import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { User, Vehicle, Ride, RideStatus, BookingStatus, NotificationType, Prisma } from '@vit-carpool/db';
import {
  CreateRideDto,
  UpdateRideDto,
  DriverRideResponseDto,
  PublicRideSummaryDto,
  SearchRidesQueryDto,
  SearchRidesResponseDto,
  ReusableRideTemplateDto,
  QuickRideTemplatesResponseDto,
} from '@vit-carpool/contracts';
import { RatingsService } from '../ratings/ratings.service';
import { RideAlertsMatcherService } from '../ride-alerts/ride-alerts-matcher.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ModerationService } from '../moderation/moderation.service';

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly ratingsService: RatingsService,
    private readonly alertsMatcher: RideAlertsMatcherService,
    private readonly notificationsService: NotificationsService,
    private readonly moderationService: ModerationService,
  ) {}

  /**
   * Helper to format internal Ride entity with Vehicle to DriverRideResponseDto
   */
  private toDriverRideDto(
    ride: Ride & {
      vehicle?: Vehicle | null;
      bookings?: Array<{ id: string; status: BookingStatus; requestedSeats: number }>;
    },
    driverRating?: { average: number | null; count: number } | null,
  ): DriverRideResponseDto {
    const confirmedBookings = ride.bookings?.filter((b) => b.status === BookingStatus.CONFIRMED);
    const pendingBookings = ride.bookings?.filter((b) => b.status === BookingStatus.PENDING);
    const confirmedSeatsCount = confirmedBookings
      ? confirmedBookings.reduce((sum, b) => sum + b.requestedSeats, 0)
      : (ride.totalSeats - ride.availableSeats);

    return {
      id: ride.id,
      driverId: ride.driverId,
      vehicleId: ride.vehicleId,
      audience: ride.audience,
      origin: ride.origin,
      originAddress: ride.originAddress ?? undefined,
      originLatitude: ride.originLatitude ?? undefined,
      originLongitude: ride.originLongitude ?? undefined,
      originPlaceId: ride.originPlaceId ?? undefined,
      destination: ride.destination,
      destinationAddress: ride.destinationAddress ?? undefined,
      destinationLatitude: ride.destinationLatitude ?? undefined,
      destinationLongitude: ride.destinationLongitude ?? undefined,
      destinationPlaceId: ride.destinationPlaceId ?? undefined,
      pickupDescription: ride.pickupDescription,
      dropoffDescription: ride.dropoffDescription,
      departureTime: ride.departureTime.toISOString(),
      availableSeats: ride.availableSeats,
      totalSeats: ride.totalSeats,
      costPerSeat: ride.costPerSeat,
      status: ride.status,
      confirmedBookingsCount: confirmedBookings ? confirmedBookings.length : undefined,
      confirmedSeatsCount,
      pendingBookingsCount: pendingBookings ? pendingBookings.length : undefined,
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
      driverRating: driverRating ?? undefined,
    };
  }

  /**
   * Helper to format internal Ride entity to privacy-preserving PublicRideSummaryDto.
   * Excludes vehicle registration number and driver's personal contact details.
   */
  private toPublicRideDto(
    ride: Ride & { driver?: User | null; vehicle?: Vehicle | null },
    driverRating?: { average: number | null; count: number } | null,
  ): PublicRideSummaryDto {
    return {
      id: ride.id,
      driverId: ride.driverId,
      driverName: ride.driver?.fullName || 'Verified Member',
      audience: ride.audience,
      origin: ride.origin,
      originAddress: ride.originAddress ?? undefined,
      originLatitude: ride.originLatitude ?? undefined,
      originLongitude: ride.originLongitude ?? undefined,
      originPlaceId: ride.originPlaceId ?? undefined,
      destination: ride.destination,
      destinationAddress: ride.destinationAddress ?? undefined,
      destinationLatitude: ride.destinationLatitude ?? undefined,
      destinationLongitude: ride.destinationLongitude ?? undefined,
      destinationPlaceId: ride.destinationPlaceId ?? undefined,
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
      driverRating: driverRating ?? undefined,
    };
  }

  /**
   * Computes a canonical SHA-256 hash of a ride creation payload to verify
   * that retries using the same idempotency key carry identical request data.
   */
  private computeRideRequestHash(dto: CreateRideDto): string {
    const canonical = {
      vehicleId: dto.vehicleId,
      origin: dto.origin.trim().toLowerCase(),
      destination: dto.destination.trim().toLowerCase(),
      originLatitude: dto.originLatitude ?? null,
      originLongitude: dto.originLongitude ?? null,
      originPlaceId: dto.originPlaceId ?? null,
      destinationLatitude: dto.destinationLatitude ?? null,
      destinationLongitude: dto.destinationLongitude ?? null,
      destinationPlaceId: dto.destinationPlaceId ?? null,
      departureTime: new Date(dto.departureTime).toISOString(),
      availableSeats: dto.availableSeats,
      costPerSeat: dto.costPerSeat ?? null,
      pickupDescription: dto.pickupDescription?.trim() || null,
      dropoffDescription: dto.dropoffDescription?.trim() || null,
    };
    return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  /**
   * Publish a new ride for the authenticated, verified user.
   * Supports persistent concurrency-safe publication idempotency when an idempotency key is provided.
   */
  async publishRide(
    user: User,
    dto: CreateRideDto,
    idempotencyKey?: string,
  ): Promise<DriverRideResponseDto> {
    if (!user.audience) {
      throw new BadRequestException('Driver must have an assigned institutional audience.');
    }

    const trimmedKey = idempotencyKey?.trim() || undefined;
    let requestHash: string | null = null;

    // 1. If idempotency key provided, check if a previous attempt already succeeded
    if (trimmedKey) {
      requestHash = this.computeRideRequestHash(dto);
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: {
          userId_key: {
            userId: user.id,
            key: trimmedKey,
          },
        },
      });

      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException(
            `Idempotency key '${trimmedKey}' was previously used with a different request payload.`,
          );
        }
        return existingKey.responseBody as unknown as DriverRideResponseDto;
      }
    }

    // 2. Verify vehicle ownership and active status
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

    // 3. Validate passenger capacity (vehicle capacity includes the driver)
    const maxPassengerSeats = vehicle.capacity - 1;
    if (dto.availableSeats > maxPassengerSeats) {
      throw new BadRequestException(
        `Vehicle capacity is ${vehicle.capacity} seats (including driver). You cannot offer more than ${maxPassengerSeats} passenger seats.`,
      );
    }

    // 4. Validate departure time (must be at least 10 minutes in the future)
    const depTime = new Date(dto.departureTime);
    if (isNaN(depTime.getTime())) {
      throw new BadRequestException('Invalid departure timestamp format.');
    }
    const minDepartureTime = Date.now() + 10 * 60 * 1000;
    if (depTime.getTime() <= minDepartureTime) {
      throw new BadRequestException('Departure time must be at least 10 minutes in the future.');
    }

    // 5. Create ride, audit log, and idempotency key atomically in the same database transaction
    let newlyCreatedRide: Ride | null = null;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // If idempotency key provided, re-verify within transaction
        if (trimmedKey && requestHash) {
          const existingInTx = await tx.idempotencyKey.findUnique({
            where: {
              userId_key: {
                userId: user.id,
                key: trimmedKey,
              },
            },
          });
          if (existingInTx) {
            if (existingInTx.requestHash !== requestHash) {
              throw new ConflictException(
                `Idempotency key '${trimmedKey}' was previously used with a different request payload.`,
              );
            }
            return existingInTx.responseBody as unknown as DriverRideResponseDto;
          }
        }

        const ride = await tx.ride.create({
          data: {
            driverId: user.id,
            vehicleId: vehicle.id,
            audience: user.audience!,
            origin: dto.origin.trim(),
            originAddress: dto.originAddress?.trim() || null,
            originLatitude: dto.originLatitude ?? null,
            originLongitude: dto.originLongitude ?? null,
            originPlaceId: dto.originPlaceId?.trim() || null,
            destination: dto.destination.trim(),
            destinationAddress: dto.destinationAddress?.trim() || null,
            destinationLatitude: dto.destinationLatitude ?? null,
            destinationLongitude: dto.destinationLongitude ?? null,
            destinationPlaceId: dto.destinationPlaceId?.trim() || null,
            pickupDescription: dto.pickupDescription?.trim() || null,
            dropoffDescription: dto.dropoffDescription?.trim() || null,
            departureTime: depTime,
            availableSeats: dto.availableSeats,
            totalSeats: dto.availableSeats,
            costPerSeat: dto.costPerSeat ?? null,
            status: RideStatus.SCHEDULED,
          },
          include: {
            vehicle: true,
          },
        });

        newlyCreatedRide = ride;

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

        const dtoResponse = this.toDriverRideDto(ride);

        if (trimmedKey && requestHash) {
          await tx.idempotencyKey.create({
            data: {
              userId: user.id,
              key: trimmedKey,
              targetType: 'RIDE',
              requestHash,
              rideId: ride.id,
              responseBody: dtoResponse as unknown as Prisma.InputJsonValue,
            },
          });
        }

        return dtoResponse;
      });

      // Post-commit: Match newly published ride against active ride alerts
      if (newlyCreatedRide) {
        try {
          await this.alertsMatcher.matchRideAgainstAlerts(newlyCreatedRide);
        } catch (err) {
          this.logger.error(
            `[RidesService] Background alert matching failed for ride ${(newlyCreatedRide as any)?.id}: ${err}`,
          );
        }
      }

      return result;
    } catch (err: any) {
      // Concurrency safety: handle unique constraint race condition on [userId, key] (Prisma P2002)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && trimmedKey) {
        const raceExisting = await this.prisma.idempotencyKey.findUnique({
          where: {
            userId_key: {
              userId: user.id,
              key: trimmedKey,
            },
          },
        });
        if (raceExisting) {
          if (raceExisting.requestHash !== requestHash) {
            throw new ConflictException(
              `Idempotency key '${trimmedKey}' was previously used with a different request payload.`,
            );
          }
          return raceExisting.responseBody as unknown as DriverRideResponseDto;
        }
      }
      throw err;
    }
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

    const originRadiusKm = dto.originRadiusKm ?? dto.radiusKm ?? 3.0;
    const destRadiusKm = dto.destRadiusKm ?? dto.radiusKm ?? 3.0;

    const spatialConditions: Prisma.Sql[] = [];
    if (dto.originLat !== undefined && dto.originLon !== undefined) {
      const radiusMeters = originRadiusKm * 1000;
      spatialConditions.push(Prisma.sql`
        r.origin_geom IS NOT NULL AND ST_DWithin(
          r.origin_geom,
          ST_SetSRID(ST_MakePoint(${dto.originLon}, ${dto.originLat}), 4326)::geography,
          ${radiusMeters}
        )
      `);
    }

    if (dto.destLat !== undefined && dto.destLon !== undefined) {
      const radiusMeters = destRadiusKm * 1000;
      spatialConditions.push(Prisma.sql`
        r.destination_geom IS NOT NULL AND ST_DWithin(
          r.destination_geom,
          ST_SetSRID(ST_MakePoint(${dto.destLon}, ${dto.destLat}), 4326)::geography,
          ${radiusMeters}
        )
      `);
    }

    let spatialRideIds: string[] | null = null;
    if (spatialConditions.length > 0) {
      const whereSql = Prisma.join(spatialConditions, ' AND ');
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT r.id FROM rides r WHERE ${whereSql}
      `;
      spatialRideIds = rows.map((r) => r.id);
    }

    const blockedUserIds = await this.moderationService.getMutualBlockedUserIds(user.id);

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
      ...(spatialRideIds !== null ? { id: { in: spatialRideIds } } : {}),
      ...(blockedUserIds.length > 0 ? { driverId: { notIn: blockedUserIds } } : {}),
    };

    if (dto.maxCost !== undefined) {
      where.costPerSeat = {
        lte: dto.maxCost,
      };
    }

    // If spatial search was NOT applied for origin, fallback to case-insensitive text search
    if (
      (dto.originLat === undefined || dto.originLon === undefined) &&
      dto.origin &&
      dto.origin.trim().length > 0
    ) {
      where.origin = {
        contains: dto.origin.trim(),
        mode: 'insensitive',
      };
    }

    // If spatial search was NOT applied for destination, fallback to case-insensitive text search
    if (
      (dto.destLat === undefined || dto.destLon === undefined) &&
      dto.destination &&
      dto.destination.trim().length > 0
    ) {
      where.destination = {
        contains: dto.destination.trim(),
        mode: 'insensitive',
      };
    }

    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(50, Math.max(1, dto.limit ?? 20));
    const skip = (page - 1) * limit;

    const sortField = dto.sortBy || 'departureTime';
    let orderBy: Prisma.RideOrderByWithRelationInput[];
    if (sortField === 'cost') {
      orderBy = [
        { costPerSeat: { sort: dto.sortOrder ?? 'asc', nulls: 'last' } },
        { departureTime: 'asc' },
        { id: 'asc' },
      ];
    } else if (sortField === 'seats') {
      orderBy = [
        { availableSeats: dto.sortOrder ?? 'desc' },
        { departureTime: 'asc' },
        { id: 'asc' },
      ];
    } else {
      orderBy = [
        { departureTime: dto.sortOrder ?? 'asc' },
        { id: 'asc' }, // Deterministic tie-breaker for pagination
      ];
    }

    const [rides, total] = await Promise.all([
      this.prisma.ride.findMany({
        where,
        include: {
          driver: true,
          vehicle: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.ride.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    const driverIds = Array.from(new Set(rides.map((r) => r.driverId)));
    const ratingMap = await this.ratingsService.getDriverRatingAggregates(driverIds);

    return {
      rides: rides.map((r) => this.toPublicRideDto(r, ratingMap.get(r.driverId) || null)),
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
        bookings: {
          select: {
            id: true,
            status: true,
            requestedSeats: true,
          },
        },
      },
      orderBy: {
        departureTime: 'desc',
      },
    });

    const ratingMap = await this.ratingsService.getDriverRatingAggregates([user.id]);
    const driverRating = ratingMap.get(user.id) || null;

    return rides.map((r) => this.toDriverRideDto(r, driverRating));
  }

  /**
   * Retrieve reusable ride templates for Quick Ride posting.
   * Strictly scoped to the authenticated driver.
   * Excludes private pickup/dropoff notes and passenger bookings.
   */
  async getQuickRideTemplates(user: User): Promise<QuickRideTemplatesResponseDto> {
    const activeVehiclesCount = await this.prisma.vehicle.count({
      where: {
        userId: user.id,
        deletedAt: null,
      },
    });

    const pastRides = await this.prisma.ride.findMany({
      where: {
        driverId: user.id,
      },
      include: {
        vehicle: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    if (pastRides.length === 0) {
      return {
        recentRide: null,
        routes: [],
        hasActiveVehicle: activeVehiclesCount > 0,
      };
    }

    const formatTemplate = (r: (typeof pastRides)[0]): ReusableRideTemplateDto => ({
      id: r.id,
      vehicleId: r.vehicleId,
      vehicle: r.vehicle
        ? {
            id: r.vehicle.id,
            make: r.vehicle.make,
            model: r.vehicle.model,
            color: r.vehicle.color,
            capacity: r.vehicle.capacity,
            isDeleted: r.vehicle.deletedAt !== null,
          }
        : null,
      origin: r.origin,
      originAddress: r.originAddress,
      originLatitude: r.originLatitude,
      originLongitude: r.originLongitude,
      originPlaceId: r.originPlaceId,
      destination: r.destination,
      destinationAddress: r.destinationAddress,
      destinationLatitude: r.destinationLatitude,
      destinationLongitude: r.destinationLongitude,
      destinationPlaceId: r.destinationPlaceId,
      availableSeats: r.availableSeats,
      costPerSeat: r.costPerSeat,
      departureTime: r.departureTime.toISOString(),
      createdAt: r.createdAt.toISOString(),
    });

    const recentRide = formatTemplate(pastRides[0]);

    const seenRoutes = new Set<string>();
    const uniqueRoutes: ReusableRideTemplateDto[] = [];

    for (const r of pastRides) {
      const routeKey = `${r.origin.trim().toLowerCase()}->${r.destination.trim().toLowerCase()}`;
      if (!seenRoutes.has(routeKey)) {
        seenRoutes.add(routeKey);
        uniqueRoutes.push(formatTemplate(r));
        if (uniqueRoutes.length >= 10) break;
      }
    }

    return {
      recentRide,
      routes: uniqueRoutes,
      hasActiveVehicle: activeVehiclesCount > 0,
    };
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
        bookings: {
          select: {
            id: true,
            status: true,
            requestedSeats: true,
          },
        },
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found.');
    }

    // Strict Audience Isolation: do not expose student rides to faculty or vice versa
    if (ride.audience !== user.audience) {
      throw new NotFoundException('Ride not found or not accessible.');
    }

    if (ride.driverId !== user.id) {
      const isBlocked = await this.moderationService.isMutuallyBlocked(user.id, ride.driverId);
      if (isBlocked) {
        throw new NotFoundException('Ride not found or not accessible.');
      }
    }

    const ratingMap = await this.ratingsService.getDriverRatingAggregates([ride.driverId]);
    const driverRating = ratingMap.get(ride.driverId) || null;

    // If caller is the ride owner, return full driver DTO
    if (ride.driverId === user.id) {
      return this.toDriverRideDto(ride, driverRating);
    }

    // Otherwise return privacy-preserving public summary
    return this.toPublicRideDto(ride, driverRating);
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
    if (dto.originAddress !== undefined) dataToUpdate.originAddress = dto.originAddress?.trim() || null;
    if (dto.originLatitude !== undefined) dataToUpdate.originLatitude = dto.originLatitude ?? null;
    if (dto.originLongitude !== undefined) dataToUpdate.originLongitude = dto.originLongitude ?? null;
    if (dto.originPlaceId !== undefined) dataToUpdate.originPlaceId = dto.originPlaceId?.trim() || null;
    if (dto.destination !== undefined) dataToUpdate.destination = dto.destination.trim();
    if (dto.destinationAddress !== undefined) dataToUpdate.destinationAddress = dto.destinationAddress?.trim() || null;
    if (dto.destinationLatitude !== undefined) dataToUpdate.destinationLatitude = dto.destinationLatitude ?? null;
    if (dto.destinationLongitude !== undefined) dataToUpdate.destinationLongitude = dto.destinationLongitude ?? null;
    if (dto.destinationPlaceId !== undefined) dataToUpdate.destinationPlaceId = dto.destinationPlaceId?.trim() || null;
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
          bookings: {
            select: {
              id: true,
              status: true,
              requestedSeats: true,
            },
          },
        },
      });

      if (!ride) {
        throw new NotFoundException('Ride not found or you do not have permission to modify it.');
      }

      if (ride.status === RideStatus.CANCELLED) {
        throw new BadRequestException('Cannot modify a ride that has already been cancelled.');
      }

      if (ride.status === RideStatus.COMPLETED) {
        throw new BadRequestException('Cannot modify a ride that has already been completed.');
      }

      // Policy: Scheduled rides cannot be edited within 15 minutes of departure or after departure
      if (ride.departureTime.getTime() <= Date.now() + 15 * 60 * 1000) {
        throw new BadRequestException(
          'Scheduled rides cannot be modified within 15 minutes of departure.',
        );
      }

      if (dto.availableSeats !== undefined) {
        const confirmedBookings = ride.bookings.filter((b) => b.status === BookingStatus.CONFIRMED);
        const confirmedSeats = confirmedBookings.reduce((sum, b) => sum + b.requestedSeats, 0);
        const maxPassengerSeats = ride.vehicle.capacity - 1;

        if (dto.availableSeats + confirmedSeats > maxPassengerSeats) {
          throw new BadRequestException(
            `Cannot offer more than ${maxPassengerSeats} passenger seats for this vehicle${confirmedSeats > 0 ? ` (${confirmedSeats} already booked)` : ''}.`,
          );
        }

        dataToUpdate.availableSeats = dto.availableSeats;
        dataToUpdate.totalSeats = Math.max(ride.totalSeats, dto.availableSeats + confirmedSeats);
      }

      const updated = await tx.ride.update({
        where: { id: rideId },
        data: dataToUpdate,
        include: {
          vehicle: true,
          bookings: {
            select: {
              id: true,
              status: true,
              requestedSeats: true,
            },
          },
        },
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
    const { result, activeBookings, rideDepartureTime, rideOrigin, rideDestination, rideAudience } =
      await this.prisma.$transaction(async (tx) => {
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
          bookings: {
            select: {
              id: true,
              status: true,
              requestedSeats: true,
            },
          },
        },
      });

      if (!ride) {
        throw new NotFoundException('Ride not found or you do not have permission to cancel it.');
      }

      if (ride.status === RideStatus.CANCELLED) {
        throw new BadRequestException('This ride is already cancelled.');
      }

      if (ride.status === RideStatus.COMPLETED) {
        throw new BadRequestException('Cannot cancel a completed ride.');
      }

      if (ride.departureTime.getTime() <= Date.now()) {
        throw new BadRequestException('Cannot cancel a ride that has already departed.');
      }

      // When a ride is cancelled by driver, transition any active passenger bookings to CANCELLED
      const activeBookings = await tx.booking.findMany({
        where: {
          rideId,
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        },
        select: { passengerId: true },
      });

      await tx.booking.updateMany({
        where: {
          rideId,
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: 'Ride was cancelled by driver',
        },
      });

      const cancelled = await tx.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.CANCELLED,
        },
        include: {
          vehicle: true,
          bookings: {
            select: {
              id: true,
              status: true,
              requestedSeats: true,
            },
          },
        },
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

      return {
        result: this.toDriverRideDto(cancelled),
        activeBookings,
        rideDepartureTime: ride.departureTime,
        rideOrigin: ride.origin,
        rideDestination: ride.destination,
        rideAudience: ride.audience,
        rideId: ride.id,
      };
    });

    // Post-commit: Notify all affected passengers of the cancellation
    if (activeBookings.length > 0) {
      const kolkataTime = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(rideDepartureTime);

      for (const b of activeBookings) {
        try {
          await this.notificationsService.createNotification({
            recipientId: b.passengerId,
            audience: rideAudience,
            type: NotificationType.RIDE_CANCELLED,
            title: '❌ Ride Cancelled by Driver',
            message: `The ride from ${rideOrigin} to ${rideDestination} scheduled for ${kolkataTime} was cancelled by the driver.`,
            rideId,
            dedupKey: `ride_cancelled:${rideId}:${b.passengerId}`,
          });
        } catch (err) {
          this.logger.error(`[RidesService] Failed to notify passenger of ride cancellation: ${err}`);
        }
      }
    }

    return result;
  }

  /**
   * Mark a scheduled ride as completed (Driver only).
   */
  async completeMyRide(user: User, rideId: string): Promise<DriverRideResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const lockedRides = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM rides
        WHERE id = ${rideId}::uuid AND driver_id = ${user.id}::uuid
        FOR UPDATE
      `;

      if (!lockedRides.length) {
        throw new NotFoundException('Ride not found or you do not have permission to complete it.');
      }

      const ride = await tx.ride.findFirst({
        where: { id: rideId, driverId: user.id },
        include: {
          vehicle: true,
          bookings: {
            select: { id: true, status: true, requestedSeats: true },
          },
        },
      });

      if (!ride) {
        throw new NotFoundException('Ride not found.');
      }

      if (ride.status === RideStatus.CANCELLED) {
        throw new BadRequestException('Cannot complete a cancelled ride.');
      }

      if (ride.status === RideStatus.COMPLETED) {
        const ratingMap = await this.ratingsService.getDriverRatingAggregates([user.id]);
        return this.toDriverRideDto(ride, ratingMap.get(user.id) || null);
      }

      // When a ride is completed by driver, transition any remaining PENDING passenger bookings to CANCELLED
      await tx.booking.updateMany({
        where: {
          rideId,
          status: BookingStatus.PENDING,
        },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: 'Ride completed without accepting pending booking request',
        },
      });

      const completed = await tx.ride.update({
        where: { id: rideId },
        data: { status: RideStatus.COMPLETED },
        include: {
          vehicle: true,
          bookings: {
            select: { id: true, status: true, requestedSeats: true },
          },
        },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'RIDE_COMPLETED',
          targetType: 'RIDE',
          targetId: rideId,
          changes: { status: 'COMPLETED' },
        },
        tx,
      );

      const ratingMap = await this.ratingsService.getDriverRatingAggregates([user.id]);
      return this.toDriverRideDto(completed, ratingMap.get(user.id) || null);
    });
  }
}
