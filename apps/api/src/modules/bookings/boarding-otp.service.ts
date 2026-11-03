import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Booking, BoardingStatus } from '@vit-carpool/db';

export interface GeneratedOtpResult {
  rawOtp: string;
  formattedOtp: string;
  hash: string;
  salt: string;
  encrypted: string;
  expiresAt: Date;
}

export type OtpVerificationResult =
  | { valid: true }
  | {
      valid: false;
      code: 'ALREADY_BOARDED' | 'LOCKOUT' | 'EXPIRED' | 'INVALID_OTP' | 'NOT_CONFIRMED' | 'NO_OTP';
      message: string;
      attemptsRemaining?: number;
      lockoutUntil?: Date;
    };

@Injectable()
export class BoardingOtpService {
  private readonly logger = new Logger(BoardingOtpService.name);
  private readonly hmacSecret: string;
  private readonly encryptionKey: Buffer;

  // Security constants
  public static readonly MAX_FAILED_ATTEMPTS = 5;
  public static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  public static readonly REGEN_COOLDOWN_MS = 60 * 1000; // 60 seconds
  public static readonly MAX_REGEN_COUNT = 5;

  constructor(private readonly config: ConfigService) {
    const rawSecret =
      this.config.get<string>('OTP_HMAC_SECRET') ||
      this.config.get<string>('JWT_PRIVATE_KEY') ||
      'vit-carpool-boarding-otp-master-secret-key-salt-2026';

    this.hmacSecret = rawSecret.trim();
    // Derive exactly 32 bytes (256 bits) for AES-256-GCM encryption
    this.encryptionKey = crypto.createHash('sha256').update(this.hmacSecret).digest();
  }

  /**
   * Generates a cryptographically secure 6-digit numeric OTP,
   * salt, HMAC-SHA256 hash, and authenticated AES-256-GCM ciphertext.
   */
  generateBoardingOtp(bookingId: string, customExpiresAt?: Date): GeneratedOtpResult {
    // 1. Uniformly distributed 6-digit number [100000, 999999]
    const otpNumber = crypto.randomInt(100000, 1000000);
    const rawOtp = otpNumber.toString();

    // 2. Cryptographic Salt
    const salt = crypto.randomBytes(16).toString('hex');

    // 3. HMAC-SHA256 Hash for constant-time driver verification
    const hash = this.computeHash(bookingId, rawOtp, salt);

    // 4. AES-256-GCM authenticated encryption for passenger-only retrieval
    const encrypted = this.encryptOtp(rawOtp);

    // 5. Expiration: default to 24 hours or custom departure-based window
    const expiresAt = customExpiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000);

    return {
      rawOtp,
      formattedOtp: this.formatOtp(rawOtp),
      hash,
      salt,
      encrypted,
      expiresAt,
    };
  }

  /**
   * Compute HMAC-SHA256 verifier hash
   */
  public computeHash(bookingId: string, rawOtp: string, salt: string): string {
    const hmac = crypto.createHmac('sha256', this.hmacSecret);
    hmac.update(`boarding-otp:${bookingId}:${rawOtp}:${salt}`);
    return hmac.digest('hex');
  }

  /**
   * Encrypt OTP with AES-256-GCM (Returns iv:authTag:ciphertext)
   */
  public encryptOtp(rawOtp: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let ciphertext = cipher.update(rawOtp, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${ciphertext}`;
  }

  /**
   * Decrypt OTP with AES-256-GCM (Validates integrity authTag)
   */
  public decryptOtp(encryptedString: string): string | null {
    try {
      const parts = encryptedString.split(':');
      if (parts.length !== 3) return null;

      const [ivHex, authTagHex, cipherHex] = parts;
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      this.logger.error(`[BoardingOtpService] Failed to decrypt boarding OTP: ${err}`);
      return null;
    }
  }

  /**
   * Verifies candidate OTP against stored hash using constant-time comparison,
   * tracking failed attempts and temporary lockout.
   */
  verifyOtp(booking: Booking, candidateOtp: string): OtpVerificationResult {
    const now = new Date();

    // 1. Check if already boarded
    if (booking.boardingStatus === BoardingStatus.BOARDED || booking.boardingOtpConsumedAt != null) {
      return {
        valid: false,
        code: 'ALREADY_BOARDED',
        message: 'This passenger has already been verified as boarded.',
      };
    }

    // 2. Check if locked out
    if (booking.boardingOtpLockoutUntil && booking.boardingOtpLockoutUntil > now) {
      return {
        valid: false,
        code: 'LOCKOUT',
        message: 'Too many incorrect attempts. Verification is temporarily locked out.',
        lockoutUntil: booking.boardingOtpLockoutUntil,
      };
    }

    // 3. Check if OTP is configured
    if (!booking.boardingOtpHash || !booking.boardingOtpSalt) {
      return {
        valid: false,
        code: 'NO_OTP',
        message: 'No boarding OTP has been issued for this booking.',
      };
    }

    // 4. Check if expired
    if (booking.boardingOtpExpiresAt && booking.boardingOtpExpiresAt < now) {
      return {
        valid: false,
        code: 'EXPIRED',
        message: 'The boarding OTP has expired. Passenger must request a new OTP.',
      };
    }

    // 5. Clean normalized candidate OTP
    const cleanOtp = candidateOtp.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanOtp)) {
      return {
        valid: false,
        code: 'INVALID_OTP',
        message: 'Boarding OTP must be a valid 6-digit number.',
        attemptsRemaining: Math.max(0, BoardingOtpService.MAX_FAILED_ATTEMPTS - booking.boardingOtpFailedAttempts),
      };
    }

    // 6. Compute candidate hash and execute constant-time comparison
    const candidateHash = this.computeHash(booking.id, cleanOtp, booking.boardingOtpSalt);
    const isMatch =
      candidateHash.length === booking.boardingOtpHash.length &&
      crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(booking.boardingOtpHash, 'hex'));

    if (!isMatch) {
      const nextFailed = booking.boardingOtpFailedAttempts + 1;
      const isLockout = nextFailed >= BoardingOtpService.MAX_FAILED_ATTEMPTS;
      const lockoutUntil = isLockout ? new Date(now.getTime() + BoardingOtpService.LOCKOUT_DURATION_MS) : undefined;

      return {
        valid: false,
        code: isLockout ? 'LOCKOUT' : 'INVALID_OTP',
        message: isLockout
          ? 'Too many incorrect attempts. Verification is temporarily locked out for 15 minutes.'
          : `Invalid boarding OTP. ${BoardingOtpService.MAX_FAILED_ATTEMPTS - nextFailed} attempt(s) remaining.`,
        attemptsRemaining: Math.max(0, BoardingOtpService.MAX_FAILED_ATTEMPTS - nextFailed),
        lockoutUntil,
      };
    }

    return { valid: true };
  }

  /**
   * Format OTP into readable groups (e.g., "482 916")
   */
  formatOtp(rawOtp: string): string {
    const cleaned = rawOtp.replace(/\s+/g, '');
    if (cleaned.length === 6) {
      return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
    }
    return cleaned;
  }

  /**
   * Determine cooldown seconds remaining before next regeneration
   */
  getRegenCooldownSeconds(lastRegenAt: Date | null): number {
    if (!lastRegenAt) return 0;
    const elapsed = Date.now() - lastRegenAt.getTime();
    const remainingMs = BoardingOtpService.REGEN_COOLDOWN_MS - elapsed;
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }
}

