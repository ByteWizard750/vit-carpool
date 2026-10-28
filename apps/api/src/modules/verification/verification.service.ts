import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import {
  User,
  UserRole,
  VerificationRequest,
  VerificationRequestStatus,
  VerificationStatus,
  VerificationMethod,
} from '@vit-carpool/db';
import {
  CreateVerificationRequestDto,
  ReviewVerificationRequestDto,
} from '@vit-carpool/contracts';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Submit manual campus ID verification request for a PENDING account.
   */
  async submitRequest(
    user: User,
    dto: CreateVerificationRequestDto,
  ): Promise<VerificationRequest> {
    if (user.isSuspended || user.verificationStatus === VerificationStatus.SUSPENDED) {
      throw new ForbiddenException({
        error: 'ACCOUNT_SUSPENDED',
        message: 'Suspended accounts cannot submit verification requests.',
      });
    }

    const normalizedEmail = dto.institutionalEmail.trim().toLowerCase();

    // Check for existing active pending request
    const existing = await this.prisma.verificationRequest.findFirst({
      where: {
        userId: user.id,
        status: VerificationRequestStatus.PENDING,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'An active pending verification request already exists for this account.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.verificationRequest.create({
        data: {
          userId: user.id,
          requestedAudience: dto.requestedAudience,
          institutionalEmail: normalizedEmail,
          status: VerificationRequestStatus.PENDING,
        },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'VERIFICATION_REQUEST_SUBMITTED',
          targetType: 'VERIFICATION_REQUEST',
          targetId: request.id,
          changes: {
            requestedAudience: dto.requestedAudience,
            institutionalEmail: normalizedEmail,
          },
        },
        tx,
      );

      return request;
    });
  }

  async getMyRequest(userId: string): Promise<VerificationRequest | null> {
    return this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listRequests(status?: VerificationRequestStatus): Promise<VerificationRequest[]> {
    return this.prisma.verificationRequest.findMany({
      where: status ? { status } : undefined,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            verificationStatus: true,
            audience: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Administrator review for verification requests.
   * Atomically transitions request status, updates user verification state, and writes audit record.
   */
  async reviewRequest(
    adminUser: User,
    requestId: string,
    dto: ReviewVerificationRequestDto,
  ): Promise<VerificationRequest> {
    if (adminUser.role !== UserRole.ADMIN) {
      throw new BadRequestException('Only administrators can review verification requests.');
    }

    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!request) {
      throw new NotFoundException(`Verification request with ID ${requestId} not found.`);
    }

    if (request.status !== VerificationRequestStatus.PENDING) {
      throw new BadRequestException('This verification request has already been resolved.');
    }

    return this.prisma.$transaction(async (tx) => {
      const targetStatus =
        dto.status === 'APPROVED'
          ? VerificationRequestStatus.APPROVED
          : VerificationRequestStatus.REJECTED;

      const updatedRequest = await tx.verificationRequest.update({
        where: { id: requestId },
        data: {
          status: targetStatus,
          reviewedBy: adminUser.id,
          reviewedAt: new Date(),
          reviewNotes: dto.reviewNotes ?? null,
        },
      });

      if (dto.status === 'APPROVED') {
        await tx.user.update({
          where: { id: request.userId },
          data: {
            verificationStatus: VerificationStatus.VERIFIED,
            audience: request.requestedAudience,
            verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
            verifiedAt: new Date(),
          },
        });

        await this.audit.log(
          {
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: 'USER_MANUALLY_VERIFIED',
            targetType: 'USER',
            targetId: request.userId,
            changes: {
              audience: request.requestedAudience,
              verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
              notes: dto.reviewNotes,
            },
          },
          tx,
        );
      } else {
        await tx.user.update({
          where: { id: request.userId },
          data: {
            verificationStatus: VerificationStatus.REJECTED,
            audience: null,
            verifiedAt: null,
          },
        });

        await this.audit.log(
          {
            actorId: adminUser.id,
            actorRole: adminUser.role,
            action: 'USER_VERIFICATION_REJECTED',
            targetType: 'USER',
            targetId: request.userId,
            changes: {
              notes: dto.reviewNotes,
            },
          },
          tx,
        );
      }

      return updatedRequest;
    });
  }

  /**
   * Controlled Email-Change Reconciliation adhering to ADR-009.
   * Employs row locking, monotonic sequence evaluation, and fails safe to PENDING.
   * Never transfers a user between student and faculty groups.
   */
  async reconcileEmailChange(params: {
    authUserId: string;
    incomingEmail: string;
    incomingUpdatedAt?: string;
  }): Promise<{ action: 'IGNORED_STALE' | 'NO_OP' | 'RECONCILED' }> {
    const normalizedEmail = params.incomingEmail.trim().toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      // Row lock user record for concurrency safety
      const users = await tx.$queryRaw<User[]>`
        SELECT * FROM "users" WHERE "auth_user_id" = ${params.authUserId}::uuid FOR UPDATE
      `;

      if (!users || users.length === 0) {
        this.logger.warn(`Email reconciliation skipped: User authUserId=${params.authUserId} not found.`);
        return { action: 'NO_OP' };
      }

      const user = users[0];
      const rawUser = user as any;
      const incomingTime = params.incomingUpdatedAt
        ? new Date(params.incomingUpdatedAt).getTime()
        : Date.now();
      const localAuthUpdatedAt = rawUser.auth_updated_at || rawUser.authUpdatedAt;
      const localTime = localAuthUpdatedAt ? new Date(localAuthUpdatedAt).getTime() : 0;

      // 1. Stale event evaluation: If incoming event is older than local record, drop it
      if (incomingTime < localTime) {
        this.logger.log(
          `[EmailChange] Discarded stale auth event for user ${user.id} (incoming: ${incomingTime} < local: ${localTime})`,
        );
        return { action: 'IGNORED_STALE' };
      }

      // 2. Redundant event evaluation
      if (incomingTime === localTime && normalizedEmail === user.email) {
        return { action: 'NO_OP' };
      }

      // 3. Email modified: transition to PENDING re-verification, retain audience
      if (normalizedEmail !== user.email) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            email: normalizedEmail,
            verificationStatus: VerificationStatus.PENDING,
            verifiedAt: null,
            authUpdatedAt: new Date(incomingTime),
          },
        });

        await this.audit.log(
          {
            actorId: user.id,
            actorRole: user.role,
            action: 'USER_EMAIL_CHANGED',
            targetType: 'USER',
            targetId: user.id,
            changes: {
              previousEmail: user.email,
              newEmail: normalizedEmail,
              previousStatus: user.verificationStatus,
              newStatus: VerificationStatus.PENDING,
              retainedAudience: user.audience,
            },
          },
          tx,
        );

        this.logger.log(
          `[EmailChange] User ${user.id} email changed to ${normalizedEmail}. Carpooling access revoked (status=PENDING, audience=${user.audience} retained).`,
        );
        return { action: 'RECONCILED' };
      }

      return { action: 'NO_OP' };
    });
  }
}
