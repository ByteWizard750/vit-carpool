import { IRouteGeometryProvider, RouteCalculationResult } from './route-provider.interface';

export class MockRouteProvider implements IRouteGeometryProvider {
  readonly name = 'mock';

  async calculateRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteCalculationResult> {
    // Generate a deterministic 6-point route between origin and destination
    const points: [number, number][] = [
      [originLon, originLat],
      [originLon + (destLon - originLon) * 0.2, originLat + (destLat - originLat) * 0.18],
      [originLon + (destLon - originLon) * 0.4, originLat + (destLat - originLat) * 0.42],
      [originLon + (destLon - originLon) * 0.6, originLat + (destLat - originLat) * 0.58],
      [originLon + (destLon - originLon) * 0.8, originLat + (destLat - originLat) * 0.82],
      [destLon, destLat],
    ];

    const distMeters = 14500;
    const durSeconds = 1800; // 30 minutes

    return {
      coordinates: points,
      distanceMeters: distMeters,
      durationSeconds: durSeconds,
      provider: this.name,
      isFallback: false,
    };
  }
}

