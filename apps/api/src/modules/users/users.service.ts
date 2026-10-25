import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { EmailClassifierService } from '../verification/email-classifier.service';
import {
  User,
  UserRole,
  VerificationStatus,
  VerificationMethod,
} from '@vit-carpool/db';

export interface CreateUserInput {
  authUserId: string;
  email: string;
  fullName?: string;
  phoneNumber?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly classifier: EmailClassifierService,
  ) {}

  /**
   * Look up existing user by Supabase auth_user_id or create a new record.
   * Enforces lowercase email normalization and transactional registration audit.
   */
  async findOrCreateUser(input: CreateUserInput): Promise<User> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // Check if user already exists
    const existing = await this.prisma.user.findUnique({
      where: { authUserId: input.authUserId },
    });

    if (existing) {
      return existing;
    }

    // Evaluate automatic classification (disabled by default until rules confirmed)
    const classification = this.classifier.classify(normalizedEmail);

    return this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          authUserId: input.authUserId,
          email: normalizedEmail,
          fullName: input.fullName || normalizedEmail.split('@')[0],
          phoneNumber: input.phoneNumber ?? null,
          audience: classification.audience,
          verificationStatus: classification.isClassified
            ? VerificationStatus.VERIFIED
            : VerificationStatus.PENDING,
          verificationMethod: classification.isClassified
            ? VerificationMethod.AUTOMATIC_EMAIL
            : null,
          verifiedAt: classification.isClassified ? new Date() : null,
          role: UserRole.USER,
        },
      });

      // Audit registration
      await this.audit.log(
        {
          actorId: newUser.id,
          actorRole: UserRole.USER,
          action: 'USER_REGISTERED',
          targetType: 'USER',
          targetId: newUser.id,
          changes: {
            email: normalizedEmail,
            verificationStatus: newUser.verificationStatus,
            audience: newUser.audience,
          },
        },
        tx,
      );

      if (classification.isClassified) {
        await this.audit.log(
          {
            actorId: null, // SYSTEM
            actorRole: null,
            action: 'USER_AUTO_VERIFIED',
            targetType: 'USER',
            targetId: newUser.id,
            changes: {
              audience: classification.audience,
              ruleMatched: classification.ruleMatched,
            },
          },
          tx,
        );
      }

      return newUser;
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found.`);
    }
    return user;
  }

  async findByAuthUserId(authUserId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { authUserId } });
  }

  /**
   * Admin-governed role update with audit log.
   * Self-demotion is blocked to prevent administrator lockout.
   */
  async updateUserRole(
    adminActor: User,
    targetUserId: string,
    newRole: UserRole,
    reason: string,
  ): Promise<User> {
    if (adminActor.role !== UserRole.ADMIN) {
      throw new BadRequestException('Only active administrators can modify user roles.');
    }

    if (adminActor.id === targetUserId && newRole !== UserRole.ADMIN) {
      throw new BadRequestException('Administrators cannot revoke their own admin role.');
    }

    const targetUser = await this.findById(targetUserId);

    if (targetUser.role === newRole) {
      return targetUser;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: { role: newRole },
      });

      await this.audit.log(
        {
          actorId: adminActor.id,
          actorRole: adminActor.role,
          action: newRole === UserRole.ADMIN ? 'ADMIN_ROLE_PROMOTED' : 'ADMIN_ROLE_REVOKED',
          targetType: 'USER',
          targetId: targetUser.id,
          changes: {
            role: { from: targetUser.role, to: newRole },
            reason,
          },
        },
        tx,
      );

      return updated;
    });
  }
}
