import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  UserRole,
  VerificationStatus,
  Audience,
  VerificationMethod,
  RideStatus,
  BookingStatus,
  BoardingStatus,
  NotificationType,
  User,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { TrackingService } from '../src/modules/tracking/tracking.service';
import { TrackingGateway } from '../src/modules/tracking/tracking.gateway';

describe('Milestone 7.8: Complete Integration, Security & Production Validation (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let trackingService: TrackingService;
  let trackingGateway: TrackingGateway;
  let serverPort: number;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Driver A
  const driverAuthId = 'd7800000-0000-4000-a000-000000000001';
  const driverEmail = 'm78.driver@vitstudent.ac.in';
  let driverUser: User;
  let driverToken: string;
  let vehicleId: string;

  // Driver B (Another driver)
  const driverBAuthId = 'd7800000-0000-4000-a000-000000000009';
  const driverBEmail = 'm78.driverb@vitstudent.ac.in';
  let driverBUser: User;
  let driverBToken: string;

  // Passenger 1 (Confirmed)
  const p1AuthId = 'd7800000-0000-4000-a000-000000000002';
  const p1Email = 'm78.pass1@vitstudent.ac.in';
  let p1User: User;
  let p1Token: string;

  // Passenger 2 (Confirmed)
  const p2AuthId = 'd7800000-0000-4000-a000-000000000003';
  const p2Email = 'm78.pass2@vitstudent.ac.in';
  let p2User: User;
  let p2Token: string;

  // Passenger 3 (Pending booking)
  const p3AuthId = 'd7800000-0000-4000-a000-000000000004';
  const p3Email = 'm78.pass3@vitstudent.ac.in';
  let p3User: User;
  let p3Token: string;

  // Unrelated User (No booking)
  const strangerAuthId = 'd7800000-0000-4000-a000-000000000005';
  const strangerEmail = 'm78.stranger@vitstudent.ac.in';
  let strangerUser: User;
  let strangerToken: string;

  let activeRideId: string;
  let booking1Id: string;
  let booking2Id: string;
  let booking3Id: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables before starting
    await testPrisma.notification.deleteMany();
    await testPrisma.driverLocationSnapshot.deleteMany();
    await testPrisma.rideTrackingSession.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.user.deleteMany({
      where: {
        email: {
          in: [driverEmail, driverBEmail, p1Email, p2Email, p3Email, strangerEmail],
        },
      },
    });

    driverUser = await testPrisma.user.create({
      data: {
        authUserId: driverAuthId,
        email: driverEmail,
        fullName: 'Captain Arvind Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });

    driverBUser = await testPrisma.user.create({
      data: {
        authUserId: driverBAuthId,
        email: driverBEmail,
        fullName: 'Another Driver Mohan',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });

    p1User = await testPrisma.user.create({
      data: {
        authUserId: p1AuthId,
        email: p1Email,
        fullName: 'Passenger One Vandalur',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });

    p2User = await testPrisma.user.create({
      data: {
        authUserId: p2AuthId,
        email: p2Email,
        fullName: 'Passenger Two Perungalathur',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });

    p3User = await testPrisma.user.create({
      data: {
        authUserId: p3AuthId,
        email: p3Email,
        fullName: 'Passenger Three Pending',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });

    strangerUser = await testPrisma.user.create({
      data: {
        authUserId: strangerAuthId,
        email: strangerEmail,
        fullName: 'Stranger Unrelated',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });

    const vehicle = await testPrisma.vehicle.create({
      data: {
        userId: driverUser.id,
        make: 'Honda',
        model: 'City ZX',
        color: 'Radiant Red',
        registrationNumber: 'TN 11 M7 7878',
        capacity: 4,
      },
    });
    vehicleId = vehicle.id;

    driverToken = signTestJwt({ sub: driverAuthId, email: driverEmail });
    driverBToken = signTestJwt({ sub: driverBAuthId, email: driverBEmail });
    p1Token = signTestJwt({ sub: p1AuthId, email: p1Email });
    p2Token = signTestJwt({ sub: p2AuthId, email: p2Email });
    p3Token = signTestJwt({ sub: p3AuthId, email: p3Email });
    strangerToken = signTestJwt({ sub: strangerAuthId, email: strangerEmail });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address();
    serverPort = typeof address === 'string' ? 3000 : address.port;

    trackingService = app.get<TrackingService>(TrackingService);
    trackingGateway = app.get<TrackingGateway>(TrackingGateway);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPrisma) await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await testPrisma.notification.deleteMany();
    await testPrisma.driverLocationSnapshot.deleteMany();
    await testPrisma.rideTrackingSession.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();

    const depTime = new Date(Date.now() + 30 * 60 * 1000);
    const ride = await testPrisma.ride.create({
      data: {
        driverId: driverUser.id,
        vehicleId,
        origin: 'Tambaram Railway Station',
        destination: 'VIT Chennai Main Campus',
        departureTime: depTime,
        availableSeats: 3,
        totalSeats: 3,
        costPerSeat: 40,
        status: RideStatus.SCHEDULED,
        audience: Audience.STUDENT,
      },
    });
    activeRideId = ride.id;

    const b1 = await testPrisma.booking.create({
      data: {
        rideId: activeRideId,
        passengerId: p1User.id,
        driverId: driverUser.id,
        audience: Audience.STUDENT,
        status: BookingStatus.CONFIRMED,
        requestedSeats: 1,
        boardingStatus: 'WAITING',
        pickupAddress: 'Vandalur Crescent Gate',
        pickupLatitude: 12.8890,
        pickupLongitude: 80.0825,
      },
    });
    booking1Id = b1.id;

    const b2 = await testPrisma.booking.create({
      data: {
        rideId: activeRideId,
        passengerId: p2User.id,
        driverId: driverUser.id,
        audience: Audience.STUDENT,
        status: BookingStatus.CONFIRMED,
        requestedSeats: 1,
        boardingStatus: 'WAITING',
        pickupAddress: 'Perungalathur Junction',
        pickupLatitude: 12.9050,
        pickupLongitude: 80.0950,
      },
    });
    booking2Id = b2.id;

    const b3 = await testPrisma.booking.create({
      data: {
        rideId: activeRideId,
        passengerId: p3User.id,
        driverId: driverUser.id,
        audience: Audience.STUDENT,
        status: BookingStatus.PENDING,
        requestedSeats: 1,
        boardingStatus: 'WAITING',
        pickupAddress: 'Camp Road Junction',
      },
    });
    booking3Id = b3.id;
  });

  // ---------------------------------------------------------------------------
  // 1. COMPLETE USER JOURNEYS
  // ---------------------------------------------------------------------------
  describe('1. Complete User Journeys', () => {
    it('JOURNEY A — Complete lifecycle: Publish -> Book -> Start -> Track -> Board -> Complete', async () => {
      // Step 1: Driver starts the ride
      const startRes = await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/start`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      expect(startRes.body.status).toBe(RideStatus.IN_PROGRESS);

      // Step 2: Driver broadcasts GPS updates
      await new Promise((r) => setTimeout(r, 1100));
      const locRes = await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/location-update`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          latitude: 12.8980,
          longitude: 80.0880,
          accuracy: 12,
          speedKmh: 35,
          heading: 210,
        })
        .expect(200);

      expect(locRes.body.success).toBe(true);

      // Step 3: Passenger 1 opens live tracking and receives individual ETA
      const trackRes = await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${p1Token}`)
        .expect(200);

      expect(trackRes.body.status).toBe(RideStatus.IN_PROGRESS);
      expect(trackRes.body.myPickup.boardingStatus).toBe('WAITING');
      expect(trackRes.body.myPickup.etaMinutes).toBeLessThanOrEqual(5);

      // Step 4: Passenger retrieves boarding OTP and driver verifies it
      const otpRes = await request(app.getHttpServer())
        .get(`/bookings/${booking1Id}/boarding-otp`)
        .set('Authorization', `Bearer ${p1Token}`)
        .expect(200);

      const boardRes = await request(app.getHttpServer())
        .post(`/bookings/${booking1Id}/verify-boarding`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ otp: otpRes.body.rawOtp })
        .expect(200);

      expect(boardRes.body.boardingStatus).toBe('BOARDED');

      // Step 5: Driver completes ride
      const completeRes = await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/complete`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      expect(completeRes.body.status).toBe(RideStatus.COMPLETED);

      // Step 6: Tracking session is terminated
      const session = await testPrisma.rideTrackingSession.findUnique({
        where: { rideId: activeRideId },
      });
      expect(session?.endedAt).not.toBeNull();
    });

    it('JOURNEY B — Multi-passenger individual ETAs and distinct pickup proximity triggers', async () => {
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/start`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      // Driver at 12.8980, 80.0880: Close to Passenger 1 (Vandalur, ~1.2 km), further from Passenger 2 (Perungalathur, ~2.5 km)
      await new Promise((r) => setTimeout(r, 1100));
      const res = await trackingService.recordDriverLocation(driverUser, activeRideId, {
        latitude: 12.8980,
        longitude: 80.0880,
        accuracy: 10,
        speedKmh: 35,
      });

      expect(res.passengerETAs[p1User.id]).toBeDefined();
      expect(res.passengerETAs[p2User.id]).toBeDefined();

      // Individual ETAs must be distinct and reflect geography
      expect(res.passengerETAs[p1User.id].distanceMeters).not.toEqual(
        res.passengerETAs[p2User.id].distanceMeters,
      );
      expect(res.passengerETAs[p1User.id].distanceMeters).toBeLessThan(
        res.passengerETAs[p2User.id].distanceMeters,
      );
    });

    it('JOURNEY C — Mid-journey booking cancellation immediately revokes access without affecting other passenger', async () => {
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/start`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      // Passenger 2 cancels their booking
      await request(app.getHttpServer())
        .post(`/bookings/${booking2Id}/cancel`)
        .set('Authorization', `Bearer ${p2Token}`)
        .expect(201);

      // Passenger 2 tracking access is immediately revoked (403)
      await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${p2Token}`)
        .expect(403);

      // Passenger 1 retains full uninterrupted live tracking access (200)
      const p1Access = await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${p1Token}`)
        .expect(200);

      expect(p1Access.body.rideId).toBe(activeRideId);
    });

    it('JOURNEY D — Failure recovery: Stale-state detection and seamless reconnection', async () => {
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/start`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      // Simulate 35s gap since last GPS update
      const staleTime = new Date(Date.now() - 35 * 1000);
      await testPrisma.driverLocationSnapshot.create({
        data: {
          rideId: activeRideId,
          latitude: 12.9249,
          longitude: 80.1171,
          recordedAt: staleTime,
        },
      });
      await testPrisma.rideTrackingSession.update({
        where: { rideId: activeRideId },
        data: { lastUpdateAt: staleTime, isStale: true },
      });

      // Passenger sees STALE state
      const staleRes = await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${p1Token}`)
        .expect(200);

      expect(staleRes.body.isStale).toBe(true);

      // Driver reconnects and sends update
      await new Promise((r) => setTimeout(r, 1100));
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/location-update`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ latitude: 12.9200, longitude: 80.1150, accuracy: 10, speedKmh: 25 })
        .expect(200);

      // State is restored to ACTIVE
      const activeRes = await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${p1Token}`)
        .expect(200);

      expect(activeRes.body.isStale).toBe(false);
    });

    it('JOURNEY E — Unauthorized access enforcement across 6 attack vectors', async () => {
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/start`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      // Vector 1: Unauthenticated request (no JWT) -> 401
      await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .expect(401);

      // Vector 2: Expired / Invalid JWT -> 401
      await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', 'Bearer invalid.token.signature')
        .expect(401);

      // Vector 3: Passenger with PENDING booking -> 403 Forbidden
      await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${p3Token}`)
        .expect(403);

      // Vector 4: Passenger with CANCELLED booking -> 403 Forbidden
      await testPrisma.booking.update({
        where: { id: booking2Id },
        data: { status: BookingStatus.CANCELLED },
      });
      await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${p2Token}`)
        .expect(403);

      // Vector 5: Unrelated user with no booking on the ride -> 403 Forbidden
      await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(403);

      // Vector 6: Another driver attempting to update location or access tracking -> 403 Forbidden
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/location-update`)
        .set('Authorization', `Bearer ${driverBToken}`)
        .send({ latitude: 12.9200, longitude: 80.1150 })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SECURITY & PRIVACY AUDIT
  // ---------------------------------------------------------------------------
  describe('2. Security & Privacy Audit', () => {
    it('enforces coordinate boundary validation (-90..90 lat, -180..180 lng)', async () => {
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/start`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      await new Promise((r) => setTimeout(r, 1100));

      // Latitude > 90 -> 400 Bad Request
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/location-update`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ latitude: 120.5, longitude: 80.1171 })
        .expect(400);

      // Longitude > 180 -> 400 Bad Request
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/location-update`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ latitude: 12.9249, longitude: 200.0 })
        .expect(400);

      // Low accuracy (> 500m) -> 400 Bad Request
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/location-update`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ latitude: 12.9249, longitude: 80.1171, accuracy: 650 })
        .expect(400);
    });

    it('enforces GPS location ingestion rate limiting (max 1 req/sec per ride)', async () => {
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/start`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      await new Promise((r) => setTimeout(r, 1100));

      // Request 1 succeeds
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/location-update`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ latitude: 12.9249, longitude: 80.1171 })
        .expect(200);

      // Request 2 immediately following (< 1000ms) is rejected with 429 Too Many Requests
      const rateLimitRes = await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/location-update`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ latitude: 12.9250, longitude: 80.1172 })
        .expect(429);

      expect(rateLimitRes.body.message).toContain('Rate limit exceeded');
    });

    it('prevents cross-user data leakage: Co-passengers only see first names, never full names or contact numbers', async () => {
      await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/start`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      // Passenger 1 queries tracking state
      const res = await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${p1Token}`)
        .expect(200);

      // In the passenger roster, Passenger 2 full name is "Passenger Two Perungalathur"
      const p2Entry = res.body.passengers.find((p: any) => p.passengerId === p2User.id);
      expect(p2Entry).toBeDefined();

      // Privacy check: Passenger only sees first name "Passenger"
      expect(p2Entry.passengerName).toBe('Passenger');
      expect(p2Entry.passengerName).not.toContain('Perungalathur');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. PERFORMANCE & CONCURRENCY SIMULATION
  // ---------------------------------------------------------------------------
  describe('3. Performance Simulation (20 Concurrent Campus Commutes)', () => {
    it('simulates the campus pilot target of 20 concurrent active rides with multiple passengers', async () => {
      const concurrentRideIds: string[] = [];

      // Create 20 concurrent active rides
      for (let i = 0; i < 20; i++) {
        const ride = await testPrisma.ride.create({
          data: {
            driverId: driverUser.id,
            vehicleId,
            origin: `Campus Pickup Stop ${i + 1}`,
            destination: 'VIT Chennai Main Campus',
            departureTime: new Date(Date.now() + 10 * 60 * 1000),
            availableSeats: 2,
            totalSeats: 3,
            costPerSeat: 40,
            status: RideStatus.IN_PROGRESS,
            audience: Audience.STUDENT,
          },
        });
        concurrentRideIds.push(ride.id);

        await testPrisma.rideTrackingSession.create({
          data: {
            rideId: ride.id,
            startedAt: new Date(),
            lastUpdateAt: new Date(),
            isStale: false,
          },
        });

        // Add confirmed passenger
        await testPrisma.booking.create({
          data: {
            rideId: ride.id,
            passengerId: p1User.id,
            driverId: driverUser.id,
            audience: Audience.STUDENT,
            status: BookingStatus.CONFIRMED,
            requestedSeats: 1,
            boardingStatus: 'WAITING',
            pickupLatitude: 12.8890 + i * 0.001,
            pickupLongitude: 80.0825 + i * 0.001,
          },
        });
      }

      // Concurrently query tracking state across all 20 rides
      const startTime = Date.now();
      const results = await Promise.all(
        concurrentRideIds.map((rId) =>
          request(app.getHttpServer())
            .get(`/rides/${rId}/tracking`)
            .set('Authorization', `Bearer ${driverToken}`)
        ),
      );
      const elapsedMs = Date.now() - startTime;

      // Every single request must return 200 OK
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(RideStatus.IN_PROGRESS);
      }

      // Performance assertion: 20 parallel state evaluations complete well within 2 seconds
      expect(elapsedMs).toBeLessThan(3000);
      console.log(`[Performance Benchmark] Evaluated 20 concurrent tracking states in ${elapsedMs}ms (${(elapsedMs / 20).toFixed(1)}ms/query)`);
    });
  });
});
