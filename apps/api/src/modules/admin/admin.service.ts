import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import {
  User,
  UserRole,
  ReportCategory,
  ReportStatus,
  VerificationStatus,
  Prisma,
} from '@vit-carpool/db';
import {
  ResolveReportDto,
  SuspendUserDto,
  ReportResponseDto,
  AdminUserSummaryDto,
} from '@vit-carpool/contracts';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  // ---------------------------------------------------------------------------
  // Report Management Queue
  // ---------------------------------------------------------------------------

  /**
   * List incident reports with optional filtering by status and category, paginated.
   */
  async listReports(query: {
    status?: ReportStatus;
    category?: ReportCategory;
    page?: number;
    limit?: number;
  }): Promise<{ reports: ReportResponseDto[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ReportWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: {
          reporter: {
            select: { id: true, fullName: true, email: true, audience: true },
          },
          reportedUser: {
            select: { id: true, fullName: true, email: true, audience: true, isSuspended: true },
          },
          ride: {
            select: { id: true, origin: true, destination: true, departureTime: true },
          },
          booking: {
            select: { id: true, status: true, requestedSeats: true },
          },
          message: {
            select: { id: true, content: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);

    const mappedReports: ReportResponseDto[] = reports.map((r) => ({
      id: r.id,
      reporterId: r.reporterId,
      reportedUserId: r.reportedUserId,
      rideId: r.rideId,
      bookingId: r.bookingId,
      messageId: r.messageId,
      category: r.category,
      description: r.description,
      status: r.status,
      resolutionNotes: r.resolutionNotes,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      reporter: r.reporter
        ? {
            id: r.reporter.id,
            fullName: r.reporter.fullName,
            email: r.reporter.email,
            audience: r.reporter.audience,
          }
        : undefined,
      reportedUser: r.reportedUser
        ? {
            id: r.reportedUser.id,
            fullName: r.reportedUser.fullName,
            email: r.reportedUser.email,
            audience: r.reportedUser.audience,
            isSuspended: r.reportedUser.isSuspended,
          }
        : null,
      ride: r.ride
        ? {
            id: r.ride.id,
            origin: r.ride.origin,
            destination: r.ride.destination,
            departureTime: r.ride.departureTime.toISOString(),
          }
        : null,
      booking: r.booking
        ? {
            id: r.booking.id,
            status: r.booking.status,
            requestedSeats: r.booking.requestedSeats,
          }
        : null,
      message: r.message
        ? {
            id: r.message.id,
            content: r.message.content,
            createdAt: r.message.createdAt.toISOString(),
          }
        : null,
    }));

    return {
      reports: mappedReports,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get single report details with full context.
   */
  async getReportById(id: string): Promise<ReportResponseDto> {
    const r = await this.prisma.report.findUnique({
      where: { id },
      include: {
        reporter: {
          select: { id: true, fullName: true, email: true, audience: true },
        },
        reportedUser: {
          select: { id: true, fullName: true, email: true, audience: true, isSuspended: true },
        },
        ride: {
          select: { id: true, origin: true, destination: true, departureTime: true },
        },
        booking: {
          select: { id: true, status: true, requestedSeats: true },
        },
        message: {
          select: { id: true, content: true, createdAt: true },
        },
      },
    });

    if (!r) {
      throw new NotFoundException(`Report with ID ${id} not found.`);
    }

    return {
      id: r.id,
      reporterId: r.reporterId,
      reportedUserId: r.reportedUserId,
      rideId: r.rideId,
      bookingId: r.bookingId,
      messageId: r.messageId,
      category: r.category,
      description: r.description,
      status: r.status,
      resolutionNotes: r.resolutionNotes,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      reporter: r.reporter
        ? {
            id: r.reporter.id,
            fullName: r.reporter.fullName,
            email: r.reporter.email,
            audience: r.reporter.audience,
          }
        : undefined,
      reportedUser: r.reportedUser
        ? {
            id: r.reportedUser.id,
            fullName: r.reportedUser.fullName,
            email: r.reportedUser.email,
            audience: r.reportedUser.audience,
            isSuspended: r.reportedUser.isSuspended,
          }
        : null,
      ride: r.ride
        ? {
            id: r.ride.id,
            origin: r.ride.origin,
            destination: r.ride.destination,
            departureTime: r.ride.departureTime.toISOString(),
          }
        : null,
      booking: r.booking
        ? {
            id: r.booking.id,
            status: r.booking.status,
            requestedSeats: r.booking.requestedSeats,
          }
        : null,
      message: r.message
        ? {
            id: r.message.id,
            content: r.message.content,
            createdAt: r.message.createdAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Transition report status to INVESTIGATING.
   */
  async investigateReport(adminUser: User, id: string): Promise<ReportResponseDto> {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found.`);
    }

    if (report.status !== ReportStatus.PENDING) {
      throw new BadRequestException('Only PENDING reports can be set to INVESTIGATING.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id },
        data: {
          status: ReportStatus.INVESTIGATING,
          reviewedBy: adminUser.id,
        },
      });

      await this.audit.log(
        {
          actorId: adminUser.id,
          actorRole: adminUser.role,
          action: 'REPORT_INVESTIGATING',
          targetType: 'REPORT',
          targetId: id,
          changes: { previousStatus: report.status, newStatus: ReportStatus.INVESTIGATING },
        },
        tx,
      );
    });

    return this.getReportById(id);
  }

  /**
   * Resolve or dismiss an incident report with mandatory resolution notes.
   */
  async resolveReport(
    adminUser: User,
    id: string,
    dto: ResolveReportDto,
  ): Promise<ReportResponseDto> {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found.`);
    }

    if (report.status === ReportStatus.RESOLVED || report.status === ReportStatus.DISMISSED) {
      throw new BadRequestException('This report has already been finalized.');
    }

    const targetStatus =
      dto.status === 'RESOLVED' ? ReportStatus.RESOLVED : ReportStatus.DISMISSED;

    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id },
        data: {
          status: targetStatus,
          resolutionNotes: dto.resolutionNotes.trim(),
          reviewedBy: adminUser.id,
          reviewedAt: new Date(),
        },
      });

      await this.audit.log(
        {
          actorId: adminUser.id,
          actorRole: adminUser.role,
          action: targetStatus === ReportStatus.RESOLVED ? 'REPORT_RESOLVED' : 'REPORT_DISMISSED',
          targetType: 'REPORT',
          targetId: id,
          changes: {
            previousStatus: report.status,
            newStatus: targetStatus,
            resolutionNotes: dto.resolutionNotes.trim(),
          },
        },
        tx,
      );
    });

    return this.getReportById(id);
  }

  // ---------------------------------------------------------------------------
  // User Management & Account Suspension
  // ---------------------------------------------------------------------------

  /**
   * List/search users with pagination and status filters.
   */
  async listUsers(query: {
    search?: string;
    status?: string;
    role?: string;
    page?: number;
    limit?: number;
  }): Promise<{ users: AdminUserSummaryDto[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { email: { contains: term, mode: 'insensitive' } },
        { fullName: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      if (query.status === 'SUSPENDED') {
        where.isSuspended = true;
      } else if (Object.values(VerificationStatus).includes(query.status as VerificationStatus)) {
        where.verificationStatus = query.status as VerificationStatus;
      }
    }

    if (query.role && Object.values(UserRole).includes(query.role as UserRole)) {
      where.role = query.role as UserRole;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneNumber: true,
          audience: true,
          role: true,
          verificationStatus: true,
          verificationMethod: true,
          isSuspended: true,
          suspensionReason: true,
          suspendedAt: true,
          createdAt: true,
          _count: {
            select: { receivedReports: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const mappedUsers: AdminUserSummaryDto[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      phoneNumber: u.phoneNumber,
      audience: u.audience,
      role: u.role,
      verificationStatus: u.verificationStatus,
      verificationMethod: u.verificationMethod,
      isSuspended: u.isSuspended,
      suspensionReason: u.suspensionReason,
      suspendedAt: u.suspendedAt ? u.suspendedAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      reportsCount: u._count.receivedReports,
    }));

    return {
      users: mappedUsers,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Suspend an account. Prohibits self-suspension and writes immutable audit record.
   */
  async suspendUser(
    adminUser: User,
    targetUserId: string,
    dto: SuspendUserDto,
  ): Promise<AdminUserSummaryDto> {
    if (adminUser.id === targetUserId) {
      throw new BadRequestException('CANNOT_SUSPEND_SELF: Administrators cannot suspend their own account.');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        _count: { select: { receivedReports: true } },
      },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID ${targetUserId} not found.`);
    }

    if (targetUser.isSuspended) {
      throw new BadRequestException('This account is already suspended.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          isSuspended: true,
          verificationStatus: VerificationStatus.SUSPENDED,
          suspensionReason: dto.reason.trim(),
          suspendedAt: new Date(),
          suspendedBy: adminUser.id,
        },
      });

      await this.audit.log(
        {
          actorId: adminUser.id,
          actorRole: adminUser.role,
          action: 'USER_SUSPENDED',
          targetType: 'USER',
          targetId: targetUserId,
          changes: {
            reason: dto.reason.trim(),
            previousStatus: targetUser.verificationStatus,
          },
        },
        tx,
      );

      return {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        phoneNumber: updated.phoneNumber,
        audience: updated.audience,
        role: updated.role,
        verificationStatus: updated.verificationStatus,
        verificationMethod: updated.verificationMethod,
        isSuspended: updated.isSuspended,
        suspensionReason: updated.suspensionReason,
        suspendedAt: updated.suspendedAt ? updated.suspendedAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        reportsCount: targetUser._count.receivedReports,
      };
    });
  }

  /**
   * Reinstate a suspended user.
   * Restores status to VERIFIED if they were previously verified, or PENDING.
   */
  async reinstateUser(adminUser: User, targetUserId: string): Promise<AdminUserSummaryDto> {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        _count: { select: { receivedReports: true } },
      },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID ${targetUserId} not found.`);
    }

    if (!targetUser.isSuspended) {
      throw new BadRequestException('This account is not currently suspended.');
    }

    const restoredStatus = targetUser.verifiedAt
      ? VerificationStatus.VERIFIED
      : VerificationStatus.PENDING;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          isSuspended: false,
          verificationStatus: restoredStatus,
          suspensionReason: null,
          suspendedAt: null,
          suspendedBy: null,
        },
      });

      await this.audit.log(
        {
          actorId: adminUser.id,
          actorRole: adminUser.role,
          action: 'USER_REINSTATED',
          targetType: 'USER',
          targetId: targetUserId,
          changes: {
            restoredStatus,
            previousReason: targetUser.suspensionReason,
          },
        },
        tx,
      );

      return {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        phoneNumber: updated.phoneNumber,
        audience: updated.audience,
        role: updated.role,
        verificationStatus: updated.verificationStatus,
        verificationMethod: updated.verificationMethod,
        isSuspended: updated.isSuspended,
        suspensionReason: updated.suspensionReason,
        suspendedAt: null,
        createdAt: updated.createdAt.toISOString(),
        reportsCount: targetUser._count.receivedReports,
      };
    });
  }
}
