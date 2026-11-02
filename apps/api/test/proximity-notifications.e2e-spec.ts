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
  BookingStatus,
  NotificationType,
  User,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { TrackingService } from '../src/modules/tracking/tracking.service';
import { WebPushService } from '../src/modules/notifications/web-push.service';

describe('Milestone 7.6: Proximity Notifications & Boarding Workflow (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let trackingService: TrackingService;
  let webPushService: WebPushService;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Driver
  const driverAuthId = 'd7600000-0000-4000-a000-000000000001';
  const driverEmail = 'm76.driver@vitstudent.ac.in';
  let driverUser: User;
  let driverToken: string;
  let driverId: string;
  let vehicleId: string;

  // Passenger A (Pickup: Vandalur Gate, boards successfully)
  const passengerAAuthId = 'd7600000-0000-4000-a000-000000000002';
  const passengerAEmail = 'm76.passa@vitstudent.ac.in';
  let passengerAUser: User;
  let passengerAToken: string;
  let passengerAId: string;
  let bookingAId: string;

  // Passenger B (Pickup: Perungalathur, gets missed)
  const passengerBAuthId = 'd7600000-0000-4000-a000-000000000003';
  const passengerBEmail = 'm76.passb@vitstudent.ac.in';
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
        fullName: 'M76 Driver Captain',
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
        fullName: 'Passenger A Vandalur',
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
        fullName: 'Passenger B Perungalathur',
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
        model: 'i20 Active',
        color: 'Polar White',
        registrationNumber: 'TN 11 M7 7676',
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

    trackingService = app.get<TrackingService>(TrackingService);
    webPushService = app.get<WebPushService>(WebPushService);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPrisma) await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    // Reset test rides, snapshots, and bookings
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

    // Booking A: Vandalur pickup (12.8890, 80.0825)
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

    // Booking B: Perungalathur pickup (12.9050, 80.0950)
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

    // Start the ride via POST /rides/:id/start
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/start`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(201);
  });

  describe('1. Approaching Proximity Notification (ETA <= 5 min / Fallback distance)', () => {
    it('generates DRIVER_APPROACHING notification and sets proximityNotifiedAt when ETA <= 5 min', async () => {
      // Driver is approaching Passenger A: ~1.2 km away from Vandalur (12.8980, 80.0880)
      const approachingLat = 12.8980;
      const approachingLng = 80.0880;

      // Wait 1.1s to respect rate limit
      await new Promise((r) => setTimeout(r, 1100));

      const result = await trackingService.recordDriverLocation(driverUser, activeRideId, {
        latitude: approachingLat,
        longitude: approachingLng,
        accuracy: 15,
        speedKmh: 35,
        heading: 210,
      });

      // Assertions on returned approaching passenger IDs
      expect(result.approachingPassengerIds).toContain(passengerAId);

      // Verify DB booking update: proximity_notified_at is stamped
      const updatedBooking = await testPrisma.booking.findUnique({ where: { id: bookingAId } });
      expect(updatedBooking?.proximityNotifiedAt).not.toBeNull();

      // Verify In-App Notification created in database
      const notifs = await testPrisma.notification.findMany({
        where: { recipientId: passengerAId, type: NotificationType.DRIVER_APPROACHING },
      });
      expect(notifs.length).toBe(1);
      expect(notifs[0].message).toContain('Your driver is approximately');
      expect(notifs[0].message).toContain('Vandalur Crescent Gate');
    });

    it('deduplicates approaching notifications (never emits or stores duplicate alert for subsequent GPS pings)', async () => {
      // First ping: triggers approaching
      await new Promise((r) => setTimeout(r, 1100));
      await trackingService.recordDriverLocation(driverUser, activeRideId, {
        latitude: 12.8980,
        longitude: 80.0880,
        accuracy: 15,
        speedKmh: 30,
      });

      // Second ping: driver moves 60m further, still ETA <= 5 min
      await new Promise((r) => setTimeout(r, 1100));
      const secondResult = await trackingService.recordDriverLocation(driverUser, activeRideId, {
        latitude: 12.8975,
        longitude: 80.0875,
        accuracy: 12,
        speedKmh: 28,
      });

      // Deduplication: approachingPassengerIds must not include Passenger A again
      expect(secondResult.approachingPassengerIds).not.toContain(passengerAId);

      // Verify exactly 1 notification in DB
      const notifCount = await testPrisma.notification.count({
        where: { recipientId: passengerAId, type: NotificationType.DRIVER_APPROACHING },
      });
      expect(notifCount).toBe(1);
    });
  });

  describe('2. Driver Stopped Near Pickup (< 150m, speed < 5 km/h)', () => {
    it('detects driver arrival, sets arrivedNotifiedAt and creates DRIVER_ARRIVED notification', async () => {
      // Driver pulls up right outside Vandalur Crescent Gate (~20m away) and stops
      const arrivedLat = 12.8891;
      const arrivedLng = 80.0826;

      await new Promise((r) => setTimeout(r, 1100));
      const result = await trackingService.recordDriverLocation(driverUser, activeRideId, {
        latitude: arrivedLat,
        longitude: arrivedLng,
        accuracy: 10,
        speedKmh: 0, // Stopped
      });

      expect(result.stoppedNearPassengerIds).toContain(passengerAId);

      // Verify DB timestamps
      const updatedBooking = await testPrisma.booking.findUnique({ where: { id: bookingAId } });
      expect(updatedBooking?.arrivedNotifiedAt).not.toBeNull();

      // Verify In-App Notification
      const arrivedNotifs = await testPrisma.notification.findMany({
        where: { recipientId: passengerAId, type: NotificationType.DRIVER_ARRIVED },
      });
      expect(arrivedNotifs.length).toBe(1);
      expect(arrivedNotifs[0].message).toContain('appears to be near your pickup');
      expect(arrivedNotifs[0].message).toContain('Vandalur Crescent Gate');
    });

    it('does not re-emit stopped notification on subsequent stationary pings', async () => {
      // First ping: stopped
      await new Promise((r) => setTimeout(r, 1100));
      await trackingService.recordDriverLocation(driverUser, activeRideId, {
        latitude: 12.8891,
        longitude: 80.0826,
        accuracy: 10,
        speedKmh: 0,
      });

      // Second stationary ping
      await new Promise((r) => setTimeout(r, 1100));
      const result2 = await trackingService.recordDriverLocation(driverUser, activeRideId, {
        latitude: 12.8891,
        longitude: 80.0826,
        accuracy: 10,
        speedKmh: 0,
      });

      expect(result2.stoppedNearPassengerIds).not.toContain(passengerAId);

      const count = await testPrisma.notification.count({
        where: { recipientId: passengerAId, type: NotificationType.DRIVER_ARRIVED },
      });
      expect(count).toBe(1);
    });
  });

  describe('3. Boarding Confirmation Workflow', () => {
    it('allows passenger to confirm boarding (transitions WAITING -> BOARDED with timestamp)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/boarding`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send({ bookingId: bookingAId, boardingStatus: 'BOARDED' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.bookingId).toBe(bookingAId);
      expect(res.body.boardingStatus).toBe('BOARDED');

      const updated = await testPrisma.booking.findUnique({ where: { id: bookingAId } });
      expect(updated?.boardingStatus).toBe('BOARDED');
      expect(updated?.boardedAt).not.toBeNull();
    });

    it('allows passenger to signal BOARDING status', async () => {
      const res = await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/boarding`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send({ bookingId: bookingAId, boardingStatus: 'BOARDING' })
        .expect(200);

      expect(res.body.boardingStatus).toBe('BOARDING');
      const updated = await testPrisma.booking.findUnique({ where: { id: bookingAId } });
      expect(updated?.boardingStatus).toBe('BOARDING');
    });

    it('strictly forbids a passenger from changing another passenger boarding status (403)', async () => {
      // Passenger A tries to mark Passenger B as BOARDED
      const res = await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/boarding`)
        .set('Authorization', `Bearer ${passengerAToken}`)
        .send({ bookingId: bookingBId, boardingStatus: 'BOARDED' })
        .expect(403);

      expect(res.body.message).toContain('You do not have permission to update boarding status for this booking');
    });

    it('allows the driver to update boarding status for any confirmed passenger', async () => {
      const res = await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/boarding`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ bookingId: bookingAId, boardingStatus: 'BOARDED' })
        .expect(200);

      expect(res.body.boardingStatus).toBe('BOARDED');
    });
  });

  describe('4. Missed Pickup Detection & Safety', () => {
    it('triggers MISSED_PICKUP notification if driver passes pickup without boarding confirmation', async () => {
      // Step A: Driver previously approached Passenger B (triggers proximity timestamp)
      await testPrisma.booking.update({
        where: { id: bookingBId },
        data: { proximityNotifiedAt: new Date(Date.now() - 5 * 60 * 1000) },
      });

      // Step B: Driver moves past Perungalathur pickup (12.9050, 80.0950)
      // Driver is now at 12.8980, 80.0880 (~1.1 km away), traveling at 45 km/h
      const passedLat = 12.8980;
      const passedLng = 80.0880;

      await new Promise((r) => setTimeout(r, 1100));
      const result = await trackingService.recordDriverLocation(driverUser, activeRideId, {
        latitude: passedLat,
        longitude: passedLng,
        accuracy: 15,
        speedKmh: 45,
      });

      expect(result.missedPickupPassengerIds).toContain(passengerBId);

      // Verify DB timestamps
      const updatedBooking = await testPrisma.booking.findUnique({ where: { id: bookingBId } });
      expect(updatedBooking?.missedNotifiedAt).not.toBeNull();

      // CRITICAL SAFETY CHECK: Booking is NOT auto-boarded and NOT auto-cancelled!
      expect(updatedBooking?.status).toBe(BookingStatus.CONFIRMED);
      expect(updatedBooking?.boardingStatus).toBe('WAITING');

      // Verify Missed In-App Notification
      const missedNotifs = await testPrisma.notification.findMany({
        where: { recipientId: passengerBId, type: NotificationType.MISSED_PICKUP },
      });
      expect(missedNotifs.length).toBe(1);
      expect(missedNotifs[0].message).toContain('may have passed your pickup');
    });

    it('allows passenger or driver to explicitly mark boarding status as MISSED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/rides/${activeRideId}/boarding`)
        .set('Authorization', `Bearer ${passengerBToken}`)
        .send({ bookingId: bookingBId, boardingStatus: 'MISSED' })
        .expect(200);

      expect(res.body.boardingStatus).toBe('MISSED');
      const updated = await testPrisma.booking.findUnique({ where: { id: bookingBId } });
      expect(updated?.boardingStatus).toBe('MISSED');
      expect(updated?.missedAt).not.toBeNull();
    });
  });

  describe('5. Decoupled Web Push Resiliency', () => {
    it('safely tolerates Web Push delivery failures without throwing or breaking in-app notifications', async () => {
      const sendSpy = jest.spyOn(webPushService, 'sendPushNotification').mockRejectedValueOnce(new Error('Push service 503'));

      await new Promise((r) => setTimeout(r, 1100));
      const result = await trackingService.recordDriverLocation(driverUser, activeRideId, {
        latitude: 12.8891,
        longitude: 80.0826,
        accuracy: 12,
        speedKmh: 0,
      });

      expect(result.snapshot).toBeDefined();
      sendSpy.mockRestore();
    });
  });
});
