import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, User, RouteStatus } from '@vit-carpool/db';
import { SearchRidesQueryDto, RideMatchType, RideMatchMetadataDto } from '@vit-carpool/contracts';

export interface CandidateCorridorMatch {
  id: string;
  matchType: RideMatchType;
  pickupDistanceM: number;
  dropoffDistanceM: number;
  pickupFraction: number;
  dropoffFraction: number;
  sharedDistanceM: number | null;
  isFallbackGeometry: boolean;
  matchReasons: string[];
}

export type CorridorSearchMode = 'ENDPOINT' | 'SHADOW' | 'CORRIDOR';

@Injectable()
export class CorridorMatcherService {
  private readonly logger = new Logger(CorridorMatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Retrieves the current corridor discovery mode from configuration.
   * Can be 'ENDPOINT' (default), 'SHADOW', or 'CORRIDOR'.
   */
  getSearchMode(): CorridorSearchMode {
    const rawMode = (
      process.env.CORRIDOR_SEARCH_MODE ||
      this.configService.get<string>('CORRIDOR_SEARCH_MODE') ||
      'ENDPOINT'
    )
      .trim()
      .toUpperCase();
    if (rawMode === 'CORRIDOR' || rawMode === 'SHADOW') {
      return rawMode as CorridorSearchMode;
    }
    return 'ENDPOINT';
  }

  /**
   * Performs high-performance PostGIS corridor matching along the driver's route geometry.
   * Leverages the GiST index on route_geom and validates:
   * 1. Pickup is within acceptable buffer of route_geom
   * 2. Dropoff is within acceptable buffer of route_geom
   * 3. Forward directionality: pickup_fraction < dropoff_fraction
   * 4. Driver max detour constraints
   * 5. Strict institutional audience isolation
   */
  async findCorridorMatches(
    user: User,
    dto: SearchRidesQueryDto,
    timeParams: { fromTime: Date; toExclusive?: Date; toTime?: Date },
    blockedUserIds: string[] = [],
  ): Promise<Map<string, CandidateCorridorMatch>> {
    const matches = new Map<string, CandidateCorridorMatch>();

    // Corridor matching requires both pickup and dropoff coordinates
    if (
      dto.originLat === undefined ||
      dto.originLon === undefined ||
      dto.destLat === undefined ||
      dto.destLon === undefined
    ) {
      return matches;
    }

    const defaultMaxPickup = this.configService.get<number>('CORRIDOR_MAX_PICKUP_METERS', 1500);
    const defaultMaxDropoff = this.configService.get<number>('CORRIDOR_MAX_DROPOFF_METERS', 1500);

    const pickupBufferM = dto.originRadiusKm
      ? dto.originRadiusKm * 1000
      : dto.radiusKm
      ? dto.radiusKm * 1000
      : defaultMaxPickup;

    const dropoffBufferM = dto.destRadiusKm
      ? dto.destRadiusKm * 1000
      : dto.radiusKm
      ? dto.radiusKm * 1000
      : defaultMaxDropoff;

    const { fromTime, toExclusive, toTime } = timeParams;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        origin: string;
        destination: string;
        origin_latitude: number | null;
        origin_longitude: number | null;
        destination_latitude: number | null;
        destination_longitude: number | null;
        route_status: RouteStatus;
        route_distance_m: number | null;
        max_detour_minutes: number | null;
        pickup_distance_m: number;
        dropoff_distance_m: number;
        pickup_fraction: number;
        dropoff_fraction: number;
        origin_distance_m: number | null;
        dest_distance_m: number | null;
      }>
    >`
      SELECT 
        r.id,
        r.origin,
        r.destination,
        r.origin_latitude,
        r.origin_longitude,
        r.destination_latitude,
        r.destination_longitude,
        r.route_status,
        r.route_distance_m,
        r.max_detour_minutes,
        ROUND(ST_Distance(r.route_geom, ST_SetSRID(ST_MakePoint(${dto.originLon}, ${dto.originLat}), 4326)::geography)::numeric, 1)::float AS pickup_distance_m,
        ROUND(ST_Distance(r.route_geom, ST_SetSRID(ST_MakePoint(${dto.destLon}, ${dto.destLat}), 4326)::geography)::numeric, 1)::float AS dropoff_distance_m,
        ROUND(ST_LineLocatePoint(r.route_geom::geometry, ST_SetSRID(ST_MakePoint(${dto.originLon}, ${dto.originLat}), 4326))::numeric, 4)::float AS pickup_fraction,
        ROUND(ST_LineLocatePoint(r.route_geom::geometry, ST_SetSRID(ST_MakePoint(${dto.destLon}, ${dto.destLat}), 4326))::numeric, 4)::float AS dropoff_fraction,
        ROUND(ST_Distance(r.origin_geom, ST_SetSRID(ST_MakePoint(${dto.originLon}, ${dto.originLat}), 4326)::geography)::numeric, 1)::float AS origin_distance_m,
        ROUND(ST_Distance(r.destination_geom, ST_SetSRID(ST_MakePoint(${dto.destLon}, ${dto.destLat}), 4326)::geography)::numeric, 1)::float AS dest_distance_m
      FROM rides r
      LEFT JOIN vehicles v ON r.vehicle_id = v.id
      WHERE r.audience = ${user.audience}::audience_type
        AND r.status = 'SCHEDULED'
        AND (r.ride_type = 'CAB_SHARE' OR (r.ride_type = 'VEHICLE_RIDE' AND v.deleted_at IS NULL))
        ${dto.rideType === 'VEHICLE_RIDE' ? Prisma.sql`AND r.ride_type = 'VEHICLE_RIDE'` : dto.rideType === 'CAB_SHARE' ? Prisma.sql`AND r.ride_type = 'CAB_SHARE'` : Prisma.empty}
        AND r.route_geom IS NOT NULL
        AND r.route_status IN ('READY', 'FALLBACK')
        AND r.departure_time >= ${fromTime}
        ${toExclusive ? Prisma.sql`AND r.departure_time < ${toExclusive}` : toTime ? Prisma.sql`AND r.departure_time <= ${toTime}` : Prisma.empty}
        AND r.available_seats >= ${dto.minSeats ?? 1}
        ${dto.maxCost !== undefined ? Prisma.sql`AND r.cost_per_seat <= ${dto.maxCost}` : Prisma.empty}
        ${blockedUserIds.length > 0 ? Prisma.sql`AND r.driver_id NOT IN (${Prisma.join(blockedUserIds.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
        AND ST_DWithin(r.route_geom, ST_SetSRID(ST_MakePoint(${dto.originLon}, ${dto.originLat}), 4326)::geography, ${pickupBufferM})
        AND ST_DWithin(r.route_geom, ST_SetSRID(ST_MakePoint(${dto.destLon}, ${dto.destLat}), 4326)::geography, ${dropoffBufferM})
        AND ST_LineLocatePoint(r.route_geom::geometry, ST_SetSRID(ST_MakePoint(${dto.originLon}, ${dto.originLat}), 4326)) <
            ST_LineLocatePoint(r.route_geom::geometry, ST_SetSRID(ST_MakePoint(${dto.destLon}, ${dto.destLat}), 4326))
    `;

    // Passenger journey direction vector
    const pVecX = dto.destLon - dto.originLon;
    const pVecY = dto.destLat - dto.originLat;
    const pMag = Math.sqrt(pVecX * pVecX + pVecY * pVecY);

    for (const row of rows) {
      // 1. Strict forward directionality validation
      // Ensure passenger journey progresses forward by at least 0.5% of total route length
      if (row.dropoff_fraction <= row.pickup_fraction || row.dropoff_fraction - row.pickup_fraction < 0.005) {
        continue;
      }

      // Safeguard against opposite-direction journeys on U-turns, parallel roads, and highway cloverleaf loops:
      // Compare passenger travel vector against driver's origin -> destination vector.
      if (
        pMag > 0.0001 &&
        row.origin_longitude != null &&
        row.origin_latitude != null &&
        row.destination_longitude != null &&
        row.destination_latitude != null
      ) {
        const dVecX = row.destination_longitude - row.origin_longitude;
        const dVecY = row.destination_latitude - row.origin_latitude;
        const dMag = Math.sqrt(dVecX * dVecX + dVecY * dVecY);

        if (dMag > 0.0001) {
          const dotProduct = pVecX * dVecX + pVecY * dVecY;
          const cosTheta = dotProduct / (pMag * dMag);
          // If angle is obtuse (> 90 deg, cosTheta < 0), passenger is heading in the opposite direction
          if (cosTheta < -0.1) {
            continue;
          }
        }
      }

      // 2. Conservative detour limit validation
      // Evaluates whether the passenger's pickup and dropoff perpendicular access distances
      // are compatible with the driver's maximum detour willingness.
      // We apply a road network tortuosity factor (1.3x) and a conservative 20 km/h (~333 m/min)
      // suburban diversion velocity for the round-trip off-corridor travel.
      if (row.max_detour_minutes !== null && row.max_detour_minutes > 0) {
        const roundTripDetourM = (row.pickup_distance_m + row.dropoff_distance_m) * 2;
        const estimatedDetourMinutes = Math.round((roundTripDetourM * 1.3) / 333);
        if (estimatedDetourMinutes > row.max_detour_minutes) {
          continue;
        }
      }

      // 3. Match classification: EXACT vs ALONG_ROUTE
      // Straight-line fallback geometry is NEVER classified as EXACT because it lacks road-precision
      const isFallback = row.route_status === RouteStatus.FALLBACK;

      const isOriginClose =
        row.pickup_fraction <= 0.08 || (row.origin_distance_m !== null && row.origin_distance_m <= 800);
      const isDestClose =
        row.dropoff_fraction >= 0.92 || (row.dest_distance_m !== null && row.dest_distance_m <= 800);
      const isBothEndpointsClose =
        row.origin_distance_m !== null &&
        row.origin_distance_m <= 500 &&
        row.dest_distance_m !== null &&
        row.dest_distance_m <= 500;

      const isExact = !isFallback && (isBothEndpointsClose || (isOriginClose && isDestClose));
      const matchType: RideMatchType = isExact ? 'EXACT' : 'ALONG_ROUTE';

      // 4. Shared distance along route
      const sharedDistanceM = row.route_distance_m
        ? Math.max(0, Math.round((row.dropoff_fraction - row.pickup_fraction) * row.route_distance_m))
        : null;

      // 5. Match reasons construction (Never presenting crude heuristics as exact road detour)
      const matchReasons: string[] = [];
      const overlapPct = Math.round((row.dropoff_fraction - row.pickup_fraction) * 100);

      if (isFallback) {
        matchReasons.push(`Estimated corridor towards ${row.destination}`);
        matchReasons.push(`Pickup is ${Math.round(row.pickup_distance_m)}m from estimated corridor`);
        matchReasons.push(`Drop-off is ${Math.round(row.dropoff_distance_m)}m from estimated corridor`);
        matchReasons.push('Route geometry estimated (straight-line campus approximation)');
      } else if (isExact) {
        matchReasons.push('Direct match along your route');
        if (row.pickup_distance_m < 250) {
          matchReasons.push("Pickup near driver's departure point");
        } else {
          matchReasons.push(`Pickup is ${Math.round(row.pickup_distance_m)}m from driver's route`);
        }
        if (row.dropoff_distance_m < 250) {
          matchReasons.push("Drop-off near driver's destination");
        } else {
          matchReasons.push(`Drop-off is ${Math.round(row.dropoff_distance_m)}m from driver's route`);
        }
      } else {
        matchReasons.push(`Along driver's route towards ${row.destination}`);
        matchReasons.push(`Pickup is ${Math.round(row.pickup_distance_m)}m from driver's route`);
        matchReasons.push(`Drop-off is ${Math.round(row.dropoff_distance_m)}m from driver's route`);
        matchReasons.push(`Shares ${overlapPct}% of the driver's journey`);
        if (row.max_detour_minutes !== null && row.max_detour_minutes > 0) {
          matchReasons.push("Within driver's detour tolerance");
        }
      }

      matches.set(row.id, {
        id: row.id,
        matchType,
        pickupDistanceM: row.pickup_distance_m,
        dropoffDistanceM: row.dropoff_distance_m,
        pickupFraction: row.pickup_fraction,
        dropoffFraction: row.dropoff_fraction,
        sharedDistanceM,
        isFallbackGeometry: isFallback,
        matchReasons,
      });
    }

    return matches;
  }

  /**
   * Logs telemetry for shadow mode comparisons without exposing sensitive
   * coordinates, email addresses, or personal identity information.
   */
  logShadowComparison(
    endpointCount: number,
    corridorMatches: Map<string, CandidateCorridorMatch>,
    dto: SearchRidesQueryDto,
  ): void {
    const corridorCount = corridorMatches.size;
    let exactCount = 0;
    let alongRouteCount = 0;

    for (const match of corridorMatches.values()) {
      if (match.matchType === 'EXACT') exactCount++;
      else if (match.matchType === 'ALONG_ROUTE') alongRouteCount++;
    }

    this.logger.log(
      `[CorridorDiscovery:ShadowMode] endpointMatches=${endpointCount} corridorMatches=${corridorCount} exactMatches=${exactCount} alongRouteMatches=${alongRouteCount} hasSpatialCoords=${Boolean(dto.originLat && dto.destLat)} minSeats=${dto.minSeats ?? 1}`,
    );
  }
}
