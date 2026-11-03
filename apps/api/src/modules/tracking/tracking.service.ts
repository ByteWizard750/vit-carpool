import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LocationsService } from '../locations/locations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingAccessService, TrackingAccessContext } from './tracking-access.service';
import {
  User,
  RideStatus,
  BookingStatus,
  BoardingStatus,
  NotificationType,
} from '@vit-carpool/db';
import {
  DriverLocationUpdateDto,
  TrackingSessionStateDto,
  PassengerTrackingInfoDto,
} from '@vit-carpool/contracts';

import { WebPushService } from '../notifications/web-push.service';

@Injectable()
export class TrackingService implements OnModuleInit {
  private readonly logger = new Logger(TrackingService.name);
  private readonly staleThresholdMs: number;
  private readonly proximityEtaMinutes: number;
  private readonly proximityRadiusMeters: number;
  private readonly lastUpdateMap = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly locationsService: LocationsService,
    private readonly notificationsService: NotificationsService,
    private readonly webPushService: WebPushService,
    private readonly accessService: TrackingAccessService,
    private readonly config: ConfigService,
  ) {
    this.staleThresholdMs =
      this.config.get<number>('TRACKING_STALE_THRESHOLD_SECONDS', 30) * 1000;
    this.proximityEtaMinutes = this.config.get<number>(
      'TRACKING_PROXIMITY_ETA_MINUTES',
      5,
    );
    this.proximityRadiusMeters = this.config.get<number>(
      'TRACKING_PROXIMITY_RADIUS_METERS',
      300,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.reconcileSessionsOnStartup();
    } catch (err) {
      this.logger.warn(`Startup tracking reconciliation non-critical notice: ${err}`);
    }
  }

  /**
   * Startup reconciliation: reconciles existing tracking sessions upon backend restart.
   * Identifies unclosed tracking sessions with no recent updates (> 30s) and marks them STALE.
   * Cleans up expired abandoned sessions without falsely marking rides completed.
   */
  async reconcileSessionsOnStartup(): Promise<{ staleCount: number; expiredCount: number }> {
    const thirtySecondsAgo = new Date(Date.now() - this.staleThresholdMs);

    const staleResult = await this.prisma.rideTrackingSession.updateMany({
      where: {
        endedAt: null,
        isStale: false,
        OR: [
          { lastUpdateAt: { lte: thirtySecondsAgo } },
          { lastUpdateAt: null },
        ],
      },
      data: { isStale: true },
    });

    const expiredCount = await this.cleanupStaleSessions();

    this.logger.log(
      `[TrackingService] Startup reconciliation: marked ${staleResult.count} session(s) STALE, cleaned up ${expiredCount} expired session(s).`,
    );

    return {
      staleCount: staleResult.count,
      expiredCount,
    };
  }

  /**
   * Periodic evaluation to detect sessions whose location updates stopped (> 30s).
   * Marks them isStale = true in the database and returns the list of affected ride IDs.
   */
  async evaluateStaleSessions(): Promise<string[]> {
    const thirtySecondsAgo = new Date(Date.now() - this.staleThresholdMs);

    const staleSessions = await this.prisma.rideTrackingSession.findMany({
      where: {
        endedAt: null,
        isStale: false,
        lastUpdateAt: { lte: thirtySecondsAgo },
      },
      select: { id: true, rideId: true },
    });

    if (staleSessions.length > 0) {
      await this.prisma.rideTrackingSession.updateMany({
        where: { id: { in: staleSessions.map((s) => s.id) } },
        data: { isStale: true },
      });
    }

    return staleSessions.map((s) => s.rideId);
  }

  /**
   * Authorize a user to access tracking data for a ride.
   * Delegates to TrackingAccessService.
   */
  async authorizeTrackingAccess(
    user: User,
    rideId: string,
  ): Promise<TrackingAccessContext> {
    return this.accessService.authorizeRideTracking(user, rideId);
  }

  /**
   * Ingest driver live GPS coordinates.
   * Maintains a ring buffer of the last 20 snapshots and calculates proximity alerts.
   */
  async recordDriverLocation(
    driver: User,
    rideId: string,
    dto: DriverLocationUpdateDto,
  ): Promise<{
    snapshot: any;
    approachingPassengerIds: string[];
    stoppedNearPassengerIds: string[];
    missedPickupPassengerIds: string[];
    passengerETAs: Record<string, any>;
  }> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        trackingSession: true,
        bookings: {
          where: { status: BookingStatus.CONFIRMED },
          include: { passenger: true },
        },
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.driverId !== driver.id) {
      throw new ForbiddenException('Only the assigned driver can update ride location');
    }

    if (ride.status !== RideStatus.IN_PROGRESS && ride.status !== RideStatus.SCHEDULED) {
      throw new BadRequestException(`Cannot record location for ride with status ${ride.status}`);
    }

    const nowTime = Date.now();

    // Validate GPS Accuracy
    if (dto.accuracy != null && dto.accuracy > 500) {
      throw new BadRequestException('GPS accuracy too low (> 500m)');
    }

    // Validate Timestamp Freshness if provided
    if (dto.timestamp) {
      const ts = new Date(dto.timestamp);
      if (isNaN(ts.getTime())) {
        throw new BadRequestException('Invalid timestamp provided in location update');
      }
      if (nowTime - ts.getTime() > 5 * 60 * 1000) {
        throw new BadRequestException('Stale location timestamp: updates must be recorded within 5 minutes');
      }
      if (ts.getTime() - nowTime > 30 * 1000) {
        throw new BadRequestException('Location timestamp cannot be in the future');
      }
    }

    // Rate Limiting: Minimum 1000ms between GPS updates per ride
    const lastUpdate = this.lastUpdateMap.get(rideId);
    if (lastUpdate && nowTime - lastUpdate < 1000) {
      throw new HttpException(
        'Rate limit exceeded: GPS updates cannot exceed 1 request per second',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.lastUpdateMap.set(rideId, nowTime);

    // If ride is scheduled, transitioning to in_progress on first GPS update
    if (ride.status === RideStatus.SCHEDULED) {
      await this.prisma.ride.update({
        where: { id: rideId },
        data: { status: RideStatus.IN_PROGRESS },
      });
    }

    const now = new Date();

    // 1. Insert snapshot
    const snapshot = await this.prisma.driverLocationSnapshot.create({
      data: {
        rideId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy ?? null,
        speedKmh: dto.speedKmh ?? null,
        heading: dto.heading ?? null,
        recordedAt: now,
      },
    });

    // 2. Upsert tracking session
    await this.prisma.rideTrackingSession.upsert({
      where: { rideId },
      create: {
        rideId,
        startedAt: now,
        lastUpdateAt: now,
        isStale: false,
      },
      update: {
        lastUpdateAt: now,
        isStale: false,
      },
    });

    // 3. Ring buffer: Prune older snapshots beyond the latest 20
    const surplusSnapshots = await this.prisma.driverLocationSnapshot.findMany({
      where: { rideId },
      orderBy: { recordedAt: 'desc' },
      skip: 20,
      select: { id: true },
    });

    if (surplusSnapshots.length > 0) {
      const idsToDelete = surplusSnapshots.map((s) => s.id);
      await this.prisma.driverLocationSnapshot.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    // 4. Calculate individual passenger ETAs and proximity triggers
    const approachingPassengerIds: string[] = [];
    const stoppedNearPassengerIds: string[] = [];
    const missedPickupPassengerIds: string[] = [];
    const passengerETAs: Record<string, any> = {};

    for (const b of ride.bookings) {
      // Determine pickup coordinates: custom passenger pickup or ride origin
      const pickupLat = b.pickupLatitude ?? ride.originLatitude;
      const pickupLng = b.pickupLongitude ?? ride.originLongitude;

      if (pickupLat != null && pickupLng != null) {
        const eta = await this.locationsService.calculateEta(
          dto.latitude,
          dto.longitude,
          pickupLat,
          pickupLng,
          { rideId },
        );

        passengerETAs[b.passengerId] = eta;
        const pickupName = b.pickupAddress || b.pickupDescription || ride.origin;

        // Stage 1: Approaching Trigger (ETA <= 5 min OR Distance <= 300m)
        // Deduplicated: only fires once per booking
        if (
          !b.proximityNotifiedAt &&
          b.boardingStatus === BoardingStatus.WAITING &&
          (dto.accuracy == null || dto.accuracy <= 250) &&
          eta.etaMinutes != null &&
          (eta.etaMinutes <= this.proximityEtaMinutes ||
            (eta.distanceMeters != null && eta.distanceMeters <= this.proximityRadiusMeters))
        ) {
          approachingPassengerIds.push(b.passengerId);

          await this.prisma.booking.update({
            where: { id: b.id },
            data: { proximityNotifiedAt: now },
          });

          const minutesText = eta.etaMinutes ?? 5;
          const msg = `Your driver is approximately ${minutesText} minute${minutesText !== 1 ? 's' : ''} away. Please get ready at ${pickupName}.`;

          try {
            await this.notificationsService.createNotification({
              recipientId: b.passengerId,
              audience: ride.audience,
              type: NotificationType.DRIVER_APPROACHING,
              title: '🚗 Driver Approaching',
              message: msg,
              rideId,
              bookingId: b.id,
              dedupKey: `driver_approaching:${rideId}:${b.id}`,
            });
          } catch (err) {
            this.logger.error(`Failed to send proximity notification: ${err}`);
          }

          // Resilient Web Push delivery (non-blocking)
          this.webPushService
            .sendPushNotification(b.passengerId, {
              title: '🚗 Driver Approaching',
              body: msg,
              url: `/rides/${rideId}/track`,
              tag: `approaching-${b.id}`,
            })
            .catch(() => {});
        }

        // Stage 2: Driver stopped near pickup (speed < 5 km/h, distance <= 150m, accuracy <= 150m)
        const isStationary = dto.speedKmh == null || dto.speedKmh < 5;
        if (
          isStationary &&
          eta.distanceMeters != null &&
          eta.distanceMeters <= 150 &&
          (dto.accuracy == null || dto.accuracy <= 150) &&
          b.boardingStatus === BoardingStatus.WAITING &&
          !b.arrivedNotifiedAt
        ) {
          stoppedNearPassengerIds.push(b.passengerId);

          await this.prisma.booking.update({
            where: { id: b.id },
            data: { arrivedNotifiedAt: now },
          });

          const msg = `Your driver appears to be near your pickup at ${pickupName}. Are you boarding?`;

          try {
            await this.notificationsService.createNotification({
              recipientId: b.passengerId,
              audience: ride.audience,
              type: NotificationType.DRIVER_ARRIVED,
              title: '📍 Driver Near Pickup',
              message: msg,
              rideId,
              bookingId: b.id,
              dedupKey: `driver_arrived:${rideId}:${b.id}`,
            });
          } catch (err) {
            this.logger.error(`Failed to send driver arrived notification: ${err}`);
          }

          this.webPushService
            .sendPushNotification(b.passengerId, {
              title: '📍 Driver Near Pickup',
              body: msg,
              url: `/rides/${rideId}/track`,
              tag: `arrived-${b.id}`,
            })
            .catch(() => {});
        }

        // Stage 3: Missed pickup detection (driver passed pickup without boarding)
        const isMovingAway = dto.speedKmh != null && dto.speedKmh > 10;
        if (
          isMovingAway &&
          (b.proximityNotifiedAt != null || b.arrivedNotifiedAt != null) &&
          eta.distanceMeters != null &&
          eta.distanceMeters >= 400 &&
          b.boardingStatus === BoardingStatus.WAITING &&
          !b.missedNotifiedAt
        ) {
          missedPickupPassengerIds.push(b.passengerId);

          await this.prisma.booking.update({
            where: { id: b.id },
            data: { missedNotifiedAt: now },
          });

          const msg = `Your driver may have passed your pickup point at ${pickupName}. Please message the driver or review your trip.`;

          try {
            await this.notificationsService.createNotification({
              recipientId: b.passengerId,
              audience: ride.audience,
              type: NotificationType.MISSED_PICKUP,
              title: '⚠️ Missed Pickup Notice',
              message: msg,
              rideId,
              bookingId: b.id,
              dedupKey: `missed_pickup:${rideId}:${b.id}`,
            });
          } catch (err) {
            this.logger.error(`Failed to send missed pickup notification: ${err}`);
          }

          this.webPushService
            .sendPushNotification(b.passengerId, {
              title: '⚠️ Missed Pickup Notice',
              body: msg,
              url: `/rides/${rideId}/track`,
              tag: `missed-${b.id}`,
            })
            .catch(() => {});
        }
      }
    }

    return {
      snapshot,
      approachingPassengerIds,
      stoppedNearPassengerIds,
      missedPickupPassengerIds,
      passengerETAs,
    };
  }

  /**
   * Retrieve current tracking state for a ride.
   */
  async getTrackingState(
    user: User,
    rideId: string,
  ): Promise<TrackingSessionStateDto> {
    const { isDriver, confirmedBooking, ride } = await this.authorizeTrackingAccess(user, rideId);

    // Latest location snapshot
    const latestSnapshot = await this.prisma.driverLocationSnapshot.findFirst({
      where: { rideId },
      orderBy: { recordedAt: 'desc' },
    });

    const session = ride.trackingSession;
    const now = Date.now();
    const isStale =
      session?.isStale ||
      (latestSnapshot && now - latestSnapshot.recordedAt.getTime() > this.staleThresholdMs) ||
      false;

    // Fetch confirmed bookings
    const confirmedBookings = await this.prisma.booking.findMany({
      where: {
        rideId,
        status: BookingStatus.CONFIRMED,
      },
      include: {
        passenger: { select: { id: true, fullName: true, phoneNumber: true, avatarUrl: true } },
      },
    });

    // Build passenger tracking info list
    const passengers: PassengerTrackingInfoDto[] = [];
    let myPickup: any = null;

    for (const b of confirmedBookings) {
      let etaMinutes: number | null = null;
      let etaSeconds: number | null = null;
      let distanceMeters: number | null = null;
      let etaCalculatedAt: string | null = null;
      let etaSource: any = 'UNAVAILABLE';
      let isApproximate = false;

      const pLat = b.pickupLatitude ?? ride.originLatitude;
      const pLng = b.pickupLongitude ?? ride.originLongitude;

      if (latestSnapshot && pLat != null && pLng != null) {
        const eta = await this.locationsService.calculateEta(
          latestSnapshot.latitude,
          latestSnapshot.longitude,
          pLat,
          pLng,
          { rideId },
        );
        etaMinutes = eta.etaMinutes;
        etaSeconds = eta.etaSeconds;
        distanceMeters = eta.distanceMeters;
        etaCalculatedAt = eta.calculatedAt;
        etaSource = eta.source;
        isApproximate = eta.isApproximate;
      }

      const info: PassengerTrackingInfoDto = {
        bookingId: b.id,
        passengerId: b.passengerId,
        // Privacy: Passengers only see first name of co-passengers; driver sees full name
        passengerName: isDriver ? b.passenger.fullName : b.passenger.fullName.split(' ')[0],
        passengerAvatarUrl: b.passenger.avatarUrl ?? null,
        pickupAddress: b.pickupAddress,
        pickupLatitude: b.pickupLatitude,
        pickupLongitude: b.pickupLongitude,
        pickupDescription: b.pickupDescription,
        boardingStatus: b.boardingStatus,
        boardedAt: b.boardedAt ? b.boardedAt.toISOString() : null,
        proximityNotifiedAt: b.proximityNotifiedAt ? b.proximityNotifiedAt.toISOString() : null,
        etaMinutes,
        etaSeconds,
        distanceMeters,
        etaCalculatedAt,
        etaSource,
        isApproximate,
      };

      passengers.push(info);

      if (!isDriver && b.passengerId === user.id) {
        myPickup = {
          bookingId: b.id,
          pickupAddress: b.pickupAddress,
          pickupLatitude: b.pickupLatitude,
          pickupLongitude: b.pickupLongitude,
          pickupDescription: b.pickupDescription,
          boardingStatus: b.boardingStatus,
          etaMinutes,
          etaSeconds,
          distanceMeters,
          etaCalculatedAt,
          etaSource,
          isApproximate,
        };
      }
    }

    const isTrackingActive =
      ride.status === RideStatus.IN_PROGRESS &&
      session != null &&
      session.endedAt == null;

    return {
      rideId: ride.id,
      status: ride.status,
      isTrackingActive: Boolean(isTrackingActive),
      isStale: Boolean(isStale),
      startedAt: session?.startedAt ? session.startedAt.toISOString() : null,
      lastUpdateAt: session?.lastUpdateAt ? session.lastUpdateAt.toISOString() : null,
      driverId: ride.driverId,
      driverName: ride.driver.fullName,
      driverAvatarUrl: ride.driver.avatarUrl ?? null,
      vehicle: ride.vehicle
        ? {
            make: ride.vehicle.make,
            model: ride.vehicle.model,
            color: ride.vehicle.color,
            registrationNumber: ride.vehicle.registrationNumber, // Revealed to driver and confirmed passengers
            imageUrl: ride.vehicle.imageUrl ?? null,
          }
        : undefined,
      origin: ride.origin,
      originAddress: ride.originAddress,
      originLatitude: ride.originLatitude,
      originLongitude: ride.originLongitude,
      destination: ride.destination,
      destinationAddress: ride.destinationAddress,
      destinationLatitude: ride.destinationLatitude,
      destinationLongitude: ride.destinationLongitude,
      currentLocation: latestSnapshot
        ? {
            latitude: latestSnapshot.latitude,
            longitude: latestSnapshot.longitude,
            accuracy: latestSnapshot.accuracy,
            speedKmh: latestSnapshot.speedKmh,
            heading: latestSnapshot.heading,
            recordedAt: latestSnapshot.recordedAt.toISOString(),
          }
        : null,
      passengers,
      myPickup,
    };
  }

  /**
   * Update a passenger's boarding status (WAITING -> BOARDING -> BOARDED).
   * Caller must be the passenger of the booking or the driver of the ride.
   */
  async updateBoardingStatus(
    user: User,
    bookingId: string,
    status: BoardingStatus,
  ): Promise<any> {
    const booking = await this.accessService.authorizeBoardingUpdate(user, bookingId);

    if (status === BoardingStatus.BOARDED) {
      throw new ForbiddenException(
        'Direct boarding transition to BOARDED is disabled. Driver must verify passenger boarding OTP via /bookings/:id/verify-boarding.',
      );
    }

    const dataToUpdate: any = { boardingStatus: status };
    if (status === BoardingStatus.MISSED) {
      dataToUpdate.missedAt = new Date();
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: dataToUpdate,
      include: { passenger: true, ride: true },
    });
  }

  /**
   * Safe automatic cleanup of abandoned tracking sessions.
   * A timeout may end a tracking session under carefully defined conditions (endedAt = now()),
   * but MUST NOT falsely mark a ride COMPLETED.
   * Preserves booking and ride history.
   */
  async cleanupStaleSessions(): Promise<number> {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const expiredSessions = await this.prisma.rideTrackingSession.findMany({
      where: {
        endedAt: null,
        OR: [
          { startedAt: { lte: fourHoursAgo } },
          { lastUpdateAt: { lte: twoHoursAgo } },
        ],
      },
    });

    let closedCount = 0;
    for (const s of expiredSessions) {
      await this.prisma.rideTrackingSession.update({
        where: { id: s.id },
        data: { endedAt: new Date(), isStale: true },
      });
      // NOTE: We do NOT update ride.status! Preserves ride lifecycle integrity.
      closedCount++;
    }

    return closedCount;
  }

  /**
   * Safe automatic cleanup of expired location records.
   * Prunes location snapshots older than 24 hours to preserve database storage and passenger privacy.
   */
  async cleanupExpiredTrackingData(olderThanHours = 24): Promise<{ prunedSnapshotsCount: number }> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const deleteResult = await this.prisma.driverLocationSnapshot.deleteMany({
      where: {
        recordedAt: { lte: cutoff },
      },
    });

    return {
      prunedSnapshotsCount: deleteResult.count,
    };
  }
}

