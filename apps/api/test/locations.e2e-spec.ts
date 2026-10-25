import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  Audience,
  VerificationStatus,
  VerificationMethod,
  UserRole,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { MapboxLocationProvider } from '../src/modules/locations/providers/mapbox-location.provider';
import { LocationRateLimiterGuard } from '../src/modules/locations/guards/location-rate-limiter.guard';
import { validateEnv } from '../src/config/env.validation';

describe('Milestone 5.1: Location Provider, Autocomplete & Geographic Foundation (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let rateLimiterGuard: LocationRateLimiterGuard;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  const verifiedStudentAuthId = 'ba555555-1111-4111-8111-111111111111';
  const verifiedStudentEmail = 'student.location@vitstudent.ac.in';
  let verifiedStudentToken: string;

  const verifiedFacultyAuthId = 'ba555555-2222-4111-8111-222222222222';
  const verifiedFacultyEmail = 'faculty.location@vit.ac.in';
  let verifiedFacultyToken: string;

  const pendingStudentAuthId = 'ba555555-3333-4111-8111-333333333333';
  const pendingStudentEmail = 'pending.location@vitstudent.ac.in';
  let pendingToken: string;

  const suspendedAuthId = 'ba555555-4444-4111-8111-444444444444';
  const suspendedEmail = 'suspended.location@vitstudent.ac.in';
  let suspendedToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.LOCATION_PROVIDER = 'mock';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean up test database
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.verificationRequest.deleteMany();
    await testPrisma.user.deleteMany({
      where: {
        email: {
          in: [
            verifiedStudentEmail,
            verifiedFacultyEmail,
            pendingStudentEmail,
            suspendedEmail,
          ],
        },
      },
    });

    // 1. Seed verified student
    await testPrisma.user.create({
      data: {
        authUserId: verifiedStudentAuthId,
        email: verifiedStudentEmail,
        fullName: 'Verified Student Commuter',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    verifiedStudentToken = signTestJwt({
      sub: verifiedStudentAuthId,
      email: verifiedStudentEmail,
    });

    // 2. Seed verified faculty
    await testPrisma.user.create({
      data: {
        authUserId: verifiedFacultyAuthId,
        email: verifiedFacultyEmail,
        fullName: 'Verified Faculty Commuter',
        audience: Audience.FACULTY,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    verifiedFacultyToken = signTestJwt({
      sub: verifiedFacultyAuthId,
      email: verifiedFacultyEmail,
    });

    // 3. Seed pending student
    await testPrisma.user.create({
      data: {
        authUserId: pendingStudentAuthId,
        email: pendingStudentEmail,
        fullName: 'Pending Verification Student',
        verificationStatus: VerificationStatus.PENDING,
        role: UserRole.USER,
      },
    });
    pendingToken = signTestJwt({
      sub: pendingStudentAuthId,
      email: pendingStudentEmail,
    });

    // 4. Seed suspended student
    await testPrisma.user.create({
      data: {
        authUserId: suspendedAuthId,
        email: suspendedEmail,
        fullName: 'Suspended Account User',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.SUSPENDED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    suspendedToken = signTestJwt({
      sub: suspendedAuthId,
      email: suspendedEmail,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    rateLimiterGuard = app.get(LocationRateLimiterGuard);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testPrisma) {
      await testPrisma.$disconnect();
    }
  });

  beforeEach(() => {
    rateLimiterGuard?.reset();
  });

  // ---------------------------------------------------------------------------
  // 1. Authentication & Verification Guards
  // ---------------------------------------------------------------------------
  describe('Authentication & Verification Requirements', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const response = await request(app.getHttpServer())
        .get('/locations/autocomplete?q=vandalur')
        .expect(401);

      expect(response.body.message).toMatch(/authorization header/i);
    });

    it('rejects requests with malformed or invalid JWT tokens with 401', async () => {
      await request(app.getHttpServer())
        .get('/locations/autocomplete?q=vandalur')
        .set('Authorization', 'Bearer invalid.bogus.jwt')
        .expect(401);
    });

    it('rejects unverified (PENDING) users with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .get('/locations/autocomplete?q=vandalur')
        .set('Authorization', `Bearer ${pendingToken}`)
        .expect(403);

      expect(response.body.error).toBe('ACCOUNT_PENDING_VERIFICATION');
    });

    it('rejects SUSPENDED users with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .get('/locations/autocomplete?q=vandalur')
        .set('Authorization', `Bearer ${suspendedToken}`)
        .expect(403);

      expect(response.body.error).toBe('ACCOUNT_SUSPENDED');
    });

    it('allows verified student users to access location autocomplete', async () => {
      const response = await request(app.getHttpServer())
        .get('/locations/autocomplete?q=vandalur')
        .set('Authorization', `Bearer ${verifiedStudentToken}`)
        .expect(200);

      expect(response.body.suggestions).toBeDefined();
      expect(Array.isArray(response.body.suggestions)).toBe(true);
    });

    it('allows verified faculty users to access location autocomplete', async () => {
      const response = await request(app.getHttpServer())
        .get('/locations/autocomplete?q=vandalur')
        .set('Authorization', `Bearer ${verifiedFacultyToken}`)
        .expect(200);

      expect(response.body.suggestions).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Query Validation & Parameter Limits
  // ---------------------------------------------------------------------------
  describe('Query Validation & Edge Cases', () => {
    it('returns empty array when query is under 2 characters', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/locations/autocomplete?q=v')
        .set('Authorization', `Bearer ${verifiedStudentToken}`)
        .expect(200);

      expect(res1.body.suggestions).toEqual([]);

      const res2 = await request(app.getHttpServer())
        .get('/locations/autocomplete?q=')
        .set('Authorization', `Bearer ${verifiedStudentToken}`)
        .expect(200);

      expect(res2.body.suggestions).toEqual([]);
    });

    it('rejects queries exceeding 100 characters with 400 Bad Request', async () => {
      const longQuery = 'a'.repeat(101);
      await request(app.getHttpServer())
        .get(`/locations/autocomplete?q=${longQuery}`)
        .set('Authorization', `Bearer ${verifiedStudentToken}`)
        .expect(400);
    });

    it('respects custom limit parameter (e.g. limit=2)', async () => {
      const response = await request(app.getHttpServer())
        .get('/locations/autocomplete?q=chennai&limit=2')
        .set('Authorization', `Bearer ${verifiedStudentToken}`)
        .expect(200);

      expect(response.body.suggestions.length).toBeLessThanOrEqual(2);
    });

    it('returns empty array for non-matching queries without errors', async () => {
      const response = await request(app.getHttpServer())
        .get('/locations/autocomplete?q=xyznonexistentchennaiplace')
        .set('Authorization', `Bearer ${verifiedStudentToken}`)
        .expect(200);

      expect(response.body.suggestions).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Mock Provider Chennai Coverage & Colloquial Support
  // ---------------------------------------------------------------------------
  describe('Mock Provider Chennai Transit Coverage & Colloquial Matching', () => {
    it('resolves colloquial "tea nagar" to T. Nagar (Thyagaraya Nagar)', async () => {
      const response = await request(app.getHttpServer())
        .get('/locations/autocomplete?q=tea+nagar')
        .set('Authorization', `Bearer ${verifiedStudentToken}`)
        .expect(200);

      expect(response.body.suggestions.length).toBeGreaterThan(0);
      const top = response.body.suggestions[0];
      expect(top.name).toBe('T. Nagar (Thyagaraya Nagar)');
      expect(top.category).toBe('locality');
      expect(top.address).toContain('Pondy Bazaar');
      expect(top.latitude).toBeCloseTo(13.04, 1);
      expect(top.longitude).toBeCloseTo(80.23, 1);
    });

    it('resolves "tea" query to T. Nagar', async () => {
      const response = await request(app.getHttpServer())
        .get('/locations/autocomplete?q=tea')
        .set('Authorization', `Bearer ${verifiedStudentToken}`)
        .expect(200);

      const names = response.body.suggestions.map((s: any) => s.name);
      expect(names).toContain('T. Nagar (Thyagaraya Nagar)');
    });

    it('returns required Milestone development fixtures', async () => {
      const requiredFixtures = [
        { q: 'vandalur', expected: 'Vandalur' },
        { q: 'vandalur station', expected: 'Vandalur Railway Station' },
        { q: 'tambaram station', expected: 'Tambaram Railway Station' },
        { q: 'velachery', expected: 'Velachery' },
        { q: 'guindy', expected: 'Guindy (Kathipara Junction)' },
        { q: 'sholinganallur', expected: 'Sholinganallur Junction' },
        { q: 'kelambakkam', expected: 'Kelambakkam Junction' },
        { q: 'vit', expected: 'VIT Chennai Campus' },
      ];

      for (const item of requiredFixtures) {
        const response = await request(app.getHttpServer())
          .get(`/locations/autocomplete?q=${encodeURIComponent(item.q)}`)
          .set('Authorization', `Bearer ${verifiedStudentToken}`)
          .expect(200);

        const names = response.body.suggestions.map((s: any) => s.name);
        expect(names).toContain(item.expected);
      }
    });

    it('covers citywide Chennai regions: North, West, Central, GST, ECR', async () => {
      const regions = [
        { q: 'porur', expected: 'Porur Junction' },
        { q: 'anna nagar', expected: 'Anna Nagar (Roundtana / Tower Park)' },
        { q: 'red hills', expected: 'Red Hills (Sothupakkam)' },
        { q: 'kilambakkam', expected: 'Kilambakkam Bus Terminus (KCBT)' },
        { q: 'egmore', expected: 'Chennai Egmore Railway Station' },
        { q: 'central', expected: 'MGR Chennai Central Railway Station' },
        { q: 'airport', expected: 'Chennai International Airport (Meenambakkam)' },
        { q: 'siruseri', expected: 'SIPCOT IT Park (Siruseri)' },
      ];

      for (const item of regions) {
        const response = await request(app.getHttpServer())
          .get(`/locations/autocomplete?q=${encodeURIComponent(item.q)}`)
          .set('Authorization', `Bearer ${verifiedStudentToken}`)
          .expect(200);

        const names = response.body.suggestions.map((s: any) => s.name);
        expect(names).toContain(item.expected);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Rate Limiting Protection
  // ---------------------------------------------------------------------------
  describe('Location Rate Limiting', () => {
    it('enforces rate limits and returns 429 when threshold exceeded', async () => {
      // Limit is set to 30 requests per minute
      let hit429 = false;
      for (let i = 0; i < 35; i++) {
        const res = await request(app.getHttpServer())
          .get('/locations/autocomplete?q=vandalur')
          .set('Authorization', `Bearer ${verifiedStudentToken}`);

        if (res.status === 429) {
          hit429 = true;
          expect(res.body.message).toMatch(/rate limit exceeded/i);
          break;
        }
      }

      expect(hit429).toBe(true);
    });

    it('cannot be bypassed by spoofing X-Forwarded-For headers when authenticated', async () => {
      let hit429 = false;
      for (let i = 0; i < 35; i++) {
        const res = await request(app.getHttpServer())
          .get('/locations/autocomplete?q=vandalur')
          .set('Authorization', `Bearer ${verifiedStudentToken}`)
          .set('X-Forwarded-For', `198.51.100.${i + 1}`);

        if (res.status === 429) {
          hit429 = true;
          break;
        }
      }

      expect(hit429).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Mapbox Provider Unit & Mocked Upstream Integration
  // ---------------------------------------------------------------------------
  describe('MapboxLocationProvider (Search Box API v1)', () => {
    let mockServer: http.Server;
    let mockServerPort: number;
    let mockHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

    beforeAll((done) => {
      mockServer = http.createServer((req, res) => {
        mockHandler(req, res);
      });
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        mockServerPort = addr.port;
        done();
      });
    });

    afterAll((done) => {
      mockServer.close(done);
    });

    it('fails clearly on missing MAPBOX_ACCESS_TOKEN during instantiation', () => {
      expect(() => new MapboxLocationProvider('')).toThrow(
        /MAPBOX_ACCESS_TOKEN is required/i,
      );
    });

    it('normalizes Search Box API forward geocoding results into LocationSuggestionDto', async () => {
      mockHandler = (req, res) => {
        expect(req.url).toContain('/search/searchbox/v1/forward');
        expect(req.url).toContain('q=Anna+Nagar');
        expect(req.url).toContain('access_token=pk.test-token');
        expect(req.url).toContain('country=IN');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            features: [
              {
                id: 'mbx-1',
                properties: {
                  name: 'Anna Nagar',
                  full_address: 'Anna Nagar, Chennai, Tamil Nadu, 600040',
                  feature_type: 'locality',
                  mapbox_id: 'mbx-place-1',
                },
                geometry: {
                  type: 'Point',
                  coordinates: [80.209, 13.085],
                },
              },
            ],
          }),
        );
      };

      const provider = new MapboxLocationProvider('pk.test-token', {
        baseUrl: `http://127.0.0.1:${mockServerPort}`,
      });

      const results = await provider.search('Anna Nagar', 5);
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Anna Nagar');
      expect(results[0].address).toBe('Anna Nagar, Chennai, Tamil Nadu, 600040');
      expect(results[0].latitude).toBe(13.085);
      expect(results[0].longitude).toBe(80.209);
      expect(results[0].category).toBe('locality');
    });

    it('handles upstream 401/403 without leaking access token', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Not Authorized' }));
      };

      const provider = new MapboxLocationProvider('secret-mapbox-key-do-not-leak', {
        baseUrl: `http://127.0.0.1:${mockServerPort}`,
      });

      await expect(provider.search('Vandalur', 5)).rejects.toThrow(
        /Upstream location provider authentication failed/i,
      );
    });

    it('handles upstream 429 rate limit errors safely', async () => {
      mockHandler = (_req, res) => {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Rate limit exceeded' }));
      };

      const provider = new MapboxLocationProvider('pk.test-token', {
        baseUrl: `http://127.0.0.1:${mockServerPort}`,
      });

      await expect(provider.search('Tambaram', 5)).rejects.toThrow(
        /Upstream location provider rate limit exceeded/i,
      );
    });

    it('handles upstream timeout via AbortController and throws GatewayTimeoutException', async () => {
      mockHandler = (_req, _res) => {
        // Purposely do not respond, causing provider timeout
      };

      const provider = new MapboxLocationProvider('pk.test-token', {
        baseUrl: `http://127.0.0.1:${mockServerPort}`,
        timeoutMs: 150, // Short timeout for deterministic test
      });

      await expect(provider.search('Kelambakkam', 5)).rejects.toThrow(
        /timed out after 150ms/i,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Environment Validation Guardrails
  // ---------------------------------------------------------------------------
  describe('Environment Validation Guardrails', () => {
    it('disallows LOCATION_PROVIDER="mock" in production environment', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          LOCATION_PROVIDER: 'mock',
        }),
      ).toThrow(/LOCATION_PROVIDER cannot be mock in production environment/i);
    });

    it('requires MAPBOX_ACCESS_TOKEN when LOCATION_PROVIDER="mapbox"', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'development',
          LOCATION_PROVIDER: 'mapbox',
          MAPBOX_ACCESS_TOKEN: '',
        }),
      ).toThrow(/MAPBOX_ACCESS_TOKEN is required/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Geographic Database Foundation & Spatial Constraints
  // ---------------------------------------------------------------------------
  describe('Geographic Database Foundation (PostGIS, Constraints & Triggers)', () => {
    let studentVehicleId: string;
    let studentDriverId: string;

    beforeAll(async () => {
      const user = await testPrisma.user.findUniqueOrThrow({
        where: { email: verifiedStudentEmail },
      });
      studentDriverId = user.id;

      const vehicle = await testPrisma.vehicle.create({
        data: {
          userId: studentDriverId,
          make: 'Maruti',
          model: 'Swift',
          color: 'Silver',
          registrationNumber: 'TN09LOC001',
          capacity: 5,
        },
      });
      studentVehicleId = vehicle.id;
    });

    it('auto-generates PostGIS geography point via trigger when coordinates are inserted', async () => {
      const departure = new Date(Date.now() + 86400000);

      const ride = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Tambaram Railway Station',
          originAddress: 'GST Road, Tambaram, Chennai',
          originLatitude: 12.9249,
          originLongitude: 80.1171,
          destination: 'VIT Chennai Campus',
          destinationAddress: 'Vandalur-Kelambakkam Road, Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: departure,
          availableSeats: 3,
          totalSeats: 4,
        },
      });

      // Verify geometry was populated in PostGIS by trigger
      const rawRows = await testPrisma.$queryRaw<Array<{ has_origin_geom: boolean; has_dest_geom: boolean }>>`
        SELECT
          (origin_geom IS NOT NULL) AS has_origin_geom,
          (destination_geom IS NOT NULL) AS has_dest_geom
        FROM rides
        WHERE id = ${ride.id}::uuid
      `;

      expect(rawRows[0].has_origin_geom).toBe(true);
      expect(rawRows[0].has_dest_geom).toBe(true);
    });

    it('enforces paired coordinate constraint chk_rides_origin_coords_paired', async () => {
      const departure = new Date(Date.now() + 86400000);

      // Attempting to supply latitude without longitude must fail check constraint
      await expect(
        testPrisma.$executeRaw`
          INSERT INTO rides (
            id, driver_id, vehicle_id, audience, origin, destination,
            origin_latitude, origin_longitude, departure_time, available_seats, total_seats
          ) VALUES (
            uuid_generate_v4(), ${studentDriverId}::uuid, ${studentVehicleId}::uuid,
            'STUDENT', 'Tambaram', 'VIT', 12.9249, NULL, ${departure}, 3, 4
          )
        `,
      ).rejects.toThrow(/chk_rides_origin_coords_paired/i);
    });

    it('enforces latitude range check constraint chk_rides_origin_lat', async () => {
      const departure = new Date(Date.now() + 86400000);

      // Latitude > 90 must fail check constraint
      await expect(
        testPrisma.$executeRaw`
          INSERT INTO rides (
            id, driver_id, vehicle_id, audience, origin, destination,
            origin_latitude, origin_longitude, departure_time, available_seats, total_seats
          ) VALUES (
            uuid_generate_v4(), ${studentDriverId}::uuid, ${studentVehicleId}::uuid,
            'STUDENT', 'Tambaram', 'VIT', 95.5, 80.1171, ${departure}, 3, 4
          )
        `,
      ).rejects.toThrow(/chk_rides_origin_lat/i);
    });

    it('preserves existing text-only rides without coordinates and keeps them queryable', async () => {
      const departure = new Date(Date.now() + 86400000);

      const textOnlyRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Adyar Bus Stand',
          destination: 'VIT Chennai Library',
          departureTime: departure,
          availableSeats: 2,
          totalSeats: 4,
        },
      });

      expect(textOnlyRide.originLatitude).toBeNull();
      expect(textOnlyRide.destinationLatitude).toBeNull();

      // Querying by text substring successfully finds the ride
      const found = await testPrisma.ride.findFirst({
        where: {
          id: textOnlyRide.id,
          origin: { contains: 'Adyar', mode: 'insensitive' },
        },
      });

      expect(found).toBeDefined();
      expect(found?.id).toBe(textOnlyRide.id);
    });
  });
});
