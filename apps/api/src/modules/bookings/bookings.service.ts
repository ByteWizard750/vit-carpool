import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { User, Ride, Vehicle, Booking, BookingStatus, RideStatus, Prisma } from '@vit-carpool/db';
import {
  CreateBookingRequestDto,
  CancelBookingDto,
  RejectBookingDto,
  PassengerBookingResponseDto,
  DriverBookingResponseDto,
} from '@vit-carpool/contracts';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Helper to format booking to PassengerBookingResponseDto.
   * Conceals private landmark descriptions and driver phone unless status === 'CONFIRMED'.
   */
  private toPassengerBookingDto(
    booking: Booking & {
      ride: Ride & { driver?: User | null; vehicle?: Vehicle | null };
    },
  ): PassengerBookingResponseDto {
    const isConfirmed = booking.status === BookingStatus.CONFIRMED;

    return {
      id: booking.id,
      rideId: booking.rideId,
      passengerId: booking.passengerId,
      driverId: booking.driverId,
      audience: booking.audience,
      requestedSeats: booking.requestedSeats,
      status: booking.status,
      confirmedAt: booking.confirmedAt ? booking.confirmedAt.toISOString() : null,
      rejectedAt: booking.rejectedAt ? booking.rejectedAt.toISOString() : null,
      cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
      cancellationReason: booking.cancellationReason,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      ride: {
        id: booking.ride.id,
        origin: booking.ride.origin,
        destination: booking.ride.destination,
        departureTime: booking.ride.departureTime.toISOString(),
        availableSeats: booking.ride.availableSeats,
        costPerSeat: booking.ride.costPerSeat,
        status: booking.ride.status,
        driverName: booking.ride.driver?.fullName || 'Verified Driver',
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
            }
          : undefined,
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
      ride: Ride;
    },
  ): DriverBookingResponseDto {
    const isConfirmed = booking.status === BookingStatus.CONFIRMED;

    return {
      id: booking.id,
      rideId: booking.rideId,
      passengerId: booking.passengerId,
      passengerName: booking.passenger?.fullName || 'Verified Passenger',
      passengerPhone: isConfirmed ? booking.passenger?.phoneNumber : undefined,
      driverId: booking.driverId,
      audience: booking.audience,
      requestedSeats: booking.requestedSeats,
      status: booking.status,
      confirmedAt: booking.confirmedAt ? booking.confirmedAt.toISOString() : null,
      rejectedAt: booking.rejectedAt ? booking.rejectedAt.toISOString() : null,
      cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
      cancellationReason: booking.cancellationReason,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      ride: {
        id: booking.ride.id,
        origin: booking.ride.origin,
        destination: booking.ride.destination,
        departureTime: booking.ride.departureTime.toISOString(),
        availableSeats: booking.ride.availableSeats,
        totalSeats: booking.ride.totalSeats,
        status: booking.ride.status,
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
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found.');
    }

    // 2. Strict Cohort Isolation (404 for opposite audience)
    if (ride.audience !== user.audience) {
      throw new NotFoundException('Ride not found or not accessible.');
    }

    // 3. Driver cannot book their own ride
    if (ride.driverId === user.id) {
      throw new BadRequestException('Drivers cannot book seats on their own rides.');
    }

    // 4. Validate ride eligibility
    if (ride.status === RideStatus.CANCELLED) {
      throw new BadRequestException('Cannot request seats on a cancelled ride.');
    }

    if (ride.status === RideStatus.COMPLETED) {
      throw new BadRequestException('Cannot request seats on a completed ride.');
    }

    if (ride.departureTime.getTime() <= Date.now()) {
      throw new BadRequestException('Cannot request seats on a ride that has already departed.');
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
      return await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            rideId: ride.id,
            passengerId: user.id,
            driverId: ride.driverId,
            audience: user.audience!,
            requestedSeats: dto.requestedSeats,
            status: BookingStatus.PENDING,
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
          },
        },
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
        ride: true,
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
    return this.prisma.$transaction(async (tx) => {
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

      // 6. Transition booking to CONFIRMED
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
        include: {
          passenger: true,
          ride: true,
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

      return this.toDriverBookingDto(updatedBooking);
    });
  }

  /**
   * Reject a pending booking request (Driver only).
   */
  async rejectBooking(
    user: User,
    bookingId: string,
    dto?: RejectBookingDto,
  ): Promise<DriverBookingResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          passenger: true,
          ride: true,
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
          ride: true,
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

      return this.toDriverBookingDto(updated);
    });
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
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
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
            },
          },
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

      return this.toPassengerBookingDto(updated);
    });
  }
}
