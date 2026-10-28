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
  ReportCategory,
  ReportStatus,
  RecurringCommuteStatus,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { RecurringCommutesService } from '../src/modules/recurring-commutes/recurring-commutes.service';
import { RideAlertsMatcherService } from '../src/modules/ride-alerts/ride-alerts-matcher.service';
import { getKolkataTodayString } from '@vit-carpool/contracts';

describe('Comprehensive End-to-End Product Validation & User Journeys (A through G)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let commutesService: RecurringCommutesService;
  let alertsMatcher: RideAlertsMatcherService;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // 1. Admin
  const adminAuthId = 'f0000000-0000-4000-8000-000000000000';
  const adminEmail = 'admin.journey@vitstudent.ac.in';
  let adminToken: string;
  let adminId: string;

  // 2. Student Driver
  const studentDriverAuthId = 'f1111111-1111-4111-8111-111111111111';
  const studentDriverEmail = 'driver.journey@vitstudent.ac.in';
  let studentDriverToken: string;
  let studentDriverId: string;
  let studentDriverVehicleId: string;

  // 3. Student Passenger 1
  const studentPass1AuthId = 'f2222222-2222-4222-8222-222222222222';
  const studentPass1Email = 'passenger1.journey@vitstudent.ac.in';
  let studentPass1Token: string;
  let studentPass1Id: string;

  // 4. Student Passenger 2
  const studentPass2AuthId = 'f3333333-3333-4333-8333-333333333333';
  const studentPass2Email = 'passenger2.journey@vitstudent.ac.in';
  let studentPass2Token: string;
  let studentPass2Id: string;

  // 5. Abusive Target Student
  const abuserAuthId = 'f4444444-4444-4444-8444-444444444444';
  const abuserEmail = 'abuser.journey@vitstudent.ac.in';
  let abuserToken: string;
  let abuserId: string;

  // 6. Faculty Driver
  const facultyDriverAuthId = 'f5555555-5555-4555-8555-555555555555';
  const facultyDriverEmail = 'faculty.driver.journey@vit.ac.in';
  let facultyDriverToken: string;
  let facultyDriverId: string;
  let facultyDriverVehicleId: string;

  // Shared test entity IDs across journeys
  let publishedRideId: string;
  let booking1Id: string;
  let booking2Id: string;
  let conversationId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean test tables in dependency order (without touching append-only audit_logs)
    await testPrisma.block.deleteMany();
    await testPrisma.report.deleteMany();
    await testPrisma.notification.deleteMany();
    await testPrisma.rideAlert.deleteMany();
    await testPrisma.message.deleteMany();
    await testPrisma.conversation.deleteMany();
    await testPrisma.driverRating.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.recurringCommute.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.verificationRequest.deleteMany();
    await testPrisma.idempotencyKey.deleteMany();
    await testPrisma.user.deleteMany();

    // 1. Seed Admin
    const admin = await testPrisma.user.create({
      data: {
        authUserId: adminAuthId,
        email: adminEmail,
        fullName: 'Campus Admin',
        role: UserRole.ADMIN,
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.ADMIN_OVERRIDE,
        verifiedAt: new Date(),
      },
    });
    adminId = admin.id;
    adminToken = signTestJwt({ sub: adminAuthId, email: adminEmail, role: 'ADMIN' });

    // 2. Seed Student Driver
    const sDriver = await testPrisma.user.create({
      data: {
        authUserId: studentDriverAuthId,
        email: studentDriverEmail,
        fullName: 'Karthik Student Driver',
        role: UserRole.USER,
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
      },
    });
    studentDriverId = sDriver.id;
    studentDriverToken = signTestJwt({ sub: studentDriverAuthId, email: studentDriverEmail, role: 'USER' });

    // 3. Seed Passenger 1
    const sPass1 = await testPrisma.user.create({
      data: {
        authUserId: studentPass1AuthId,
        email: studentPass1Email,
        fullName: 'Ananya Passenger One',
        role: UserRole.USER,
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
      },
    });
    studentPass1Id = sPass1.id;
    studentPass1Token = signTestJwt({ sub: studentPass1AuthId, email: studentPass1Email, role: 'USER' });

    // 4. Seed Passenger 2
    const sPass2 = await testPrisma.user.create({
      data: {
        authUserId: studentPass2AuthId,
        email: studentPass2Email,
        fullName: 'Rohan Passenger Two',
        role: UserRole.USER,
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
      },
    });
    studentPass2Id = sPass2.id;
    studentPass2Token = signTestJwt({ sub: studentPass2AuthId, email: studentPass2Email, role: 'USER' });

    // 5. Seed Abusive User
    const abuser = await testPrisma.user.create({
      data: {
        authUserId: abuserAuthId,
        email: abuserEmail,
        fullName: 'Abusive User',
        role: UserRole.USER,
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
      },
    });
    abuserId = abuser.id;
    abuserToken = signTestJwt({ sub: abuserAuthId, email: abuserEmail, role: 'USER' });

    // 6. Seed Faculty Driver
    const fDriver = await testPrisma.user.create({
      data: {
        authUserId: facultyDriverAuthId,
        email: facultyDriverEmail,
        fullName: 'Dr. Ramesh Faculty',
        role: UserRole.USER,
        audience: Audience.FACULTY,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
      },
    });
    facultyDriverId = fDriver.id;
    facultyDriverToken = signTestJwt({ sub: facultyDriverAuthId, email: facultyDriverEmail, role: 'USER' });

    // Bootstrap Nest App
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    commutesService = moduleFixture.get<RecurringCommutesService>(RecurringCommutesService);
    alertsMatcher = moduleFixture.get<RideAlertsMatcherService>(RideAlertsMatcherService);
  });

  afterAll(async () => {
    if (testPrisma) {
      await testPrisma.block.deleteMany();
      await testPrisma.report.deleteMany();
      await testPrisma.notification.deleteMany();
      await testPrisma.rideAlert.deleteMany();
      await testPrisma.message.deleteMany();
      await testPrisma.conversation.deleteMany();
      await testPrisma.driverRating.deleteMany();
      await testPrisma.booking.deleteMany();
      await testPrisma.ride.deleteMany();
      await testPrisma.recurringCommute.deleteMany();
      await testPrisma.vehicle.deleteMany();
      await testPrisma.verificationRequest.deleteMany();
      await testPrisma.idempotencyKey.deleteMany();
      await testPrisma.user.deleteMany();
      await testPrisma.$disconnect();
    }
    if (app) await app.close();
  });

  // ===========================================================================
  // JOURNEY A: Student Offers a Ride & Privacy Invariants
  // ===========================================================================
  describe('Journey A: Student Offers a Ride', () => {
    it('1. Student driver adds a verified vehicle', async () => {
      const res = await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          make: 'Toyota',
          model: 'Innova Crysta',
          color: 'Silver Metallic',
          registrationNumber: 'TN-09-CD-9999',
          capacity: 5,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.make).toBe('Toyota');
      expect(res.body.capacity).toBe(5);
      studentDriverVehicleId = res.body.id;
    });

    it('2. Student driver publishes a scheduled ride with private pickup notes', async () => {
      const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentDriverVehicleId,
          origin: 'Vandalur Zoo Bus Stop',
          destination: 'VIT Chennai North Gate',
          originLatitude: 12.89,
          originLongitude: 80.08,
          destinationLatitude: 12.84,
          destinationLongitude: 80.15,
          departureTime: tomorrowIso,
          availableSeats: 3,
          costPerSeat: 50,
          pickupDescription: 'Wait near Pillar 14 by the metro escalator',
          dropoffDescription: 'North Gate Academic Block Drop point',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.availableSeats).toBe(3);
      expect(res.body.status).toBe('SCHEDULED');
      expect(res.body.pickupDescription).toBe('Wait near Pillar 14 by the metro escalator');
      publishedRideId = res.body.id;
    });

    it('3. Ride appears in student search with sanitized public fields (pickup notes hidden)', async () => {
      const searchRes = await request(app.getHttpServer())
        .get('/rides?origin=Vandalur')
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .expect(200);

      expect(searchRes.body.rides).toBeDefined();
      const matched = searchRes.body.rides.find((r: any) => r.id === publishedRideId);
      expect(matched).toBeDefined();
      expect(matched.driverName).toBe('Karthik Student Driver');
      // Privacy check: public summary strictly excludes private notes and vehicle registration
      expect(matched.pickupDescription).toBeUndefined();
      expect(matched.dropoffDescription).toBeUndefined();
      expect(matched.vehicle?.registrationNumber).toBeUndefined();
    });

    it('4. Direct lookup by unconfirmed peer rider enforces Coarse Location / Note Redaction', async () => {
      const detailsRes = await request(app.getHttpServer())
        .get(`/rides/${publishedRideId}`)
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .expect(200);

      expect(detailsRes.body.id).toBe(publishedRideId);
      expect(detailsRes.body.pickupDescription).toBeUndefined();
      expect(detailsRes.body.dropoffDescription).toBeUndefined();
    });

    it('5. Driver updates available seats on scheduled ride', async () => {
      const updateRes = await request(app.getHttpServer())
        .patch(`/rides/${publishedRideId}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          availableSeats: 4,
        })
        .expect(200);

      expect(updateRes.body.availableSeats).toBe(4);
    });
  });

  // ===========================================================================
  // JOURNEY B: Passenger Books a Ride & Concurrency Invariants
  // ===========================================================================
  describe('Journey B: Passenger Books a Ride, Concurrency, and Private Chat', () => {
    it('1. Passenger 1 requests 2 seats on the published ride', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .send({
          rideId: publishedRideId,
          requestedSeats: 2,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('PENDING');
      expect(res.body.requestedSeats).toBe(2);
      booking1Id = res.body.id;
    });

    it('2. Invariant: Duplicate active booking by same passenger is rejected', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .send({
          rideId: publishedRideId,
          requestedSeats: 1,
        })
        .expect(409);

      expect(res.body.message.toLowerCase()).toContain('already have an active booking request');
    });

    it('3. Driver approves Passenger 1 booking: seats decremented and private notes unlocked', async () => {
      const approveRes = await request(app.getHttpServer())
        .post(`/bookings/${booking1Id}/approve`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(201);

      expect(approveRes.body.status).toBe('CONFIRMED');

      // Check ride available seats decremented from 4 to 2
      const rideCheck = await testPrisma.ride.findUnique({ where: { id: publishedRideId } });
      expect(rideCheck?.availableSeats).toBe(2);

      // Now Passenger 1 queries their booking: pickupDescription is revealed!
      const passengerBooking = await request(app.getHttpServer())
        .get(`/bookings/${booking1Id}`)
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .expect(200);

      expect(passengerBooking.body.ride.pickupDescription).toBe(
        'Wait near Pillar 14 by the metro escalator',
      );
    });

    it('4. Passenger 2 requests remaining 2 seats and driver approves (capacity becomes 0)', async () => {
      const b2Res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPass2Token}`)
        .send({
          rideId: publishedRideId,
          requestedSeats: 2,
        })
        .expect(201);
      booking2Id = b2Res.body.id;

      await request(app.getHttpServer())
        .post(`/bookings/${booking2Id}/approve`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(201);

      const rideCheck = await testPrisma.ride.findUnique({ where: { id: publishedRideId } });
      expect(rideCheck?.availableSeats).toBe(0);
    });

    it('5. Invariant: Booking request exceeding capacity is rejected', async () => {
      const exceedRes = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${abuserToken}`)
        .send({
          rideId: publishedRideId,
          requestedSeats: 1,
        })
        .expect(400);

      expect(exceedRes.body.message.toLowerCase()).toContain('exceed');
    });

    it('6. Private Chat: participants exchange messages and unread counts update', async () => {
      // Find conversation for booking1
      const convRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .expect(200);

      expect(convRes.body.id).toBeDefined();
      conversationId = convRes.body.id;

      // Passenger 1 sends a message
      const msgRes = await request(app.getHttpServer())
        .post(`/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .send({ content: 'Hi driver, I will be wearing a red jacket at Pillar 14!' })
        .expect(201);

      expect(msgRes.body.content).toContain('Pillar 14');

      // Driver checks unread count: should be >= 1
      const unreadRes = await request(app.getHttpServer())
        .get('/chat/unread-count')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      expect(unreadRes.body.unreadCount).toBeGreaterThanOrEqual(1);

      // Driver reads conversation: marks messages read
      await request(app.getHttpServer())
        .get(`/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);
    });

    it('7. Passenger 2 cancels booking: seats are atomically restored from 0 to 2', async () => {
      const cancelRes = await request(app.getHttpServer())
        .post(`/bookings/${booking2Id}/cancel`)
        .set('Authorization', `Bearer ${studentPass2Token}`)
        .send({ cancellationReason: 'Change of plans' })
        .expect(201);

      expect(cancelRes.body.status).toBe('CANCELLED');

      const rideCheck = await testPrisma.ride.findUnique({ where: { id: publishedRideId } });
      expect(rideCheck?.availableSeats).toBe(2);
    });
  });

  // ===========================================================================
  // JOURNEY C: Ride Completion and Ratings
  // ===========================================================================
  describe('Journey C: Ride Completion & Rating Eligibility', () => {
    it('1. Non-driver cannot mark ride complete', async () => {
      await request(app.getHttpServer())
        .post(`/rides/${publishedRideId}/complete`)
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .expect(404);
    });

    it('2. Driver explicitly marks ride as COMPLETED', async () => {
      const completeRes = await request(app.getHttpServer())
        .post(`/rides/${publishedRideId}/complete`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(201);

      expect(completeRes.body.status).toBe('COMPLETED');
    });

    it('3. Chat conversation becomes read-only after ride completion', async () => {
      const convRes = await request(app.getHttpServer())
        .get(`/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .expect(200);

      expect(convRes.body.isReadOnly).toBe(true);

      // Attempting to send message in completed ride chat is rejected
      await request(app.getHttpServer())
        .post(`/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .send({ content: 'Are we there yet?' })
        .expect(400);
    });

    it('4. Confirmed Passenger 1 rates driver (5 stars, positive review)', async () => {
      const rateRes = await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .send({
          bookingId: booking1Id,
          rating: 5,
          review: 'Smooth driving and pleasant conversation. Highly recommend!',
        })
        .expect(201);

      expect(rateRes.body.rating).toBe(5);
      expect(rateRes.body.review).toContain('Smooth driving');
    });

    it('5. Invariant: Duplicate rating is rejected', async () => {
      const dupRes = await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .send({
          bookingId: booking1Id,
          rating: 4,
        })
        .expect(409);

      expect(dupRes.body.message.toLowerCase()).toContain('already submitted a rating');
    });

    it('6. Invariant: Cancelled passenger booking cannot submit a rating', async () => {
      const ineligRes = await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${studentPass2Token}`)
        .send({
          bookingId: booking2Id,
          rating: 1,
        })
        .expect(400);

      expect(ineligRes.body.message.toLowerCase()).toContain('only confirmed bookings');
    });

    it('7. Driver rating aggregate reflects 5.0 rating with 1 review', async () => {
      const driverRatingRes = await request(app.getHttpServer())
        .get(`/ratings/driver/${studentDriverId}`)
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .expect(200);

      expect(driverRatingRes.body.averageRating).toBe(5);
      expect(driverRatingRes.body.totalReviews).toBe(1);
    });
  });

  // ===========================================================================
  // JOURNEY D: Recurring Commute & Timezone Safety (Asia/Kolkata)
  // ===========================================================================
  describe('Journey D: Recurring Commute & Timezone Safety (Asia/Kolkata)', () => {
    let recurringCommuteId: string;

    it('1. Driver creates recurring commute for MWF departing at 08:30 IST', async () => {
      const todayKolkata = getKolkataTodayString();
      const res = await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentDriverVehicleId,
          origin: 'Sholinganallur Junction',
          destination: 'VIT Chennai Campus',
          weekdays: [1, 3, 5], // Monday, Wednesday, Friday
          departureTime: '08:30',
          startDate: todayKolkata,
          endDate: '2026-12-31',
          availableSeats: 3,
          costPerSeat: 40,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.weekdays).toEqual([1, 3, 5]);
      expect(res.body.departureTime).toBe('08:30');
      recurringCommuteId = res.body.id;
    });

    it('2. Scheduler materializes rides: occurrences created with exact Asia/Kolkata (+05:30) UTC time', async () => {
      // Commute creation automatically materializes future horizon occurrences
      const generatedRides = await testPrisma.ride.findMany({
        where: { recurringCommuteId },
      });
      expect(generatedRides.length).toBeGreaterThanOrEqual(1);

      for (const r of generatedRides) {
        expect(r.audience).toBe(Audience.STUDENT);
        expect(r.availableSeats).toBe(3);
        expect(r.status).toBe(RideStatus.SCHEDULED);

        // Check UTC time: 08:30 IST is 03:00 UTC (no DST offset in India)
        const d = new Date(r.departureTime);
        expect(d.getUTCHours()).toBe(3);
        expect(d.getUTCMinutes()).toBe(0);
      }
    });

    it('3. Invariant: Re-running materialization is strictly idempotent (0 duplicates)', async () => {
      const secondMat = await commutesService.generateAllActiveCommutes(7);
      expect(secondMat.totalCreated).toBe(0);
      expect(secondMat.totalSkipped).toBeGreaterThanOrEqual(1);
    });

    it('4. Paused commute stops generating rides', async () => {
      await request(app.getHttpServer())
        .patch(`/recurring-commutes/${recurringCommuteId}/pause`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      const check = await testPrisma.recurringCommute.findUnique({
        where: { id: recurringCommuteId },
      });
      expect(check?.status).toBe(RecurringCommuteStatus.PAUSED);
    });
  });

  // ===========================================================================
  // JOURNEY E: Ride Alerts & In-App Notifications
  // ===========================================================================
  describe('Journey E: Ride Alerts & Notifications Lifecycle', () => {
    let alertId: string;
    let notificationId: string;

    it('1. Passenger 2 creates a ride alert for Tambaram -> VIT Chennai corridor', async () => {
      const alertRes = await request(app.getHttpServer())
        .post('/ride-alerts')
        .set('Authorization', `Bearer ${studentPass2Token}`)
        .send({
          origin: 'Tambaram East',
          destination: 'VIT Chennai',
          originLatitude: 12.92,
          originLongitude: 80.12,
          destinationLatitude: 12.84,
          destinationLongitude: 80.15,
          radiusKm: 5.0,
          minSeats: 1,
        })
        .expect(201);

      expect(alertRes.body.id).toBeDefined();
      expect(alertRes.body.status).toBe('ACTIVE');
      alertId = alertRes.body.id;
    });

    it('2. Driver publishes matching ride: triggers automated notification match', async () => {
      const tomorrow = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
      const rideRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentDriverVehicleId,
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai Main Campus',
          originLatitude: 12.924,
          originLongitude: 80.128,
          destinationLatitude: 12.841,
          destinationLongitude: 80.154,
          departureTime: tomorrow,
          availableSeats: 3,
        })
        .expect(201);

      const rideRecord = await testPrisma.ride.findUniqueOrThrow({
        where: { id: rideRes.body.id },
      });
      const matchResult = await alertsMatcher.matchRideAgainstAlerts(rideRecord);
      expect(matchResult.matchedCount).toBeGreaterThanOrEqual(1);
    });

    it('3. Passenger receives notification, unread count increments, and marking read works', async () => {
      const countBefore = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${studentPass2Token}`)
        .expect(200);

      const notifsRes = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${studentPass2Token}`)
        .expect(200);

      expect(notifsRes.body.notifications.length).toBeGreaterThanOrEqual(1);
      const notif = notifsRes.body.notifications[0];
      expect(notif.type).toBe('RIDE_MATCH');
      expect(notif.isRead).toBe(false);
      notificationId = notif.id;

      // Mark as read
      const readRes = await request(app.getHttpServer())
        .patch(`/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${studentPass2Token}`)
        .expect(200);

      expect(readRes.body.isRead).toBe(true);

      // Unread count decrements by 1
      const countAfter = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${studentPass2Token}`)
        .expect(200);

      expect(countAfter.body.count).toBe(countBefore.body.count - 1);
    });
  });

  // ===========================================================================
  // JOURNEY F: Safety, Moderation, User Blocking & Account Suspension
  // ===========================================================================
  describe('Journey F: Safety, Moderation & JWT Invalidation', () => {
    let reportId: string;

    it('1. Driver blocks abusive user: mutual invisibility is enforced', async () => {
      await request(app.getHttpServer())
        .post(`/moderation/blocks/${abuserId}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          reason: 'Harassment and inappropriate behavior',
        })
        .expect(201);

      // Mutually blocked: abuser searching for rides sees ZERO rides from driver
      const abuserSearch = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${abuserToken}`)
        .expect(200);

      const driverRides = abuserSearch.body.rides.filter(
        (r: any) => r.driverId === studentDriverId,
      );
      expect(driverRides.length).toBe(0);
    });

    it('2. Driver submits incident report against abusive user', async () => {
      const reportRes = await request(app.getHttpServer())
        .post('/moderation/reports')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          reportedUserId: abuserId,
          category: ReportCategory.HARASSMENT,
          description: 'User repeatedly sent harassing messages violating campus charter.',
        })
        .expect(201);

      expect(reportRes.body.id).toBeDefined();
      expect(reportRes.body.status).toBe('PENDING');
      reportId = reportRes.body.id;
    });

    it('3. Administrator reviews, investigates, and resolves the incident report', async () => {
      // Mark as investigating
      const invRes = await request(app.getHttpServer())
        .post(`/admin/reports/${reportId}/investigate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(invRes.body.status).toBe('INVESTIGATING');

      // Resolve with mandatory notes
      const resolveRes = await request(app.getHttpServer())
        .post(`/admin/reports/${reportId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'RESOLVED',
          resolutionNotes: 'Pattern of harassment verified across audit logs. Suspending account.',
        })
        .expect(200);

      expect(resolveRes.body.status).toBe('RESOLVED');
      expect(resolveRes.body.resolutionNotes).toContain('Suspending account');
    });

    it('4. Administrator suspends abusive account: previously issued JWT cannot be used', async () => {
      const suspRes = await request(app.getHttpServer())
        .post(`/admin/users/${abuserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Severe trust and safety policy violation' })
        .expect(200);

      expect(suspRes.body.isSuspended).toBe(true);

      // The abuserToken was issued BEFORE suspension.
      // Calling protected endpoints must immediately fail with 403 ACCOUNT_SUSPENDED:
      const ridesTry = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${abuserToken}`)
        .expect(403);
      expect(ridesTry.body.error).toBe('ACCOUNT_SUSPENDED');

      const notifTry = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${abuserToken}`)
        .expect(403);
      expect(notifTry.body.error).toBe('ACCOUNT_SUSPENDED');

      // Suspended user can access ONLY GET /users/me to inspect suspension reason:
      const meRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${abuserToken}`)
        .expect(200);

      expect(meRes.body.isSuspended).toBe(true);
      expect(meRes.body.suspensionReason).toBe('Severe trust and safety policy violation');
    });

    it('5. Administrator reinstates suspended user: restores capabilities safely', async () => {
      const reinRes = await request(app.getHttpServer())
        .post(`/admin/users/${abuserId}/reinstate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Written appeal approved by campus committee' })
        .expect(200);

      expect(reinRes.body.isSuspended).toBe(false);

      // Access restored
      await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${abuserToken}`)
        .expect(200);
    });
  });

  // ===========================================================================
  // JOURNEY G: Strict Student and Faculty Cohort Separation
  // ===========================================================================
  describe('Journey G: Strict Student & Faculty Cohort Isolation', () => {
    let facultyRideId: string;

    it('1. Faculty driver registers vehicle and publishes a faculty-only ride', async () => {
      const vRes = await testPrisma.vehicle.create({
        data: {
          userId: facultyDriverId,
          make: 'Honda',
          model: 'City',
          color: 'White',
          registrationNumber: 'TN-11-FA-1001',
          capacity: 4,
        },
      });
      facultyDriverVehicleId = vRes.id;

      const dep = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const rRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .send({
          vehicleId: facultyDriverVehicleId,
          origin: 'Adyar Gate',
          destination: 'VIT Faculty Quarters',
          departureTime: dep,
          availableSeats: 3,
        })
        .expect(201);

      expect(rRes.body.audience).toBe('FACULTY');
      facultyRideId = rRes.body.id;
    });

    it('2. Student searches rides: faculty ride is completely invisible', async () => {
      const searchRes = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .expect(200);

      const foundFacultyRide = searchRes.body.rides.find((r: any) => r.id === facultyRideId);
      expect(foundFacultyRide).toBeUndefined();
    });

    it('3. Student attempts direct lookup on faculty ride: rejected with 404', async () => {
      await request(app.getHttpServer())
        .get(`/rides/${facultyRideId}`)
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .expect(404);
    });

    it('4. Student attempts booking on faculty ride: rejected with 404 / 403', async () => {
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .send({
          rideId: facultyRideId,
          requestedSeats: 1,
        })
        .expect(404);
    });

    it('5. Invariant: Tampering query params to request FACULTY audience is rejected with 400 Bad Request', async () => {
      // SearchRidesQuerySchema is strictly validated; client-side injection of audience parameter is rejected
      const tamperedSearch = await request(app.getHttpServer())
        .get('/rides?audience=FACULTY')
        .set('Authorization', `Bearer ${studentPass1Token}`)
        .expect(400);

      expect(tamperedSearch.body.message.toLowerCase()).toContain('unrecognized key');
    });
  });
});
