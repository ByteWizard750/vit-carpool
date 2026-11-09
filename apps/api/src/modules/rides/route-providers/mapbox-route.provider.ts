import { Logger } from '@nestjs/common';
import { IRouteGeometryProvider, RouteCalculationResult } from './route-provider.interface';

export class MapboxRouteProvider implements IRouteGeometryProvider {
  readonly name = 'mapbox';
  private readonly logger = new Logger(MapboxRouteProvider.name);

  constructor(
    private readonly accessToken: string,
    private readonly timeoutMs: number = 5000,
  ) {
    this.logger.log(
      '[MapboxRouteProvider] Initialized Mapbox Directions provider. Ensure enterprise caching terms permit backend geometry persistence.',
    );
  }

  async calculateRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteCalculationResult> {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${originLon},${originLat};${destLon},${destLat}?access_token=${this.accessToken}&overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Mapbox Directions API returned HTTP ${res.status}`);
      }

      const data = (await res.json()) as any;
      if (!data.routes || !data.routes[0]) {
        throw new Error('No driving route found in Mapbox response');
      }

      const route = data.routes[0];
      const rawCoordinates = route.geometry?.coordinates as [number, number][];

      if (!rawCoordinates || rawCoordinates.length < 2) {
        throw new Error('Mapbox route geometry contained fewer than 2 points');
      }

      return {
        coordinates: rawCoordinates,
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
        provider: this.name,
        isFallback: false,
      };
    } catch (err: any) {
      this.logger.warn(`[MapboxRouteProvider] Directions request failed: ${err.message}`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

