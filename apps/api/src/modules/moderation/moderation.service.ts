import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { User, ReportStatus } from '@vit-carpool/db';
import {
  CreateBlockDto,
  BlockResponseDto,
  BlockStatusResponseDto,
  CreateReportDto,
  ReportResponseDto,
} from '@vit-carpool/contracts';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  // ---------------------------------------------------------------------------
  // User Blocking
  // ---------------------------------------------------------------------------

  /**
   * Block a target user. Enforces self-blocking prevention and transactional audit logging.
   */
  async blockUser(
    blocker: User,
    targetUserId: string,
    dto: CreateBlockDto,
  ): Promise<BlockResponseDto> {
    if (blocker.id === targetUserId) {
      throw new BadRequestException('CANNOT_BLOCK_SELF: You cannot block yourself.');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, fullName: true, audience: true },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID ${targetUserId} not found.`);
    }

    // Check existing block (idempotency)
    const existing = await this.prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: blocker.id,
          blockedId: targetUserId,
        },
      },
    });

    if (existing) {
      return {
        id: existing.id,
        blockerId: existing.blockerId,
        blockedId: existing.blockedId,
        reason: existing.reason,
        createdAt: existing.createdAt.toISOString(),
        blockedUser: {
          id: targetUser.id,
          fullName: targetUser.fullName,
          audience: targetUser.audience,
        },
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const block = await tx.block.create({
        data: {
          blockerId: blocker.id,
          blockedId: targetUserId,
          reason: dto.reason?.trim() || null,
        },
      });

      await this.audit.log(
        {
          actorId: blocker.id,
          actorRole: blocker.role,
          action: 'USER_BLOCKED',
          targetType: 'USER',
          targetId: targetUserId,
          changes: { reason: dto.reason?.trim() || null },
        },
        tx,
      );

      return {
        id: block.id,
        blockerId: block.blockerId,
        blockedId: block.blockedId,
        reason: block.reason,
        createdAt: block.createdAt.toISOString(),
        blockedUser: {
          id: targetUser.id,
          fullName: targetUser.fullName,
          audience: targetUser.audience,
        },
      };
    });
  }

  /**
   * Unblock a target user. Idempotent under concurrent calls.
   */
  async unblockUser(
    blocker: User,
    targetUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: blocker.id,
          blockedId: targetUserId,
        },
      },
    });

    if (!existing) {
      return { success: true, message: 'User is not currently blocked.' };
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.block.delete({
        where: { id: existing.id },
      });

      await this.audit.log(
        {
          actorId: blocker.id,
          actorRole: blocker.role,
          action: 'USER_UNBLOCKED',
          targetType: 'USER',
          targetId: targetUserId,
          changes: {},
        },
        tx,
      );

      return { success: true, message: 'User unblocked successfully.' };
    });
  }

  /**
   * List users blocked by the authenticated caller.
   */
  async listBlockedUsers(blocker: User): Promise<BlockResponseDto[]> {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: blocker.id },
      include: {
        blocked: {
          select: { id: true, fullName: true, audience: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return blocks.map((b) => ({
      id: b.id,
      blockerId: b.blockerId,
      blockedId: b.blockedId,
      reason: b.reason,
      createdAt: b.createdAt.toISOString(),
      blockedUser: {
        id: b.blocked.id,
        fullName: b.blocked.fullName,
        audience: b.blocked.audience,
      },
    }));
  }

  /**
   * Check mutual block status between caller and target user.
   */
  async getBlockStatus(caller: User, targetUserId: string): Promise<BlockStatusResponseDto> {
    const [byMe, byThem] = await Promise.all([
      this.prisma.block.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: caller.id,
            blockedId: targetUserId,
          },
        },
      }),
      this.prisma.block.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: targetUserId,
            blockedId: caller.id,
          },
        },
      }),
    ]);

    const isBlockedByMe = !!byMe;
    const isBlockedByThem = !!byThem;

    return {
      isBlockedByMe,
      isBlockedByThem,
      isBlockedMutual: isBlockedByMe || isBlockedByThem,
    };
  }

  /**
   * Helper: Check if either user has blocked the other.
   */
  async isMutuallyBlocked(userId1: string, userId2: string): Promise<boolean> {
    if (userId1 === userId2) return false;
    const count = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: userId1, blockedId: userId2 },
          { blockerId: userId2, blockedId: userId1 },
        ],
      },
    });
    return count > 0;
  }

  /**
   * Helper: Get list of all user IDs that have a mutual block relationship with the given user.
   */
  async getMutualBlockedUserIds(userId: string): Promise<string[]> {
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: { blockerId: true, blockedId: true },
    });

    const set = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId === userId) {
        set.add(b.blockedId);
      } else {
        set.add(b.blockerId);
      }
    }

    return Array.from(set);
  }

  // ---------------------------------------------------------------------------
  // Incident Reporting
  // ---------------------------------------------------------------------------

  /**
   * Submit a structured incident report.
   * Enforces self-reporting rejection, relationship legitimacy, and rate-limiting.
   */
  async submitReport(reporter: User, dto: CreateReportDto): Promise<ReportResponseDto> {
    let reportedUserId = dto.reportedUserId;
    const rideId = dto.rideId;
    const bookingId = dto.bookingId;
    const messageId = dto.messageId;

    if (!reportedUserId && !rideId && !bookingId && !messageId) {
      throw new BadRequestException(
        'A report must specify at least one target (user, ride, booking, or message).',
      );
    }

    if (reportedUserId && reportedUserId === reporter.id) {
      throw new BadRequestException('CANNOT_REPORT_SELF: You cannot submit a report against yourself.');
    }

    // Validate ride reference if supplied
    if (rideId) {
      const ride = await this.prisma.ride.findUnique({
        where: { id: rideId },
        select: { id: true, driverId: true },
      });
      if (!ride) {
        throw new NotFoundException('Referenced ride not found.');
      }
      if (!reportedUserId && ride.driverId !== reporter.id) {
        reportedUserId = ride.driverId;
      }
    }

    // Validate booking reference if supplied
    if (bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, passengerId: true, driverId: true },
      });
      if (!booking) {
        throw new NotFoundException('Referenced booking not found.');
      }
      if (booking.passengerId !== reporter.id && booking.driverId !== reporter.id) {
        throw new ForbiddenException('You can only report bookings that you are a participant of.');
      }
      if (!reportedUserId) {
        reportedUserId = booking.passengerId === reporter.id ? booking.driverId : booking.passengerId;
      }
    }

    // Validate message reference if supplied
    if (messageId) {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        include: { conversation: true },
      });
      if (!message) {
        throw new NotFoundException('Referenced message not found.');
      }
      if (
        message.conversation.passengerId !== reporter.id &&
        message.conversation.driverId !== reporter.id
      ) {
        throw new ForbiddenException(
          'You can only report messages from conversations you participate in.',
        );
      }
      if (!reportedUserId && message.senderId !== reporter.id) {
        reportedUserId = message.senderId;
      }
    }

    if (reportedUserId && reportedUserId === reporter.id) {
      throw new BadRequestException('CANNOT_REPORT_SELF: You cannot submit a report against yourself.');
    }

    // Abuse prevention: reject duplicate identical reports submitted within 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentDuplicate = await this.prisma.report.findFirst({
      where: {
        reporterId: reporter.id,
        reportedUserId: reportedUserId ?? undefined,
        rideId: rideId ?? undefined,
        bookingId: bookingId ?? undefined,
        messageId: messageId ?? undefined,
        category: dto.category,
        createdAt: { gte: fiveMinutesAgo },
      },
    });

    if (recentDuplicate) {
      throw new ConflictException({
        error: 'DUPLICATE_REPORT',
        message: 'A duplicate report was already submitted recently. Our moderation team is reviewing it.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          reporterId: reporter.id,
          reportedUserId: reportedUserId ?? null,
          rideId: rideId ?? null,
          bookingId: bookingId ?? null,
          messageId: messageId ?? null,
          category: dto.category,
          description: dto.description.trim(),
          status: ReportStatus.PENDING,
        },
      });

      await this.audit.log(
        {
          actorId: reporter.id,
          actorRole: reporter.role,
          action: 'REPORT_SUBMITTED',
          targetType: 'REPORT',
          targetId: report.id,
          changes: {
            category: dto.category,
            reportedUserId,
            rideId,
            bookingId,
            messageId,
          },
        },
        tx,
      );

      return {
        id: report.id,
        reporterId: report.reporterId,
        reportedUserId: report.reportedUserId,
        rideId: report.rideId,
        bookingId: report.bookingId,
        messageId: report.messageId,
        category: report.category,
        description: report.description,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
      };
    });
  }
}
