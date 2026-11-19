import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { EmailClassifierService } from '../verification/email-classifier.service';
import { UploadsService } from '../uploads/uploads.service';
import {
  User,
  UserRole,
  VerificationStatus,
  VerificationMethod,
  RideStatus,
  BookingStatus,
} from '@vit-carpool/db';
import {
  UserProfileResponseDto,
  UpdateUserProfileDto,
  PublicUserProfileDto,
  GLOBAL_ADMIN_RESERVED_EMAIL,
} from '@vit-carpool/contracts';

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
    private readonly uploads: UploadsService,
  ) {}

  /**
   * Look up existing user by Supabase auth_user_id or create a new record.
   * Enforces lowercase email normalization and transactional registration audit.
   */
  async findOrCreateUser(input: CreateUserInput): Promise<User> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // Check if user already exists by authUserId
    const existing = await this.prisma.user.findUnique({
      where: { authUserId: input.authUserId },
    });

    if (existing) {
      return existing;
    }

    // Check if user already exists by email (preserve existing identity & verification status)
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingByEmail) {
      if (existingByEmail.authUserId !== input.authUserId) {
        return this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { authUserId: input.authUserId },
        });
      }
      return existingByEmail;
    }

    const isDesignatedGlobalAdmin = normalizedEmail === GLOBAL_ADMIN_RESERVED_EMAIL;
    // Evaluate automatic classification (disabled by default until rules confirmed)
    const classification = this.classifier.classify(normalizedEmail);

    return this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          authUserId: input.authUserId,
          email: normalizedEmail,
          fullName: input.fullName || (isDesignatedGlobalAdmin ? 'VIT Carpool Administrator' : normalizedEmail.split('@')[0]),
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
    if (adminActor.role !== UserRole.ADMIN && adminActor.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Only active administrators can modify user roles.');
    }

    if (
      adminActor.id === targetUserId &&
      newRole !== UserRole.ADMIN &&
      newRole !== UserRole.SUPER_ADMIN
    ) {
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

  mapToUserProfileDto(user: User): UserProfileResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      avatarUrl: user.avatarUrl ?? null,
      audience: user.audience,
      verificationStatus: user.verificationStatus,
      verificationMethod: user.verificationMethod,
      verifiedAt: user.verifiedAt ? user.verifiedAt.toISOString() : null,
      role: user.role,
      isSuspended: user.isSuspended,
      suspensionReason: user.suspensionReason,
      suspendedAt: user.suspendedAt ? user.suspendedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async updateProfile(user: User, dto: UpdateUserProfileDto): Promise<UserProfileResponseDto> {
    const dataToUpdate: any = {};
    if (dto.fullName !== undefined) dataToUpdate.fullName = dto.fullName.trim();
    if (dto.phoneNumber !== undefined) dataToUpdate.phoneNumber = dto.phoneNumber ? dto.phoneNumber.trim() : null;
    if (dto.avatarUrl !== undefined) dataToUpdate.avatarUrl = dto.avatarUrl ? dto.avatarUrl.trim() : null;

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: dataToUpdate,
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'USER_PROFILE_UPDATED',
      targetType: 'USER',
      targetId: user.id,
      changes: dto as any,
    });

    return this.mapToUserProfileDto(updated);
  }

  async updateAvatar(user: User, file: Express.Multer.File): Promise<UserProfileResponseDto> {
    const avatarUrl = await this.uploads.saveImage('avatars', file);

    if (user.avatarUrl) {
      await this.uploads.deleteImage(user.avatarUrl);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'USER_AVATAR_UPDATED',
      targetType: 'USER',
      targetId: user.id,
      changes: { avatarUrl },
    });

    return this.mapToUserProfileDto(updated);
  }

  async deleteAvatar(user: User): Promise<UserProfileResponseDto> {
    if (user.avatarUrl) {
      await this.uploads.deleteImage(user.avatarUrl);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'USER_AVATAR_REMOVED',
      targetType: 'USER',
      targetId: user.id,
      changes: { avatarUrl: null },
    });

    return this.mapToUserProfileDto(updated);
  }

  /**
   * Look up another user's public profile.
   * Privacy-preserving: strictly omits email, phoneNumber, authUserId, suspension status.
   * Enforces audience isolation (students cannot view faculty profiles unless viewer is Admin).
   */
  async getPublicProfile(viewer: User, targetUserId: string): Promise<PublicUserProfileDto> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        audience: true,
        verificationStatus: true,
        createdAt: true,
      },
    });

    if (!target) {
      throw new NotFoundException('User not found.');
    }

    // Audience isolation check
    const isPrivileged = viewer.role === UserRole.ADMIN || viewer.role === UserRole.SUPER_ADMIN;
    if (!isPrivileged && viewer.audience && target.audience && viewer.audience !== target.audience) {
      throw new NotFoundException('User not found or not accessible.');
    }

    // Aggregate driver ratings
    const ratingAgg = await this.prisma.driverRating.aggregate({
      where: { driverId: targetUserId },
      _avg: { rating: true },
      _count: { id: true },
    });

    // Count rides offered
    const ridesOffered = await this.prisma.ride.count({
      where: {
        driverId: targetUserId,
        status: { in: [RideStatus.COMPLETED, RideStatus.IN_PROGRESS, RideStatus.SCHEDULED] },
      },
    });

    // Count rides completed as passenger
    const ridesCompleted = await this.prisma.booking.count({
      where: {
        passengerId: targetUserId,
        status: BookingStatus.CONFIRMED,
        ride: { status: RideStatus.COMPLETED },
      },
    });

    return {
      id: target.id,
      fullName: target.fullName,
      avatarUrl: target.avatarUrl ?? null,
      audience: target.audience,
      verificationStatus: target.verificationStatus,
      memberSince: target.createdAt.toISOString(),
      driverRating: {
        averageRating: ratingAgg._avg.rating ? Math.round(ratingAgg._avg.rating * 10) / 10 : null,
        totalReviews: ratingAgg._count.id,
      },
      stats: {
        ridesOffered,
        ridesCompleted,
      },
    };
  }
}
