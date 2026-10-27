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

interface StoredOtp {
  code: string;
  expiresAt: Date;
  requestedAt: Date;
  intent: 'signup' | 'signin';
  fullName?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly supabaseUrl: string | null;
  private readonly supabaseAnonKey: string | null;
  private readonly isSupabaseConfigured: boolean;
  private readonly nodeEnv: string;
  private readonly jwtTestMode: boolean;

  // In-memory store for OTP cooldowns and dev/test boundary
  private readonly otpStore = new Map<string, StoredOtp>();

  private readonly OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly OTP_COOLDOWN_MS = 30 * 1000; // 30 seconds

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly classifier: EmailClassifierService,
  ) {
    this.supabaseUrl = this.config.get<string>('SUPABASE_URL') || null;
    this.supabaseAnonKey = this.config.get<string>('SUPABASE_ANON_KEY') || null;
    this.nodeEnv = this.config.get<string>('NODE_ENV') || 'development';
    this.jwtTestMode = this.config.get<boolean>('JWT_TEST_MODE') ?? false;

    this.isSupabaseConfigured = Boolean(
      this.supabaseUrl &&
        this.supabaseUrl.trim().length > 0 &&
        this.supabaseAnonKey &&
        this.supabaseAnonKey.trim().length > 0,
    );

    this.logger.log(
      `[AuthService] Initialized: Supabase configured=${this.isSupabaseConfigured}, Env=${this.nodeEnv}, TestMode=${this.jwtTestMode}`,
    );
  }

  /**
   * Request a passwordless email OTP for Sign Up or Sign In.
   */
  async requestOtp(dto: RequestOtpDto): Promise<{ message: string; cooldownSeconds: number }> {
    const email = dto.email.trim().toLowerCase();

    // 1. Check rate-limit cooldown
    const existingOtp = this.otpStore.get(email);
    if (existingOtp) {
      const elapsed = Date.now() - existingOtp.requestedAt.getTime();
      if (elapsed < this.OTP_COOLDOWN_MS) {
        const remaining = Math.ceil((this.OTP_COOLDOWN_MS - elapsed) / 1000);
        throw new BadRequestException(
          `Please wait ${remaining} seconds before requesting a new verification code.`,
        );
      }
    }

    // 2. Validate institutional domain rules based on intent
    if (dto.intent === 'signup') {
      // Validate full name
      if (!dto.fullName || dto.fullName.trim().length < 2) {
        throw new BadRequestException('Full name is required for registration.');
      }

      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        throw new BadRequestException(
          'An account with this email address already exists. Please sign in instead.',
        );
      }

      // Enforce institutional email classification rule
      const classification = this.classifier.classify(email);
      if (!classification.isClassified) {
        throw new BadRequestException(
          'Only institutional email addresses (@vitstudent.ac.in for students, @vit.ac.in for faculty) are eligible for registration.',
        );
      }
    } else {
      // For signin: Verify existing user record exists
      const existingUser = await this.prisma.user.findUnique({ where: { email } });
      if (!existingUser) {
        throw new NotFoundException(
          'No account found with this email address. Please sign up first.',
        );
      }
    }

    // 3. Dispatch OTP via Supabase or Test/Dev Mock Boundary
    if (this.isSupabaseConfigured) {
      try {
        const response = await fetch(`${this.supabaseUrl}/auth/v1/otp`, {
          method: 'POST',
          headers: {
            apikey: this.supabaseAnonKey!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            create_user: dto.intent === 'signup',
            data: dto.fullName ? { full_name: dto.fullName.trim() } : undefined,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          this.logger.error(
            `[AuthService] Supabase OTP dispatch failed: status=${response.status}, error=${errData.msg || errData.error_description || 'Unknown'}`,
          );
          throw new BadGatewayException(
            errData.msg || errData.error_description || 'Failed to dispatch verification code via upstream service.',
          );
        }

        // Record cooldown timestamp
        this.otpStore.set(email, {
          code: '', // Live Supabase code handled upstream
          expiresAt: new Date(Date.now() + this.OTP_EXPIRY_MS),
          requestedAt: new Date(),
          intent: dto.intent,
          fullName: dto.fullName?.trim(),
        });
      } catch (err) {
        if (err instanceof BadRequestException || err instanceof BadGatewayException) {
          throw err;
        }
        this.logger.error(`[AuthService] Network error during Supabase OTP request: ${err}`);
        throw new BadGatewayException('Upstream email delivery service is currently unavailable.');
      }
    } else {
      // Supabase is NOT configured: fail closed in all non-development and non-test environments
      if (this.nodeEnv !== 'development' && this.nodeEnv !== 'test') {
        throw new ServiceUnavailableException(
          'Authentication service is unavailable: Supabase credentials are not configured.',
        );
      }

      // Deterministic dev/test mock boundary
      // Default to '123456' for predictable automated testing
      const testCode = '123456';
      this.otpStore.set(email, {
        code: testCode,
        expiresAt: new Date(Date.now() + this.OTP_EXPIRY_MS),
        requestedAt: new Date(),
        intent: dto.intent,
        fullName: dto.fullName?.trim(),
      });

      this.logger.debug(
        `[AuthService] Dev/Test OTP code generated for ${email}: ${testCode} (Expires in 5m)`,
      );
    }

    return {
      message: 'Verification code sent to your institutional email.',
      cooldownSeconds: 30,
    };
  }

  /**
   * Verify an email OTP, restore or provision the authoritative user record,
   * and return the authenticated session JWT.
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const tokenInput = dto.token.trim();

    let authUserId: string;
    let jwtToken: string;

    if (this.isSupabaseConfigured) {
      try {
        const response = await fetch(`${this.supabaseUrl}/auth/v1/verify`, {
          method: 'POST',
          headers: {
            apikey: this.supabaseAnonKey!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            token: tokenInput,
            type: 'email',
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          this.logger.warn(
            `[AuthService] Supabase OTP verification failed: status=${response.status}, msg=${errData.msg || errData.error_description}`,
          );
          throw new BadRequestException(
            errData.msg || errData.error_description || 'Invalid or expired verification code.',
          );
        }

        const data = await response.json();
        authUserId = data.user?.id;
        jwtToken = data.access_token;

        if (!authUserId || !jwtToken) {
          throw new BadGatewayException('Malformed response from upstream authentication provider.');
        }

        // Clean up store
        this.otpStore.delete(email);
      } catch (err) {
        if (err instanceof BadRequestException || err instanceof BadGatewayException) {
          throw err;
        }
        this.logger.error(`[AuthService] Network error during Supabase verify: ${err}`);
        throw new BadGatewayException('Failed to verify code with upstream service.');
      }
    } else {
      // Supabase is NOT configured: fail closed in all non-development and non-test environments
      if (this.nodeEnv !== 'development' && this.nodeEnv !== 'test') {
        throw new ServiceUnavailableException(
          'Authentication service is unavailable: Supabase credentials are not configured.',
        );
      }

      // Verify in dev/test mock store
      const stored = this.otpStore.get(email);
      if (!stored) {
        throw new BadRequestException('Verification code has expired or was not requested. Please request a new code.');
      }

      if (Date.now() > stored.expiresAt.getTime()) {
        this.otpStore.delete(email);
        throw new BadRequestException('Verification code has expired. Please request a new code.');
      }

      if (stored.code !== tokenInput) {
        throw new BadRequestException('Invalid verification code.');
      }

      // Verification successful, consume code
      this.otpStore.delete(email);

      // Check if existing user already has authUserId, or generate a deterministic one
      const existingUser = await this.prisma.user.findUnique({ where: { email } });
      authUserId = existingUser ? existingUser.authUserId : crypto.randomUUID();
      jwtToken = signTestJwt({ sub: authUserId, email });
    }

    // Authoritative Database Record Synchronization
    let userRecord;
    if (dto.intent === 'signup') {
      userRecord = await this.usersService.findOrCreateUser({
        authUserId,
        email,
        fullName: dto.fullName || undefined,
      });
    } else {
      // For signin: load existing user and link authUserId if needed
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
      fullName: undefined, // full name preserved in DB or stored in initial request
    });
  }

  /**
   * Set a specific OTP code in the test mock boundary for automated testing.
   */
  setTestOtp(email: string, code: string, intent: 'signup' | 'signin' = 'signup', isExpired = false): void {
    const now = Date.now();
    this.otpStore.set(email.trim().toLowerCase(), {
      code,
      expiresAt: isExpired ? new Date(now - 1000) : new Date(now + this.OTP_EXPIRY_MS),
      requestedAt: new Date(now),
      intent,
    });
  }
}
