import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  Audience,
  VerificationStatus,
  VerificationMethod,
  UserRole,
  RideStatus,
  BookingStatus,
  BoardingStatus,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { WebPushService } from '../src/modules/notifications/web-push.service';

describe('Milestone 7: Web Push Integration & Dashboard Endpoints (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let webPushService: WebPushService;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Driver User
  const driverAuthId = 'a7d7d7d7-1111-4111-8111-111111111111';
  const driverEmail = 'm7.driver@vitstudent.ac.in';
  let driverToken: string;
  let driverId: string;
  let driverVehicleId: string;

  // Passenger User
  const passengerAuthId = 'b7e7e7e7-2222-4222-8222-222222222222';
  const passengerEmail = 'm7.passenger@vitstudent.ac.in';
  let passengerToken: string;
  let passengerId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';
    process.env.VAPID_PUBLIC_KEY =
      process.env.VAPID_PUBLIC_KEY ||
      'BD_hD66wL2nZ74y9g66PzJm5a8hFmPqI3gJp1Uu0yq6NqV5Kz0q4TjG9B6f3H7b8K9s0L1m2N3o4P5q6R7s8T9';
    process.env.VAPID_PRIVATE_KEY =
      process.env.VAPID_PRIVATE_KEY || 'dummy_test_vapid_private_key_1234567890';
    process.env.VAPID_SUBJECT = 'mailto:vitcarpool.test@gmail.com';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean up any existing test records
    await testPrisma.webPushSubscription.deleteMany();
    await testPrisma.notification.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.rideTrackingSession.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.user.deleteMany({
      where: { email: { in: [driverEmail, passengerEmail, 'pending.rider@vitstudent.ac.in'] } },
    });

    // Create verified Driver user
    const driver = await testPrisma.user.create({
      data: {
        authUserId: driverAuthId,
        email: driverEmail,
        fullName: 'Milestone7 Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    driverId = driver.id;

    // Create verified Passenger user
    const passenger = await testPrisma.user.create({
      data: {
        authUserId: passengerAuthId,
        email: passengerEmail,
        fullName: 'Milestone7 Passenger',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    passengerId = passenger.id;

    // Create vehicle for driver
    const vehicle = await testPrisma.vehicle.create({
      data: {
        userId: driverId,
        make: 'Hyundai',
        model: 'i20',
        color: 'Polar White',
        registrationNumber: 'TN-07-M7-9999',
        capacity: 4,
      },
    });
    driverVehicleId = vehicle.id;

    driverToken = signTestJwt({
      sub: driverAuthId,
      email: driverEmail,
    });

    passengerToken = signTestJwt({
      sub: passengerAuthId,
      email: passengerEmail,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    webPushService = moduleFixture.get<WebPushService>(WebPushService);
  });

  afterAll(async () => {
    if (testPrisma) {
      await testPrisma.webPushSubscription.deleteMany();
      await testPrisma.notification.deleteMany();
      await testPrisma.booking.deleteMany();
      await testPrisma.rideTrackingSession.deleteMany();
      await testPrisma.ride.deleteMany();
      await testPrisma.vehicle.deleteMany();
      await testPrisma.user.deleteMany({
        where: { email: { in: [driverEmail, passengerEmail, 'pending.rider@vitstudent.ac.in'] } },
      });
      await testPrisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('Part A: Web Push & VAPID Integration', () => {
    it('1. Rejects unauthenticated push public key request with 401', async () => {
      await request(app.getHttpServer())
        .get('/notifications/push-public-key')
        .expect(401);
    });

    it('2. Returns VAPID public key for authenticated passenger', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications/push-public-key')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('publicKey');
      expect(typeof res.body.publicKey).toBe('string');
      expect(res.body.publicKey.length).toBeGreaterThan(20);
    });

    it('3. Rejects invalid push subscription payload with 400', async () => {
      await request(app.getHttpServer())
        .post('/notifications/subscribe-push')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ endpoint: 'https://push.example.com' })
        .expect(400);
    });

    it('4. Successfully registers push subscription for passenger', async () => {
      const mockEndpoint = 'https://fcm.googleapis.com/fcm/send/test-sub-12345';
      const res = await request(app.getHttpServer())
        .post('/notifications/subscribe-push')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          endpoint: mockEndpoint,
          keys: {
            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9AcUbVYOISxkzquVmtXHGChTLnwRxrvMpY6v8eo3Qyb3vU',
            auth: 'tBHItJI5svbpez7KI4CCXg',
          },
        })
        .expect(200);

      expect(res.body).toEqual({ success: true });

      // Verify record exists in webPushSubscription
      const stored = await testPrisma.webPushSubscription.findFirst({
        where: { userId: passengerId, endpoint: mockEndpoint },
      });
      expect(stored).toBeDefined();
      expect(stored?.endpoint).toBe(mockEndpoint);
    });

    it('5. Successfully unregisters push subscription', async () => {
      const mockEndpoint = 'https://fcm.googleapis.com/fcm/send/test-sub-12345';
      const res = await request(app.getHttpServer())
        .post('/notifications/unsubscribe-push')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ endpoint: mockEndpoint })
        .expect(200);

      expect(res.body).toEqual({ success: true });

      const stored = await testPrisma.webPushSubscription.findFirst({
        where: { userId: passengerId, endpoint: mockEndpoint },
      });
      expect(stored).toBeNull();
    });

    it('6. WebPushService gracefully handles dispatch when push subscription is simulated or expired', async () => {
      // Re-register test subscription
      await webPushService.registerSubscription(passengerId, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/simulated-non-existent-device-token',
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9AcUbVYOISxkzquVmtXHGChTLnwRxrvMpY6v8eo3Qyb3vU',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      });

      // Sending push should not throw or crash the service (graceful error handling)
      const dispatchResult = await webPushService.sendPushNotification(passengerId, {
        title: 'Driver Approaching',
        body: 'Captain Arvind Driver is 4 minutes away from your pickup point.',
        url: '/rides/test-ride/track',
      });

      // Returns boolean (never throws error)
      expect(typeof dispatchResult).toBe('boolean');
    });
  });

  describe('Part B: Dashboard Elevated Active Ride & Action Items Endpoints', () => {
    let activeRideId: string;
    let pendingBookingId: string;
    let confirmedBookingId: string;
    let pendingUserId: string;

    beforeAll(async () => {
      // Create an IN_PROGRESS ride published by driver
      const ride = await testPrisma.ride.create({
        data: {
          driverId,
          vehicleId: driverVehicleId,
          origin: 'Tambaram Station, Chennai',
          originLatitude: 12.9249,
          originLongitude: 80.1171,
          destination: 'VIT Chennai Campus, Vandalur-Kelambakkam Road',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: new Date(Date.now() + 3600 * 1000),
          totalSeats: 3,
          availableSeats: 2,
          costPerSeat: 50,
          status: RideStatus.IN_PROGRESS,
          audience: Audience.STUDENT,
        },
      });
      activeRideId = ride.id;

      // Create an active tracking session for this ride
      await testPrisma.rideTrackingSession.create({
        data: {
          rideId: activeRideId,
          startedAt: new Date(),
          isStale: false,
          lastUpdateAt: new Date(),
        },
      });

      // Create a CONFIRMED booking for passenger on this active ride
      const confBooking = await testPrisma.booking.create({
        data: {
          rideId: activeRideId,
          passengerId,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED,
          boardingStatus: BoardingStatus.WAITING,
          pickupAddress: 'Tambaram Railway Station Bus Stop',
          pickupLatitude: 12.9249,
          pickupLongitude: 80.1171,
          confirmedAt: new Date(),
        },
      });
      confirmedBookingId = confBooking.id;

      // Create a second PENDING booking from a new student to test Action Items
      const pendingUser = await testPrisma.user.create({
        data: {
          email: 'pending.rider@vitstudent.ac.in',
          authUserId: 'c7e7e7e7-3333-4333-8333-333333333333',
          fullName: 'Pending Student',
          audience: Audience.STUDENT,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
          verifiedAt: new Date(),
          role: UserRole.USER,
        },
      });
      pendingUserId = pendingUser.id;

      const pendBooking = await testPrisma.booking.create({
        data: {
          rideId: activeRideId,
          passengerId: pendingUserId,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
          pickupAddress: 'Chromepet Signal',
        },
      });
      pendingBookingId = pendBooking.id;
    });

    afterAll(async () => {
      await testPrisma.booking.deleteMany({ where: { rideId: activeRideId } });
      await testPrisma.rideTrackingSession.deleteMany({ where: { rideId: activeRideId } });
      await testPrisma.ride.deleteMany({ where: { id: activeRideId } });
      await testPrisma.user.deleteMany({ where: { id: pendingUserId } });
    });

    it('1. Driver dashboard: GET /rides/mine returns active ride with IN_PROGRESS status', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides/mine')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const activeRide = res.body.find((r: any) => r.id === activeRideId);
      expect(activeRide).toBeDefined();
      expect(activeRide.status).toBe('IN_PROGRESS');
      expect(activeRide.origin).toContain('Tambaram');
      expect(activeRide.destination).toContain('VIT Chennai');
    });

    it('2. Passenger dashboard: GET /bookings/mine returns confirmed booking with active ride', async () => {
      const res = await request(app.getHttpServer())
        .get('/bookings/mine')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const activeBooking = res.body.find((b: any) => b.id === confirmedBookingId);
      expect(activeBooking).toBeDefined();
      expect(activeBooking.status).toBe('CONFIRMED');
      expect(activeBooking.ride.status).toBe('IN_PROGRESS');
      expect(activeBooking.boardingStatus).toBe('WAITING');
      expect(activeBooking.ride.driverName).toContain('Milestone7 Driver');
    });

    it('3. Driver dashboard Action Items: GET /bookings/driver?status=PENDING returns pending booking', async () => {
      const res = await request(app.getHttpServer())
        .get('/bookings/driver?status=PENDING')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const pendingRequest = res.body.find((b: any) => b.id === pendingBookingId);
      expect(pendingRequest).toBeDefined();
      expect(pendingRequest.passengerName).toBe('Pending Student');
      expect(pendingRequest.requestedSeats).toBe(1);
    });

    it('4. Driver approves pending booking directly: POST /bookings/:id/approve', async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${pendingBookingId}/approve`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      expect(res.body.status).toBe('CONFIRMED');

      // Verify pending list is now empty for this ride
      const updatedList = await request(app.getHttpServer())
        .get(`/bookings/driver?rideId=${activeRideId}&status=PENDING`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(updatedList.body.length).toBe(0);
    });
  });
});
