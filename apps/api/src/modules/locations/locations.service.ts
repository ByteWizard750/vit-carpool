import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILocationProvider } from './providers/location-provider.interface';
import { MockLocationProvider } from './providers/mock-location.provider';
import { MapboxLocationProvider } from './providers/mapbox-location.provider';
import {
  LocationSuggestionDto,
  LocationAutocompleteResponseDto,
} from '@vit-carpool/contracts';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);
  private readonly provider: ILocationProvider;

  constructor(private readonly config: ConfigService) {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    const providerType = this.config.get<string>('LOCATION_PROVIDER', 'mock');
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
    limit: number = 5,
  ): Promise<LocationAutocompleteResponseDto> {
    const trimmed = query?.trim() || '';
    if (trimmed.length < 2) {
      return { suggestions: [] };
    }

    const suggestions = await this.provider.search(trimmed, limit);
    return { suggestions };
  }
}
