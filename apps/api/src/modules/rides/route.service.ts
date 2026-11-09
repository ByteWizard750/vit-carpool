import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RouteStatus } from '@vit-carpool/db';
import { RideRouteResponseDto } from '@vit-carpool/contracts';
import { IRouteGeometryProvider, RouteCalculationResult } from './route-providers/route-provider.interface';
import { OsrmRouteProvider } from './route-providers/osrm-route.provider';
import { MapboxRouteProvider } from './route-providers/mapbox-route.provider';
import { StraightLineRouteProvider } from './route-providers/straight-line-route.provider';
import { MockRouteProvider } from './route-providers/mock-route.provider';

export interface RouteGenerationOptions {
  force?: boolean;
}

@Injectable()
export class RouteService {
  private readonly logger = new Logger(RouteService.name);
  private readonly primaryProvider: IRouteGeometryProvider;
  private readonly fallbackProvider: IRouteGeometryProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const configuredProvider = this.config.get<string>('ROUTE_GEOMETRY_PROVIDER', 'osrm').toLowerCase();
    const mapboxToken = this.config.get<string>('MAPBOX_ACCESS_TOKEN', '');
    const osrmUrl = this.config.get<string>('OSRM_ROUTER_URL', 'https://router.project-osrm.org');
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');

    this.fallbackProvider = new StraightLineRouteProvider();

    if (configuredProvider === 'mock' || nodeEnv === 'test') {
      this.logger.log('[RouteService] Using MockRouteProvider for deterministic routing in test/mock environment');
      this.primaryProvider = new MockRouteProvider();
    } else if (configuredProvider === 'mapbox' && mapboxToken.trim()) {
      this.logger.log('[RouteService] Using MapboxRouteProvider for route geometry generation');
      this.primaryProvider = new MapboxRouteProvider(mapboxToken);
    } else {
      this.logger.log(`[RouteService] Using OsrmRouteProvider (OSM open routing) at ${osrmUrl}`);
      this.primaryProvider = new OsrmRouteProvider({ baseUrl: osrmUrl });
    }
  }

  /**
   * Generates and stores route geometry for a given ride in PostgreSQL PostGIS.
   * Asynchronous, non-blocking: Never prevents ride publication if external routing fails.
   */
  async generateRouteForRide(
    rideId: string,
    options?: RouteGenerationOptions,
  ): Promise<boolean> {
    try {
      const ride = await this.prisma.ride.findUnique({
        where: { id: rideId },
        select: {
          id: true,
          originLatitude: true,
          originLongitude: true,
          destinationLatitude: true,
          destinationLongitude: true,
          routeStatus: true,
          routeVersion: true,
        },
      });

      if (!ride) {
        this.logger.warn(`[RouteService] Ride ${rideId} not found for route generation`);
        return false;
      }

      // Check coordinate validity
      if (
        ride.originLatitude == null ||
        ride.originLongitude == null ||
        ride.destinationLatitude == null ||
        ride.destinationLongitude == null
      ) {
        this.logger.log(`[RouteService] Ride ${rideId} lacks coordinate pairs; setting routeStatus=NONE`);
        await this.prisma.ride.update({
          where: { id: rideId },
          data: { routeStatus: RouteStatus.NONE },
        });
        return false;
      }

      if (ride.routeStatus === RouteStatus.READY && !options?.force) {
        return true;
      }

      // Compute route via primary provider with automatic fallback
      let calcResult: RouteCalculationResult;
      try {
        calcResult = await this.primaryProvider.calculateRoute(
          ride.originLatitude,
          ride.originLongitude,
          ride.destinationLatitude,
          ride.destinationLongitude,
        );
      } catch (primaryErr: any) {
        this.logger.warn(
          `[RouteService] Primary routing provider '${this.primaryProvider.name}' failed for ride ${rideId}: ${primaryErr.message}. Engaging fallback provider.`,
        );
        calcResult = await this.fallbackProvider.calculateRoute(
          ride.originLatitude,
          ride.originLongitude,
          ride.destinationLatitude,
          ride.destinationLongitude,
        );
      }

      const geojsonStr = JSON.stringify({
        type: 'LineString',
        coordinates: calcResult.coordinates,
      });

      const nextStatus = calcResult.isFallback ? RouteStatus.FALLBACK : RouteStatus.READY;

      // Atomic PostGIS persistence using native ST_GeomFromGeoJSON
      await this.prisma.$executeRaw`
        UPDATE rides
        SET route_geom = ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)::geography,
            route_distance_m = ${calcResult.distanceMeters},
            route_duration_s = ${calcResult.durationSeconds},
            route_status = ${nextStatus}::route_status_type,
            route_provider = ${calcResult.provider},
            route_computed_at = NOW(),
            route_version = route_version + 1
        WHERE id = ${rideId}::uuid
      `;

      this.logger.log(
        `[RouteService] Route geometry stored for ride ${rideId} (${calcResult.distanceMeters}m, ${calcResult.durationSeconds}s, status=${nextStatus}, provider=${calcResult.provider})`,
      );

      return true;
    } catch (err: any) {
      this.logger.error(`[RouteService] Fatal error generating route for ride ${rideId}: ${err.message}`, err.stack);
      try {
        await this.prisma.ride.update({
          where: { id: rideId },
          data: { routeStatus: RouteStatus.FAILED },
        });
      } catch {
        // Ignore failure update error
      }
      return false;
    }
  }

  /**
   * Retrieves the stored route geometry and navigation metrics for a ride.
   */
  async getRideRoute(rideId: string): Promise<RideRouteResponseDto | null> {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      route_status: RouteStatus;
      route_provider: string | null;
      route_distance_m: number | null;
      route_duration_s: number | null;
      route_computed_at: Date | null;
      route_version: number;
      geojson: string | null;
    }>>`
      SELECT id, route_status, route_provider, route_distance_m, route_duration_s,
             route_computed_at, route_version,
             ST_AsGeoJSON(route_geom) AS geojson
      FROM rides
      WHERE id = ${rideId}::uuid
    `;

    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    let geometry: { type: 'LineString'; coordinates: [number, number][] } | null = null;
    if (row.geojson) {
      try {
        geometry = JSON.parse(row.geojson);
      } catch {
        geometry = null;
      }
    }

    return {
      rideId: row.id,
      status: row.route_status,
      provider: row.route_provider,
      distanceMeters: row.route_distance_m,
      durationSeconds: row.route_duration_s,
      computedAt: row.route_computed_at ? row.route_computed_at.toISOString() : null,
      version: row.route_version,
      geometry,
    };
  }

  /**
   * Backfills route geometry for pre-existing scheduled rides that lack route geometry.
   */
  async backfillRidesWithoutRoute(limit: number = 25): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const pendingRides = await this.prisma.ride.findMany({
      where: {
        status: 'SCHEDULED',
        originLatitude: { not: null },
        destinationLatitude: { not: null },
        routeStatus: { in: [RouteStatus.NONE, RouteStatus.PENDING, RouteStatus.FAILED] },
      },
      select: { id: true },
      take: limit,
    });

    let succeeded = 0;
    let failed = 0;

    for (const r of pendingRides) {
      const ok = await this.generateRouteForRide(r.id);
      if (ok) succeeded++;
      else failed++;
    }

    return {
      processed: pendingRides.length,
      succeeded,
      failed,
    };
  }
}
