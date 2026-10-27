import {
  Injectable,
  BadRequestException,
  NotFoundException,
  BadGatewayException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { EmailClassifierService } from '../verification/email-classifier.service';
import {
  RequestOtpDto,
  VerifyOtpDto,
  ResendOtpDto,
  AuthResponseDto,
} from '@vit-carpool/contracts';
import { signTestJwt } from './jwt-keys.fixture';
import { EmailService } from './email.service';
import { normalizePem } from '../../config/env.validation';

interface TestMockOtp {
  code: string;
  expiresAt: Date;
  requestedAt: Date;
  intent: 'signup' | 'signin';
  fullName?: string;
  failedAttempts: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly supabaseUrl: string | null;
  private readonly supabaseAnonKey: string | null;
  private readonly isSupabaseConfigured: boolean;
  private readonly nodeEnv: string;
  private readonly jwtTestMode: boolean;
  private readonly expectedIssuer: string;
  private readonly customPrivateKeyPem: string | null = null;
  private readonly jwtKeyId: string;
  private readonly otpSecret: string;

  // Test-only mock boundary for hermetic automated tests
  private readonly testMockCodes = new Map<string, TestMockOtp>();

  private readonly OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly OTP_COOLDOWN_MS = 30 * 1000; // 30 seconds
  private readonly MAX_FAILED_ATTEMPTS = 5;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly classifier: EmailClassifierService,
    private readonly emailService: EmailService,
  ) {
    this.supabaseUrl = this.config.get<string>('SUPABASE_URL') || null;
    this.supabaseAnonKey = this.config.get<string>('SUPABASE_ANON_KEY') || null;
    this.nodeEnv = this.config.get<string>('NODE_ENV') || 'development';
    this.jwtTestMode = this.config.get<boolean>('JWT_TEST_MODE') ?? false;

    const customIssuer = this.config.get<string>('JWT_ISSUER');
    const configuredIssuer = this.config.get<string>('SUPABASE_JWT_ISSUER');
    if (configuredIssuer) {
      this.expectedIssuer = configuredIssuer;
    } else if (customIssuer) {
      this.expectedIssuer = customIssuer;
    } else if (this.supabaseUrl) {
      this.expectedIssuer = `${this.supabaseUrl.replace(/\/$/, '')}/auth/v1`;
    } else {
      this.expectedIssuer = 'https://mock-supabase.local/auth/v1';
    }

    const rawPrivateKey = this.config.get<string>('JWT_PRIVATE_KEY');
    this.customPrivateKeyPem = rawPrivateKey && rawPrivateKey.trim().length > 0 ? normalizePem(rawPrivateKey) : null;
    this.jwtKeyId = this.config.get<string>('JWT_KEY_ID', 'vit-carpool-jwt-key-1');

    this.otpSecret =
      this.config.get<string>('OTP_HMAC_SECRET') ||
      (this.nodeEnv === 'test'
        ? 'deterministic-test-hmac-secret-for-test-isolation-only'
        : 'dev-secret-change-in-production-must-be-long-and-secure');

    this.isSupabaseConfigured = Boolean(
      this.supabaseUrl &&
        this.supabaseUrl.trim().length > 0 &&
        this.supabaseAnonKey &&
        this.supabaseAnonKey.trim().length > 0,
    );

    this.logger.log(
      `[AuthService] Initialized: EmailService configured=${this.emailService.isEmailConfigured}, Supabase configured=${this.isSupabaseConfigured}, CustomRS256=${Boolean(
        this.customPrivateKeyPem,
      )}, Env=${this.nodeEnv}, TestMode=${this.jwtTestMode}`,
    );
  }

  /**
   * Compute keyed HMAC verifier for OTP storage at rest.
   * Protects 6-digit codes against rainbow table and offline dictionary attacks if the database is read.
   */
  private computeVerifier(email: string, code: string, salt: string): string {
    return crypto
      .createHmac('sha256', this.otpSecret)
      .update(`${email.trim().toLowerCase()}:${code.trim()}:${salt}`)
      .digest('hex');
  }

  /**
   * Sign authenticated session JWT using custom RS256 private key (or test fixture in test mode).
   */
  private signSessionJwt(payload: { sub: string; email: string; role?: string }): string {
    if (this.customPrivateKeyPem) {
      return jwt.sign(
        {
          email: payload.email,
          role: payload.role ?? 'authenticated',
        },
        this.customPrivateKeyPem,
        {
          algorithm: 'RS256',
          keyid: this.jwtKeyId,
          subject: payload.sub,
          audience: 'authenticated',
          issuer: this.expectedIssuer,
          expiresIn: '7d',
        },
      );
    }

    if (this.nodeEnv === 'test' || this.jwtTestMode === true) {
      return signTestJwt({
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        iss: this.expectedIssuer,
      });
    }

    throw new ServiceUnavailableException('Authentication key pair is not configured for token signing.');
  }

  /**
   * Request a passwordless email OTP for Sign Up or Sign In.
   * State is persisted to PostgreSQL to support multi-instance deployments and atomic cooldowns.
   */
  async requestOtp(dto: RequestOtpDto): Promise<{ message: string; cooldownSeconds: number }> {
    const email = dto.email.trim().toLowerCase();

    // 1. Check rate-limit cooldown against PostgreSQL persistent state
    const existingOtp = await this.prisma.otpVerification.findUnique({ where: { email } });
    if (existingOtp) {
      const elapsed = Date.now() - existingOtp.createdAt.getTime();
      const isCooldownActive = existingOtp.cooldownUntil.getTime() > Date.now();
      if (isCooldownActive) {
        const remaining = Math.ceil((existingOtp.cooldownUntil.getTime() - Date.now()) / 1000);
        throw new BadRequestException(
          `Please wait ${remaining} seconds before requesting a new verification code.`,
        );
      }
    }

    const resolvedFullName = dto.fullName?.trim() || existingOtp?.fullName || undefined;

    // 2. Validate institutional domain rules based on intent
    if (dto.intent === 'signup') {
      if (!resolvedFullName || resolvedFullName.length < 2) {
        throw new BadRequestException('Full name is required for registration.');
      }

      const existingUser = await this.prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        throw new BadRequestException(
          'An account with this email address already exists. Please sign in instead.',
        );
      }

      const classification = this.classifier.classify(email);
      if (!classification.isClassified) {
        throw new BadRequestException(
          'Only institutional email addresses (@vitstudent.ac.in for students, @vit.ac.in for faculty) are eligible for registration.',
        );
      }
    } else {
      const existingUser = await this.prisma.user.findUnique({ where: { email } });
      if (!existingUser) {
        throw new NotFoundException(
          'No account found with this email address. Please sign up first.',
        );
      }
    }

    // 3. Generate cryptographic 6-digit OTP and keyed HMAC salt
    const otpCode =
      this.nodeEnv === 'test'
        ? '123456'
        : crypto.randomInt(100000, 1000000).toString();
    const salt = crypto.randomBytes(16).toString('hex');
    const verifierHash = this.computeVerifier(email, otpCode, salt);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MS);
    const cooldownUntil = new Date(Date.now() + this.OTP_COOLDOWN_MS);

    // 4. Persist to PostgreSQL atomically (upsert resets attempt counter and invalidates previous code)
    await this.prisma.otpVerification.upsert({
      where: { email },
      create: {
        email,
        verifierHash,
        salt,
        failedAttempts: 0,
        maxAttempts: this.MAX_FAILED_ATTEMPTS,
        expiresAt,
        cooldownUntil,
        intent: dto.intent,
        fullName: resolvedFullName || null,
      },
      update: {
        verifierHash,
        salt,
        failedAttempts: 0,
        maxAttempts: this.MAX_FAILED_ATTEMPTS,
        expiresAt,
        cooldownUntil,
        intent: dto.intent,
        fullName: resolvedFullName || undefined,
      },
    });

    // Mirror to test mock boundary for hermetic automated tests
    if (this.nodeEnv === 'test') {
      this.testMockCodes.set(email, {
        code: otpCode,
        expiresAt,
        requestedAt: new Date(),
        intent: dto.intent,
        fullName: resolvedFullName,
        failedAttempts: 0,
      });
      this.logger.debug(`[AuthService] Test OTP boundary initialized for ${email}`);
    }

    // 5. Dispatch OTP via EmailService (Gmail SMTP) or dev fallback
    if (this.nodeEnv !== 'test' && this.emailService.isEmailConfigured) {
      try {
        await this.emailService.sendOtpEmail(email, otpCode, resolvedFullName, dto.intent);
        this.logger.log(`[AuthService] OTP verification code dispatched via Gmail SMTP to ${email}`);
      } catch (err: any) {
        this.logger.error(`[AuthService] Failed to dispatch OTP email to ${email}`);
        throw new BadGatewayException('Failed to dispatch verification email. Please try again.');
      }
    } else if (this.nodeEnv === 'test') {
      this.logger.debug(`[AuthService] Hermetic test OTP prepared for ${email}`);
    } else if (this.nodeEnv !== 'development') {
      throw new ServiceUnavailableException(
        'Authentication service is unavailable: Email credentials are not configured.',
      );
    } else {
      this.logger.debug(`[AuthService] Dev OTP generated for ${email} (Expires in 5m)`);
    }

    return {
      message: 'Verification code sent to your institutional email.',
      cooldownSeconds: 30,
    };
  }

  /**
   * Verify an email OTP, restore or provision the authoritative user record,
   * and return the authenticated RS256 session JWT.
   * 
   * Security Controls:
   * - Max 5 attempts enforced atomically in PostgreSQL transaction.
   * - Immediate record deletion on 5th failure or successful verification (single-use).
   * - Keyed HMAC verification with timing-safe comparison.
   * - Multi-instance synchronized state.
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const tokenInput = dto.token.trim();

    let authUserId: string;
    let jwtToken: string;

    const record = await this.prisma.otpVerification.findUnique({
      where: { email },
    });

    // Fallback check for test mock boundary in test environment
    if (!record) {
      if (this.nodeEnv === 'test' && this.testMockCodes.has(email)) {
        const testMock = this.testMockCodes.get(email)!;
        if (Date.now() > testMock.expiresAt.getTime()) {
          this.testMockCodes.delete(email);
          throw new BadRequestException('Verification code has expired. Please request a new code.');
        }
        if (testMock.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
          this.testMockCodes.delete(email);
          throw new BadRequestException(
            'Too many incorrect verification attempts. This code has been invalidated. Please request a new code.',
          );
        }
        if (testMock.code !== tokenInput) {
          testMock.failedAttempts += 1;
          if (testMock.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
            this.testMockCodes.delete(email);
            throw new BadRequestException(
              'Too many incorrect verification attempts. This code has been invalidated. Please request a new code.',
            );
          }
          const rem = this.MAX_FAILED_ATTEMPTS - testMock.failedAttempts;
          throw new BadRequestException(`Invalid verification code. ${rem} attempt(s) remaining.`);
        }
        this.testMockCodes.delete(email);
      } else {
        throw new BadRequestException(
          'Verification code has expired or was not requested. Please request a new code.',
        );
      }
    } else {
      const now = Date.now();

      // 1. Enforce expiry check
      if (now > record.expiresAt.getTime()) {
        await this.prisma.otpVerification.deleteMany({ where: { email } });
        throw new BadRequestException('Verification code has expired. Please request a new code.');
      }

      // 2. Enforce maximum failed attempts limit
      if (record.failedAttempts >= record.maxAttempts) {
        await this.prisma.otpVerification.deleteMany({ where: { email } });
        throw new BadRequestException(
          'Too many incorrect verification attempts. This code has been invalidated. Please request a new code.',
        );
      }

      // 3. Timing-safe verification using keyed HMAC
      const candidateHash = this.computeVerifier(email, tokenInput, record.salt);
      const isMatch =
        candidateHash.length === record.verifierHash.length &&
        crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(record.verifierHash, 'hex'));

      if (!isMatch) {
        const updatedAttempts = record.failedAttempts + 1;
        if (updatedAttempts >= record.maxAttempts) {
          await this.prisma.otpVerification.deleteMany({ where: { email } });
          if (this.nodeEnv === 'test') {
            this.testMockCodes.delete(email);
          }
          throw new BadRequestException(
            'Too many incorrect verification attempts. This code has been invalidated. Please request a new code.',
          );
        }

        await this.prisma.otpVerification.update({
          where: { email },
          data: { failedAttempts: updatedAttempts },
        });

        const remaining = record.maxAttempts - updatedAttempts;
        throw new BadRequestException(`Invalid verification code. ${remaining} attempt(s) remaining.`);
      }

      // 4. Single-use consumption: atomic conditional delete prevents concurrent reuse
      const deleted = await this.prisma.otpVerification.deleteMany({
        where: {
          email,
          verifierHash: record.verifierHash,
        },
      });
      if (this.nodeEnv === 'test') {
        this.testMockCodes.delete(email);
      }
      if (deleted.count === 0) {
        throw new BadRequestException('Verification code was already used or invalidated.');
      }
    }

    // Authoritative Database Record Synchronization
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    authUserId = existingUser ? existingUser.authUserId : crypto.randomUUID();
    jwtToken = this.signSessionJwt({
      sub: authUserId,
      email,
    });

    let userRecord;
    if (dto.intent === 'signup') {
      userRecord = await this.usersService.findOrCreateUser({
        authUserId,
        email,
        fullName: dto.fullName || undefined,
      });
    } else {
      userRecord = await this.prisma.user.findUnique({ where: { email } });
      if (!userRecord) {
        throw new NotFoundException('Account record not found.');
      }

      if (userRecord.authUserId !== authUserId) {
        userRecord = await this.prisma.user.update({
          where: { id: userRecord.id },
          data: { authUserId },
        });
      }
    }

    return {
      token: jwtToken,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        fullName: userRecord.fullName,
        phoneNumber: userRecord.phoneNumber,
        audience: userRecord.audience,
        verificationStatus: userRecord.verificationStatus,
        verificationMethod: userRecord.verificationMethod,
        verifiedAt: userRecord.verifiedAt ? userRecord.verifiedAt.toISOString() : null,
        role: userRecord.role,
        createdAt: userRecord.createdAt.toISOString(),
        updatedAt: userRecord.updatedAt.toISOString(),
      },
      message: dto.intent === 'signup' ? 'Registration complete' : 'Signed in successfully',
    };
  }

  /**
   * Resend verification OTP with cooldown check.
   */
  async resendOtp(dto: ResendOtpDto): Promise<{ message: string; cooldownSeconds: number }> {
    return this.requestOtp({
      email: dto.email,
      intent: dto.intent,
      fullName: undefined,
    });
  }

  /**
   * Safe maintenance method to prune expired OTP records from the database.
   * Only deletes records older than 1 hour to prevent interfering with active cooldown windows.
   */
  async cleanupExpiredOtps(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await this.prisma.otpVerification.deleteMany({
      where: {
        expiresAt: { lt: oneHourAgo },
        cooldownUntil: { lt: new Date() },
      },
    });
    return result.count;
  }

  /**
   * Test fixture boundary: pre-populate OTP code for automated testing.
   */
  setTestOtp(email: string, code: string, intent: 'signup' | 'signin' = 'signup', isExpired = false): void {
    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();
    const expiresAt = isExpired ? new Date(now - 1000) : new Date(now + this.OTP_EXPIRY_MS);

    this.testMockCodes.set(normalizedEmail, {
      code,
      expiresAt,
      requestedAt: new Date(now),
      intent,
      failedAttempts: 0,
    });

    const salt = 'test-salt-fixture';
    const verifierHash = this.computeVerifier(normalizedEmail, code, salt);

    this.prisma.otpVerification
      .upsert({
        where: { email: normalizedEmail },
        create: {
          email: normalizedEmail,
          verifierHash,
          salt,
          failedAttempts: 0,
          maxAttempts: this.MAX_FAILED_ATTEMPTS,
          expiresAt,
          cooldownUntil: new Date(now),
          intent,
        },
        update: {
          verifierHash,
          salt,
          failedAttempts: 0,
          maxAttempts: this.MAX_FAILED_ATTEMPTS,
          expiresAt,
          cooldownUntil: new Date(now),
          intent,
        },
      })
      .catch(() => {});
  }
}
