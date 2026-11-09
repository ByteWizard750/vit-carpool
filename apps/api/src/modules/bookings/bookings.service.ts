import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { User, Ride, Vehicle, Booking, BookingStatus, RideStatus, BoardingStatus, NotificationType, Prisma, RideType } from '@vit-carpool/db';
import {
  CreateBookingRequestDto,
  CancelBookingDto,
  RejectBookingDto,
  PassengerBookingResponseDto,
  DriverBookingResponseDto,
  BoardingOtpResponseDto,
  VerifyBoardingResponseDto,
  MarkNoShowResponseDto,
  CabFareAcknowledgementDto,
  calculateCabFareSplit,
} from '@vit-carpool/contracts';
import { NotificationsService } from '../notifications/notifications.service';
import { ModerationService } from '../moderation/moderation.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { BoardingOtpService } from './boarding-otp.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly notificationsService: NotificationsService,
    private readonly moderationService: ModerationService,
    private readonly boardingOtpService: BoardingOtpService,
    @Optional() private readonly trackingGateway?: TrackingGateway,
  ) {}

  /**
   * Helper to format booking to PassengerBookingResponseDto.
   * Conceals private landmark descriptions and driver phone unless status === 'CONFIRMED'.
   */
  private toPassengerBookingDto(
    booking: Booking & {
      ride: Ride & { driver?: User | null; vehicle?: Vehicle | null; cabShareDetail?: any };
      cabFareAcknowledgements?: any[];
    },
  ): PassengerBookingResponseDto {
    const isConfirmed = booking.status === BookingStatus.CONFIRMED;
    const cabShareDetail = booking.ride.cabShareDetail;
    let cabShareSummary = undefined;
    if (cabShareDetail) {
      const activeFare = cabShareDetail.finalTotalFare ?? cabShareDetail.estimatedTotalFare;
      const confirmedPassengerSeats = Math.max(0, (cabShareDetail.totalCapacity - 1) - booking.ride.availableSeats);
      const split = calculateCabFareSplit(activeFare, cabShareDetail.totalCapacity, confirmedPassengerSeats);
      cabShareSummary = {
        totalCapacity: cabShareDetail.totalCapacity,
        estimatedTotalFare: cabShareDetail.estimatedTotalFare,
        finalTotalFare: cabShareDetail.finalTotalFare ?? null,
        fareRevision: cabShareDetail.fareRevision,
        bookingDeadline: typeof cabShareDetail.bookingDeadline?.toISOString === 'function'
          ? cabShareDetail.bookingDeadline.toISOString()
          : cabShareDetail.bookingDeadline,
        cabService: cabShareDetail.cabService ?? null,
        estimatedPerPersonIfFull: split.estimatedPerPersonIfFull,
        currentPerPerson: split.currentPerPerson,
        totalConfirmedParticipants: split.confirmedParticipants,
      };
    }

    const acks = booking.cabFareAcknowledgements;
    const fareRevisionAcknowledged = acks && acks.length > 0
      ? Math.max(...acks.map((a: any) => a.fareRevision))
      : null;

    return {
      id: booking.id,
      rideId: booking.rideId,
      passengerId: booking.passengerId,
      driverId: booking.driverId,
      audience: booking.audience,
      requestedSeats: booking.requestedSeats,
      status: booking.status,
      pickupAddress: booking.pickupAddress,
      pickupLatitude: booking.pickupLatitude,
      pickupLongitude: booking.pickupLongitude,
      pickupDescription: isConfirmed ? (booking.pickupDescription || booking.ride.pickupDescription) : undefined,
      boardingStatus: booking.boardingStatus,
      boardedAt: booking.boardedAt ? booking.boardedAt.toISOString() : null,
      proximityNotifiedAt: booking.proximityNotifiedAt ? booking.proximityNotifiedAt.toISOString() : null,
      confirmedAt: booking.confirmedAt ? booking.confirmedAt.toISOString() : null,
      rejectedAt: booking.rejectedAt ? booking.rejectedAt.toISOString() : null,
      cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
      cancellationReason: booking.cancellationReason,
      fareRevisionAcknowledged,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      ride: {
        id: booking.ride.id,
        rideType: (booking.ride.rideType as any) || 'VEHICLE_RIDE',
        origin: booking.ride.origin,
        destination: booking.ride.destination,
        departureTime: booking.ride.departureTime.toISOString(),
        availableSeats: booking.ride.availableSeats,
        costPerSeat: booking.ride.costPerSeat,
        status: booking.ride.status,
        driverName: booking.ride.driver?.fullName || 'Verified Driver',
        driverAvatarUrl: booking.ride.driver?.avatarUrl ?? null,
        // Privacy protection: Landmark notes and contact info disclosed ONLY if confirmed
        pickupDescription: isConfirmed ? booking.ride.pickupDescription : undefined,
        dropoffDescription: isConfirmed ? booking.ride.dropoffDescription : undefined,
        driverPhone: isConfirmed ? booking.ride.driver?.phoneNumber : undefined,
        vehicle: booking.ride.vehicle
          ? {
              id: booking.ride.vehicle.id,
              make: booking.ride.vehicle.make,
              model: booking.ride.vehicle.model,
              color: booking.ride.vehicle.color,
              capacity: booking.ride.vehicle.capacity,
              imageUrl: booking.ride.vehicle.imageUrl ?? null,
            }
          : undefined,
        cabShare: cabShareSummary,
      },
    };
  }

  /**
   * Helper to format booking to DriverBookingResponseDto.
   * Discloses passenger phone number only when status === 'CONFIRMED'.
   */
  private toDriverBookingDto(
    booking: Booking & {
      passenger?: User | null;
      ride: Ride & { cabShareDetail?: any };
    },
  ): DriverBookingResponseDto {
    const isConfirmed = booking.status === BookingStatus.CONFIRMED;
    const cabShareDetail = (booking.ride as any).cabShareDetail;

    return {
      id: booking.id,
      rideId: booking.rideId,
      passengerId: booking.passengerId,
      passengerName: booking.passenger?.fullName || 'Verified Passenger',
      passengerAvatarUrl: booking.passenger?.avatarUrl ?? null,
      passengerPhone: isConfirmed ? booking.passenger?.phoneNumber : undefined,
      driverId: booking.driverId,
      audience: booking.audience,
      requestedSeats: booking.requestedSeats,
      status: booking.status,
      pickupAddress: booking.pickupAddress,
      pickupLatitude: booking.pickupLatitude,
      pickupLongitude: booking.pickupLongitude,
      pickupDescription: isConfirmed ? (booking.pickupDescription || booking.ride.pickupDescription) : undefined,
      boardingStatus: booking.boardingStatus,
      boardedAt: booking.boardedAt ? booking.boardedAt.toISOString() : null,
      proximityNotifiedAt: booking.proximityNotifiedAt ? booking.proximityNotifiedAt.toISOString() : null,
      confirmedAt: booking.confirmedAt ? booking.confirmedAt.toISOString() : null,
      rejectedAt: booking.rejectedAt ? booking.rejectedAt.toISOString() : null,
      cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
      cancellationReason: booking.cancellationReason,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      ride: {
        id: booking.ride.id,
        rideType: (booking.ride.rideType as any) || 'VEHICLE_RIDE',
        origin: booking.ride.origin,
        destination: booking.ride.destination,
        departureTime: booking.ride.departureTime.toISOString(),
        availableSeats: booking.ride.availableSeats,
        totalSeats: booking.ride.totalSeats,
        status: booking.ride.status,
        cabShare: cabShareDetail
          ? {
              id: cabShareDetail.id,
              rideId: cabShareDetail.rideId,
              totalCapacity: cabShareDetail.totalCapacity,
              estimatedTotalFare: cabShareDetail.estimatedTotalFare,
              finalTotalFare: cabShareDetail.finalTotalFare ?? null,
              fareRevision: cabShareDetail.fareRevision,
              bookingDeadline: typeof cabShareDetail.bookingDeadline?.toISOString === 'function'
                ? cabShareDetail.bookingDeadline.toISOString()
                : cabShareDetail.bookingDeadline,
              cabService: cabShareDetail.cabService ?? null,
              cabBookingRef: cabShareDetail.cabBookingRef ?? null,
              createdAt: typeof cabShareDetail.createdAt?.toISOString === 'function'
                ? cabShareDetail.createdAt.toISOString()
                : cabShareDetail.createdAt,
              updatedAt: typeof cabShareDetail.updatedAt?.toISOString === 'function'
                ? cabShareDetail.updatedAt.toISOString()
                : cabShareDetail.updatedAt,
            }
          : null,
      },
    };
  }

  /**
   * Request seats on a scheduled ride.
   * Pending requests do NOT reserve or decrement available seats.
   */
  async requestBooking(
    user: User,
    dto: CreateBookingRequestDto,
  ): Promise<PassengerBookingResponseDto> {
    if (!user.audience) {
      throw new BadRequestException('User must have an assigned institutional audience to book rides.');
    }

    // 1. Fetch target ride
    const ride = await this.prisma.ride.findUnique({
      where: { id: dto.rideId },
      include: {
        driver: true,
        vehicle: true,
        cabShareDetail: true,
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found.');
    }

    // 2. Strict Cohort Isolation (404 for opposite audience)
    if (ride.audience !== user.audience) {
      throw new NotFoundException('Ride not found or not accessible.');
    }

    // 3. Driver/Organiser cannot book their own ride
    if (ride.driverId === user.id) {
      throw new BadRequestException(
        ride.rideType === RideType.CAB_SHARE
          ? 'Organisers cannot book seats on their own rides.'
          : 'Drivers cannot book seats on their own rides.',
      );
    }

    // 3.1 Mutual blocking check
    const isBlocked = await this.moderationService.isMutuallyBlocked(user.id, ride.driverId);
    if (isBlocked) {
      throw new ForbiddenException({
        error: 'BOOKING_NOT_PERMITTED',
        message: 'You cannot book seats on a ride involving a blocked user.',
      });
    }

    // 4. Validate ride eligibility
    if (ride.status === RideStatus.CANCELLED) {
      throw new BadRequestException('Cannot request seats on a cancelled ride.');
    }

    if (ride.status === RideStatus.COMPLETED) {
      throw new BadRequestException('Cannot request seats on a completed ride.');
    }

    if (ride.status === RideStatus.IN_PROGRESS) {
      throw new BadRequestException('Cannot request seats on a ride that is already in progress.');
    }

    if (ride.departureTime.getTime() <= Date.now()) {
      throw new BadRequestException('Cannot request seats on a ride that has already departed.');
    }

    if (ride.rideType === RideType.CAB_SHARE && ride.cabShareDetail) {
      if (ride.cabShareDetail.bookingDeadline.getTime() <= Date.now()) {
        throw new BadRequestException('The booking deadline for this cab share journey has passed.');
      }
    }

    if (dto.requestedSeats > ride.availableSeats) {
      throw new BadRequestException(
        `Requested seats (${dto.requestedSeats}) exceed currently available seats (${ride.availableSeats}).`,
      );
    }

    // 5. Check for existing active booking (PENDING or CONFIRMED)
    const existingActive = await this.prisma.booking.findFirst({
      where: {
        rideId: dto.rideId,
        passengerId: user.id,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      },
    });

    if (existingActive) {
      throw new ConflictException(
        'You already have an active booking request (pending or confirmed) for this ride.',
      );
    }

    // 6. Create booking and audit record atomically
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            rideId: ride!.id,
            passengerId: user.id,
            driverId: ride!.driverId,
            audience: user.audience!,
            requestedSeats: dto.requestedSeats,
            status: BookingStatus.PENDING,
            pickupAddress: dto.pickupAddress ?? ride!.originAddress ?? null,
            pickupLatitude: dto.pickupLatitude ?? ride!.originLatitude ?? null,
            pickupLongitude: dto.pickupLongitude ?? ride!.originLongitude ?? null,
            pickupDescription: dto.pickupDescription ?? ride!.pickupDescription ?? null,
          },
          include: {
            ride: {
              include: {
                driver: true,
                vehicle: true,
                cabShareDetail: true,
              },
            },
            cabFareAcknowledgements: true,
          },
        });

        await this.audit.log(
          {
            actorId: user.id,
            actorRole: user.role,
            action: 'BOOKING_REQUESTED',
            targetType: 'BOOKING',
            targetId: booking.id,
            changes: {
              rideId: booking.rideId,
              requestedSeats: booking.requestedSeats,
              status: booking.status,
            },
          },
          tx,
        );

        return this.toPassengerBookingDto(booking);
      });

      // Post-commit: Notify driver of new booking request
      try {
        await this.notificationsService.createNotification({
          recipientId: ride!.driverId,
          audience: user.audience!,
          type: NotificationType.BOOKING_REQUESTED,
          title: '🙋 New Booking Request',
          message: `${user.fullName} requested ${dto.requestedSeats} seat(s) for your ride to ${ride!.destination}.`,
          rideId: ride!.id,
          bookingId: result.id,
          dedupKey: `booking_requested:${result.id}`,
        });
      } catch (err) {
        this.logger.error(`[BookingsService] Failed to notify driver of booking request: ${err}`);
      }

      return result;
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          // Unique constraint violation on idx_bookings_active_unique
          throw new ConflictException(
            'You already have an active booking request for this ride.',
          );
        }
      }
      throw err;
    }
  }

  /**
   * View all bookings where the caller is the passenger.
   */
  async getMyBookings(user: User): Promise<PassengerBookingResponseDto[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        passengerId: user.id,
      },
      include: {
        ride: {
          include: {
            driver: true,
            vehicle: true,
            cabShareDetail: true,
          },
        },
        cabFareAcknowledgements: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return bookings.map((b) => this.toPassengerBookingDto(b));
  }

  /**
   * View all booking requests on rides published by the authenticated driver.
   */
  async getDriverBookings(
    user: User,
    rideId?: string,
    status?: BookingStatus,
  ): Promise<DriverBookingResponseDto[]> {
    const where: Prisma.BookingWhereInput = {
      driverId: user.id,
      ...(rideId ? { rideId } : {}),
      ...(status ? { status } : {}),
    };

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        passenger: true,
        ride: {
          include: {
            cabShareDetail: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return bookings.map((b) => this.toDriverBookingDto(b));
  }

  /**
   * View details of a specific booking.
   * Authorized strictly for the passenger or the ride's driver.
   */
  async getBookingById(
    user: User,
    bookingId: string,
  ): Promise<PassengerBookingResponseDto | DriverBookingResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        passenger: true,
        cabFareAcknowledgements: true,
        ride: {
          include: {
            driver: true,
            vehicle: true,
            cabShareDetail: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    // Strict Cohort Isolation
    if (booking.audience !== user.audience) {
      throw new NotFoundException('Booking not found or not accessible.');
    }

    if (booking.passengerId !== user.id && booking.driverId !== user.id) {
      throw new NotFoundException('Booking not found or not accessible.');
    }

    if (booking.passengerId === user.id) {
      return this.toPassengerBookingDto(booking);
    }

    return this.toDriverBookingDto(booking);
  }

  /**
   * Approve a pending booking request (Driver only).
   * Atomically locks ride row, verifies seat availability, decrements seats, and updates booking.
   */
  async approveBooking(user: User, bookingId: string): Promise<DriverBookingResponseDto> {
    const { result, notificationData } = await this.prisma.$transaction(async (tx) => {
      // 1. Fetch booking
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          passenger: true,
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking request not found.');
      }

      if (booking.driverId !== user.id) {
        throw new NotFoundException('Booking request not found or you are not the driver.');
      }

      if (booking.status !== BookingStatus.PENDING) {
        throw new BadRequestException(`Cannot approve booking in ${booking.status} status.`);
      }

      // 2. Lock the associated ride row exclusively for update
      const lockedRides = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM rides
        WHERE id = ${booking.rideId}::uuid
        FOR UPDATE
      `;

      if (!lockedRides.length) {
        throw new NotFoundException('Associated ride not found.');
      }

      // 3. Re-read ride state under row lock
      const ride = await tx.ride.findUniqueOrThrow({
        where: { id: booking.rideId },
        include: { vehicle: true },
      });

      if (ride.driverId !== user.id) {
        throw new NotFoundException('You do not own this ride.');
      }

      if (ride.status === RideStatus.CANCELLED) {
        throw new BadRequestException('Cannot approve booking for a cancelled ride.');
      }

      if (ride.status === RideStatus.COMPLETED) {
        throw new BadRequestException('Cannot approve booking for a completed ride.');
      }

      if (ride.departureTime.getTime() <= Date.now()) {
        throw new BadRequestException('Cannot approve booking for a ride that has already departed.');
      }

      if (ride.rideType === RideType.CAB_SHARE) {
        const cabDetail = await tx.cabShareDetail.findUnique({ where: { rideId: ride.id } });
        if (cabDetail && cabDetail.bookingDeadline.getTime() <= Date.now()) {
          throw new BadRequestException('The booking deadline for this cab share journey has passed.');
        }
      }

      // 4. Validate seat availability
      if (ride.availableSeats < booking.requestedSeats) {
        throw new ConflictException(
          `Insufficient seats available. Requested: ${booking.requestedSeats}, Available: ${ride.availableSeats}.`,
        );
      }

      // 5. Decrement ride available seats
      const newAvailableSeats = ride.availableSeats - booking.requestedSeats;
      await tx.ride.update({
        where: { id: ride.id },
        data: { availableSeats: newAvailableSeats },
      });

      // 6. Generate secure Boarding OTP and transition booking to CONFIRMED
      const otpData = this.boardingOtpService.generateBoardingOtp(bookingId);

      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CONFIRMED,
          confirmedAt: new Date(),
          boardingOtpHash: otpData.hash,
          boardingOtpSalt: otpData.salt,
          boardingOtpEncrypted: otpData.encrypted,
          boardingOtpExpiresAt: otpData.expiresAt,
          boardingOtpFailedAttempts: 0,
          boardingOtpRegenCount: 0,
        },
        include: {
          passenger: true,
          ride: {
            include: {
              cabShareDetail: true,
            },
          },
        },
      });

      // 7. Audit logging
      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'BOOKING_APPROVED',
          targetType: 'BOOKING',
          targetId: booking.id,
          changes: {
            rideId: ride.id,
            passengerId: booking.passengerId,
            allocatedSeats: booking.requestedSeats,
            previousAvailableSeats: ride.availableSeats,
            newAvailableSeats,
          },
        },
        tx,
      );

      return {
        result: this.toDriverBookingDto(updatedBooking),
        notificationData: {
          recipientId: booking.passengerId,
          audience: booking.audience || user.audience!,
          type: NotificationType.BOOKING_APPROVED,
          title: '✅ Booking Approved!',
          message: `Your booking for ${ride.origin} → ${ride.destination} was approved by the driver.`,
          rideId: ride.id,
          bookingId: booking.id,
          dedupKey: `booking_approved:${booking.id}`,
        },
      };
    });

    // Post-commit: Notify passenger that booking was approved
    try {
      await this.notificationsService.createNotification(notificationData);
    } catch (err) {
      this.logger.error(`[BookingsService] Failed to notify passenger of booking approval: ${err}`);
    }

    return result;
  }

  /**
   * Reject a pending booking request (Driver only).
   */
  async rejectBooking(
    user: User,
    bookingId: string,
    dto?: RejectBookingDto,
  ): Promise<DriverBookingResponseDto> {
    const { result, notificationData } = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          passenger: true,
          ride: {
            include: {
              cabShareDetail: true,
            },
          },
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking request not found.');
      }

      if (booking.driverId !== user.id) {
        throw new NotFoundException('Booking request not found or you are not the driver.');
      }

      if (booking.status !== BookingStatus.PENDING) {
        throw new BadRequestException(`Cannot reject booking in ${booking.status} status.`);
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.REJECTED,
          rejectedAt: new Date(),
          cancellationReason: dto?.reason?.trim() || null,
        },
        include: {
          passenger: true,
          ride: {
            include: {
              cabShareDetail: true,
            },
          },
        },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'BOOKING_REJECTED',
          targetType: 'BOOKING',
          targetId: booking.id,
          changes: {
            rideId: booking.rideId,
            passengerId: booking.passengerId,
            reason: dto?.reason || null,
          },
        },
        tx,
      );

      return {
        result: this.toDriverBookingDto(updated),
        notificationData: {
          recipientId: booking.passengerId,
          audience: booking.audience || user.audience!,
          type: NotificationType.BOOKING_REJECTED,
          title: '⚠️ Booking Declined',
          message: dto?.reason?.trim()
            ? `Your booking request for ${booking.ride.origin} → ${booking.ride.destination} was declined: "${dto.reason.trim()}".`
            : `Your booking request for ${booking.ride.origin} → ${booking.ride.destination} was declined by the driver.`,
          rideId: booking.rideId,
          bookingId: booking.id,
          dedupKey: `booking_rejected:${booking.id}`,
        },
      };
    });

    // Post-commit: Notify passenger that booking was rejected
    try {
      await this.notificationsService.createNotification(notificationData);
    } catch (err) {
      this.logger.error(`[BookingsService] Failed to notify passenger of booking rejection: ${err}`);
    }

    return result;
  }

  /**
   * Cancel passenger's own booking (Pending or Confirmed).
   * If Confirmed, safely restores seats to the ride without exceeding total capacity.
   */
  async cancelBooking(
    user: User,
    bookingId: string,
    dto?: CancelBookingDto,
  ): Promise<PassengerBookingResponseDto> {
    const { result, notificationData } = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          ride: {
            include: {
              driver: true,
              vehicle: true,
              cabShareDetail: true,
            },
          },
          cabFareAcknowledgements: true,
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found.');
      }

      if (booking.passengerId !== user.id) {
        throw new NotFoundException('Booking not found or does not belong to you.');
      }

      if (booking.status === BookingStatus.CANCELLED) {
        throw new BadRequestException('This booking has already been cancelled.');
      }

      if (booking.status === BookingStatus.REJECTED) {
        throw new BadRequestException('Cannot cancel a booking that was already rejected.');
      }

      // Check departure time
      if (booking.ride.departureTime.getTime() <= Date.now()) {
        throw new BadRequestException('Cannot cancel a booking for a ride that has already departed.');
      }

      // If CONFIRMED, safely restore allocated seats under row lock
      if (booking.status === BookingStatus.CONFIRMED) {
        await tx.$queryRaw`
          SELECT id FROM rides
          WHERE id = ${booking.rideId}::uuid
          FOR UPDATE
        `;

        const freshRide = await tx.ride.findUniqueOrThrow({
          where: { id: booking.rideId },
          include: { vehicle: true },
        });

        // Only restore seats if the ride is still SCHEDULED
        if (freshRide.status === RideStatus.SCHEDULED) {
          const restoredSeats = freshRide.availableSeats + booking.requestedSeats;
          const maxCapacity = freshRide.totalSeats;

          if (restoredSeats > maxCapacity) {
            throw new BadRequestException(
              `Restored seats would exceed ride total capacity of ${maxCapacity}.`,
            );
          }

          await tx.ride.update({
            where: { id: freshRide.id },
            data: { availableSeats: restoredSeats },
          });
        }
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: dto?.reason?.trim() || null,
        },
        include: {
          ride: {
            include: {
              driver: true,
              vehicle: true,
              cabShareDetail: true,
            },
          },
          cabFareAcknowledgements: true,
        },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'BOOKING_CANCELLED',
          targetType: 'BOOKING',
          targetId: booking.id,
          changes: {
            previousStatus: booking.status,
            restoredSeats: booking.status === BookingStatus.CONFIRMED ? booking.requestedSeats : 0,
            reason: dto?.reason || null,
          },
        },
        tx,
      );

      return {
        result: this.toPassengerBookingDto(updated),
        notificationData: {
          recipientId: booking.ride.driverId,
          audience: user.audience!,
          type: NotificationType.BOOKING_CANCELLED,
          title: 'ℹ️ Booking Cancelled by Passenger',
          message: `${user.fullName} cancelled their booking for your ride to ${booking.ride.destination}.`,
          rideId: booking.ride.id,
          bookingId: booking.id,
          dedupKey: `booking_cancelled_by_passenger:${booking.id}`,
        },
      };
    });

    // Post-commit: Notify driver that passenger cancelled booking
    try {
      await this.notificationsService.createNotification(notificationData);
    } catch (err) {
      this.logger.error(`[BookingsService] Failed to notify driver of booking cancellation: ${err}`);
    }

    // Revoke tracking room access for this passenger if they were tracking
    try {
      await this.trackingGateway?.revokePassengerAccess(result.rideId, user.id, 'BOOKING_CANCELLED');
    } catch (err) {
      this.logger.warn(`Failed to revoke tracking access for cancelled passenger: ${err}`);
    }

    return result;
  }

  /**
   * Milestone 8: Retrieve Passenger Boarding OTP (Passenger only).
   */
  async getPassengerBoardingOtp(user: User, bookingId: string): Promise<BoardingOtpResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ride: {
          include: {
            driver: true,
            vehicle: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    if (booking.passengerId !== user.id) {
      throw new ForbiddenException('Only the booking passenger can view this boarding OTP.');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Boarding OTP is only available for CONFIRMED bookings.');
    }

    // Cohort boundary check
    if (user.audience && booking.ride.audience !== user.audience) {
      throw new ForbiddenException('Audience cohort mismatch.');
    }

    let rawOtp: string | null = null;
    let expiresAt = booking.boardingOtpExpiresAt;

    // Check if OTP was already generated and encrypted
    if (booking.boardingOtpEncrypted) {
      rawOtp = this.boardingOtpService.decryptOtp(booking.boardingOtpEncrypted);
    }

    // Lazy generation for test fixtures or bookings confirmed prior to M8
    if (!rawOtp || !expiresAt || expiresAt < new Date()) {
      const generated = this.boardingOtpService.generateBoardingOtp(booking.id);
      rawOtp = generated.rawOtp;
      expiresAt = generated.expiresAt;

      await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          boardingOtpHash: generated.hash,
          boardingOtpSalt: generated.salt,
          boardingOtpEncrypted: generated.encrypted,
          boardingOtpExpiresAt: generated.expiresAt,
          boardingOtpFailedAttempts: 0,
        },
      });
    }

    const cooldownSecondsRemaining = this.boardingOtpService.getRegenCooldownSeconds(
      booking.boardingOtpLastRegenAt,
    );
    const regenCountRemaining = Math.max(
      0,
      BoardingOtpService.MAX_REGEN_COUNT - booking.boardingOtpRegenCount,
    );
    const canRegenerate =
      booking.boardingStatus !== BoardingStatus.BOARDED &&
      cooldownSecondsRemaining === 0 &&
      regenCountRemaining > 0;

    return {
      bookingId: booking.id,
      rideId: booking.rideId,
      otp: this.boardingOtpService.formatOtp(rawOtp),
      rawOtp,
      expiresAt: expiresAt.toISOString(),
      boardingStatus: booking.boardingStatus,
      canRegenerate,
      cooldownSecondsRemaining,
      regenCountRemaining,
      driverName: booking.ride.driver.fullName,
      vehiclePlate: booking.ride.vehicle?.registrationNumber ?? null,
      pickupAddress: booking.pickupAddress,
    };
  }

  /**
   * Milestone 8: Regenerate Passenger Boarding OTP (Passenger only).
   */
  async regeneratePassengerBoardingOtp(user: User, bookingId: string): Promise<BoardingOtpResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ride: {
          include: {
            driver: true,
            vehicle: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    if (booking.passengerId !== user.id) {
      throw new ForbiddenException('Only the booking passenger can regenerate this boarding OTP.');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Cannot regenerate OTP for a booking that is not CONFIRMED.');
    }

    if (booking.boardingStatus === BoardingStatus.BOARDED) {
      throw new BadRequestException('Passenger has already been verified as boarded.');
    }

    if (booking.boardingOtpRegenCount >= BoardingOtpService.MAX_REGEN_COUNT) {
      throw new BadRequestException('Maximum OTP regeneration limit reached (5).');
    }

    const cooldown = this.boardingOtpService.getRegenCooldownSeconds(booking.boardingOtpLastRegenAt);
    if (cooldown > 0) {
      throw new BadRequestException(`Please wait ${cooldown} seconds before regenerating OTP.`);
    }

    const newOtp = this.boardingOtpService.generateBoardingOtp(booking.id);
    const now = new Date();

    const updated = await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        boardingOtpHash: newOtp.hash,
        boardingOtpSalt: newOtp.salt,
        boardingOtpEncrypted: newOtp.encrypted,
        boardingOtpExpiresAt: newOtp.expiresAt,
        boardingOtpFailedAttempts: 0,
        boardingOtpLockoutUntil: null,
        boardingOtpRegenCount: booking.boardingOtpRegenCount + 1,
        boardingOtpLastRegenAt: now,
      },
      include: {
        ride: {
          include: {
            driver: true,
            vehicle: true,
          },
        },
      },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'BOARDING_OTP_REGENERATED',
      targetType: 'BOOKING',
      targetId: booking.id,
      changes: {
        regenCount: updated.boardingOtpRegenCount,
      },
    });

    return {
      bookingId: updated.id,
      rideId: updated.rideId,
      otp: newOtp.formattedOtp,
      rawOtp: newOtp.rawOtp,
      expiresAt: newOtp.expiresAt.toISOString(),
      boardingStatus: updated.boardingStatus,
      canRegenerate: false,
      cooldownSecondsRemaining: 60,
      regenCountRemaining: Math.max(0, BoardingOtpService.MAX_REGEN_COUNT - updated.boardingOtpRegenCount),
      driverName: updated.ride.driver.fullName,
      vehiclePlate: updated.ride.vehicle?.registrationNumber ?? null,
      pickupAddress: updated.pickupAddress,
    };
  }

  /**
   * Milestone 8: Verify Boarding OTP (Driver only).
   * Constant-time comparison, failed attempt lockout, and atomic transition to BOARDED.
   */
  async verifyBoardingOtp(
    user: User,
    bookingId: string,
    candidateOtp: string,
  ): Promise<VerifyBoardingResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ride: true,
        passenger: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    if (booking.driverId !== user.id) {
      throw new ForbiddenException('Only the driver of this ride can verify passenger boarding OTP.');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Booking is not in CONFIRMED status.');
    }

    // Cohort verification
    if (user.audience && booking.ride.audience !== user.audience) {
      throw new ForbiddenException('Audience cohort mismatch.');
    }

    // Execute verification inside row-locked transaction
    const { updatedBooking, notificationData } = await this.prisma.$transaction(async (tx) => {
      const lockedBooking = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: {
          ride: true,
          passenger: true,
        },
      });

      const verResult = this.boardingOtpService.verifyOtp(lockedBooking, candidateOtp);

      if (!verResult.valid) {
        if (verResult.code === 'INVALID_OTP') {
          const nextFailed = lockedBooking.boardingOtpFailedAttempts + 1;
          const isLockout = nextFailed >= BoardingOtpService.MAX_FAILED_ATTEMPTS;
          const lockoutUntil = isLockout
            ? new Date(Date.now() + BoardingOtpService.LOCKOUT_DURATION_MS)
            : null;

          await tx.booking.update({
            where: { id: bookingId },
            data: {
              boardingOtpFailedAttempts: nextFailed,
              boardingOtpLockoutUntil: lockoutUntil,
            },
          });

          throw new BadRequestException(verResult.message);
        }

        if (verResult.code === 'LOCKOUT') {
          throw new ForbiddenException(verResult.message);
        }

        if (verResult.code === 'ALREADY_BOARDED') {
          throw new ConflictException(verResult.message);
        }

        throw new BadRequestException(verResult.message);
      }

      // Valid OTP! Atomically mark passenger as BOARDED
      const now = new Date();
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          boardingStatus: BoardingStatus.BOARDED,
          boardedAt: now,
          boardingOtpConsumedAt: now,
          boardingOtpFailedAttempts: 0,
          boardingOtpLockoutUntil: null,
        },
        include: {
          ride: true,
          passenger: true,
        },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'PASSENGER_BOARDED',
          targetType: 'BOOKING',
          targetId: bookingId,
          changes: {
            rideId: lockedBooking.rideId,
            passengerId: lockedBooking.passengerId,
            boardedAt: now.toISOString(),
          },
        },
        tx,
      );

      return {
        updatedBooking: updated,
        notificationData: {
          recipientId: lockedBooking.passengerId,
          audience: user.audience!,
          type: NotificationType.BOOKING_APPROVED,
          title: '✅ Boarding Confirmed',
          message: `Your driver ${user.fullName} has verified your boarding OTP. Enjoy your ride!`,
          rideId: lockedBooking.rideId,
          bookingId: lockedBooking.id,
          dedupKey: `boarding_verified:${lockedBooking.id}`,
        },
      };
    });

    // Notify passenger post-commit
    try {
      await this.notificationsService.createNotification(notificationData);
    } catch (err) {
      this.logger.error(`[BookingsService] Failed to notify passenger of verified boarding: ${err}`);
    }

    // Real-time broadcast to connected sockets
    try {
      this.trackingGateway?.broadcastBoarding(
        updatedBooking.rideId,
        updatedBooking.id,
        updatedBooking.passengerId,
        BoardingStatus.BOARDED,
        updatedBooking.boardedAt?.toISOString() || null,
      );
    } catch (err) {
      this.logger.warn(`Failed to broadcast boarding verification: ${err}`);
    }

    return {
      success: true,
      bookingId: updatedBooking.id,
      rideId: updatedBooking.rideId,
      passengerId: updatedBooking.passengerId,
      passengerName: updatedBooking.passenger.fullName,
      boardingStatus: 'BOARDED',
      boardedAt: updatedBooking.boardedAt!.toISOString(),
      message: 'Boarding verified successfully.',
    };
  }

  /**
   * Milestone 8: Mark No-Show (Driver only).
   */
  async markNoShow(
    user: User,
    bookingId: string,
    reason?: string,
  ): Promise<MarkNoShowResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ride: true,
        passenger: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    if (booking.driverId !== user.id) {
      throw new ForbiddenException('Only the driver can mark a passenger as no-show.');
    }

    if (booking.boardingStatus === BoardingStatus.BOARDED) {
      throw new BadRequestException('Cannot mark a passenger as no-show after they have already boarded.');
    }

    const now = new Date();
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        boardingStatus: BoardingStatus.MISSED,
        missedAt: now,
      },
      include: {
        ride: true,
        passenger: true,
      },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'PASSENGER_MISSED',
      targetType: 'BOOKING',
      targetId: bookingId,
      changes: {
        rideId: booking.rideId,
        passengerId: booking.passengerId,
        reason: reason || null,
        missedAt: now.toISOString(),
      },
    });

    // Notify passenger post-commit
    try {
      await this.notificationsService.createNotification({
        recipientId: booking.passengerId,
        audience: user.audience!,
        type: NotificationType.MISSED_PICKUP,
        title: '⚠️ Missed Pickup / No-Show',
        message: `Your driver ${user.fullName} marked your pickup as missed.`,
        rideId: booking.rideId,
        bookingId: booking.id,
        dedupKey: `passenger_missed:${booking.id}`,
      });
    } catch (err) {
      this.logger.error(`[BookingsService] Failed to notify passenger of missed pickup: ${err}`);
    }

    // Real-time broadcast
    try {
      this.trackingGateway?.broadcastBoarding(
        updated.rideId,
        updated.id,
        updated.passengerId,
        BoardingStatus.MISSED,
        now.toISOString(),
      );
    } catch (err) {
      this.logger.warn(`Failed to broadcast missed pickup: ${err}`);
    }

    return {
      success: true,
      bookingId: updated.id,
      rideId: updated.rideId,
      passengerId: updated.passengerId,
      passengerName: updated.passenger.fullName,
      boardingStatus: 'MISSED',
      missedAt: now.toISOString(),
      message: 'Passenger marked as no-show.',
    };
  }

  /**
   * Passenger acknowledges a material fare revision for a cab share journey.
   */
  async acknowledgeCabFare(
    user: User,
    bookingId: string,
    dto: CabFareAcknowledgementDto,
  ): Promise<{ acknowledged: boolean; bookingId: string; fareRevision: number }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ride: {
          include: {
            cabShareDetail: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking request not found.');
    }

    if (booking.passengerId !== user.id) {
      throw new NotFoundException('Booking not found or you are not the passenger.');
    }

    if (booking.ride.rideType !== RideType.CAB_SHARE || !booking.ride.cabShareDetail) {
      throw new BadRequestException('This booking is not part of a shared cab journey.');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed bookings can acknowledge fare revisions.');
    }

    if (booking.ride.status === RideStatus.CANCELLED) {
      throw new BadRequestException('Cannot acknowledge fare revisions on a cancelled cab share journey.');
    }

    if (dto.fareRevision < booking.ride.cabShareDetail.fareRevision) {
      throw new BadRequestException('Cannot acknowledge an outdated fare revision.');
    }

    if (dto.fareRevision > booking.ride.cabShareDetail.fareRevision) {
      throw new BadRequestException('Cannot acknowledge a future or invalid fare revision.');
    }

    const existing = await this.prisma.cabFareAcknowledgement.findUnique({
      where: {
        bookingId_userId_fareRevision: {
          bookingId: booking.id,
          userId: user.id,
          fareRevision: dto.fareRevision,
        },
      },
    });

    if (existing) {
      return { acknowledged: true, bookingId: booking.id, fareRevision: dto.fareRevision };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.cabFareAcknowledgement.create({
        data: {
          cabDetailId: booking.ride.cabShareDetail!.id,
          bookingId: booking.id,
          userId: user.id,
          fareRevision: dto.fareRevision,
        },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'CAB_FARE_ACKNOWLEDGED',
          targetType: 'BOOKING',
          targetId: booking.id,
          changes: {
            acknowledgedFareRevision: dto.fareRevision,
          },
        },
        tx,
      );
    });

    return { acknowledged: true, bookingId: booking.id, fareRevision: dto.fareRevision };
  }
}
