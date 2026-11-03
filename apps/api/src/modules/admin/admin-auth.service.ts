import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../auth/email.service';
import {
  User,
  UserRole,
  VerificationStatus,
  VerificationMethod,
  Audience,
} from '@vit-carpool/db';
import {
  AcceptAdminInviteDto,
  AdminSessionResponseDto,
  ROLE_PERMISSIONS,
} from '@vit-carpool/contracts';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly nodeEnv: string;
  private readonly otpSecret: string;
  private readonly OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_FAILED_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {
    this.nodeEnv = this.config.get<string>('NODE_ENV') || 'development';
    this.otpSecret =
      this.config.get<string>('OTP_HMAC_SECRET') ||
      (this.nodeEnv === 'test'
        ? 'deterministic-test-hmac-secret-for-test-isolation-only'
        : 'dev-secret-change-in-production-must-be-long-and-secure');
  }

  private computeVerifier(email: string, code: string, salt: string): string {
    return crypto
      .createHmac('sha256', this.otpSecret)
      .update(`${email.trim().toLowerCase()}:${code.trim()}:${salt}`)
      .digest('hex');
  }

  /**
   * Initiate dedicated admin login.
   * Rejects if account does not exist or has non-admin role without leaking specifics.
   */
  async login(
    email: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string; requiresMfa: boolean }> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const adminRoles: UserRole[] = [
      UserRole.MODERATOR,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ];

    if (!user || !adminRoles.includes(user.role)) {
      await this.audit.log({
        actorId: null,
        actorRole: null,
        action: 'ADMIN_LOGIN_UNAUTHORIZED_ATTEMPT',
        targetType: 'SYSTEM',
        targetId: '00000000-0000-0000-0000-000000000000',
        changes: { attemptedEmail: normalizedEmail },
        ipAddress,
        userAgent,
      });

      throw new ForbiddenException({
        error: 'ADMIN_LOGIN_UNAUTHORIZED',
        message: 'Invalid administrative credentials or unauthorized account.',
      });
    }

    if (user.isSuspended || user.verificationStatus === VerificationStatus.SUSPENDED) {
      throw new ForbiddenException({
        error: 'ACCOUNT_SUSPENDED',
        message: 'This administrative account has been suspended.',
      });
    }

    // Generate cryptographic 6-digit MFA challenge code
    const otpCode =
      this.nodeEnv === 'production'
        ? crypto.randomInt(100000, 999999).toString()
        : '123456';

    this.logger.log(`[Admin MFA Challenge] Code for ${normalizedEmail}: ${otpCode}`);

    const salt = crypto.randomBytes(16).toString('hex');
    const verifierHash = this.computeVerifier(normalizedEmail, otpCode, salt);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MS);
    const cooldownUntil = new Date(Date.now() + 15 * 1000); // 15s cooldown

    await this.prisma.otpVerification.upsert({
      where: { email: normalizedEmail },
      update: {
        verifierHash,
        salt,
        failedAttempts: 0,
        expiresAt,
        cooldownUntil,
        intent: 'admin_mfa',
      },
      create: {
        email: normalizedEmail,
        verifierHash,
        salt,
        failedAttempts: 0,
        expiresAt,
        cooldownUntil,
        intent: 'admin_mfa',
      },
    });

    // Send email notification with MFA code asynchronously (non-blocking)
    if (this.nodeEnv !== 'test' && this.emailService.isEmailConfigured) {
      this.emailService
        .sendOtpEmail(normalizedEmail, otpCode, user.fullName, 'signin')
        .catch((err) => {
          this.logger.error(`Failed to dispatch admin MFA email to ${normalizedEmail}`, err);
        });
    }

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'ADMIN_LOGIN_CHALLENGE_DISPATCHED',
      targetType: 'USER',
      targetId: user.id,
      changes: { expiresAt: expiresAt.toISOString() },
      ipAddress,
      userAgent,
    });

    return {
      message: 'Administrative two-factor authentication challenge dispatched.',
      requiresMfa: true,
    };
  }

  /**
   * Verify MFA challenge and issue session JWT.
   */
  async verifyMfa(
    email: string,
    code: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AdminSessionResponseDto> {
    const normalizedEmail = email.trim().toLowerCase();
    const tokenInput = code.trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const adminRoles: UserRole[] = [
      UserRole.MODERATOR,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ];

    if (!user || !adminRoles.includes(user.role)) {
      throw new ForbiddenException({
        error: 'ADMIN_LOGIN_UNAUTHORIZED',
        message: 'Invalid administrative credentials.',
      });
    }

    const otpRecord = await this.prisma.otpVerification.findUnique({
      where: { email: normalizedEmail },
    });

    if (!otpRecord || otpRecord.intent !== 'admin_mfa') {
      throw new BadRequestException('MFA verification challenge expired. Please request a new code.');
    }

    if (Date.now() > otpRecord.expiresAt.getTime()) {
      await this.prisma.otpVerification.delete({ where: { email: normalizedEmail } }).catch(() => {});
      throw new BadRequestException('MFA challenge code has expired. Please request a new code.');
    }

    if (otpRecord.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
      await this.prisma.otpVerification.delete({ where: { email: normalizedEmail } }).catch(() => {});
      throw new BadRequestException(
        'Too many failed MFA verification attempts. Challenge has been invalidated. Please request a new code.',
      );
    }

    const expectedHash = this.computeVerifier(normalizedEmail, tokenInput, otpRecord.salt);
    const isMatch =
      expectedHash.length === otpRecord.verifierHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedHash, 'hex'),
        Buffer.from(otpRecord.verifierHash, 'hex'),
      );

    if (!isMatch) {
      await this.prisma.otpVerification.update({
        where: { email: normalizedEmail },
        data: { failedAttempts: { increment: 1 } },
      });

      await this.audit.log({
        actorId: user.id,
        actorRole: user.role,
        action: 'ADMIN_LOGIN_MFA_FAILED',
        targetType: 'USER',
        targetId: user.id,
        changes: { attemptsRemaining: this.MAX_FAILED_ATTEMPTS - (otpRecord.failedAttempts + 1) },
        ipAddress,
        userAgent,
      });

      const remaining = this.MAX_FAILED_ATTEMPTS - (otpRecord.failedAttempts + 1);
      throw new BadRequestException(`Invalid MFA code. ${remaining} attempt(s) remaining.`);
    }

    // Clean up OTP single-use record
    await this.prisma.otpVerification.delete({ where: { email: normalizedEmail } });

    // Update user MFA verification timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: { adminMfaVerifiedAt: new Date() },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'ADMIN_LOGIN_SUCCESS',
      targetType: 'USER',
      targetId: user.id,
      changes: { role: user.role },
      ipAddress,
      userAgent,
    });

    const token = this.authService.signSessionJwt({
      sub: user.authUserId,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role as 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN',
        permissions: ROLE_PERMISSIONS[user.role] || [],
      },
    };
  }

  /**
   * Accept an administrator invitation.
   */
  async acceptInvite(
    dto: AcceptAdminInviteDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AdminSessionResponseDto> {
    const tokenHash = crypto.createHash('sha256').update(dto.token.trim()).digest('hex');

    const invitation = await this.prisma.adminInvitation.findUnique({
      where: { tokenHash },
      include: { inviter: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation token is invalid.');
    }

    if (invitation.revokedAt) {
      throw new BadRequestException('This invitation has been revoked by an administrator.');
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException('This invitation has already been accepted.');
    }

    if (Date.now() > invitation.expiresAt.getTime()) {
      throw new BadRequestException('This invitation has expired.');
    }

    const email = invitation.email.toLowerCase().trim();

    return this.prisma.$transaction(async (tx) => {
      // Find or create user
      let user = await tx.user.findUnique({ where: { email } });

      const isFaculty = email.endsWith('@vit.ac.in') && !email.includes('student');
      const defaultAudience = isFaculty ? Audience.FACULTY : Audience.STUDENT;

      if (user) {
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            role: invitation.role,
            fullName: dto.fullName.trim(),
            audience: user.audience || defaultAudience,
            verificationStatus: VerificationStatus.VERIFIED,
            verificationMethod: VerificationMethod.ADMIN_OVERRIDE,
            verifiedAt: user.verifiedAt || new Date(),
          },
        });
      } else {
        const authUserId = crypto.randomUUID();
        user = await tx.user.create({
          data: {
            authUserId,
            email,
            fullName: dto.fullName.trim(),
            role: invitation.role,
            audience: defaultAudience,
            verificationStatus: VerificationStatus.VERIFIED,
            verificationMethod: VerificationMethod.ADMIN_OVERRIDE,
            verifiedAt: new Date(),
          },
        });
      }

      await tx.adminInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'ADMIN_INVITATION_ACCEPTED',
          targetType: 'ADMIN_INVITATION',
          targetId: invitation.id,
          changes: { role: invitation.role, email: invitation.email },
          ipAddress,
          userAgent,
        },
        tx,
      );

      const token = this.authService.signSessionJwt({
        sub: user.authUserId,
        email: user.email,
        role: user.role,
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role as 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN',
          permissions: ROLE_PERMISSIONS[user.role] || [],
        },
      };
    });
  }

  getMe(user: User): AdminSessionResponseDto['user'] {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN',
      permissions: ROLE_PERMISSIONS[user.role] || [],
    };
  }
}
