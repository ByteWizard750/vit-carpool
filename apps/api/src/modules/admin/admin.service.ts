import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';
import {
  User,
  UserRole,
  ReportCategory,
  ReportStatus,
  VerificationStatus,
  RideStatus,
  BookingStatus,
  Audience,
  NotificationType,
  Prisma,
} from '@vit-carpool/db';
import {
  ResolveReportDto,
  SuspendUserDto,
  ReportResponseDto,
  AdminUserSummaryDto,
  InviteAdminDto,
  CreateModerationNoteDto,
  AdminOverviewStatsDto,
  AdminAnalyticsDto,
  AdminSystemHealthDto,
  AdminRideSummaryDto,
  AdminBookingSummaryDto,
} from '@vit-carpool/contracts';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly appStartTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. Overview & Operational KPIs
  // ---------------------------------------------------------------------------

  async getOverviewStats(): Promise<AdminOverviewStatsDto & { recentActivity: any[]; recentRegistrations: any[] }> {
    const [
      totalUsers,
      studentUsers,
      facultyUsers,
      suspendedUsers,
      totalRides,
      activeRides,
      completedRides,
      cancelledRides,
      totalBookings,
      confirmedBookings,
      pendingVerifications,
      openReports,
      recentActivity,
      recentRegistrations,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { audience: Audience.STUDENT } }),
      this.prisma.user.count({ where: { audience: Audience.FACULTY } }),
      this.prisma.user.count({ where: { isSuspended: true } }),
      this.prisma.ride.count(),
      this.prisma.ride.count({ where: { status: RideStatus.SCHEDULED } }),
      this.prisma.ride.count({ where: { status: RideStatus.COMPLETED } }),
      this.prisma.ride.count({ where: { status: RideStatus.CANCELLED } }),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { status: BookingStatus.CONFIRMED } }),
      this.prisma.verificationRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.report.count({
        where: { status: { in: [ReportStatus.PENDING, ReportStatus.INVESTIGATING] } },
      }),
      this.prisma.auditLog.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fullName: true,
          email: true,
          audience: true,
          verificationStatus: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      totalUsers,
      studentUsers,
      facultyUsers,
      suspendedUsers,
      totalRides,
      activeRides,
      completedRides,
      cancelledRides,
      totalBookings,
      confirmedBookings,
      pendingVerifications,
      openReports,
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        actorId: a.actorId,
        actorRole: a.actorRole,
        createdAt: a.createdAt.toISOString(),
      })),
      recentRegistrations: recentRegistrations.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        audience: u.audience,
        verificationStatus: u.verificationStatus,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Report Management Queue
  // ---------------------------------------------------------------------------

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
  // 3. User Management & Account Suspension
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // 4. Ride Management & Oversight
  // ---------------------------------------------------------------------------

  async listRides(query: {
    search?: string;
    status?: RideStatus;
    audience?: Audience;
    page?: number;
    limit?: number;
  }): Promise<{ rides: AdminRideSummaryDto[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.RideWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.audience) where.audience = query.audience;

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { origin: { contains: term, mode: 'insensitive' } },
        { destination: { contains: term, mode: 'insensitive' } },
        { driver: { fullName: { contains: term, mode: 'insensitive' } } },
        { driver: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [rides, total] = await Promise.all([
      this.prisma.ride.findMany({
        where,
        include: {
          driver: { select: { id: true, fullName: true, email: true, audience: true } },
          vehicle: { select: { make: true, model: true, registrationNumber: true } },
          _count: { select: { bookings: true, reports: true } },
        },
        orderBy: { departureTime: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.ride.count({ where }),
    ]);

    const mappedRides: AdminRideSummaryDto[] = rides.map((r) => ({
      id: r.id,
      origin: r.origin,
      destination: r.destination,
      departureTime: r.departureTime.toISOString(),
      status: r.status,
      audience: r.audience,
      availableSeats: r.availableSeats,
      totalSeats: r.totalSeats,
      driver: {
        id: r.driver.id,
        fullName: r.driver.fullName,
        email: r.driver.email,
        audience: r.driver.audience,
      },
      vehicle: r.vehicle
        ? {
            make: r.vehicle.make,
            model: r.vehicle.model,
            registrationNumber: r.vehicle.registrationNumber,
          }
        : null,
      bookingsCount: r._count.bookings,
      reportsCount: r._count.reports,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      rides: mappedRides,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async cancelRide(
    adminUser: User,
    rideId: string,
    reason: string,
  ): Promise<{ message: string; cancelledBookingsCount: number }> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        bookings: {
          where: { status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] } },
        },
      },
    });

    if (!ride) {
      throw new NotFoundException(`Ride with ID ${rideId} not found.`);
    }

    if (ride.status === RideStatus.CANCELLED) {
      throw new BadRequestException('This ride is already cancelled.');
    }

    if (ride.status === RideStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a ride that has already been completed.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Cancel ride
      await tx.ride.update({
        where: { id: rideId },
        data: { status: RideStatus.CANCELLED },
      });

      // Cancel all active bookings
      const cancelledBookings = await tx.booking.updateMany({
        where: {
          rideId,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
        },
        data: {
          status: BookingStatus.CANCELLED,
          cancellationReason: `Cancelled by administration: ${reason.trim()}`,
          cancelledAt: new Date(),
        },
      });

      // Notify driver
      await tx.notification.create({
        data: {
          recipientId: ride.driverId,
          audience: ride.audience,
          type: NotificationType.RIDE_CANCELLED,
          title: 'Ride Cancelled by Administration',
          message: `Your ride from ${ride.origin} to ${ride.destination} was cancelled by moderators: ${reason.trim()}`,
          rideId,
        },
      });

      // Notify passengers
      for (const booking of ride.bookings) {
        await tx.notification.create({
          data: {
            recipientId: booking.passengerId,
            audience: ride.audience,
            type: NotificationType.RIDE_CANCELLED,
            title: 'Ride Cancelled by Administration',
            message: `The ride from ${ride.origin} to ${ride.destination} has been cancelled by campus moderators: ${reason.trim()}`,
            rideId,
            bookingId: booking.id,
          },
        });
      }

      await this.audit.log(
        {
          actorId: adminUser.id,
          actorRole: adminUser.role,
          action: 'RIDE_CANCELLED_BY_ADMIN',
          targetType: 'RIDE',
          targetId: rideId,
          changes: {
            reason: reason.trim(),
            driverId: ride.driverId,
            affectedBookings: cancelledBookings.count,
          },
        },
        tx,
      );

      return {
        message: 'Ride successfully cancelled by administration and participants notified.',
        cancelledBookingsCount: cancelledBookings.count,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Booking Oversight
  // ---------------------------------------------------------------------------

  async listBookings(query: {
    status?: BookingStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ bookings: AdminBookingSummaryDto[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = {};
    if (query.status) where.status = query.status;

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { passenger: { fullName: { contains: term, mode: 'insensitive' } } },
        { passenger: { email: { contains: term, mode: 'insensitive' } } },
        { driver: { fullName: { contains: term, mode: 'insensitive' } } },
        { ride: { origin: { contains: term, mode: 'insensitive' } } },
        { ride: { destination: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          passenger: { select: { fullName: true, email: true, audience: true } },
          driver: { select: { fullName: true, email: true } },
          ride: { select: { origin: true, destination: true, departureTime: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    const mappedBookings: AdminBookingSummaryDto[] = bookings.map((b) => ({
      id: b.id,
      rideId: b.rideId,
      passengerId: b.passengerId,
      passenger: {
        fullName: b.passenger.fullName,
        email: b.passenger.email,
        audience: b.passenger.audience,
      },
      driver: {
        fullName: b.driver.fullName,
        email: b.driver.email,
      },
      ride: {
        origin: b.ride.origin,
        destination: b.ride.destination,
        departureTime: b.ride.departureTime.toISOString(),
        status: b.ride.status,
      },
      requestedSeats: b.requestedSeats,
      status: b.status,
      boardingStatus: b.boardingStatus,
      createdAt: b.createdAt.toISOString(),
    }));

    return {
      bookings: mappedBookings,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Durable Activity & Audit Logs
  // ---------------------------------------------------------------------------

  async listAuditLogs(query: {
    action?: string;
    targetType?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ logs: any[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 25));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.targetType) where.targetType = query.targetType;

    if (query.search && query.search.trim().length > 0) {
      where.action = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs: logs.map((l) => ({
        id: l.id,
        actorId: l.actorId,
        actorRole: l.actorRole,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        changes: l.changes,
        ipAddress: l.ipAddress,
        userAgent: l.userAgent,
        createdAt: l.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // ---------------------------------------------------------------------------
  // 7. Operational Analytics
  // ---------------------------------------------------------------------------

  async getAnalytics(): Promise<AdminAnalyticsDto> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      recentUsers,
      recentRides,
      totalBookings,
      confirmedBookings,
      studentsCount,
      facultyCount,
      reports,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      }),
      this.prisma.ride.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, status: true },
      }),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { status: BookingStatus.CONFIRMED } }),
      this.prisma.user.count({ where: { audience: Audience.STUDENT } }),
      this.prisma.user.count({ where: { audience: Audience.FACULTY } }),
      this.prisma.report.groupBy({
        by: ['category'],
        _count: { category: true },
      }),
    ]);

    // Group user growth by date
    const growthMap = new Map<string, number>();
    for (const u of recentUsers) {
      const dateStr = u.createdAt.toISOString().slice(0, 10);
      growthMap.set(dateStr, (growthMap.get(dateStr) || 0) + 1);
    }

    const userGrowth = Array.from(growthMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    // Group ride activity
    const rideMap = new Map<string, { published: number; completed: number }>();
    for (const r of recentRides) {
      const dateStr = r.createdAt.toISOString().slice(0, 10);
      const entry = rideMap.get(dateStr) || { published: 0, completed: 0 };
      entry.published += 1;
      if (r.status === RideStatus.COMPLETED) entry.completed += 1;
      rideMap.set(dateStr, entry);
    }

    const rideActivity = Array.from(rideMap.entries()).map(([date, data]) => ({
      date,
      published: data.published,
      completed: data.completed,
    }));

    const reportDistribution: Record<string, number> = {};
    for (const r of reports) {
      reportDistribution[r.category] = r._count.category;
    }

    const conversionRate = totalBookings > 0 ? (confirmedBookings / totalBookings) * 100 : 0;

    return {
      userGrowth,
      rideActivity,
      bookingConversionRate: Math.round(conversionRate * 10) / 10,
      cohortDistribution: {
        students: studentsCount,
        faculty: facultyCount,
      },
      reportDistribution,
    };
  }

  // ---------------------------------------------------------------------------
  // 8. System Health Diagnostics
  // ---------------------------------------------------------------------------

  async getSystemHealth(): Promise<AdminSystemHealthDto> {
    const dbStart = Date.now();
    let dbStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
    let dbLatency = 0;
    let dbMessage = 'Database responsive.';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
    } catch (err: any) {
      dbStatus = 'UNHEALTHY';
      dbMessage = `Database error: ${err.message}`;
    }

    const emailStatus = this.emailService.isEmailConfigured ? 'HEALTHY' : 'DEGRADED';
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const emailMessage = this.emailService.isEmailConfigured
      ? `SMTP transport active via ${smtpHost}.`
      : 'Email SMTP not configured (using mock delivery).';

    const isS3 = process.env.STORAGE_PROVIDER === 's3' && Boolean(process.env.S3_BUCKET_NAME);
    const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads'));
    const storageHealthy = isS3 || fs.existsSync(uploadsDir);
    const storageMessage = isS3
      ? `AWS S3 private bucket storage active (${process.env.S3_BUCKET_NAME}).`
      : storageHealthy
        ? 'Local storage mounted.'
        : 'Uploads directory created on demand.';

    const now = new Date().toISOString();
    const overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' =
      dbStatus === 'UNHEALTHY'
        ? 'UNHEALTHY'
        : emailStatus === 'DEGRADED'
          ? 'DEGRADED'
          : 'HEALTHY';

    return {
      overallStatus,
      components: {
        database: {
          status: dbStatus,
          latencyMs: dbLatency,
          message: dbMessage,
          lastChecked: now,
        },
        emailService: {
          status: emailStatus,
          message: emailMessage,
          lastChecked: now,
        },
        webSockets: {
          status: 'HEALTHY',
          message: 'Tracking Gateway active on /tracking',
          lastChecked: now,
        },
        storage: {
          status: storageHealthy ? 'HEALTHY' : 'DEGRADED',
          message: storageMessage,
          lastChecked: now,
        },
      },
      uptimeSeconds: Math.floor((Date.now() - this.appStartTime) / 1000),
      version: '1.0.0-rc2',
    };
  }

  // ---------------------------------------------------------------------------
  // 9. Administrator Management (SUPER_ADMIN)
  // ---------------------------------------------------------------------------

  async listAdministrators(): Promise<{
    administrators: any[];
    pendingInvitations: any[];
  }> {
    const [admins, invitations] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          role: { in: [UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN] },
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isSuspended: true,
          createdAt: true,
          adminMfaVerifiedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.adminInvitation.findMany({
        where: {
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: {
          inviter: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      administrators: admins.map((a) => ({
        id: a.id,
        email: a.email,
        fullName: a.fullName,
        role: a.role,
        isSuspended: a.isSuspended,
        createdAt: a.createdAt.toISOString(),
        lastActiveAt: a.adminMfaVerifiedAt ? a.adminMfaVerifiedAt.toISOString() : null,
      })),
      pendingInvitations: invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
        inviter: {
          id: i.inviter.id,
          fullName: i.inviter.fullName,
          email: i.inviter.email,
        },
      })),
    };
  }

  async inviteAdministrator(
    superAdminUser: User,
    dto: InviteAdminDto,
  ): Promise<{ id: string; email: string; role: string; inviteToken: string; expiresAt: string }> {
    if (superAdminUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a SUPER_ADMIN can invite new administrators.');
    }

    const email = dto.email.trim().toLowerCase();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const invitation = await this.prisma.adminInvitation.create({
      data: {
        email,
        role: dto.role as UserRole,
        tokenHash,
        invitedBy: superAdminUser.id,
        expiresAt,
      },
    });

    await this.audit.log({
      actorId: superAdminUser.id,
      actorRole: superAdminUser.role,
      action: 'ADMIN_INVITATION_CREATED',
      targetType: 'ADMIN_INVITATION',
      targetId: invitation.id,
      changes: { email, role: dto.role, expiresAt: expiresAt.toISOString() },
    });

    return {
      id: invitation.id,
      email,
      role: dto.role,
      inviteToken: rawToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async revokeAdministrator(
    superAdminUser: User,
    targetUserId: string,
    reason: string,
  ): Promise<{ message: string }> {
    if (superAdminUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a SUPER_ADMIN can revoke administrator privileges.');
    }

    if (superAdminUser.id === targetUserId) {
      throw new BadRequestException('Cannot revoke your own administrative privileges.');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID ${targetUserId} not found.`);
    }

    // Safety constraint: Prevent accidental removal or demotion of the last active Super Administrator.
    if (targetUser.role === UserRole.SUPER_ADMIN) {
      const activeSuperAdmins = await this.prisma.user.count({
        where: {
          role: UserRole.SUPER_ADMIN,
          isSuspended: false,
        },
      });

      if (activeSuperAdmins <= 1) {
        throw new BadRequestException(
          'CANNOT_REVOKE_LAST_SUPER_ADMIN: At least one active Super Administrator must remain in the platform.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: { role: UserRole.USER },
      });

      // Revoke any pending invitations sent to this email
      await tx.adminInvitation.updateMany({
        where: { email: targetUser.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.audit.log(
        {
          actorId: superAdminUser.id,
          actorRole: superAdminUser.role,
          action: 'ADMIN_ROLE_REVOKED',
          targetType: 'USER',
          targetId: targetUserId,
          changes: {
            previousRole: targetUser.role,
            newRole: UserRole.USER,
            reason: reason.trim(),
          },
        },
        tx,
      );
    });

    return { message: `Administrator privileges successfully revoked for ${targetUser.email}.` };
  }

  // ---------------------------------------------------------------------------
  // 10. Internal Moderation Notes
  // ---------------------------------------------------------------------------

  async createModerationNote(
    adminUser: User,
    dto: CreateModerationNoteDto,
  ): Promise<{ id: string; content: string; createdAt: string }> {
    const note = await this.prisma.moderationNote.create({
      data: {
        authorId: adminUser.id,
        content: dto.content.trim(),
        targetUserId: dto.targetUserId ?? null,
        targetRideId: dto.targetRideId ?? null,
        targetReportId: dto.targetReportId ?? null,
      },
    });

    await this.audit.log({
      actorId: adminUser.id,
      actorRole: adminUser.role,
      action: 'MODERATION_NOTE_CREATED',
      targetType: 'MODERATION_NOTE',
      targetId: note.id,
      changes: {
        targetUserId: dto.targetUserId,
        targetRideId: dto.targetRideId,
        targetReportId: dto.targetReportId,
      },
    });

    return {
      id: note.id,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    };
  }

  async listModerationNotes(query: {
    targetUserId?: string;
    targetRideId?: string;
    targetReportId?: string;
  }) {
    return this.prisma.moderationNote.findMany({
      where: {
        targetUserId: query.targetUserId,
        targetRideId: query.targetRideId,
        targetReportId: query.targetReportId,
      },
      include: {
        author: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
