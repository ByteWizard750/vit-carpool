export interface RouteCalculationResult {
  coordinates: [number, number][]; // [longitude, latitude]
  distanceMeters: number;
  durationSeconds: number;
  provider: string; // 'osrm' | 'mapbox' | 'straight_line_fallback' | 'mock'
  isFallback: boolean;
}

export interface IRouteGeometryProvider {
  readonly name: string;
  calculateRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteCalculationResult>;
}

