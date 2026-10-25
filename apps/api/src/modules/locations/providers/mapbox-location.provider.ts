import {
  Injectable,
  Logger,
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ILocationProvider } from './location-provider.interface';
import { LocationSuggestionDto } from '@vit-carpool/contracts';

export interface MapboxProviderOptions {
  bbox?: string;
  proximity?: string;
  timeoutMs?: number;
  baseUrl?: string;
}

/**
 * Mapbox Location Provider utilizing the Mapbox Search Box API (v1).
 *
 * Terms & Data Storage Notice:
 * Under Mapbox Terms of Service, Search Box API results are intended for real-time
 * autocomplete and end-user selection. Ephemeral caching is permitted for up to 30 days.
 * Permanent database storage of coordinates requires appropriate licensing. In VIT Carpool,
 * rides store selected coordinates strictly to calculate proximity matches for campus commuters.
 */
@Injectable()
export class MapboxLocationProvider implements ILocationProvider {
  private readonly logger = new Logger(MapboxLocationProvider.name);

  private readonly bbox: string;
  private readonly proximity: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(
    private readonly accessToken: string,
    options?: MapboxProviderOptions,
  ) {
    if (!accessToken || !accessToken.trim()) {
      throw new Error('MAPBOX_ACCESS_TOKEN is required to instantiate MapboxLocationProvider');
    }
    this.bbox = options?.bbox || '79.80,12.60,80.35,13.35';
    this.proximity = options?.proximity || '80.1534,12.8406';
    this.timeoutMs = options?.timeoutMs || 5000;
    this.baseUrl = options?.baseUrl || 'https://api.mapbox.com';
  }

  async search(query: string, limit: number): Promise<LocationSuggestionDto[]> {
    const q = query.trim();
    if (!q || q.length < 2) {
      return [];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = new URL(`${this.baseUrl}/search/searchbox/v1/forward`);
      url.searchParams.set('q', q);
      url.searchParams.set('access_token', this.accessToken);
      url.searchParams.set('country', 'IN');
      url.searchParams.set('bbox', this.bbox);
      url.searchParams.set('proximity', this.proximity);
      url.searchParams.set('types', 'poi,address,neighborhood,locality,place');
      url.searchParams.set('limit', limit.toString());

      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          this.logger.error('Mapbox API rejected authentication. Check MAPBOX_ACCESS_TOKEN.');
          throw new BadGatewayException(
            'Upstream location provider authentication failed. Please verify provider credentials.',
          );
        }
        if (res.status === 429) {
          this.logger.warn('Mapbox API rate limit reached.');
          throw new HttpException(
            'Upstream location provider rate limit exceeded. Please try again later.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        this.logger.error(`Mapbox API request returned HTTP status ${res.status}`);
        throw new BadGatewayException(
          `Upstream location provider returned an unexpected status: ${res.status}`,
        );
      }

      let data: any;
      try {
        data = await res.json();
      } catch (parseErr: any) {
        this.logger.error(`Mapbox API response was not valid JSON: ${parseErr.message}`);
        throw new BadGatewayException('Malformed response from upstream location provider.');
      }

      const features: any[] = Array.isArray(data?.features) ? data.features : [];
      if (!features.length) {
        return [];
      }

      return features.map((f: any, idx: number) => {
        const props = f.properties || {};
        const coords = f.geometry?.coordinates || [0, 0];
        const rawType = (props.feature_type || f.place_type?.[0] || 'landmark').toLowerCase();

        let category: 'locality' | 'station' | 'campus' | 'landmark' = 'landmark';
        if (rawType.includes('station') || rawType.includes('transit')) {
          category = 'station';
        } else if (rawType.includes('college') || rawType.includes('university') || rawType.includes('campus')) {
          category = 'campus';
        } else if (
          rawType.includes('locality') ||
          rawType.includes('neighborhood') ||
          rawType.includes('place')
        ) {
          category = 'locality';
        }

        const name = props.name || props.place_formatted?.split(',')[0] || `Location ${idx + 1}`;
        const address = props.full_address || props.place_formatted || name;

        return {
          id: props.mapbox_id || f.id || `mapbox-${idx}`,
          name,
          address,
          latitude: Number(coords[1]),
          longitude: Number(coords[0]),
          category,
        };
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.logger.error(`Mapbox request timed out after ${this.timeoutMs}ms`);
        throw new GatewayTimeoutException(
          `Location search request timed out after ${this.timeoutMs}ms.`,
        );
      }
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.error(`Mapbox search failed unexpectedly: ${err.message}`);
      throw new BadGatewayException(`Location search service failure: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
