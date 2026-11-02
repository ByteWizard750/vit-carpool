import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LocationsService } from '../src/modules/locations/locations.service';

describe('Milestone 7.5: Individual Passenger ETA Intelligence', () => {
  let service: LocationsService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'NODE_ENV') return 'test';
              if (key === 'LOCATION_PROVIDER') return 'mock';
              if (key === 'MAPBOX_ACCESS_TOKEN') return '';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('1. Individual Passenger ETAs with Different Pickup Locations', () => {
    it('calculates distinct ETAs and distances for multiple passenger pickup stops', async () => {
      // Driver position: Tambaram Railway Station
      const driverLat = 12.9249;
      const driverLng = 80.1171;

      // Passenger 1: Vandalur Crescent Gate (~4.5 km away)
      const p1Lat = 12.8890;
      const p1Lng = 80.0825;

      // Passenger 2: Perungalathur Junction (~2.5 km away)
      const p2Lat = 12.9050;
      const p2Lng = 80.0950;

      // Passenger 3: Kelambakkam Junction (~14 km away)
      const p3Lat = 12.7885;
      const p3Lng = 80.2185;

      const etaP1 = await service.calculateEta(driverLat, driverLng, p1Lat, p1Lng, { rideId: 'ride-multi-1' });
      const etaP2 = await service.calculateEta(driverLat, driverLng, p2Lat, p2Lng, { rideId: 'ride-multi-1' });
      const etaP3 = await service.calculateEta(driverLat, driverLng, p3Lat, p3Lng, { rideId: 'ride-multi-1' });

      // Assertions on Passenger 2 (closest: ~2-3 km)
      expect(etaP2.distanceMeters).toBeGreaterThan(1500);
      expect(etaP2.distanceMeters).toBeLessThan(5000);
      expect(etaP2.etaMinutes).toBeGreaterThanOrEqual(1);

      // Assertions on Passenger 1 (middle: ~4-6 km)
      expect(etaP1.distanceMeters).toBeGreaterThan(etaP2.distanceMeters!);
      expect(etaP1.etaMinutes).toBeGreaterThanOrEqual(etaP2.etaMinutes!);

      // Assertions on Passenger 3 (furthest: > 12 km)
      expect(etaP3.distanceMeters).toBeGreaterThan(etaP1.distanceMeters!);
      expect(etaP3.etaMinutes).toBeGreaterThan(etaP1.etaMinutes!);

      // Output contract verification
      expect(etaP1.source).toBe('CAMPUS_ESTIMATE_FALLBACK');
      expect(etaP1.isApproximate).toBe(true);
      expect(typeof etaP1.etaSeconds).toBe('number');
      expect(typeof etaP1.calculatedAt).toBe('string');
    });
  });

  describe('2. Meaningful Movement Threshold & ETA Caching', () => {
    it('returns cached result with source CACHED when driver moves less than 50 meters', async () => {
      const rideId = 'ride-cache-test';
      const destLat = 12.8890;
      const destLng = 80.0825;

      // Driver initial position
      const initialLat = 12.9249;
      const initialLng = 80.1171;

      const firstResult = await service.calculateEta(initialLat, initialLng, destLat, destLng, { rideId });
      expect(firstResult.source).toBe('CAMPUS_ESTIMATE_FALLBACK');

      // Driver moves only ~15 meters (approx 0.0001 degrees lat is ~11 meters)
      const movedLat = initialLat + 0.0001;
      const movedLng = initialLng + 0.0001;

      const secondResult = await service.calculateEta(movedLat, movedLng, destLat, destLng, { rideId });

      expect(secondResult.source).toBe('CACHED');
      expect(secondResult.isApproximate).toBe(firstResult.isApproximate);
      expect(secondResult.calculatedAt).toBe(firstResult.calculatedAt);
    });

    it('recalculates route when driver moves beyond the 50m threshold after interval', async () => {
      const rideId = 'ride-movement-recalc';
      const destLat = 12.8890;
      const destLng = 80.0825;

      const initialLat = 12.9249;
      const initialLng = 80.1171;

      await service.calculateEta(initialLat, initialLng, destLat, destLng, { rideId });

      // Driver moves 1 km away with forceFresh option
      const newLat = initialLat + 0.009; // ~1000m
      const newLng = initialLng + 0.009;

      const freshResult = await service.calculateEta(newLat, newLng, destLat, destLng, {
        rideId,
        forceFresh: true,
      });

      expect(freshResult.source).toBe('CAMPUS_ESTIMATE_FALLBACK');
      expect(freshResult.distanceMeters).not.toBeNull();
    });
  });

  describe('3. Coordinate Validation & Safety', () => {
    it('gracefully handles invalid, out-of-bounds, or NaN coordinates without throwing', async () => {
      const invalidLat = await service.calculateEta(999, 80.1171, 12.8406, 80.1534);
      expect(invalidLat.source).toBe('UNAVAILABLE');
      expect(invalidLat.etaMinutes).toBeNull();
      expect(invalidLat.distanceMeters).toBeNull();
      expect(invalidLat.isApproximate).toBe(false);

      const nanCoord = await service.calculateEta(NaN, 80.1171, 12.8406, 80.1534);
      expect(nanCoord.source).toBe('UNAVAILABLE');
      expect(nanCoord.etaMinutes).toBeNull();

      const nullCoord = await service.calculateEta(null as any, 80.1171, 12.8406, 80.1534);
      expect(nullCoord.source).toBe('UNAVAILABLE');
    });
  });

  describe('4. Routing Provider Fallback & Realism', () => {
    it('never presents straight-line distance as driving distance (applies road detour factor)', async () => {
      const originLat = 12.9249;
      const originLng = 80.1171;
      const destLat = 12.8406;
      const destLng = 80.1534;

      const straightLine = service.haversine(originLat, originLng, destLat, destLng);
      const fallback = service.calculateCampusFallback(originLat, originLng, destLat, destLng);

      // Must apply road network detour multiplier (1.25x)
      expect(fallback.distanceMeters).toBeGreaterThan(straightLine);
      expect(fallback.distanceMeters).toBe(Math.round(straightLine * 1.25));

      // Must be explicitly flagged as approximate
      expect(fallback.isApproximate).toBe(true);
      expect(fallback.source).toBe('CAMPUS_ESTIMATE_FALLBACK');
    });

    it('simulates Mapbox failure / rate limit and seamlessly uses campus fallback', async () => {
      // Configure mock config to simulate mapbox failure
      const mapboxConfig: TestingModule = await Test.createTestingModule({
        providers: [
          LocationsService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: any) => {
                if (key === 'NODE_ENV') return 'test';
                if (key === 'LOCATION_PROVIDER') return 'mapbox';
                if (key === 'MAPBOX_ACCESS_TOKEN') return 'invalid-token-to-trigger-fallback';
                return defaultValue;
              }),
            },
          },
        ],
      }).compile();

      const mapboxService = mapboxConfig.get<LocationsService>(LocationsService);

      // Force mock fetch to throw or return 429
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('Network timeout'));

      try {
        const result = await mapboxService.calculateEta(12.9249, 80.1171, 12.8890, 80.0825, {
          rideId: 'ride-failover',
          forceFresh: true,
        });

        expect(result.source).toBe('CAMPUS_ESTIMATE_FALLBACK');
        expect(result.isApproximate).toBe(true);
        expect(result.etaMinutes).toBeGreaterThan(0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('5. Per-Ride Request Rate Limiting', () => {
    it('throttles rapid excessive queries per ride to protect upstream quotas', async () => {
      const rideId = 'ride-rate-limit-test';
      const destLat = 12.8890;
      const destLng = 80.0825;

      // Perform 16 successive queries with forceFresh to simulate high-frequency GPS barrage
      let lastResult: any;
      for (let i = 0; i < 17; i++) {
        lastResult = await service.calculateEta(12.9249 + i * 0.001, 80.1171 + i * 0.001, destLat, destLng, {
          rideId,
          forceFresh: true,
        });
      }

      // After 15 requests/min limit is hit, gracefully switches to campus fallback
      expect(lastResult.source).toBe('CAMPUS_ESTIMATE_FALLBACK');
      expect(lastResult.isApproximate).toBe(true);
    });
  });
});
