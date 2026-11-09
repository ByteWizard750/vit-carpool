import { OsrmRouteProvider } from '../src/modules/rides/route-providers/osrm-route.provider';
import { StraightLineRouteProvider } from '../src/modules/rides/route-providers/straight-line-route.provider';
import { RouteService } from '../src/modules/rides/route.service';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, RouteStatus } from '@vit-carpool/db';

describe('Routing Reliability & Resilience (unit/integration)', () => {
  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';
  let testPrisma: PrismaClient;

  beforeAll(async () => {
    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  describe('1. OsrmRouteProvider Fault Handling', () => {
    it('should throw error when service returns HTTP 500', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      global.fetch = mockFetch as any;

      const provider = new OsrmRouteProvider({ baseUrl: 'http://fake-osrm.local', timeoutMs: 2000 });
      await expect(provider.calculateRoute(12.92, 80.10, 12.84, 80.15)).rejects.toThrow(
        'OSRM routing service returned HTTP 500',
      );
    });

    it('should throw error when service times out', async () => {
      const mockFetch = jest.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });
      global.fetch = mockFetch as any;

      const provider = new OsrmRouteProvider({ baseUrl: 'http://fake-osrm.local', timeoutMs: 50 });
      await expect(provider.calculateRoute(12.92, 80.10, 12.84, 80.15)).rejects.toThrow();
    });

    it('should throw error when response code is not Ok', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'NoRoute', message: 'No route could be found' }),
      });
      global.fetch = mockFetch as any;

      const provider = new OsrmRouteProvider({ baseUrl: 'http://fake-osrm.local', timeoutMs: 2000 });
      await expect(provider.calculateRoute(12.92, 80.10, 12.84, 80.15)).rejects.toThrow(
        'No route could be found',
      );
    });

    it('should throw error when coordinates array has fewer than 2 points', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [{ geometry: { coordinates: [[80.10, 12.92]] }, distance: 0, duration: 0 }],
        }),
      });
      global.fetch = mockFetch as any;

      const provider = new OsrmRouteProvider({ baseUrl: 'http://fake-osrm.local', timeoutMs: 2000 });
      await expect(provider.calculateRoute(12.92, 80.10, 12.84, 80.15)).rejects.toThrow(
        'fewer than 2 coordinate points',
      );
    });
  });

  describe('2. StraightLineRouteProvider Guaranteed Campus Fallback', () => {
    it('should generate valid 5-point LineString geometry with positive distance and duration', async () => {
      const fallback = new StraightLineRouteProvider();
      const result = await fallback.calculateRoute(12.9249, 80.1000, 12.8406, 80.1534);

      expect(result.provider).toBe('straight_line_fallback');
      expect(result.isFallback).toBe(true);
      expect(result.coordinates.length).toBe(5);
      expect(result.distanceMeters).toBeGreaterThan(5000);
      expect(result.durationSeconds).toBeGreaterThan(600);
      expect(result.coordinates[0]).toEqual([80.1000, 12.9249]);
      expect(result.coordinates[4]).toEqual([80.1534, 12.8406]);
    });
  });

  describe('3. RouteService Automatic Fallback Integration', () => {
    it('should engage fallback provider when primary provider fails and store route as FALLBACK', async () => {
      // Create a mock failing primary provider
      const failingPrimary = {
        name: 'failing_mock',
        calculateRoute: jest.fn().mockRejectedValue(new Error('Network connection timeout to OSRM')),
      };

      const fallback = new StraightLineRouteProvider();
      const mockConfig = {
        get: jest.fn().mockReturnValue('osrm'),
      } as unknown as ConfigService;

      const routeService = new RouteService(testPrisma as any, mockConfig as any);
      // Replace providers on routeService for this test
      (routeService as any).primaryProvider = failingPrimary;
      (routeService as any).fallbackProvider = fallback;

      // Create a dummy scheduled ride in test database
      const user = await testPrisma.user.findFirst();
      const vehicle = await testPrisma.vehicle.findFirst();

      if (user && vehicle && user.audience) {
        const ride = await testPrisma.ride.create({
          data: {
            driverId: user.id,
            vehicleId: vehicle.id,
            audience: user.audience,
            origin: 'Tambaram',
            originLatitude: 12.9249,
            originLongitude: 80.1000,
            destination: 'VIT Chennai',
            destinationLatitude: 12.8406,
            destinationLongitude: 80.1534,
            departureTime: new Date(Date.now() + 3600000),
            availableSeats: 3,
            totalSeats: 3,
            status: 'SCHEDULED',
            routeStatus: RouteStatus.PENDING,
          },
        });

        const success = await routeService.generateRouteForRide(ride.id);
        expect(success).toBe(true);

        const updated = await testPrisma.ride.findUnique({ where: { id: ride.id } });
        expect(updated?.routeStatus).toBe(RouteStatus.FALLBACK);
        expect(updated?.routeProvider).toBe('straight_line_fallback');
        expect(updated?.routeDistanceM).toBeGreaterThan(0);
      }
    });
  });
});
