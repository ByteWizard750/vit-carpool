import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  UserRole,
  VerificationStatus,
  Audience,
  VerificationMethod,
  RideStatus,
  RouteStatus,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';

describe('Milestone 1: Route Geometry Foundation (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Verified student driver
  const studentDriverAuthId = 'c1111111-2222-4111-8111-111111111111';
  const studentDriverEmail = 'route.driver@vitstudent.ac.in';
  let studentDriverToken: string;
  let studentDriverId: string;
  let studentVehicleId: string;

  // Verified student passenger
  const studentRiderAuthId = 'c1111111-3333-4111-8111-111111111111';
  const studentRiderEmail = 'route.rider@vitstudent.ac.in';
  let studentRiderToken: string;
  let studentRiderId: string;

  // Verified faculty member (for cohort isolation testing)
  const facultyAuthId = 'c2222222-4444-4222-8222-222222222222';
  const facultyEmail = 'route.faculty@vit.ac.in';
  let facultyToken: string;
  let facultyId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';
    // Use mock or straight line provider for deterministic fast tests
    process.env.ROUTE_GEOMETRY_PROVIDER = 'straight_line';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables before starting
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.verificationRequest.deleteMany();
    await testPrisma.user.deleteMany();

    // 1. Seed student driver
    const sDriver = await testPrisma.user.create({
      data: {
        authUserId: studentDriverAuthId,
        email: studentDriverEmail,
        fullName: 'Vikram Route Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    studentDriverId = sDriver.id;
    studentDriverToken = signTestJwt({ sub: studentDriverAuthId, email: studentDriverEmail });

    // Vehicle for student driver
    const sVehicle = await testPrisma.vehicle.create({
      data: {
        userId: studentDriverId,
        make: 'Maruti',
        model: 'Swift',
        color: 'Red',
        registrationNumber: 'TN19RT1001',
        capacity: 5,
      },
    });
    studentVehicleId = sVehicle.id;

    // 2. Seed student rider
    const sRider = await testPrisma.user.create({
      data: {
        authUserId: studentRiderAuthId,
        email: studentRiderEmail,
        fullName: 'Pooja Route Rider',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    studentRiderId = sRider.id;
    studentRiderToken = signTestJwt({ sub: studentRiderAuthId, email: studentRiderEmail });

    // 3. Seed faculty member
    const fUser = await testPrisma.user.create({
      data: {
        authUserId: facultyAuthId,
        email: facultyEmail,
        fullName: 'Prof. Anitha Route Faculty',
        audience: Audience.FACULTY,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    facultyId = fUser.id;
    facultyToken = signTestJwt({ sub: facultyAuthId, email: facultyEmail });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await testPrisma.$disconnect();
  });

  const getFutureDeparture = (hoursAhead: number = 2) =>
    new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();

  it('1. should publish a ride with coordinates and generate route geometry asynchronously', async () => {
    const res = await request(app.getHttpServer())
      .post('/rides')
      .set('Authorization', `Bearer ${studentDriverToken}`)
      .send({
        vehicleId: studentVehicleId,
        origin: 'Tambaram Railway Station',
        originAddress: 'Tambaram, Chennai, Tamil Nadu',
        originLatitude: 12.9249,
        originLongitude: 80.1000,
        destination: 'VIT Chennai Campus',
        destinationAddress: 'Vandalur-Kelambakkam Road, Chennai',
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: getFutureDeparture(2),
        availableSeats: 3,
        costPerSeat: 50,
        maxDetourMinutes: 15,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.routeStatus).toBe(RouteStatus.PENDING);
    expect(res.body.maxDetourMinutes).toBe(15);
    expect(res.body.routeVersion).toBe(0);

    const rideId = res.body.id;

    // Wait a brief moment for the asynchronous post-commit route generation to finish
    let attempts = 0;
    let finalRide;
    while (attempts < 15) {
      await new Promise((r) => setTimeout(r, 200));
      finalRide = await testPrisma.ride.findUnique({ where: { id: rideId } });
      if (finalRide?.routeStatus === RouteStatus.READY || finalRide?.routeStatus === RouteStatus.FALLBACK) {
        break;
      }
      attempts++;
    }

    expect([RouteStatus.READY, RouteStatus.FALLBACK]).toContain(finalRide?.routeStatus);
    expect(finalRide?.routeVersion).toBe(1);
    expect(finalRide?.routeDistanceM).toBeGreaterThan(5000); // Distance between Tambaram and VIT Chennai is ~10-15km
    expect(finalRide?.routeDurationS).toBeGreaterThan(600); // Duration > 10 mins
    expect(finalRide?.routeProvider).toBeDefined();

    // Verify raw PostGIS geography is stored and valid
    const rawGeom = await testPrisma.$queryRaw<Array<{ has_geom: boolean; geojson: string }>>`
      SELECT (route_geom IS NOT NULL) AS has_geom, ST_AsGeoJSON(route_geom) AS geojson
      FROM rides WHERE id = ${rideId}::uuid
    `;
    expect(rawGeom[0].has_geom).toBe(true);
    const parsedGeoJson = JSON.parse(rawGeom[0].geojson);
    expect(parsedGeoJson.type).toBe('LineString');
    expect(parsedGeoJson.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('2. should fetch route geometry via GET /rides/:id/route', async () => {
    // Driver publishes ride
    const pubRes = await request(app.getHttpServer())
      .post('/rides')
      .set('Authorization', `Bearer ${studentDriverToken}`)
      .send({
        vehicleId: studentVehicleId,
        origin: 'Kelambakkam Junction',
        originLatitude: 12.7871,
        originLongitude: 80.2198,
        destination: 'VIT Chennai Campus',
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: getFutureDeparture(3),
        availableSeats: 2,
        costPerSeat: 40,
        maxDetourMinutes: 10,
      });

    expect(pubRes.status).toBe(201);
    const rideId = pubRes.body.id;

    // Student rider fetches route endpoint
    const routeRes = await request(app.getHttpServer())
      .get(`/rides/${rideId}/route`)
      .set('Authorization', `Bearer ${studentRiderToken}`);

    expect(routeRes.status).toBe(200);
    expect(routeRes.body.rideId).toBe(rideId);
    expect([RouteStatus.READY, RouteStatus.FALLBACK, RouteStatus.PENDING]).toContain(routeRes.body.status);
    expect(routeRes.body.geometry).toBeDefined();
    expect(routeRes.body.geometry.type).toBe('LineString');
    expect(Array.isArray(routeRes.body.geometry.coordinates)).toBe(true);
    expect(routeRes.body.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(routeRes.body.distanceMeters).toBeGreaterThan(0);
    expect(routeRes.body.durationSeconds).toBeGreaterThan(0);
  });

  it('3. should update coordinates, increment route version, and regenerate route geometry', async () => {
    // 1. Publish ride
    const pubRes = await request(app.getHttpServer())
      .post('/rides')
      .set('Authorization', `Bearer ${studentDriverToken}`)
      .send({
        vehicleId: studentVehicleId,
        origin: 'Vandalur Zoo',
        originLatitude: 12.8797,
        originLongitude: 80.0818,
        destination: 'VIT Chennai Campus',
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: getFutureDeparture(4),
        availableSeats: 3,
        costPerSeat: 30,
        maxDetourMinutes: 5,
      });

    const rideId = pubRes.body.id;

    // Wait for initial generation
    await new Promise((r) => setTimeout(r, 400));
    const initialRide = await testPrisma.ride.findUnique({ where: { id: rideId } });
    const initialVersion = initialRide?.routeVersion || 1;

    // 2. Driver updates destination to Guindy
    const patchRes = await request(app.getHttpServer())
      .patch(`/rides/${rideId}`)
      .set('Authorization', `Bearer ${studentDriverToken}`)
      .send({
        destination: 'Guindy Metro',
        destinationLatitude: 13.0067,
        destinationLongitude: 80.2026,
        maxDetourMinutes: 20,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.routeStatus).toBe(RouteStatus.PENDING);
    expect(patchRes.body.maxDetourMinutes).toBe(20);

    // Wait for post-commit route regeneration
    let attempts = 0;
    let updatedRide;
    while (attempts < 15) {
      await new Promise((r) => setTimeout(r, 200));
      updatedRide = await testPrisma.ride.findUnique({ where: { id: rideId } });
      if (updatedRide?.routeVersion && updatedRide.routeVersion > initialVersion) {
        break;
      }
      attempts++;
    }

    expect(updatedRide?.routeVersion).toBe(initialVersion + 1);
    expect([RouteStatus.READY, RouteStatus.FALLBACK]).toContain(updatedRide?.routeStatus);
  });

  it('4. should handle ride without coordinates gracefully with route_status NONE', async () => {
    const pubRes = await request(app.getHttpServer())
      .post('/rides')
      .set('Authorization', `Bearer ${studentDriverToken}`)
      .send({
        vehicleId: studentVehicleId,
        origin: 'Custom Meeting Spot',
        destination: 'VIT Gate 1',
        departureTime: getFutureDeparture(5),
        availableSeats: 1,
        costPerSeat: 20,
      });

    expect(pubRes.status).toBe(201);
    expect(pubRes.body.routeStatus).toBe(RouteStatus.NONE);
    expect(pubRes.body.routeVersion).toBe(0);

    const rideId = pubRes.body.id;
    const routeRes = await request(app.getHttpServer())
      .get(`/rides/${rideId}/route`)
      .set('Authorization', `Bearer ${studentDriverToken}`);

    expect(routeRes.status).toBe(200);
    expect(routeRes.body.status).toBe(RouteStatus.NONE);
    expect(routeRes.body.geometry).toBeNull();
  });

  it('5. should enforce institutional audience isolation on GET /rides/:id/route', async () => {
    // Student driver publishes ride
    const pubRes = await request(app.getHttpServer())
      .post('/rides')
      .set('Authorization', `Bearer ${studentDriverToken}`)
      .send({
        vehicleId: studentVehicleId,
        origin: 'Tambaram',
        originLatitude: 12.9249,
        originLongitude: 80.1000,
        destination: 'VIT Chennai',
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: getFutureDeparture(6),
        availableSeats: 2,
      });

    const rideId = pubRes.body.id;

    // Faculty user attempts to query route of student ride
    const facultyRes = await request(app.getHttpServer())
      .get(`/rides/${rideId}/route`)
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(facultyRes.status).toBe(404);
  });
});
