import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { User, Vehicle, Ride, RideStatus, BookingStatus, NotificationType, Prisma, RouteStatus, RideType } from '@vit-carpool/db';
import {
  CreateRideDto,
  UpdateRideDto,
  CreateCabShareDto,
  UpdateCabShareFareDto,
  DriverRideResponseDto,
  PublicRideSummaryDto,
  SearchRidesQueryDto,
  SearchRidesResponseDto,
  ReusableRideTemplateDto,
  QuickRideTemplatesResponseDto,
  RideRouteResponseDto,
  RideMatchMetadataDto,
  calculateCabFareSplit,
  isMaterialFareIncrease,
} from '@vit-carpool/contracts';
import { RatingsService } from '../ratings/ratings.service';
import { RideAlertsMatcherService } from '../ride-alerts/ride-alerts-matcher.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ModerationService } from '../moderation/moderation.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { RouteService } from './route.service';
import { CorridorMatcherService } from './corridor-matcher.service';

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
    private readonly routeService: RouteService,
    private readonly corridorMatcher: CorridorMatcherService,
    @Optional() private readonly trackingGateway?: TrackingGateway,
  ) {}

  /**
   * Helper to format internal Ride entity with Vehicle to DriverRideResponseDto
   */
  private toDriverRideDto(
    ride: Ride & {
      driver?: User | null;
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
      rideType: ride.rideType,
      driverId: ride.driverId,
      driverName: ride.driver?.fullName || 'Verified Driver',
      driverAvatarUrl: ride.driver?.avatarUrl ?? null,
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
      routeStatus: ride.routeStatus,
      routeDistanceM: ride.routeDistanceM ?? undefined,
      routeDurationS: ride.routeDurationS ?? undefined,
      routeVersion: ride.routeVersion,
      maxDetourMinutes: ride.maxDetourMinutes ?? undefined,
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
            imageUrl: ride.vehicle.imageUrl ?? null,
            createdAt: ride.vehicle.createdAt.toISOString(),
            updatedAt: ride.vehicle.updatedAt.toISOString(),
          }
        : undefined,
      cabShare: (ride as any).cabShareDetail
        ? {
            id: (ride as any).cabShareDetail.id,
            rideId: (ride as any).cabShareDetail.rideId,
            totalCapacity: (ride as any).cabShareDetail.totalCapacity,
            estimatedTotalFare: (ride as any).cabShareDetail.estimatedTotalFare,
            finalTotalFare: (ride as any).cabShareDetail.finalTotalFare,
            fareRevision: (ride as any).cabShareDetail.fareRevision,
            bookingDeadline: (ride as any).cabShareDetail.bookingDeadline instanceof Date
              ? (ride as any).cabShareDetail.bookingDeadline.toISOString()
              : (ride as any).cabShareDetail.bookingDeadline,
            cabService: (ride as any).cabShareDetail.cabService,
            cabBookingRef: (ride as any).cabShareDetail.cabBookingRef,
            createdAt: (ride as any).cabShareDetail.createdAt instanceof Date
              ? (ride as any).cabShareDetail.createdAt.toISOString()
              : (ride as any).cabShareDetail.createdAt,
            updatedAt: (ride as any).cabShareDetail.updatedAt instanceof Date
              ? (ride as any).cabShareDetail.updatedAt.toISOString()
              : (ride as any).cabShareDetail.updatedAt,
          }
        : null,
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
    match?: RideMatchMetadataDto | null,
  ): PublicRideSummaryDto {
    return {
      id: ride.id,
      rideType: ride.rideType,
      driverId: ride.driverId,
      driverName: ride.driver?.fullName || 'Verified Member',
      driverAvatarUrl: ride.driver?.avatarUrl ?? null,
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
      routeStatus: ride.routeStatus,
      routeDistanceM: ride.routeDistanceM ?? undefined,
      routeDurationS: ride.routeDurationS ?? undefined,
      createdAt: ride.createdAt.toISOString(),
      vehicle: ride.vehicle
        ? {
            id: ride.vehicle.id,
            make: ride.vehicle.make,
            model: ride.vehicle.model,
            color: ride.vehicle.color,
            capacity: ride.vehicle.capacity,
            imageUrl: ride.vehicle.imageUrl ?? null,
          }
        : undefined,
      cabShare: (ride as any).cabShareDetail
        ? (() => {
            const detail = (ride as any).cabShareDetail;
            const maxPassengerSeats = detail.totalCapacity - 1;
            const confirmedPassengerSeats = Math.max(0, maxPassengerSeats - ride.availableSeats);
            const split = calculateCabFareSplit(
              detail.finalTotalFare ?? detail.estimatedTotalFare,
              detail.totalCapacity,
              confirmedPassengerSeats,
            );
            return {
              totalCapacity: detail.totalCapacity,
              estimatedTotalFare: detail.estimatedTotalFare,
              finalTotalFare: detail.finalTotalFare,
              fareRevision: detail.fareRevision,
              bookingDeadline: detail.bookingDeadline instanceof Date
                ? detail.bookingDeadline.toISOString()
                : detail.bookingDeadline,
              cabService: detail.cabService,
              estimatedPerPersonIfFull: split.estimatedPerPersonIfFull,
              currentPerPerson: split.currentPerPerson,
              totalConfirmedParticipants: split.confirmedParticipants,
            };
          })()
        : null,
      driverRating: driverRating ?? undefined,
      match: match ?? undefined,
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
    if (!dto.vehicleId) {
      throw new BadRequestException('Selected vehicle is required for private vehicle rides.');
    }

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
            maxDetourMinutes: dto.maxDetourMinutes ?? null,
            routeStatus: (dto.originLatitude != null && dto.destinationLatitude != null)
              ? RouteStatus.PENDING
              : RouteStatus.NONE,
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
        const publishedRide = newlyCreatedRide as Ride;
        try {
          await this.alertsMatcher.matchRideAgainstAlerts(publishedRide);
        } catch (err) {
          this.logger.error(
            `[RidesService] Background alert matching failed for ride ${publishedRide.id}: ${err}`,
          );
        }

        // Post-commit: Asynchronously compute route geometry without delaying publish response
        if (publishedRide.originLatitude != null && publishedRide.destinationLatitude != null) {
          this.routeService.generateRouteForRide(publishedRide.id).catch((err: any) => {
            this.logger.error(`[RidesService] Background route generation failed for ${publishedRide.id}: ${err.message}`);
          });
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
   * Publish a shared cab journey (Verified student/faculty, no vehicle required).
   * Organiser automatically occupies 1 seat, available passenger seats = totalCapacity - 1.
   * Atomically creates Ride (rideType=CAB_SHARE, vehicleId=null) and CabShareDetail.
   */
  async publishCabShare(
    user: User,
    dto: CreateCabShareDto,
  ): Promise<DriverRideResponseDto> {
    if (!user.audience) {
      throw new BadRequestException('User must have an assigned institutional audience to organize rides.');
    }

    const depTime = new Date(dto.departureTime);
    const deadline = new Date(dto.bookingDeadline);
    const now = new Date();

    if (depTime.getTime() <= now.getTime() + 10 * 60 * 1000) {
      throw new BadRequestException('Departure time must be at least 10 minutes in the future.');
    }

    if (deadline.getTime() > depTime.getTime()) {
      throw new BadRequestException('Booking deadline must be before or equal to departure time.');
    }

    if (deadline.getTime() <= now.getTime()) {
      throw new BadRequestException('Booking deadline cannot be in the past.');
    }

    if (dto.totalCapacity < 2 || dto.totalCapacity > 8) {
      throw new BadRequestException('Total cab capacity must be between 2 and 8.');
    }

    if (dto.estimatedTotalFare < 50 || dto.estimatedTotalFare > 20000) {
      throw new BadRequestException('Estimated total fare must be between ₹50 and ₹20,000.');
    }

    const availableSeats = dto.totalCapacity - 1;
    const initialCostPerSeat = Math.ceil(dto.estimatedTotalFare / dto.totalCapacity);
    const hasCoordinates = dto.originLatitude != null && dto.destinationLatitude != null;

    let newlyCreatedRide: any = null;

    const result = await this.prisma.$transaction(async (tx) => {
      const ride = await tx.ride.create({
        data: {
          driverId: user.id,
          vehicleId: null,
          rideType: RideType.CAB_SHARE,
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
          availableSeats,
          totalSeats: dto.totalCapacity,
          costPerSeat: initialCostPerSeat,
          status: RideStatus.SCHEDULED,
          maxDetourMinutes: dto.maxDetourMinutes ?? null,
          routeStatus: hasCoordinates ? RouteStatus.PENDING : RouteStatus.NONE,
        },
      });

      const cabDetail = await tx.cabShareDetail.create({
        data: {
          rideId: ride.id,
          totalCapacity: dto.totalCapacity,
          estimatedTotalFare: dto.estimatedTotalFare,
          bookingDeadline: deadline,
          cabService: dto.cabService?.trim() || null,
          cabBookingRef: dto.cabBookingRef?.trim() || null,
          fareRevision: 1,
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
            rideType: 'CAB_SHARE',
            totalCapacity: dto.totalCapacity,
            availableSeats,
            estimatedTotalFare: dto.estimatedTotalFare,
            bookingDeadline: deadline.toISOString(),
            cabService: dto.cabService,
          },
        },
        tx,
      );

      newlyCreatedRide = { ...ride, cabShareDetail: cabDetail };
      return this.toDriverRideDto(newlyCreatedRide);
    });

    // Post-commit: Match alerts and generate route
    if (newlyCreatedRide) {
      try {
        await this.alertsMatcher.matchRideAgainstAlerts(newlyCreatedRide);
      } catch (err) {
        this.logger.error(`[RidesService] Background alert matching failed for cab share ${newlyCreatedRide.id}: ${err}`);
      }

      if (hasCoordinates) {
        this.routeService.generateRouteForRide(newlyCreatedRide.id).catch((err: any) => {
          this.logger.error(`[RidesService] Background route generation failed for cab share ${newlyCreatedRide.id}: ${err.message}`);
        });
      }
    }

    return result;
  }

  /**
   * Update final cab fare when the bill arrives.
   * If material increase (>15% or >₹50/person), increments fareRevision and notifies confirmed passengers.
   */
  async updateCabShareFare(
    user: User,
    rideId: string,
    dto: UpdateCabShareFareDto,
  ): Promise<DriverRideResponseDto> {
    const ride = await this.prisma.ride.findFirst({
      where: {
        id: rideId,
        driverId: user.id,
        rideType: RideType.CAB_SHARE,
      },
      include: {
        cabShareDetail: true,
        bookings: {
          where: { status: BookingStatus.CONFIRMED },
          include: { passenger: true },
        },
      },
    });

    if (!ride || !ride.cabShareDetail) {
      throw new NotFoundException('Cab share journey not found or you are not the organiser.');
    }

    if (ride.status === RideStatus.CANCELLED) {
      throw new BadRequestException('Cannot update fare for a cancelled cab share journey.');
    }

    if (ride.status === RideStatus.COMPLETED) {
      throw new BadRequestException('Cannot update fare for an already completed cab share journey.');
    }

    const isMaterial = isMaterialFareIncrease(
      ride.cabShareDetail.estimatedTotalFare,
      dto.finalTotalFare,
      ride.cabShareDetail.totalCapacity,
    );

    const newRevision = isMaterial
      ? ride.cabShareDetail.fareRevision + 1
      : ride.cabShareDetail.fareRevision;

    const newCostPerSeat = Math.ceil(dto.finalTotalFare / ride.totalSeats);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.cabShareDetail.update({
        where: { id: ride.cabShareDetail!.id },
        data: {
          finalTotalFare: dto.finalTotalFare,
          fareRevision: newRevision,
        },
      });

      const updatedRide = await tx.ride.update({
        where: { id: ride.id },
        data: {
          costPerSeat: newCostPerSeat,
        },
        include: {
          driver: true,
          vehicle: true,
          cabShareDetail: true,
          bookings: {
            select: { id: true, status: true, requestedSeats: true },
          },
        },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'RIDE_UPDATED',
          targetType: 'RIDE',
          targetId: ride.id,
          changes: {
            finalTotalFare: dto.finalTotalFare,
            fareRevision: newRevision,
            isMaterialIncrease: isMaterial,
            reason: dto.reason,
          },
        },
        tx,
      );

      return updatedRide;
    });

    // Notify affected confirmed passengers if material increase
    if (isMaterial && ride.bookings.length > 0) {
      for (const booking of ride.bookings) {
        try {
          await this.notificationsService.createNotification({
            recipientId: booking.passengerId,
            audience: ride.audience,
            type: NotificationType.CAB_FARE_UPDATED,
            title: '⚠️ Cab Fare Revision',
            message: `The total fare for your shared cab from ${ride.origin} to ${ride.destination} has been updated to ₹${dto.finalTotalFare}. Please acknowledge the revised fare.`,
            rideId: ride.id,
            bookingId: booking.id,
            dedupKey: `cab_fare_updated:${booking.id}:${newRevision}`,
          });
        } catch (err) {
          this.logger.error(`[RidesService] Failed to notify passenger ${booking.passengerId} of fare revision: ${err}`);
        }
      }
    }

    return this.toDriverRideDto(updated);
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

    const effectiveDepartureDate = dto.departureDate || (dto as any).date;
    const effectiveMinSeats = dto.minSeats ?? (dto as any).seats ?? 1;

    if (effectiveDepartureDate) {
      // YYYY-MM-DD format representing the calendar day in Asia/Kolkata (+05:30)
      const dateIsoKolkata = `${effectiveDepartureDate}T00:00:00.000+05:30`;
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
      if (kolkataFormatter.format(startOfKolkataDay) !== effectiveDepartureDate) {
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
      const originPattern = dto.origin && dto.origin.trim().length > 0 ? `%${dto.origin.trim()}%` : null;
      spatialConditions.push(Prisma.sql`
        (
          (r.origin_geom IS NOT NULL AND ST_DWithin(
            r.origin_geom,
            ST_SetSRID(ST_MakePoint(${dto.originLon}, ${dto.originLat}), 4326)::geography,
            ${radiusMeters}
          ))
          ${
            originPattern
              ? Prisma.sql`OR (
                  r.origin_geom IS NULL AND (
                    r.origin ILIKE ${originPattern}
                    OR ${dto.origin!.trim()} ILIKE ('%' || r.origin || '%')
                  )
                )`
              : Prisma.empty
          }
        )
      `);
    }

    if (dto.destLat !== undefined && dto.destLon !== undefined) {
      const radiusMeters = destRadiusKm * 1000;
      const destPattern = dto.destination && dto.destination.trim().length > 0 ? `%${dto.destination.trim()}%` : null;
      spatialConditions.push(Prisma.sql`
        (
          (r.destination_geom IS NOT NULL AND ST_DWithin(
            r.destination_geom,
            ST_SetSRID(ST_MakePoint(${dto.destLon}, ${dto.destLat}), 4326)::geography,
            ${radiusMeters}
          ))
          ${
            destPattern
              ? Prisma.sql`OR (
                  r.destination_geom IS NULL AND (
                    r.destination ILIKE ${destPattern}
                    OR ${dto.destination!.trim()} ILIKE ('%' || r.destination || '%')
                  )
                )`
              : Prisma.empty
          }
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
    const searchMode = this.corridorMatcher.getSearchMode();
    const hasCoordinates =
      dto.originLat !== undefined &&
      dto.originLon !== undefined &&
      dto.destLat !== undefined &&
      dto.destLon !== undefined;
    const timeParams = { fromTime, toExclusive, toTime };

    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(50, Math.max(1, dto.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortField = dto.sortBy || 'departureTime';

    // -------------------------------------------------------------------------
    // CORRIDOR DISCOVERY MODE: Intelligent route-geometry corridor matching
    // -------------------------------------------------------------------------
    if (searchMode === 'CORRIDOR' && hasCoordinates) {
      const corridorMatches = await this.corridorMatcher.findCorridorMatches(
        user,
        dto,
        timeParams,
        blockedUserIds,
      );

      const allCandidateIds = Array.from(
        new Set([...corridorMatches.keys(), ...(spatialRideIds || [])]),
      );

      if (allCandidateIds.length === 0) {
        return {
          rides: [],
          pagination: {
            total: 0,
            page,
            limit,
            totalPages: 1,
          },
        };
      }

      const corridorWhere: Prisma.RideWhereInput = {
        id: { in: allCandidateIds },
        audience: user.audience, // Strict database-level cohort isolation
        status: RideStatus.SCHEDULED, // Never return cancelled rides
        departureTime: {
          gte: fromTime,
          ...(toExclusive ? { lt: toExclusive } : toTime ? { lte: toTime } : {}),
        },
        availableSeats: {
          gte: dto.minSeats ?? 1,
        },
        ...(dto.rideType === 'CAB_SHARE'
          ? { rideType: RideType.CAB_SHARE }
          : dto.rideType === 'VEHICLE_RIDE'
          ? { rideType: RideType.VEHICLE_RIDE, vehicle: { deletedAt: null } }
          : {
              OR: [
                { rideType: RideType.CAB_SHARE },
                { rideType: RideType.VEHICLE_RIDE, vehicle: { deletedAt: null } },
              ],
            }),
        ...(blockedUserIds.length > 0 ? { driverId: { notIn: blockedUserIds } } : {}),
        ...(dto.maxCost !== undefined ? { costPerSeat: { lte: dto.maxCost } } : {}),
      };

      const candidates = await this.prisma.ride.findMany({
        where: corridorWhere,
        include: {
          driver: true,
          vehicle: true,
          cabShareDetail: true,
        },
      });

      const candidatesWithMatch = candidates.map((ride) => {
        let matchMeta: RideMatchMetadataDto;
        if (corridorMatches.has(ride.id)) {
          const cm = corridorMatches.get(ride.id)!;
          matchMeta = {
            matchType: cm.matchType,
            pickupDistanceM: cm.pickupDistanceM,
            dropoffDistanceM: cm.dropoffDistanceM,
            pickupFraction: cm.pickupFraction,
            dropoffFraction: cm.dropoffFraction,
            sharedDistanceM: cm.sharedDistanceM,
            isFallbackGeometry: cm.isFallbackGeometry,
            matchReasons: cm.matchReasons,
          };
        } else {
          matchMeta = {
            matchType: 'ENDPOINT_ONLY',
            isFallbackGeometry: false,
            matchReasons: ["Pickup near driver's origin", "Drop-off near driver's destination"],
          };
        }
        return { ride, match: matchMeta };
      });

      // Sorting: honor user sort preferences or default to match quality then departure
      if (sortField === 'cost') {
        candidatesWithMatch.sort((a, b) => {
          const costA = a.ride.costPerSeat ?? 999999;
          const costB = b.ride.costPerSeat ?? 999999;
          if (costA !== costB) return dto.sortOrder === 'desc' ? costB - costA : costA - costB;
          return a.ride.departureTime.getTime() - b.ride.departureTime.getTime();
        });
      } else if (sortField === 'seats') {
        candidatesWithMatch.sort((a, b) => {
          if (a.ride.availableSeats !== b.ride.availableSeats) {
            return dto.sortOrder === 'asc'
              ? a.ride.availableSeats - b.ride.availableSeats
              : b.ride.availableSeats - a.ride.availableSeats;
          }
          return a.ride.departureTime.getTime() - b.ride.departureTime.getTime();
        });
      } else {
        const typeOrder: Record<string, number> = { EXACT: 1, ALONG_ROUTE: 2, ENDPOINT_ONLY: 3 };
        candidatesWithMatch.sort((a, b) => {
          const rankDiff = (typeOrder[a.match.matchType] || 4) - (typeOrder[b.match.matchType] || 4);
          if (rankDiff !== 0) return rankDiff;
          const timeDiff = a.ride.departureTime.getTime() - b.ride.departureTime.getTime();
          if (timeDiff !== 0) return dto.sortOrder === 'desc' ? -timeDiff : timeDiff;
          return a.ride.id.localeCompare(b.ride.id);
        });
      }

      const total = candidatesWithMatch.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const pageSlice = candidatesWithMatch.slice(skip, skip + limit);

      const driverIds = Array.from(new Set(pageSlice.map((c) => c.ride.driverId)));
      const ratingMap = await this.ratingsService.getDriverRatingAggregates(driverIds);

      return {
        rides: pageSlice.map((c) =>
          this.toPublicRideDto(c.ride, ratingMap.get(c.ride.driverId) || null, c.match),
        ),
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
      };
    }

    // -------------------------------------------------------------------------
    // STANDARD / ENDPOINT SEARCH (with SHADOW mode comparison telemetry)
    // -------------------------------------------------------------------------
    const where: Prisma.RideWhereInput = {
      audience: user.audience, // Strict database-level cohort isolation
      status: RideStatus.SCHEDULED, // Never return cancelled rides
      departureTime: {
        gte: fromTime,
        ...(toExclusive ? { lt: toExclusive } : toTime ? { lte: toTime } : {}),
      },
      availableSeats: {
        gte: effectiveMinSeats,
      },
      ...(dto.rideType === 'CAB_SHARE'
        ? { rideType: RideType.CAB_SHARE }
        : dto.rideType === 'VEHICLE_RIDE'
        ? { rideType: RideType.VEHICLE_RIDE, vehicle: { deletedAt: null } }
        : {
            OR: [
              { rideType: RideType.CAB_SHARE },
              { rideType: RideType.VEHICLE_RIDE, vehicle: { deletedAt: null } },
            ],
          }),
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
          cabShareDetail: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.ride.count({ where }),
    ]);

    // SHADOW MODE: Execute corridor matching comparison asynchronously without affecting user output or request latency
    if (searchMode === 'SHADOW' && hasCoordinates) {
      setImmediate(async () => {
        try {
          const corridorMatches = await this.corridorMatcher.findCorridorMatches(
            user,
            dto,
            timeParams,
            blockedUserIds,
          );
          this.corridorMatcher.logShadowComparison(total, corridorMatches, dto);
        } catch (err: any) {
          this.logger.warn(`[CorridorSearch] Shadow evaluation error: ${err?.message || err}`);
        }
      });
    }

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
        cabShareDetail: true,
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
        vehicleId: { not: null },
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
      vehicleId: r.vehicleId!,
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
        cabShareDetail: true,
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
   * Retrieve the computed route geometry and metrics for a ride.
   * Subject to strict institutional audience isolation and moderation checks.
   */
  async getRideRoute(user: User, rideId: string): Promise<RideRouteResponseDto> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: {
        id: true,
        audience: true,
        driverId: true,
        originLatitude: true,
        destinationLatitude: true,
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

    let route = await this.routeService.getRideRoute(rideId);
    if (!route) {
      throw new NotFoundException('Route geometry not found for this ride.');
    }

    // Lazy generation: if status is PENDING or NONE but coordinates exist, try computing synchronously on-demand
    if (
      (route.status === RouteStatus.PENDING || route.status === RouteStatus.NONE) &&
      ride.originLatitude != null &&
      ride.destinationLatitude != null
    ) {
      await this.routeService.generateRouteForRide(rideId);
      const rechecked = await this.routeService.getRideRoute(rideId);
      if (rechecked) {
        route = rechecked;
      }
    }

    return route;
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
    if (dto.maxDetourMinutes !== undefined) dataToUpdate.maxDetourMinutes = dto.maxDetourMinutes ?? null;

    if (dto.departureTime !== undefined) {
      const newDepTime = new Date(dto.departureTime);
      if (isNaN(newDepTime.getTime()) || newDepTime.getTime() <= Date.now() + 10 * 60 * 1000) {
        throw new BadRequestException('New departure time must be at least 10 minutes in the future.');
      }
      dataToUpdate.departureTime = newDepTime;
    }

    const coordinatesChanged =
      dto.originLatitude !== undefined ||
      dto.originLongitude !== undefined ||
      dto.destinationLatitude !== undefined ||
      dto.destinationLongitude !== undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
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

      if (ride.status === RideStatus.IN_PROGRESS) {
        throw new BadRequestException('Cannot modify a ride that is already in progress.');
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
        const maxPassengerSeats = ride.vehicle ? (ride.vehicle.capacity - 1) : 7;

        if (dto.availableSeats + confirmedSeats > maxPassengerSeats) {
          throw new BadRequestException(
            `Cannot offer more than ${maxPassengerSeats} passenger seats for this vehicle${confirmedSeats > 0 ? ` (${confirmedSeats} already booked)` : ''}.`,
          );
        }

        dataToUpdate.availableSeats = dto.availableSeats;
        dataToUpdate.totalSeats = Math.max(ride.totalSeats, dto.availableSeats + confirmedSeats);
      }

      if (coordinatesChanged) {
        const finalOriginLat = dto.originLatitude !== undefined ? dto.originLatitude : ride.originLatitude;
        const finalDestLat = dto.destinationLatitude !== undefined ? dto.destinationLatitude : ride.destinationLatitude;
        if (finalOriginLat != null && finalDestLat != null) {
          dataToUpdate.routeStatus = RouteStatus.PENDING;
        } else {
          dataToUpdate.routeStatus = RouteStatus.NONE;
          dataToUpdate.routeGeom = null;
          dataToUpdate.routeDistanceM = null;
          dataToUpdate.routeDurationS = null;
        }
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

      return updated;
    });

    // Post-commit: Asynchronously regenerate route geometry if coordinates were updated
    if (coordinatesChanged && updated.routeStatus === RouteStatus.PENDING) {
      this.routeService.generateRouteForRide(rideId, { force: true }).catch((err: any) => {
        this.logger.error(`[RidesService] Background route regeneration failed for ${rideId}: ${err.message}`);
      });
    }

    return this.toDriverRideDto(updated);
  }

  /**
   * Cancel a scheduled ride owned by the caller.
   */
  async cancelMyRide(user: User, rideId: string): Promise<DriverRideResponseDto> {
    const { result, activeBookings, rideDepartureTime, rideOrigin, rideDestination, rideAudience, rideType } =
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
          cabShareDetail: true,
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

      if (ride.departureTime.getTime() <= Date.now() && ride.status !== RideStatus.IN_PROGRESS) {
        throw new BadRequestException('Cannot cancel a ride that has already departed.');
      }

      // When a ride is cancelled by driver/organiser, transition any active passenger bookings to CANCELLED
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
          cancellationReason: ride.rideType === RideType.CAB_SHARE
            ? 'Cab share journey was cancelled by organiser'
            : 'Ride was cancelled by driver',
        },
      });

      const cancelled = await tx.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.CANCELLED,
        },
        include: {
          vehicle: true,
          cabShareDetail: true,
          bookings: {
            select: {
              id: true,
              status: true,
              requestedSeats: true,
            },
          },
        },
      });

      // Close tracking session if active
      await tx.rideTrackingSession.updateMany({
        where: { rideId },
        data: { endedAt: new Date(), isStale: true },
      });

      // Remove active location data according to retention rules (M7.7)
      await tx.driverLocationSnapshot.deleteMany({
        where: { rideId },
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
        rideType: ride.rideType,
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

      const isCabShare = rideType === RideType.CAB_SHARE;
      const notifTitle = isCabShare
        ? '❌ Shared Cab Cancelled by Organiser'
        : '❌ Ride Cancelled by Driver';
      const notifMessage = isCabShare
        ? `The shared cab from ${rideOrigin} to ${rideDestination} scheduled for ${kolkataTime} was cancelled by the organiser.`
        : `The ride from ${rideOrigin} to ${rideDestination} scheduled for ${kolkataTime} was cancelled by the driver.`;

      for (const b of activeBookings) {
        try {
          await this.notificationsService.createNotification({
            recipientId: b.passengerId,
            audience: rideAudience,
            type: NotificationType.RIDE_CANCELLED,
            title: notifTitle,
            message: notifMessage,
            rideId,
            dedupKey: `ride_cancelled:${rideId}:${b.passengerId}`,
          });
        } catch (err) {
          this.logger.error(`[RidesService] Failed to notify passenger of ride cancellation: ${err}`);
        }
      }
    }

    // Evict any active tracking room listeners and emit access revocation
    try {
      await this.trackingGateway?.revokeRideAccess(rideId, 'RIDE_CANCELLED');
    } catch (err) {
      this.logger.warn(`Failed to revoke tracking room access on ride cancellation: ${err}`);
    }

    return result;
  }

  /**
   * Start a scheduled ride and initiate live tracking (Driver only).
   */
  async startMyRide(user: User, rideId: string): Promise<DriverRideResponseDto> {
    const { result, confirmedBookings, rideOrigin, rideDestination, rideAudience } =
      await this.prisma.$transaction(async (tx) => {
        const lockedRides = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM rides
          WHERE id = ${rideId}::uuid AND driver_id = ${user.id}::uuid
          FOR UPDATE
        `;

        if (!lockedRides.length) {
          throw new NotFoundException('Ride not found or you do not have permission to start it.');
        }

        const ride = await tx.ride.findFirst({
          where: { id: rideId, driverId: user.id },
          include: {
            vehicle: true,
            bookings: {
              select: { id: true, status: true, requestedSeats: true, passengerId: true },
            },
          },
        });

        if (!ride) {
          throw new NotFoundException('Ride not found or you do not have permission to start it.');
        }

        if (ride.rideType === RideType.CAB_SHARE) {
          throw new BadRequestException('Live vehicle tracking and boarding OTP are not supported for shared cab journeys.');
        }

        if (ride.status === RideStatus.CANCELLED) {
          throw new BadRequestException('Cannot start a ride that has been cancelled.');
        }

        if (ride.status === RideStatus.COMPLETED) {
          throw new BadRequestException('Cannot start a ride that has already completed.');
        }

        if (ride.status === RideStatus.IN_PROGRESS) {
          const ratingMap = await this.ratingsService.getDriverRatingAggregates([user.id]);
          return {
            result: this.toDriverRideDto(ride, ratingMap.get(user.id) || null),
            confirmedBookings: [],
            rideOrigin: ride.origin,
            rideDestination: ride.destination,
            rideAudience: ride.audience,
          };
        }

        const startedRide = await tx.ride.update({
          where: { id: rideId },
          data: { status: RideStatus.IN_PROGRESS },
          include: {
            vehicle: true,
            bookings: {
              select: { id: true, status: true, requestedSeats: true, passengerId: true },
            },
          },
        });

        // Upsert tracking session
        await tx.rideTrackingSession.upsert({
          where: { rideId },
          create: {
            rideId,
            startedAt: new Date(),
            isStale: false,
          },
          update: {
            startedAt: new Date(),
            endedAt: null,
            isStale: false,
          },
        });

        await this.audit.log(
          {
            actorId: user.id,
            actorRole: user.role,
            action: 'RIDE_STARTED',
            targetType: 'RIDE',
            targetId: rideId,
            changes: { status: 'IN_PROGRESS' },
          },
          tx,
        );

        const confirmed = ride.bookings.filter((b) => b.status === BookingStatus.CONFIRMED);

        const ratingMap = await this.ratingsService.getDriverRatingAggregates([user.id]);
        return {
          result: this.toDriverRideDto(startedRide, ratingMap.get(user.id) || null),
          confirmedBookings: confirmed,
          rideOrigin: ride.origin,
          rideDestination: ride.destination,
          rideAudience: ride.audience,
        };
      });

    // Notify all confirmed passengers that driver started the ride
    for (const b of confirmedBookings) {
      try {
        await this.notificationsService.createNotification({
          recipientId: b.passengerId,
          audience: rideAudience,
          type: NotificationType.RIDE_STARTED,
          title: '🚗 Ride Started',
          message: `Your driver has started the ride from ${rideOrigin} to ${rideDestination}. Live tracking is now active.`,
          rideId,
          bookingId: b.id,
          dedupKey: `ride_started:${rideId}:${b.passengerId}`,
        });
      } catch (err) {
        this.logger.error(`[RidesService] Failed to notify passenger of ride start: ${err}`);
      }
    }

    return result;
  }

  /**
   * Mark a scheduled or in-progress ride as completed (Driver only).
   */
  async completeMyRide(user: User, rideId: string): Promise<DriverRideResponseDto> {
    const { result, confirmedBookings, rideOrigin, rideDestination, rideAudience } =
      await this.prisma.$transaction(async (tx) => {
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
              select: { id: true, status: true, requestedSeats: true, passengerId: true },
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
          return {
            result: this.toDriverRideDto(ride, ratingMap.get(user.id) || null),
            confirmedBookings: [],
            rideOrigin: ride.origin,
            rideDestination: ride.destination,
            rideAudience: ride.audience,
          };
        }

        // Close tracking session
        await tx.rideTrackingSession.updateMany({
          where: { rideId },
          data: { endedAt: new Date(), isStale: true },
        });

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
              select: { id: true, status: true, requestedSeats: true, passengerId: true },
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

        const confirmed = ride.bookings.filter((b) => b.status === BookingStatus.CONFIRMED);

        const ratingMap = await this.ratingsService.getDriverRatingAggregates([user.id]);
        return {
          result: this.toDriverRideDto(completed, ratingMap.get(user.id) || null),
          confirmedBookings: confirmed,
          rideOrigin: ride.origin,
          rideDestination: ride.destination,
          rideAudience: ride.audience,
        };
      });

    // Notify all confirmed passengers that ride completed
    for (const b of confirmedBookings) {
      try {
        await this.notificationsService.createNotification({
          recipientId: b.passengerId,
          audience: rideAudience,
          type: NotificationType.RIDE_COMPLETED,
          title: '✅ Ride Completed',
          message: `The ride from ${rideOrigin} to ${rideDestination} has arrived at its destination.`,
          rideId,
          bookingId: b.id,
          dedupKey: `ride_completed:${rideId}:${b.passengerId}`,
        });
      } catch (err) {
        this.logger.error(`[RidesService] Failed to notify passenger of ride completion: ${err}`);
      }
    }

    // Evict any active tracking room listeners and emit access revocation
    try {
      await this.trackingGateway?.revokeRideAccess(rideId, 'RIDE_COMPLETED');
    } catch (err) {
      this.logger.warn(`Failed to revoke tracking room access on ride completion: ${err}`);
    }

    return result;
  }
}
