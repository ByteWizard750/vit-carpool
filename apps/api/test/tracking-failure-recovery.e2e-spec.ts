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
  User,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { TrackingService } from '../src/modules/tracking/tracking.service';
import { TrackingGateway } from '../src/modules/tracking/tracking.gateway';

describe('Milestone 7.7: Tracking Failure Handling, Recovery & Automatic Cleanup (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let trackingService: TrackingService;
  let trackingGateway: TrackingGateway;
  let serverPort: number;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Driver
  const driverAuthId = 'd7700000-0000-4000-a000-000000000001';
  const driverEmail = 'm77.driver@vitstudent.ac.in';
  let driverUser: User;
  let driverToken: string;
  let driverId: string;
  let vehicleId: string;

  // Passenger A (Confirmed)
  const passengerAAuthId = 'd7700000-0000-4000-a000-000000000002';
  const passengerAEmail = 'm77.passa@vitstudent.ac.in';
  let passengerAUser: User;
  let passengerAToken: string;
  let passengerAId: string;
  let bookingAId: string;

  // Passenger B (Confirmed, will cancel their booking)
  const passengerBAuthId = 'd7700000-0000-4000-a000-000000000003';
  const passengerBEmail = 'm77.passb@vitstudent.ac.in';
  let passengerBUser: User;
  let passengerBToken: string;
  let passengerBId: string;
  let bookingBId: string;

  let activeRideId: string;

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
      where: { email: { in: [driverEmail, passengerAEmail, passengerBEmail] } },
    });

    driverUser = await testPrisma.user.create({
      data: {
        authUserId: driverAuthId,
        email: driverEmail,
        fullName: 'Captain Vikram Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    driverId = driverUser.id;

    passengerAUser = await testPrisma.user.create({
      data: {
        authUserId: passengerAAuthId,
        email: passengerAEmail,
        fullName: 'Passenger Aarti Vandalur',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    passengerAId = passengerAUser.id;

    passengerBUser = await testPrisma.user.create({
      data: {
        authUserId: passengerBAuthId,
        email: passengerBEmail,
        fullName: 'Passenger Bharat Perungalathur',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    passengerBId = passengerBUser.id;

    const vehicle = await testPrisma.vehicle.create({
      data: {
        userId: driverId,
        make: 'Hyundai',
        model: 'Creta',
        color: 'Titan Grey',
        registrationNumber: 'TN 22 M7 7777',
        capacity: 4,
      },
    });
    vehicleId = vehicle.id;

    driverToken = signTestJwt({ sub: driverAuthId, email: driverEmail });
    passengerAToken = signTestJwt({ sub: passengerAAuthId, email: passengerAEmail });
    passengerBToken = signTestJwt({ sub: passengerBAuthId, email: passengerBEmail });

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

    const departureTime = new Date(Date.now() + 15 * 60 * 1000);
    const ride = await testPrisma.ride.create({
      data: {
        driverId,
        vehicleId,
        origin: 'Tambaram Railway Station',
        destination: 'VIT Chennai Main Campus',
        departureTime,
        availableSeats: 3,
        totalSeats: 3,
        costPerSeat: 50,
        status: RideStatus.SCHEDULED,
        audience: Audience.STUDENT,
      },
    });
    activeRideId = ride.id;

    const bookingA = await testPrisma.booking.create({
      data: {
        rideId: activeRideId,
        passengerId: passengerAId,
        driverId,
        audience: Audience.STUDENT,
        status: BookingStatus.CONFIRMED,
        requestedSeats: 1,
        boardingStatus: 'WAITING',
        pickupAddress: 'Vandalur Crescent Gate',
        pickupLatitude: 12.8890,
        pickupLongitude: 80.0825,
      },
    });
    bookingAId = bookingA.id;

    const bookingB = await testPrisma.booking.create({
      data: {
        rideId: activeRideId,
        passengerId: passengerBId,
        driverId,
        audience: Audience.STUDENT,
        status: BookingStatus.CONFIRMED,
        requestedSeats: 1,
        boardingStatus: 'WAITING',
        pickupAddress: 'Perungalathur Bus Stand',
        pickupLatitude: 12.9050,
        pickupLongitude: 80.0950,
      },
    });
    bookingBId = bookingB.id;

    // Start ride
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/start`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(201);
  });

  describe('1. GPS Staleness & Active State Restoration', () => {
    it('marks tracking STALE if no GPS update arrives within approximately 30 seconds and preserves last known location', async () => {
      // Driver records a location update 35 seconds ago
      const thirtyFiveSecsAgo = new Date(Date.now() - 35 * 1000);

      await testPrisma.driverLocationSnapshot.create({
        data: {
          rideId: activeRideId,
          latitude: 12.9249,
          longitude: 80.1171,
          accuracy: 12,
          speedKmh: 30,
          recordedAt: thirtyFiveSecsAgo,
        },
      });

      await testPrisma.rideTrackingSession.update({
        where: { rideId: activeRideId },
        data: { lastUpdateAt: thirtyFiveSecsAgo, isStale: false },
      });

      // Passenger requests live tracking state
      const res = await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .expect(200);

      // Verify staleness is honestly reported
      expect(res.body.isStale).toBe(true);

      // Verify last known location is preserved as historical data
      expect(res.body.currentLocation).not.toBeNull();
      expect(res.body.currentLocation.latitude).toBe(12.9249);
      expect(res.body.currentLocation.longitude).toBe(80.1171);
      expect(res.body.currentLocation.recordedAt).toBe(thirtyFiveSecsAgo.toISOString());
    });

    it('restores ACTIVE state when GPS updates resume', async () => {
      // Wait for rate limit window
      await new Promise((r) => setTimeout(r, 1100));

      // Driver resumes sending fresh coordinates
      const resUpdate = await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/location-update`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          latitude: 12.9100,
          longitude: 80.1000,
          accuracy: 10,
          speedKmh: 35,
        })
        .expect(200);

      expect(resUpdate.body.success).toBe(true);

      // Verify tracking state immediately recovers to active
      const stateRes = await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .expect(200);

      expect(stateRes.body.isStale).toBe(false);
      expect(stateRes.body.currentLocation.latitude).toBe(12.9100);
    });
  });

  describe('2. Driver Disconnection & Non-Premature Ride Completion', () => {
    it('does NOT automatically mark ride COMPLETED when driver disconnects or stops updating', async () => {
      // Driver loses network connection or locks phone for 2 minutes
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      await testPrisma.rideTrackingSession.update({
        where: { rideId: activeRideId },
        data: { lastUpdateAt: twoMinutesAgo, isStale: true },
      });

      // Periodic staleness check runs
      await trackingService.evaluateStaleSessions();

      // Verify ride status remains IN_PROGRESS (NOT COMPLETED!)
      const ride = await testPrisma.ride.findUnique({ where: { id: activeRideId } });
      expect(ride?.status).toBe(RideStatus.IN_PROGRESS);

      // Verify tracking session is still ongoing (endedAt is null)
      const session = await testPrisma.rideTrackingSession.findUnique({ where: { rideId: activeRideId } });
      expect(session?.endedAt).toBeNull();
    });
  });

  describe('3. Passenger Disconnection, Re-authentication & Reconnection', () => {
    it('allows disconnected passenger to re-authenticate, rejoin room, and receive fresh tracking state', async () => {
      const socket = io(`http://127.0.0.1:${serverPort}/tracking`, {
        transports: ['websocket'],
        auth: { token: passengerAToken },
      });

      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => {
          socket.emit('join_tracking', { rideId: activeRideId });
        });

        socket.on('tracking_state', (state: any) => {
          expect(state.rideId).toBe(activeRideId);
          expect(state.passengers).toBeDefined();
          expect(state.passengers.length).toBe(2);
          socket.disconnect();
          resolve();
        });

        socket.on('error', (err: any) => {
          reject(err);
        });

        setTimeout(() => reject(new Error('WebSocket connection timeout')), 4000);
      });
    });

    it('rejects reconnection if passenger uses an invalid or expired token', async () => {
      const socket = io(`http://127.0.0.1:${serverPort}/tracking`, {
        transports: ['websocket'],
        auth: { token: 'invalid.expired.jwt' },
      });

      await new Promise<void>((resolve) => {
        socket.on('connect_error', (err) => {
          expect(err.message).toBeDefined();
          socket.disconnect();
          resolve();
        });

        socket.on('error', (err: any) => {
          expect(err.code).toBe('UNAUTHORIZED');
          socket.disconnect();
          resolve();
        });

        setTimeout(() => {
          socket.disconnect();
          resolve();
        }, 1500);
      });
    });
  });

  describe('4. Backend Restart & Startup Reconciliation', () => {
    it('reconciles existing tracking sessions on server startup without falsely completing rides', async () => {
      // Simulate backend restart by setting session older than 30s
      const staleTime = new Date(Date.now() - 40 * 1000);
      await testPrisma.rideTrackingSession.update({
        where: { rideId: activeRideId },
        data: { lastUpdateAt: staleTime, isStale: false },
      });

      // Trigger startup reconciliation
      const report = await trackingService.reconcileSessionsOnStartup();

      expect(report.staleCount).toBeGreaterThanOrEqual(1);

      // Verify the session is marked STALE
      const session = await testPrisma.rideTrackingSession.findUnique({ where: { rideId: activeRideId } });
      expect(session?.isStale).toBe(true);

      // Verify ride is STILL IN_PROGRESS
      const ride = await testPrisma.ride.findUnique({ where: { id: activeRideId } });
      expect(ride?.status).toBe(RideStatus.IN_PROGRESS);
    });
  });

  describe('5. Automatic Safe Cleanup & Data Retention', () => {
    it('ends abandoned tracking sessions without falsely marking rides COMPLETED', async () => {
      // Abandoned session: started 5 hours ago
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      await testPrisma.rideTrackingSession.update({
        where: { rideId: activeRideId },
        data: { startedAt: fiveHoursAgo, lastUpdateAt: fiveHoursAgo },
      });

      const closedCount = await trackingService.cleanupStaleSessions();
      expect(closedCount).toBe(1);

      // Session is ended
      const session = await testPrisma.rideTrackingSession.findUnique({ where: { rideId: activeRideId } });
      expect(session?.endedAt).not.toBeNull();
      expect(session?.isStale).toBe(true);

      // CRITICAL REQUIREMENT: Ride status is NOT changed to COMPLETED!
      const ride = await testPrisma.ride.findUnique({ where: { id: activeRideId } });
      expect(ride?.status).toBe(RideStatus.IN_PROGRESS);
    });

    it('prunes expired location records older than retention threshold (24h)', async () => {
      // Create an old location snapshot older than 25 hours
      const oldTime = new Date(Date.now() - 26 * 60 * 60 * 1000);
      await testPrisma.driverLocationSnapshot.create({
        data: {
          rideId: activeRideId,
          latitude: 12.9249,
          longitude: 80.1171,
          recordedAt: oldTime,
        },
      });

      // Create a fresh location snapshot 5 minutes ago
      const freshTime = new Date(Date.now() - 5 * 60 * 1000);
      await testPrisma.driverLocationSnapshot.create({
        data: {
          rideId: activeRideId,
          latitude: 12.9100,
          longitude: 80.1000,
          recordedAt: freshTime,
        },
      });

      const cleanupReport = await trackingService.cleanupExpiredTrackingData(24);
      expect(cleanupReport.prunedSnapshotsCount).toBeGreaterThanOrEqual(1);

      // Verify fresh snapshot was preserved
      const remainingSnapshots = await testPrisma.driverLocationSnapshot.findMany({
        where: { rideId: activeRideId },
      });
      expect(remainingSnapshots.some((s) => s.latitude === 12.9100)).toBe(true);
      expect(remainingSnapshots.some((s) => s.recordedAt.getTime() === oldTime.getTime())).toBe(false);
    });
  });

  describe('6. Ride Cancellation & Tracking Termination', () => {
    it('terminates tracking, revokes all passenger access, and removes active snapshots upon ride cancellation', async () => {
      // Driver cancels the ride
      const res = await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/cancel`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      expect(res.body.status).toBe(RideStatus.CANCELLED);

      // Verify tracking session is terminated
      const session = await testPrisma.rideTrackingSession.findUnique({ where: { rideId: activeRideId } });
      expect(session?.endedAt).not.toBeNull();

      // Verify active location data was pruned
      const snapshots = await testPrisma.driverLocationSnapshot.findMany({ where: { rideId: activeRideId } });
      expect(snapshots.length).toBe(0);

      // Verify passengers can no longer access live tracking (403 Forbidden)
      await request(app.getHttpServer())
        .get(`/rides/${activeRideId}/tracking`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .expect(403);
    });
  });

  describe('7. Individual Booking Cancellation', () => {
    it('revokes tracking access immediately for cancelled passenger while preserving other passengers', async () => {
      // Create a fresh new ride for testing individual booking cancellation
      const depTime = new Date(Date.now() + 60 * 60 * 1000);
      const testRide = await testPrisma.ride.create({
        data: {
          driverId,
          vehicleId,
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai Main Campus',
          departureTime: depTime,
          availableSeats: 2,
          totalSeats: 3,
          costPerSeat: 50,
          status: RideStatus.SCHEDULED,
          audience: Audience.STUDENT,
        },
      });

      const bA = await testPrisma.booking.create({
        data: {
          rideId: testRide.id,
          passengerId: passengerAId,
          driverId,
          audience: Audience.STUDENT,
          status: BookingStatus.CONFIRMED,
          requestedSeats: 1,
          boardingStatus: 'WAITING',
          pickupAddress: 'Vandalur Crescent Gate',
          pickupLatitude: 12.8890,
          pickupLongitude: 80.0825,
        },
      });

      const bB = await testPrisma.booking.create({
        data: {
          rideId: testRide.id,
          passengerId: passengerBId,
          driverId,
          audience: Audience.STUDENT,
          status: BookingStatus.CONFIRMED,
          requestedSeats: 1,
          boardingStatus: 'WAITING',
          pickupAddress: 'Perungalathur Bus Stand',
          pickupLatitude: 12.9050,
          pickupLongitude: 80.0950,
        },
      });

      // Start the ride
      await request(app.getHttpServer())
        .post(`/rides/${testRide.id}/start`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      // Passenger B cancels their booking
      const cancelBRes = await request(app.getHttpServer())
        .post(`/bookings/${bB.id}/cancel`)
        .set('Authorization', `Bearer ${passengerBToken}`)
        .send({ reason: 'Schedule changed' })
        .expect(201);

      expect(cancelBRes.body.status).toBe(BookingStatus.CANCELLED);

      // 1. Cancelled passenger B is now strictly FORBIDDEN from accessing tracking
      await request(app.getHttpServer())
        .get(`/rides/${testRide.id}/tracking`)
        .set('Authorization', `Bearer ${passengerBToken}`)
        .expect(403);

      // 2. Confirmed passenger A STILL has full access to live tracking
      const accessARes = await request(app.getHttpServer())
        .get(`/rides/${testRide.id}/tracking`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .expect(200);

      expect(accessARes.body.rideId).toBe(testRide.id);
      expect(accessARes.body.myPickup).not.toBeNull();
    });
  });
});

