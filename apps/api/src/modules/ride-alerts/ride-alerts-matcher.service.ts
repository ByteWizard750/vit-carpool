import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Ride, NotificationType, Prisma } from '@vit-carpool/db';
import { formatTime12Hour } from '@vit-carpool/contracts';

interface MatchedAlertRow {
  id: string;
  user_id: string;
  earliest_departure_time: string | null;
  latest_departure_time: string | null;
  min_seats: number;
}

@Injectable()
export class RideAlertsMatcherService {
  private readonly logger = new Logger(RideAlertsMatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Evaluates a newly created or materialized ride against all active ride alerts.
   * Matches spatial proximity, directionality, available seats, and departure window.
   * Creates deduplicated persistent in-app notifications for matched passengers.
   */
  async matchRideAgainstAlerts(ride: Ride): Promise<{ matchedCount: number; notifiedCount: number }> {
    try {
      // 1. Get ride's departure time formatted in Asia/Kolkata HH:mm (24-hour)
      const kolkataTimeStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(ride.departureTime);

      const kolkataDateDisplay = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(ride.departureTime);

      const time12Hour = formatTime12Hour(kolkataTimeStr);

      const hasRideCoords =
        ride.originLatitude != null &&
        ride.originLongitude != null &&
        ride.destinationLatitude != null &&
        ride.destinationLongitude != null;

      // 2. Query candidates from PostgreSQL with spatial PostGIS filtering
      let candidates: MatchedAlertRow[] = [];

      if (hasRideCoords) {
        candidates = await this.prisma.$queryRaw<MatchedAlertRow[]>`
          SELECT
            a.id,
            a.user_id,
            a.earliest_departure_time,
            a.latest_departure_time,
            a.min_seats
          FROM ride_alerts a
          WHERE a.status = 'ACTIVE'
            AND a.audience = ${ride.audience}::audience_type
            AND a.user_id != ${ride.driverId}::uuid
            AND a.user_id NOT IN (
              SELECT blocked_id FROM blocks WHERE blocker_id = ${ride.driverId}::uuid
              UNION
              SELECT blocker_id FROM blocks WHERE blocked_id = ${ride.driverId}::uuid
            )
            AND a.min_seats <= ${ride.availableSeats}
            AND (
              -- Spatial origin match
              (
                a.origin_latitude IS NOT NULL
                AND a.origin_longitude IS NOT NULL
                AND ST_DWithin(
                  ST_SetSRID(ST_MakePoint(a.origin_longitude, a.origin_latitude), 4326)::geography,
                  ST_SetSRID(ST_MakePoint(${ride.originLongitude}, ${ride.originLatitude}), 4326)::geography,
                  a.radius_km * 1000
                )
              )
              OR (
                (a.origin_latitude IS NULL OR a.origin_longitude IS NULL)
                AND (
                  LOWER(a.origin) LIKE '%' || LOWER(${ride.origin}) || '%'
                  OR LOWER(${ride.origin}) LIKE '%' || LOWER(a.origin) || '%'
                )
              )
            )
            AND (
              -- Spatial destination match
              (
                a.destination_latitude IS NOT NULL
                AND a.destination_longitude IS NOT NULL
                AND ST_DWithin(
                  ST_SetSRID(ST_MakePoint(a.destination_longitude, a.destination_latitude), 4326)::geography,
                  ST_SetSRID(ST_MakePoint(${ride.destinationLongitude}, ${ride.destinationLatitude}), 4326)::geography,
                  a.radius_km * 1000
                )
              )
              OR (
                (a.destination_latitude IS NULL OR a.destination_longitude IS NULL)
                AND (
                  LOWER(a.destination) LIKE '%' || LOWER(${ride.destination}) || '%'
                  OR LOWER(${ride.destination}) LIKE '%' || LOWER(a.destination) || '%'
                )
              )
            )
        `;
      } else {
        // Fallback text-based matching if coordinates are missing on the ride
        candidates = await this.prisma.$queryRaw<MatchedAlertRow[]>`
          SELECT
            a.id,
            a.user_id,
            a.earliest_departure_time,
            a.latest_departure_time,
            a.min_seats
          FROM ride_alerts a
          WHERE a.status = 'ACTIVE'
            AND a.audience = ${ride.audience}::audience_type
            AND a.user_id != ${ride.driverId}::uuid
            AND a.user_id NOT IN (
              SELECT blocked_id FROM blocks WHERE blocker_id = ${ride.driverId}::uuid
              UNION
              SELECT blocker_id FROM blocks WHERE blocked_id = ${ride.driverId}::uuid
            )
            AND a.min_seats <= ${ride.availableSeats}
            AND (
              LOWER(a.origin) LIKE '%' || LOWER(${ride.origin}) || '%'
              OR LOWER(${ride.origin}) LIKE '%' || LOWER(a.origin) || '%'
            )
            AND (
              LOWER(a.destination) LIKE '%' || LOWER(${ride.destination}) || '%'
              OR LOWER(${ride.destination}) LIKE '%' || LOWER(a.destination) || '%'
            )
        `;
      }

      // 3. Filter candidates by departure time window
      const matchedAlerts = candidates.filter((alert) => {
        if (alert.earliest_departure_time && kolkataTimeStr < alert.earliest_departure_time) {
          return false;
        }
        if (alert.latest_departure_time && kolkataTimeStr > alert.latest_departure_time) {
          return false;
        }
        return true;
      });

      // 4. Create deduplicated notifications for each matched alert
      let notifiedCount = 0;
      for (const alert of matchedAlerts) {
        const dedupKey = `ride_alert:${alert.id}:${ride.id}`;
        const title = `🚗 New Ride Match: ${ride.origin} → ${ride.destination}`;
        const message = `A newly published ride departs on ${kolkataDateDisplay} at ${time12Hour} IST (${ride.availableSeats} seats available).`;

        const created = await this.notificationsService.createNotification({
          recipientId: alert.user_id,
          audience: ride.audience,
          type: NotificationType.RIDE_MATCH,
          title,
          message,
          rideId: ride.id,
          rideAlertId: alert.id,
          dedupKey,
        });

        if (created) {
          notifiedCount++;
        }
      }

      this.logger.log(
        `[RideAlertsMatcher] Ride ${ride.id} matched ${matchedAlerts.length} alert(s), sent ${notifiedCount} new notification(s)`,
      );

      return {
        matchedCount: matchedAlerts.length,
        notifiedCount,
      };
    } catch (err: unknown) {
      // Robustness: Matching failure must never crash the ride-publishing caller
      this.logger.error(`[RideAlertsMatcher] Error matching ride ${ride.id} against alerts: ${err}`);
      return { matchedCount: 0, notifiedCount: 0 };
    }
  }
}
