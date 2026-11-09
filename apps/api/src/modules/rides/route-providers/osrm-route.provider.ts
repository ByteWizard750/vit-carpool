import { Logger } from '@nestjs/common';
import { IRouteGeometryProvider, RouteCalculationResult } from './route-provider.interface';

export class OsrmRouteProvider implements IRouteGeometryProvider {
  readonly name = 'osrm';
  private readonly logger = new Logger(OsrmRouteProvider.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options?: { baseUrl?: string; timeoutMs?: number }) {
    this.baseUrl = (options?.baseUrl || 'https://router.project-osrm.org').replace(/\/+$/, '');
    this.timeoutMs = options?.timeoutMs || 5000;
  }

  async calculateRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteCalculationResult> {
    const url = `${this.baseUrl}/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`OSRM routing service returned HTTP ${res.status}`);
      }

      const data = (await res.json()) as any;
      if (data.code !== 'Ok' || !data.routes || !data.routes[0]) {
        throw new Error(data.message || 'No driving route found between coordinates');
      }

      const route = data.routes[0];
      const rawCoordinates = route.geometry?.coordinates as [number, number][];

      if (!rawCoordinates || rawCoordinates.length < 2) {
        throw new Error('OSRM route geometry returned fewer than 2 coordinate points');
      }

      const distanceMeters = Math.round(route.distance);
      const durationSeconds = Math.round(route.duration);

      return {
        coordinates: rawCoordinates,
        distanceMeters,
        durationSeconds,
        provider: this.name,
        isFallback: false,
      };
    } catch (err: any) {
      this.logger.warn(`[OsrmRouteProvider] Route request failed: ${err.message}`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

