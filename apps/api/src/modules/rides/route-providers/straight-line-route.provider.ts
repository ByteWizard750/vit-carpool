import { IRouteGeometryProvider, RouteCalculationResult } from './route-provider.interface';

export class StraightLineRouteProvider implements IRouteGeometryProvider {
  readonly name = 'straight_line_fallback';

  /**
   * Generates a segmented fallback route line between origin and destination.
   * Interpolates 5 points along the path to ensure PostGIS ST_LineLocatePoint
   * and ST_DWithin have intermediate segments for corridor matching.
   */
  async calculateRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteCalculationResult> {
    const straightDist = this.haversineMeters(originLat, originLon, destLat, destLon);
    // Road detour multiplier: Suburban roads are rarely straight lines (standard 1.25x factor)
    const distanceMeters = Math.round(straightDist * 1.25);
    // Typical Chennai suburban corridor speed (~28 km/h = 7.78 m/s) with a 45s traffic buffer
    const drivingTimeSec = Math.round(distanceMeters / 7.78);
    const durationSeconds = Math.max(30, drivingTimeSec + 45);

    // 5-segment interpolated LineString: 0%, 25%, 50%, 75%, 100%
    const steps = 4;
    const coordinates: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const lat = originLat + (destLat - originLat) * frac;
      const lon = originLon + (destLon - originLon) * frac;
      coordinates.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
    }

    return {
      coordinates,
      distanceMeters,
      durationSeconds,
      provider: this.name,
      isFallback: true,
    };
  }

  private haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }
}

