import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILocationProvider } from './providers/location-provider.interface';
import { MockLocationProvider } from './providers/mock-location.provider';
import { MapboxLocationProvider } from './providers/mapbox-location.provider';
import {
  LocationSuggestionDto,
  LocationAutocompleteResponseDto,
  EtaSource,
} from '@vit-carpool/contracts';

export interface EtaCalculationOptions {
  rideId?: string;
  forceFresh?: boolean;
}

export interface EtaResult {
  etaSeconds: number | null;
  etaMinutes: number | null;
  distanceMeters: number | null;
  calculatedAt: string | null;
  source: EtaSource;
  isApproximate: boolean;
}

interface CachedEtaEntry {
  result: EtaResult;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  timestamp: number;
}

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);
  private readonly provider: ILocationProvider;
  private readonly transitCatalog: MockLocationProvider = new MockLocationProvider();

  // In-memory ETA cache keyed by "rideId:destLat:destLng"
  private readonly etaCache = new Map<string, CachedEtaEntry>();

  // Per-ride rate limit counter (max 15 external routing queries / min per ride)
  private readonly rideRequestCounters = new Map<string, { count: number; windowStart: number }>();

  constructor(private readonly config: ConfigService) {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    const providerType = process.env.LOCATION_PROVIDER || this.config.get<string>('LOCATION_PROVIDER', 'mock');
    const mapboxToken = this.config.get<string>('MAPBOX_ACCESS_TOKEN', '');
    const bbox = this.config.get<string>('MAPBOX_SEARCH_BBOX', '79.80,12.60,80.35,13.35');
    const proximity = this.config.get<string>('MAPBOX_PROXIMITY', '80.1534,12.8406');
    const timeoutMs = this.config.get<number>('LOCATION_REQUEST_TIMEOUT_MS', 5000);

    if (providerType === 'mapbox') {
      if (!mapboxToken || !mapboxToken.trim()) {
        throw new Error(
          'MAPBOX_ACCESS_TOKEN must be configured when LOCATION_PROVIDER is set to mapbox.',
        );
      }
      this.logger.log('Initializing MapboxLocationProvider (Search Box API v1)');
      this.provider = new MapboxLocationProvider(mapboxToken, {
        bbox,
        proximity,
        timeoutMs,
      });
    } else {
      if (nodeEnv === 'production') {
        throw new Error(
          'MockLocationProvider is strictly prohibited in production. Configure a production location provider.',
        );
      }
      this.logger.log('Initializing MockLocationProvider for Chennai transit landmarks (Dev/Test only)');
      this.provider = new MockLocationProvider();
    }
  }

  async autocomplete(
    query: string,
    limit: number = 6,
  ): Promise<LocationAutocompleteResponseDto> {
    const trimmed = query?.trim() || '';
    if (trimmed.length < 2) {
      return { suggestions: [] };
    }

    // 1. Authoritative local transit landmarks for VIT Chennai commuting corridors
    const transitSuggestions = await this.transitCatalog.search(trimmed, limit);

    // If using mock provider, return transit suggestions directly
    if (!(this.provider instanceof MapboxLocationProvider)) {
      return { suggestions: transitSuggestions.slice(0, limit) };
    }

    // 2. When Mapbox is active, query Mapbox to find addresses, streets, and broader localities
    let mapboxSuggestions: LocationSuggestionDto[] = [];
    try {
      mapboxSuggestions = await this.provider.search(trimmed, limit);
    } catch (err: any) {
      this.logger.warn(`[LocationsService] Mapbox autocomplete search failed, using transit catalog: ${err.message}`);
    }

    // 3. Deduplicate Mapbox suggestions against local transit suggestions
    const seenNames = new Set(transitSuggestions.map((s) => s.name.toLowerCase().trim()));
    const filteredMapbox = mapboxSuggestions.filter((m) => {
      const lower = m.name.toLowerCase().trim();
      if (seenNames.has(lower)) return false;

      // Filter out obvious commercial retail stores / outlets that pollute commuter transit searches
      const isRetailNoise =
        /\b(outlet|showroom|store|apparel|textiles|sarees|jewellers|jewellery|sweets|bakery|cabs|tempo)\b/i.test(m.name) &&
        !/\b(outlet|showroom|store|apparel|textiles|sarees|jewellers|jewellery|sweets|bakery|cabs|tempo)\b/i.test(trimmed);
      if (isRetailNoise) return false;
      return true;
    });

    // 4. Transit landmarks come first, followed by Mapbox results up to limit
    const merged = [...transitSuggestions, ...filteredMapbox].slice(0, limit);
    return { suggestions: merged };
  }

  /**
   * Helper to compute straight-line Haversine distance in meters.
   */
  public haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

  /**
   * Intelligent campus corridor fallback when Mapbox is unavailable, rate-limited, or disabled.
   * Never presents raw straight-line distance as a driving route; applies realistic road detour
   * factor (1.25x) and Chennai suburban corridor speed (~28 km/h = 7.78 m/s + 45s transit buffer).
   */
  public calculateCampusFallback(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): EtaResult {
    const straightLine = this.haversine(originLat, originLng, destLat, destLng);
    const distanceMeters = Math.round(straightLine * 1.25);
    const drivingTimeSec = Math.round(distanceMeters / 7.78);
    const etaSeconds = Math.max(30, drivingTimeSec + 45);
    const etaMinutes = Math.max(1, Math.round(etaSeconds / 60));

    return {
      etaSeconds,
      etaMinutes,
      distanceMeters,
      calculatedAt: new Date().toISOString(),
      source: 'CAMPUS_ESTIMATE_FALLBACK',
      isApproximate: true,
    };
  }

  /**
   * Calculate driving ETA and distance between coordinates with movement thresholding,
   * caching, per-ride rate limits, and fallback estimation.
   */
  async calculateEta(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    options?: EtaCalculationOptions,
  ): Promise<EtaResult> {
    // 1. Coordinate Validation: Never invent or assume coordinates
    if (
      originLat == null ||
      originLng == null ||
      destLat == null ||
      destLng == null ||
      isNaN(originLat) ||
      isNaN(originLng) ||
      isNaN(destLat) ||
      isNaN(destLng) ||
      originLat < -90 ||
      originLat > 90 ||
      destLat < -90 ||
      destLat > 90 ||
      originLng < -180 ||
      originLng > 180 ||
      destLng < -180 ||
      destLng > 180
    ) {
      return {
        etaSeconds: null,
        etaMinutes: null,
        distanceMeters: null,
        calculatedAt: null,
        source: 'UNAVAILABLE',
        isApproximate: false,
      };
    }

    const rideId = options?.rideId || 'global';
    const cacheKey = `${rideId}:${destLat.toFixed(4)}:${destLng.toFixed(4)}`;
    const now = Date.now();

    // 2. Cache & Meaningful Movement Threshold Check
    const cached = this.etaCache.get(cacheKey);
    if (cached && !options?.forceFresh) {
      const distanceMoved = this.haversine(originLat, originLng, cached.originLat, cached.originLng);
      const elapsedMs = now - cached.timestamp;
      const elapsedSec = Math.floor(elapsedMs / 1000);

      // If driver moved < 50m and cache is < 60s old, reuse cached result adjusted by elapsed time
      if (distanceMoved < 50 && elapsedMs < 60000) {
        const adjustedSeconds = Math.max(0, (cached.result.etaSeconds ?? 60) - elapsedSec);
        return {
          etaSeconds: adjustedSeconds,
          etaMinutes: adjustedSeconds <= 30 ? 1 : Math.max(1, Math.round(adjustedSeconds / 60)),
          distanceMeters: Math.max(0, (cached.result.distanceMeters ?? 0) - Math.round(distanceMoved)),
          calculatedAt: cached.result.calculatedAt,
          source: 'CACHED',
          isApproximate: cached.result.isApproximate,
        };
      }

      // If queried within last 25s, do not hit external API; return adjusted cached result
      if (elapsedMs < 25000) {
        const adjustedSeconds = Math.max(0, (cached.result.etaSeconds ?? 60) - elapsedSec);
        return {
          etaSeconds: adjustedSeconds,
          etaMinutes: adjustedSeconds <= 30 ? 1 : Math.max(1, Math.round(adjustedSeconds / 60)),
          distanceMeters: Math.max(0, (cached.result.distanceMeters ?? 0) - Math.round(distanceMoved)),
          calculatedAt: cached.result.calculatedAt,
          source: 'CACHED',
          isApproximate: cached.result.isApproximate,
        };
      }
    }

    // 3. Per-Ride Request Limit (Max 15 routing API requests/min per ride)
    if (rideId !== 'global') {
      const counter = this.rideRequestCounters.get(rideId);
      if (!counter || now - counter.windowStart > 60000) {
        this.rideRequestCounters.set(rideId, { count: 1, windowStart: now });
      } else {
        counter.count++;
        if (counter.count > 15) {
          this.logger.debug(
            `[LocationsService] Per-ride Mapbox request limit exceeded for ride ${rideId} (${counter.count}/min), using fallback`,
          );
          const fallback = this.calculateCampusFallback(originLat, originLng, destLat, destLng);
          this.etaCache.set(cacheKey, {
            result: fallback,
            originLat,
            originLng,
            destLat,
            destLng,
            timestamp: now,
          });
          return fallback;
        }
      }
    }

    // 4. Mapbox Directions API Integration
    const mapboxToken = this.config.get<string>('MAPBOX_ACCESS_TOKEN');
    const providerType = process.env.LOCATION_PROVIDER || this.config.get<string>('LOCATION_PROVIDER', 'mock');

    if (providerType === 'mapbox' && mapboxToken && mapboxToken.trim()) {
      try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${originLng},${originLat};${destLng},${destLat}?access_token=${mapboxToken}&overview=false`;
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.routes && data.routes[0]) {
            const durationSec = Math.round(data.routes[0].duration);
            const distM = Math.round(data.routes[0].distance);
            const freshResult: EtaResult = {
              etaSeconds: durationSec,
              etaMinutes: Math.max(1, Math.round(durationSec / 60)),
              distanceMeters: distM,
              calculatedAt: new Date().toISOString(),
              source: 'MAPBOX_DIRECTIONS',
              isApproximate: false,
            };

            this.etaCache.set(cacheKey, {
              result: freshResult,
              originLat,
              originLng,
              destLat,
              destLng,
              timestamp: now,
            });

            return freshResult;
          }
        } else if (res.status === 429) {
          this.logger.warn('[LocationsService] Mapbox Directions API rate limit reached (HTTP 429), using fallback');
        } else {
          this.logger.warn(`[LocationsService] Mapbox Directions API returned HTTP ${res.status}`);
        }
      } catch (err: any) {
        this.logger.warn(`[LocationsService] Mapbox Directions API failed: ${err.message}`);
      }
    }

    // 5. Intelligent Fallback Estimation
    const fallbackResult = this.calculateCampusFallback(originLat, originLng, destLat, destLng);
    this.etaCache.set(cacheKey, {
      result: fallbackResult,
      originLat,
      originLng,
      destLat,
      destLng,
      timestamp: now,
    });
    return fallbackResult;
  }
}
