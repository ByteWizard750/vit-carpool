import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { User, Vehicle, Ride, RideStatus, Prisma } from '@vit-carpool/db';
import {
  CreateRideDto,
  UpdateRideDto,
  DriverRideResponseDto,
  PublicRideSummaryDto,
  SearchRidesQueryDto,
  SearchRidesResponseDto,
} from '@vit-carpool/contracts';

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Helper to format internal Ride entity with Vehicle to DriverRideResponseDto
   */
  private toDriverRideDto(
    ride: Ride & { vehicle?: Vehicle | null },
  ): DriverRideResponseDto {
    return {
      id: ride.id,
      driverId: ride.driverId,
      vehicleId: ride.vehicleId,
      audience: ride.audience,
      origin: ride.origin,
      destination: ride.destination,
      pickupDescription: ride.pickupDescription,
      dropoffDescription: ride.dropoffDescription,
      departureTime: ride.departureTime.toISOString(),
      availableSeats: ride.availableSeats,
      costPerSeat: ride.costPerSeat,
      status: ride.status,
      createdAt: ride.createdAt.toISOString(),
      updatedAt: ride.updatedAt.toISOString(),
      vehicle: ride.vehicle
        ? {
            id: ride.vehicle.id,
            userId: ride.vehicle.userId,
            make: ride.vehicle.make,
            model: ride.vehicle.model,
            color: ride.vehicle.color,
            registrationNumber: ride.vehicle.registrationNumber,
            capacity: ride.vehicle.capacity,
            createdAt: ride.vehicle.createdAt.toISOString(),
            updatedAt: ride.vehicle.updatedAt.toISOString(),
          }
        : undefined,
    };
  }

  /**
   * Helper to format internal Ride entity to privacy-preserving PublicRideSummaryDto.
   * Excludes vehicle registration number and driver's personal contact details.
   */
  private toPublicRideDto(
    ride: Ride & { driver?: User | null; vehicle?: Vehicle | null },
  ): PublicRideSummaryDto {
    return {
      id: ride.id,
      driverId: ride.driverId,
      driverName: ride.driver?.fullName || 'Verified Member',
      audience: ride.audience,
      origin: ride.origin,
      destination: ride.destination,
      departureTime: ride.departureTime.toISOString(),
      availableSeats: ride.availableSeats,
      costPerSeat: ride.costPerSeat,
      status: ride.status,
      createdAt: ride.createdAt.toISOString(),
      vehicle: ride.vehicle
        ? {
            id: ride.vehicle.id,
            make: ride.vehicle.make,
            model: ride.vehicle.model,
            color: ride.vehicle.color,
            capacity: ride.vehicle.capacity,
          }
        : undefined,
    };
  }

  /**
   * Publish a new ride for the authenticated, verified user.
   */
  async publishRide(user: User, dto: CreateRideDto): Promise<DriverRideResponseDto> {
    if (!user.audience) {
      throw new BadRequestException('Driver must have an assigned institutional audience.');
    }

    // 1. Verify vehicle ownership and active status
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: dto.vehicleId,
        userId: user.id,
        deletedAt: null,
      },
    });

    if (!vehicle) {
      throw new BadRequestException(
        'Selected vehicle not found, does not belong to you, or has been deactivated.',
      );
    }

    // 2. Validate passenger capacity (vehicle capacity includes the driver)
    const maxPassengerSeats = vehicle.capacity - 1;
    if (dto.availableSeats > maxPassengerSeats) {
      throw new BadRequestException(
        `Vehicle capacity is ${vehicle.capacity} seats (including driver). You cannot offer more than ${maxPassengerSeats} passenger seats.`,
      );
    }

    // 3. Validate departure time (must be at least 10 minutes in the future)
    const depTime = new Date(dto.departureTime);
    if (isNaN(depTime.getTime())) {
      throw new BadRequestException('Invalid departure timestamp format.');
    }
    const minDepartureTime = Date.now() + 10 * 60 * 1000;
    if (depTime.getTime() <= minDepartureTime) {
      throw new BadRequestException('Departure time must be at least 10 minutes in the future.');
    }

    // 4. Create ride and audit log atomically in the same database transaction
    return this.prisma.$transaction(async (tx) => {
      const ride = await tx.ride.create({
        data: {
          driverId: user.id,
          vehicleId: vehicle.id,
          audience: user.audience!,
          origin: dto.origin.trim(),
          destination: dto.destination.trim(),
          pickupDescription: dto.pickupDescription?.trim() || null,
          dropoffDescription: dto.dropoffDescription?.trim() || null,
          departureTime: depTime,
          availableSeats: dto.availableSeats,
          costPerSeat: dto.costPerSeat ?? null,
          status: RideStatus.SCHEDULED,
        },
        include: {
          vehicle: true,
        },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'RIDE_PUBLISHED',
          targetType: 'RIDE',
          targetId: ride.id,
          changes: {
            origin: ride.origin,
            destination: ride.destination,
            departureTime: ride.departureTime.toISOString(),
            availableSeats: ride.availableSeats,
            costPerSeat: ride.costPerSeat,
            vehicleId: ride.vehicleId,
          },
        },
        tx,
      );

      return this.toDriverRideDto(ride);
    });
  }

  /**
   * Search available rides matching peer query parameters.
   * Strictly filtered to the authenticated user's audience and non-cancelled future rides.
   */
  async searchRides(
    user: User,
    dto: SearchRidesQueryDto,
  ): Promise<SearchRidesResponseDto> {
    if (!user.audience) {
      throw new BadRequestException('User must have an assigned institutional audience to discover rides.');
    }

    const now = new Date();
    let fromTime = now;
    let toTime: Date | undefined = undefined;
    let toExclusive: Date | undefined = undefined;

    if (dto.departureDate) {
      // YYYY-MM-DD format representing the calendar day in Asia/Kolkata (+05:30)
      const dateIsoKolkata = `${dto.departureDate}T00:00:00.000+05:30`;
      const startOfKolkataDay = new Date(dateIsoKolkata);
      if (isNaN(startOfKolkataDay.getTime())) {
        throw new BadRequestException('Invalid departure date format.');
      }

      // Validate valid calendar day in Asia/Kolkata (reject invalid dates like 2026-02-30 or 2026-11-31)
      const kolkataFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      if (kolkataFormatter.format(startOfKolkataDay) !== dto.departureDate) {
        throw new BadRequestException('Invalid departure date format or calendar day.');
      }

      // Next day boundary in Asia/Kolkata (exclusive: [startOfKolkataDay, nextKolkataDayStart))
      // Indian Standard Time (IST) does not observe DST; 1 day is exactly 24 hours (86,400,000 ms).
      const nextKolkataDayStart = new Date(startOfKolkataDay.getTime() + 24 * 60 * 60 * 1000);

      // Exclude past calendar days
      if (nextKolkataDayStart.getTime() <= now.getTime()) {
        throw new BadRequestException('Departure date cannot be in the past.');
      }

      // Exclude rides departing before current instant
      fromTime = new Date(Math.max(now.getTime(), startOfKolkataDay.getTime()));
      toExclusive = nextKolkataDayStart;
    } else {
      if (dto.departureFrom) {
        const parsedFrom = new Date(dto.departureFrom);
        if (isNaN(parsedFrom.getTime())) {
          throw new BadRequestException('Invalid departureFrom timestamp format.');
        }
        fromTime = new Date(Math.max(now.getTime(), parsedFrom.getTime()));
      }
      if (dto.departureTo) {
        const parsedTo = new Date(dto.departureTo);
        if (isNaN(parsedTo.getTime())) {
          throw new BadRequestException('Invalid departureTo timestamp format.');
        }
        if (parsedTo.getTime() < now.getTime()) {
          throw new BadRequestException('departureTo cannot be in the past.');
        }
        if (parsedTo.getTime() < fromTime.getTime()) {
          throw new BadRequestException(
            'departureTo cannot be earlier than departureFrom or current time.',
          );
        }
        toTime = parsedTo;
      }
    }

    const where: Prisma.RideWhereInput = {
      audience: user.audience, // Strict database-level cohort isolation
      status: RideStatus.SCHEDULED, // Never return cancelled rides
      departureTime: {
        gte: fromTime,
        ...(toExclusive ? { lt: toExclusive } : toTime ? { lte: toTime } : {}),
      },
      availableSeats: {
        gte: dto.minSeats ?? 1,
      },
      vehicle: {
        deletedAt: null, // Exclude rides whose vehicle has been deactivated
      },
    };

    if (dto.origin && dto.origin.trim().length > 0) {
      where.origin = {
        contains: dto.origin.trim(),
        mode: 'insensitive',
      };
    }

    if (dto.destination && dto.destination.trim().length > 0) {
      where.destination = {
        contains: dto.destination.trim(),
        mode: 'insensitive',
      };
    }

    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(50, Math.max(1, dto.limit ?? 20));
    const skip = (page - 1) * limit;

    const [rides, total] = await Promise.all([
      this.prisma.ride.findMany({
        where,
        include: {
          driver: true,
          vehicle: true,
        },
        orderBy: [
          { departureTime: dto.sortOrder ?? 'asc' },
          { id: 'asc' }, // Deterministic tie-breaker for pagination
        ],
        skip,
        take: limit,
      }),
      this.prisma.ride.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      rides: rides.map((r) => this.toPublicRideDto(r)),
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * List all rides published by the authenticated driver.
   */
  async listMyRides(user: User): Promise<DriverRideResponseDto[]> {
    const rides = await this.prisma.ride.findMany({
      where: {
        driverId: user.id,
      },
      include: {
        vehicle: true,
      },
      orderBy: {
        departureTime: 'desc',
      },
    });

    return rides.map((r) => this.toDriverRideDto(r));
  }

  /**
   * Retrieve a single ride.
   * If caller is the driver, returns full DriverRideResponseDto.
   * If caller is a verified member of the matching audience, returns PublicRideSummaryDto.
   * If caller belongs to a different audience, returns 404 Not Found (strict audience isolation).
   */
  async getRideById(
    user: User,
    rideId: string,
  ): Promise<DriverRideResponseDto | PublicRideSummaryDto> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: true,
        vehicle: true,
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found.');
    }

    // Strict Audience Isolation: do not expose student rides to faculty or vice versa
    if (ride.audience !== user.audience) {
      throw new NotFoundException('Ride not found or not accessible.');
    }

    // If caller is the ride owner, return full driver DTO
    if (ride.driverId === user.id) {
      return this.toDriverRideDto(ride);
    }

    // Otherwise return privacy-preserving public summary
    return this.toPublicRideDto(ride);
  }

  /**
   * Update details of an eligible ride owned by the caller.
   */
  async updateMyRide(
    user: User,
    rideId: string,
    dto: UpdateRideDto,
  ): Promise<DriverRideResponseDto> {
    const dataToUpdate: Record<string, any> = {};

    if (dto.origin !== undefined) dataToUpdate.origin = dto.origin.trim();
    if (dto.destination !== undefined) dataToUpdate.destination = dto.destination.trim();
    if (dto.pickupDescription !== undefined) {
      dataToUpdate.pickupDescription = dto.pickupDescription?.trim() || null;
    }
    if (dto.dropoffDescription !== undefined) {
      dataToUpdate.dropoffDescription = dto.dropoffDescription?.trim() || null;
    }
    if (dto.costPerSeat !== undefined) dataToUpdate.costPerSeat = dto.costPerSeat;

    if (dto.departureTime !== undefined) {
      const newDepTime = new Date(dto.departureTime);
      if (isNaN(newDepTime.getTime()) || newDepTime.getTime() <= Date.now() + 10 * 60 * 1000) {
        throw new BadRequestException('New departure time must be at least 10 minutes in the future.');
      }
      dataToUpdate.departureTime = newDepTime;
    }

    return this.prisma.$transaction(async (tx) => {
      // Row-level lock ensures serialized execution and prevents concurrent modification races
      const lockedRides = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM rides
        WHERE id = ${rideId}::uuid AND driver_id = ${user.id}::uuid
        FOR UPDATE
      `;

      if (!lockedRides.length) {
        throw new NotFoundException('Ride not found or you do not have permission to modify it.');
      }

      const ride = await tx.ride.findFirst({
        where: {
          id: rideId,
          driverId: user.id,
        },
        include: {
          vehicle: true,
        },
      });

      if (!ride) {
        throw new NotFoundException('Ride not found or you do not have permission to modify it.');
      }

      if (ride.status === RideStatus.CANCELLED) {
        throw new BadRequestException('Cannot modify a ride that has already been cancelled.');
      }

      // Policy: Scheduled rides cannot be edited within 15 minutes of departure or after departure
      if (ride.departureTime.getTime() <= Date.now() + 15 * 60 * 1000) {
        throw new BadRequestException(
          'Scheduled rides cannot be modified within 15 minutes of departure.',
        );
      }

      if (dto.availableSeats !== undefined) {
        const maxPassengerSeats = ride.vehicle.capacity - 1;
        if (dto.availableSeats > maxPassengerSeats) {
          throw new BadRequestException(
            `Cannot offer more than ${maxPassengerSeats} passenger seats for this vehicle.`,
          );
        }
        dataToUpdate.availableSeats = dto.availableSeats;
      }

      const updated = await tx.ride.update({
        where: { id: rideId },
        data: dataToUpdate,
        include: { vehicle: true },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'RIDE_UPDATED',
          targetType: 'RIDE',
          targetId: rideId,
          changes: dataToUpdate,
        },
        tx,
      );

      return this.toDriverRideDto(updated);
    });
  }

  /**
   * Cancel a scheduled ride owned by the caller.
   */
  async cancelMyRide(user: User, rideId: string): Promise<DriverRideResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      // Row-level lock ensures serialized execution and prevents duplicate concurrent cancellations
      const lockedRides = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM rides
        WHERE id = ${rideId}::uuid AND driver_id = ${user.id}::uuid
        FOR UPDATE
      `;

      if (!lockedRides.length) {
        throw new NotFoundException('Ride not found or you do not have permission to cancel it.');
      }

      const ride = await tx.ride.findFirst({
        where: {
          id: rideId,
          driverId: user.id,
        },
        include: {
          vehicle: true,
        },
      });

      if (!ride) {
        throw new NotFoundException('Ride not found or you do not have permission to cancel it.');
      }

      if (ride.status === RideStatus.CANCELLED) {
        throw new BadRequestException('This ride is already cancelled.');
      }

      if (ride.departureTime.getTime() <= Date.now()) {
        throw new BadRequestException('Cannot cancel a ride that has already departed.');
      }

      const cancelled = await tx.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.CANCELLED,
        },
        include: { vehicle: true },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'RIDE_CANCELLED',
          targetType: 'RIDE',
          targetId: rideId,
          changes: {
            status: 'CANCELLED',
            cancelledAt: new Date().toISOString(),
          },
        },
        tx,
      );

      return this.toDriverRideDto(cancelled);
    });
  }
}
