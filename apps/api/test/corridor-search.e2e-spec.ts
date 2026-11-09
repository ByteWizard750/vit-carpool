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

describe('Milestone 2: Intelligent Corridor-Based Ride Discovery (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Seeded IDs
  const studentDriverAuthId = 'd1111111-2222-4111-8111-111111111111';
  const studentDriverEmail = 'corridor.driver@vitstudent.ac.in';
  let studentDriverToken: string;
  let studentDriverId: string;
  let studentVehicleId: string;

  const studentRiderAuthId = 'd1111111-3333-4111-8111-111111111111';
  const studentRiderEmail = 'corridor.rider@vitstudent.ac.in';
  let studentRiderToken: string;
  let studentRiderId: string;

  const facultyDriverAuthId = 'd2222222-4444-4222-8222-222222222222';
  const facultyDriverEmail = 'corridor.faculty@vit.ac.in';
  let facultyDriverToken: string;
  let facultyDriverId: string;
  let facultyVehicleId: string;

  const blockedDriverAuthId = 'd3333333-5555-4333-8333-333333333333';
  const blockedDriverEmail = 'blocked.driver@vitstudent.ac.in';
  let blockedDriverToken: string;
  let blockedDriverId: string;
  let blockedVehicleId: string;

  // Waypoints along Chennai GST - Vandalur - Kelambakkam Road corridor:
  // 1. Tambaram: 12.9249, 80.1000
  // 2. Perungalathur: 12.8980, 80.0880
  // 3. Vandalur Zoo: 12.8797, 80.0818
  // 4. Mambakkam: 12.8550, 80.1250
  // 5. VIT Chennai: 12.8406, 80.1534
  // Off-route points:
  // - OMR Sholinganallur: 12.9010, 80.2279 (~12km east)
  // - Chennai Central: 13.0827, 80.2707 (~25km north)

  let mainTambaramToVitRideId: string;
  let perungalathurRideId: string;
  let fallbackRideId: string;
  let noGeomRideId: string;

  const getFutureDeparture = (hoursAhead: number = 3) =>
    new Date(Date.now() + hoursAhead * 60 * 60 * 1000);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';
    process.env.CORRIDOR_SEARCH_MODE = 'CORRIDOR';
    process.env.ROUTE_GEOMETRY_PROVIDER = 'straight_line';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables before starting
    await testPrisma.block.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.verificationRequest.deleteMany();
    await testPrisma.user.deleteMany();

    // 1. Seed Student Driver
    const sDriver = await testPrisma.user.create({
      data: {
        authUserId: studentDriverAuthId,
        email: studentDriverEmail,
        fullName: 'Karthik Corridor Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    studentDriverId = sDriver.id;
    studentDriverToken = signTestJwt({ sub: studentDriverAuthId, email: studentDriverEmail });

    const sVehicle = await testPrisma.vehicle.create({
      data: {
        userId: studentDriverId,
        make: 'Tata',
        model: 'Nexon',
        color: 'Blue',
        registrationNumber: 'TN19CD1001',
        capacity: 5,
      },
    });
    studentVehicleId = sVehicle.id;

    // 2. Seed Student Rider
    const sRider = await testPrisma.user.create({
      data: {
        authUserId: studentRiderAuthId,
        email: studentRiderEmail,
        fullName: 'Deepa Corridor Rider',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    studentRiderId = sRider.id;
    studentRiderToken = signTestJwt({ sub: studentRiderAuthId, email: studentRiderEmail });

    // 3. Seed Faculty Driver (Cohort Isolation)
    const fDriver = await testPrisma.user.create({
      data: {
        authUserId: facultyDriverAuthId,
        email: facultyDriverEmail,
        fullName: 'Dr. Senthil Faculty Driver',
        audience: Audience.FACULTY,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    facultyDriverId = fDriver.id;
    facultyDriverToken = signTestJwt({ sub: facultyDriverAuthId, email: facultyDriverEmail });

    const fVehicle = await testPrisma.vehicle.create({
      data: {
        userId: facultyDriverId,
        make: 'Honda',
        model: 'City',
        color: 'White',
        registrationNumber: 'TN02CD2002',
        capacity: 4,
      },
    });
    facultyVehicleId = fVehicle.id;

    // 4. Seed Blocked Driver
    const bDriver = await testPrisma.user.create({
      data: {
        authUserId: blockedDriverAuthId,
        email: blockedDriverEmail,
        fullName: 'Blocked Driver User',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    blockedDriverId = bDriver.id;
    blockedDriverToken = signTestJwt({ sub: blockedDriverAuthId, email: blockedDriverEmail });

    const bVehicle = await testPrisma.vehicle.create({
      data: {
        userId: blockedDriverId,
        make: 'Maruti',
        model: 'WagonR',
        color: 'Silver',
        registrationNumber: 'TN22CD3003',
        capacity: 4,
      },
    });
    blockedVehicleId = bVehicle.id;

    // Create mutual block between studentRider and blockedDriver
    await testPrisma.block.create({
      data: {
        blockerId: studentRiderId,
        blockedId: blockedDriverId,
        reason: 'Unpleasant conduct',
      },
    });

    // 5. Seed Test Rides directly into database with explicit PostGIS geometries:

    // Ride A: Tambaram -> VIT Chennai (Driver: Student) with LineString passing through Perungalathur & Vandalur
    const rideA = await testPrisma.ride.create({
      data: {
        driverId: studentDriverId,
        vehicleId: studentVehicleId,
        audience: Audience.STUDENT,
        origin: 'Tambaram Railway Station',
        originAddress: 'GST Road, Tambaram, Chennai',
        originLatitude: 12.9249,
        originLongitude: 80.1000,
        destination: 'VIT Chennai Campus',
        destinationAddress: 'Vandalur-Kelambakkam Road, Chennai',
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: getFutureDeparture(2),
        availableSeats: 3,
        totalSeats: 3,
        costPerSeat: 50,
        status: RideStatus.SCHEDULED,
        routeStatus: RouteStatus.READY,
        routeProvider: 'straight_line',
        routeDistanceM: 14500,
        routeDurationS: 1800,
        maxDetourMinutes: 15,
        routeVersion: 1,
      },
    });
    mainTambaramToVitRideId = rideA.id;

    // Set origin_geom, destination_geom, and multi-point route_geom representing Tambaram -> Perungalathur -> Vandalur -> Mambakkam -> VIT
    await testPrisma.$executeRaw`
      UPDATE rides
      SET origin_geom = ST_SetSRID(ST_MakePoint(80.1000, 12.9249), 4326)::geography,
          destination_geom = ST_SetSRID(ST_MakePoint(80.1534, 12.8406), 4326)::geography,
          route_geom = ST_SetSRID(ST_GeomFromText('LINESTRING(80.1000 12.9249, 80.0880 12.8980, 80.0818 12.8797, 80.1250 12.8550, 80.1534 12.8406)'), 4326)::geography
      WHERE id = ${mainTambaramToVitRideId}::uuid
    `;

    // Ride B: Tambaram -> Perungalathur only (shorter ride)
    const rideB = await testPrisma.ride.create({
      data: {
        driverId: studentDriverId,
        vehicleId: studentVehicleId,
        audience: Audience.STUDENT,
        origin: 'Tambaram',
        originLatitude: 12.9249,
        originLongitude: 80.1000,
        destination: 'Perungalathur',
        destinationLatitude: 12.8980,
        destinationLongitude: 80.0880,
        departureTime: getFutureDeparture(3),
        availableSeats: 2,
        totalSeats: 2,
        costPerSeat: 25,
        status: RideStatus.SCHEDULED,
        routeStatus: RouteStatus.READY,
        routeProvider: 'straight_line',
        routeDistanceM: 4200,
        routeDurationS: 600,
        maxDetourMinutes: 5,
        routeVersion: 1,
      },
    });
    perungalathurRideId = rideB.id;
    await testPrisma.$executeRaw`
      UPDATE rides
      SET origin_geom = ST_SetSRID(ST_MakePoint(80.1000, 12.9249), 4326)::geography,
          destination_geom = ST_SetSRID(ST_MakePoint(80.0880, 12.8980), 4326)::geography,
          route_geom = ST_SetSRID(ST_GeomFromText('LINESTRING(80.1000 12.9249, 80.0880 12.8980)'), 4326)::geography
      WHERE id = ${perungalathurRideId}::uuid
    `;

    // Ride C: Fallback geometry ride (Tambaram -> VIT) with route_status FALLBACK
    const rideC = await testPrisma.ride.create({
      data: {
        driverId: studentDriverId,
        vehicleId: studentVehicleId,
        audience: Audience.STUDENT,
        origin: 'Tambaram West',
        originLatitude: 12.9249,
        originLongitude: 80.1000,
        destination: 'VIT Chennai',
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: getFutureDeparture(4),
        availableSeats: 3,
        totalSeats: 3,
        costPerSeat: 60,
        status: RideStatus.SCHEDULED,
        routeStatus: RouteStatus.FALLBACK,
        routeProvider: 'straight_line',
        routeDistanceM: 15000,
        routeDurationS: 1900,
        maxDetourMinutes: 10,
        routeVersion: 1,
      },
    });
    fallbackRideId = rideC.id;
    await testPrisma.$executeRaw`
      UPDATE rides
      SET origin_geom = ST_SetSRID(ST_MakePoint(80.1000, 12.9249), 4326)::geography,
          destination_geom = ST_SetSRID(ST_MakePoint(80.1534, 12.8406), 4326)::geography,
          route_geom = ST_SetSRID(ST_GeomFromText('LINESTRING(80.1000 12.9249, 80.0818 12.8797, 80.1534 12.8406)'), 4326)::geography
      WHERE id = ${fallbackRideId}::uuid
    `;

    // Ride D: Legacy ride without route geometry (route_status NONE)
    const rideD = await testPrisma.ride.create({
      data: {
        driverId: studentDriverId,
        vehicleId: studentVehicleId,
        audience: Audience.STUDENT,
        origin: 'Tambaram Sanatorium',
        originLatitude: 12.9350,
        originLongitude: 80.1100,
        destination: 'VIT Campus Gate 2',
        destinationLatitude: 12.8410,
        destinationLongitude: 80.1540,
        departureTime: getFutureDeparture(5),
        availableSeats: 1,
        totalSeats: 1,
        costPerSeat: 45,
        status: RideStatus.SCHEDULED,
        routeStatus: RouteStatus.NONE,
      },
    });
    noGeomRideId = rideD.id;
    await testPrisma.$executeRaw`
      UPDATE rides
      SET origin_geom = ST_SetSRID(ST_MakePoint(80.1100, 12.9350), 4326)::geography,
          destination_geom = ST_SetSRID(ST_MakePoint(80.1540, 12.8410), 4326)::geography
      WHERE id = ${noGeomRideId}::uuid
    `;

    // Ride E: Faculty ride along same corridor (Tambaram -> VIT)
    const rideE = await testPrisma.ride.create({
      data: {
        driverId: facultyDriverId,
        vehicleId: facultyVehicleId,
        audience: Audience.FACULTY,
        origin: 'Tambaram Faculty Home',
        originLatitude: 12.9249,
        originLongitude: 80.1000,
        destination: 'VIT Academic Block',
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: getFutureDeparture(2),
        availableSeats: 3,
        totalSeats: 3,
        costPerSeat: 70,
        status: RideStatus.SCHEDULED,
        routeStatus: RouteStatus.READY,
        routeProvider: 'straight_line',
        routeDistanceM: 14500,
        routeDurationS: 1800,
      },
    });
    await testPrisma.$executeRaw`
      UPDATE rides
      SET origin_geom = ST_SetSRID(ST_MakePoint(80.1000, 12.9249), 4326)::geography,
          destination_geom = ST_SetSRID(ST_MakePoint(80.1534, 12.8406), 4326)::geography,
          route_geom = ST_SetSRID(ST_GeomFromText('LINESTRING(80.1000 12.9249, 80.0818 12.8797, 80.1534 12.8406)'), 4326)::geography
      WHERE id = ${rideE.id}::uuid
    `;

    // Ride F: Blocked driver ride along same corridor
    const rideF = await testPrisma.ride.create({
      data: {
        driverId: blockedDriverId,
        vehicleId: blockedVehicleId,
        audience: Audience.STUDENT,
        origin: 'Tambaram',
        originLatitude: 12.9249,
        originLongitude: 80.1000,
        destination: 'VIT Campus',
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: getFutureDeparture(2),
        availableSeats: 3,
        totalSeats: 3,
        costPerSeat: 35,
        status: RideStatus.SCHEDULED,
        routeStatus: RouteStatus.READY,
        routeProvider: 'straight_line',
        routeDistanceM: 14500,
        routeDurationS: 1800,
      },
    });
    await testPrisma.$executeRaw`
      UPDATE rides
      SET origin_geom = ST_SetSRID(ST_MakePoint(80.1000, 12.9249), 4326)::geography,
          destination_geom = ST_SetSRID(ST_MakePoint(80.1534, 12.8406), 4326)::geography,
          route_geom = ST_SetSRID(ST_GeomFromText('LINESTRING(80.1000 12.9249, 80.0818 12.8797, 80.1534 12.8406)'), 4326)::geography
      WHERE id = ${rideF.id}::uuid
    `;

    // Build Nest application
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

  it('1. should discover ride along corridor: Vandalur -> VIT passenger discovers Tambaram -> VIT driver ride', async () => {
    // Passenger searching from Vandalur (12.8797, 80.0818) to VIT Chennai (12.8406, 80.1534)
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.8797,
        originLon: 80.0818,
        destLat: 12.8406,
        destLon: 80.1534,
        radiusKm: 2.0,
      });

    expect(res.status).toBe(200);
    expect(res.body.rides.length).toBeGreaterThanOrEqual(1);

    const matchRide = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(matchRide).toBeDefined();
    expect(matchRide.match).toBeDefined();
    expect(matchRide.match.matchType).toBe('ALONG_ROUTE');
    expect(matchRide.match.pickupDistanceM).toBeLessThan(300);
    expect(matchRide.match.dropoffDistanceM).toBeLessThan(300);
    expect(matchRide.match.pickupFraction).toBeGreaterThan(0.2); // Vandalur is ~35-50% along route
    expect(matchRide.match.dropoffFraction).toBeGreaterThanOrEqual(0.95); // VIT is at end
    expect(matchRide.match.sharedDistanceM).toBeGreaterThan(4000);
    expect(matchRide.match.matchReasons.length).toBeGreaterThan(0);
    expect(matchRide.match.matchReasons[0]).toContain("Along driver's route");
  });

  it('2. should discover ride along corridor: Perungalathur -> VIT passenger discovers Tambaram -> VIT driver ride', async () => {
    // Passenger searching from Perungalathur (12.8980, 80.0880) to VIT Chennai (12.8406, 80.1534)
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.8980,
        originLon: 80.0880,
        destLat: 12.8406,
        destLon: 80.1534,
      });

    expect(res.status).toBe(200);
    const matchRide = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(matchRide).toBeDefined();
    expect(matchRide.match.matchType).toBe('ALONG_ROUTE');
    expect(matchRide.match.pickupFraction).toBeLessThan(0.4);
    expect(matchRide.match.dropoffFraction).toBeGreaterThanOrEqual(0.95);
  });

  it('3. should classify complete route overlap as EXACT match: Tambaram -> VIT passenger', async () => {
    // Passenger searching from Tambaram (12.9249, 80.1000) to VIT Chennai (12.8406, 80.1534)
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.9249,
        originLon: 80.1000,
        destLat: 12.8406,
        destLon: 80.1534,
      });

    expect(res.status).toBe(200);
    const matchRide = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(matchRide).toBeDefined();
    expect(matchRide.match.matchType).toBe('EXACT');
    expect(matchRide.match.matchReasons[0]).toContain('Direct match');
  });

  it('4. should REJECT reverse-direction journeys: VIT -> Vandalur passenger searching Tambaram -> VIT ride', async () => {
    // Reverse direction: passenger wants to go from VIT Chennai (12.8406, 80.1534) back to Vandalur (12.8797, 80.0818)
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.8406,
        originLon: 80.1534,
        destLat: 12.8797,
        destLon: 80.0818,
      });

    expect(res.status).toBe(200);
    const matchRide = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(matchRide).toBeUndefined(); // Strictly rejected because dropoff_fraction <= pickup_fraction
  });

  it('5. should REJECT journeys where pickup occurs after drop-off along the corridor', async () => {
    // Passenger searching Vandalur (fraction ~0.37) -> Perungalathur (fraction ~0.20)
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.8797,
        originLon: 80.0818,
        destLat: 12.8980,
        destLon: 80.0880,
      });

    expect(res.status).toBe(200);
    const matchRide = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(matchRide).toBeUndefined();
  });

  it('6. should REJECT when pickup is too far from driver corridor', async () => {
    // OMR Sholinganallur is 12 km off the GST-Vandalur corridor
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.9010,
        originLon: 80.2279,
        destLat: 12.8406,
        destLon: 80.1534,
        radiusKm: 1.5,
      });

    expect(res.status).toBe(200);
    const matchRide = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(matchRide).toBeUndefined();
  });

  it('7. should REJECT when drop-off is too far from driver corridor', async () => {
    // Chennai Central is 25 km north of VIT
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.8797,
        originLon: 80.0818,
        destLat: 13.0827,
        destLon: 80.2707,
        radiusKm: 1.5,
      });

    expect(res.status).toBe(200);
    const matchRide = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(matchRide).toBeUndefined();
  });

  it('8. should REJECT when passenger journey extends beyond driver destination', async () => {
    // Driver destination is Perungalathur (Ride B), but passenger wants to go all the way to VIT Chennai
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.9249,
        originLon: 80.1000,
        destLat: 12.8406,
        destLon: 80.1534,
        radiusKm: 1.5,
      });

    expect(res.status).toBe(200);
    const shortRideMatch = res.body.rides.find((r: any) => r.id === perungalathurRideId);
    expect(shortRideMatch).toBeUndefined(); // Rejected because dropoff at VIT is ~10km past Perungalathur
  });

  it('9. should correctly identify fallback geometry with isFallbackGeometry: true', async () => {
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.8797,
        originLon: 80.0818,
        destLat: 12.8406,
        destLon: 80.1534,
      });

    expect(res.status).toBe(200);
    const fallbackMatch = res.body.rides.find((r: any) => r.id === fallbackRideId);
    expect(fallbackMatch).toBeDefined();
    expect(fallbackMatch.match.isFallbackGeometry).toBe(true);
    expect(fallbackMatch.match.matchType).toBe('ALONG_ROUTE'); // Straight-line fallback must NEVER be classified as EXACT
    expect(fallbackMatch.match.matchReasons[3]).toContain('straight-line campus approximation');
  });

  it('9b. should reject journeys with reverse heading vector on routes with parallel or nearby segments', async () => {
    // Passenger is near the corridor (Vandalur area), but travelling in reverse direction (towards Tambaram / North)
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.8797,
        originLon: 80.0818, // Vandalur
        destLat: 12.9249,
        destLon: 80.1000, // Tambaram (opposite heading to driver's southward journey)
      });

    expect(res.status).toBe(200);
    const match = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(match).toBeUndefined(); // Strictly rejected by direction vector alignment safeguard
  });

  it('10. should fallback to ENDPOINT_ONLY for rides without route geometry', async () => {
    // Ride D is near Tambaram Sanatorium (12.9350, 80.1100) -> VIT (12.8410, 80.1540) with route_status NONE
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.9350,
        originLon: 80.1100,
        destLat: 12.8410,
        destLon: 80.1540,
        radiusKm: 3.0,
      });

    expect(res.status).toBe(200);
    const noGeomMatch = res.body.rides.find((r: any) => r.id === noGeomRideId);
    expect(noGeomMatch).toBeDefined();
    expect(noGeomMatch.match.matchType).toBe('ENDPOINT_ONLY');
  });

  it('11. should preserve strict institutional audience isolation (Faculty rides hidden from Students)', async () => {
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.9249,
        originLon: 80.1000,
        destLat: 12.8406,
        destLon: 80.1534,
      });

    expect(res.status).toBe(200);
    // Student searching must NEVER see faculty driver rides
    const facultyRides = res.body.rides.filter((r: any) => r.driverId === facultyDriverId);
    expect(facultyRides.length).toBe(0);
  });

  it('12. should exclude blocked users from corridor discovery', async () => {
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.9249,
        originLon: 80.1000,
        destLat: 12.8406,
        destLon: 80.1534,
      });

    expect(res.status).toBe(200);
    // Blocked driver rides must be excluded
    const blockedRides = res.body.rides.filter((r: any) => r.driverId === blockedDriverId);
    expect(blockedRides.length).toBe(0);
  });

  it('13. should prevent duplicate results when a ride matches both corridor and endpoint criteria', async () => {
    // Searching Tambaram -> VIT directly matches endpoints AND corridor
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.9249,
        originLon: 80.1000,
        destLat: 12.8406,
        destLon: 80.1534,
      });

    expect(res.status).toBe(200);
    const rideIds = res.body.rides.map((r: any) => r.id);
    const uniqueRideIds = Array.from(new Set(rideIds));
    expect(rideIds.length).toBe(uniqueRideIds.length);
  });

  it('14. should exclude rides with insufficient available seats', async () => {
    // Ride has 3 seats, user requests 4 seats
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.8797,
        originLon: 80.0818,
        destLat: 12.8406,
        destLon: 80.1534,
        minSeats: 4,
      });

    expect(res.status).toBe(200);
    const matchRide = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(matchRide).toBeUndefined();
  });

  it('15. should exclude cancelled rides from corridor discovery', async () => {
    // Cancel the main ride temporarily
    await testPrisma.ride.update({
      where: { id: mainTambaramToVitRideId },
      data: { status: RideStatus.CANCELLED },
    });

    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.8797,
        originLon: 80.0818,
        destLat: 12.8406,
        destLon: 80.1534,
      });

    expect(res.status).toBe(200);
    const matchRide = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(matchRide).toBeUndefined();

    // Restore ride status
    await testPrisma.ride.update({
      where: { id: mainTambaramToVitRideId },
      data: { status: RideStatus.SCHEDULED },
    });
  });

  it('16. should respect ENDPOINT feature flag mode and disable corridor-only matches', async () => {
    process.env.CORRIDOR_SEARCH_MODE = 'ENDPOINT';

    // In ENDPOINT mode, Vandalur -> VIT passenger searching Tambaram -> VIT will NOT discover the ride
    // because Vandalur is > 2km from Tambaram origin
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.8797,
        originLon: 80.0818,
        destLat: 12.8406,
        destLon: 80.1534,
        radiusKm: 2.0,
      });

    expect(res.status).toBe(200);
    const matchRide = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(matchRide).toBeUndefined();

    // Reset back to CORRIDOR
    process.env.CORRIDOR_SEARCH_MODE = 'CORRIDOR';
  });

  it('17. should execute SHADOW feature flag mode and return endpoint results', async () => {
    process.env.CORRIDOR_SEARCH_MODE = 'SHADOW';

    // In SHADOW mode, endpoint search results are returned, while corridor comparison runs in background
    const res = await request(app.getHttpServer())
      .get('/rides')
      .set('Authorization', `Bearer ${studentRiderToken}`)
      .query({
        originLat: 12.9249,
        originLon: 80.1000,
        destLat: 12.8406,
        destLon: 80.1534,
      });

    expect(res.status).toBe(200);
    const matchRide = res.body.rides.find((r: any) => r.id === mainTambaramToVitRideId);
    expect(matchRide).toBeDefined();

    // Reset back to CORRIDOR
    process.env.CORRIDOR_SEARCH_MODE = 'CORRIDOR';
  });
});
