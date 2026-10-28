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
  RideAlertStatus,
  NotificationType,
  BookingStatus,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { RecurringCommutesService } from '../src/modules/recurring-commutes/recurring-commutes.service';

describe('Milestone 12: Ride Alerts & In-App Notifications (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let commutesService: RecurringCommutesService;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Test Driver (Student)
  const driverAuthId = 'da111111-1111-4111-8111-111111111111';
  const driverEmail = 'alert.driver@vitstudent.ac.in';
  let driverToken: string;
  let driverId: string;
  let driverVehicleId: string;

  // Test Passenger 1 (Student)
  const passenger1AuthId = 'ba111111-1111-4111-8111-111111111111';
  const passenger1Email = 'alert.passenger1@vitstudent.ac.in';
  let passenger1Token: string;
  let passenger1Id: string;

  // Test Passenger 2 (Student - for ownership and isolation)
  const passenger2AuthId = 'ba222222-2222-4222-8222-222222222222';
  const passenger2Email = 'alert.passenger2@vitstudent.ac.in';
  let passenger2Token: string;
  let passenger2Id: string;

  // Test Faculty Driver (for audience separation)
  const facultyAuthId = 'fa111111-1111-4111-8111-111111111111';
  const facultyEmail = 'alert.faculty@vit.ac.in';
  let facultyToken: string;
  let facultyId: string;
  let facultyVehicleId: string;

  // Coordinates:
  // Tambaram Railway Station: 12.9249, 80.1478
  // Tambaram Sanatorium (1.5km from Tambaram): 12.9360, 80.1480
  // Chennai Airport (10km north of Tambaram): 12.9815, 80.1643
  // VIT Chennai: 12.8406, 80.1534
  // VIT Chennai North Gate: 12.8420, 80.1540

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables in reverse dependency order
    await testPrisma.notification.deleteMany();
    await testPrisma.rideAlert.deleteMany();
    await testPrisma.message.deleteMany();
    await testPrisma.conversation.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.recurringCommute.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.user.deleteMany();

    // Seed Driver
    const d = await testPrisma.user.create({
      data: {
        authUserId: driverAuthId,
        email: driverEmail,
        fullName: 'Arjun Test Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    driverId = d.id;
    driverToken = signTestJwt({ sub: driverAuthId, email: driverEmail });

    const v = await testPrisma.vehicle.create({
      data: {
        userId: driverId,
        make: 'Hyundai',
        model: 'i20',
        color: 'White',
        registrationNumber: 'TN09AB1234',
        capacity: 5,
      },
    });
    driverVehicleId = v.id;

    // Seed Passenger 1
    const p1 = await testPrisma.user.create({
      data: {
        authUserId: passenger1AuthId,
        email: passenger1Email,
        fullName: 'Priya Passenger One',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    passenger1Id = p1.id;
    passenger1Token = signTestJwt({ sub: passenger1AuthId, email: passenger1Email });

    // Seed Passenger 2
    const p2 = await testPrisma.user.create({
      data: {
        authUserId: passenger2AuthId,
        email: passenger2Email,
        fullName: 'Rahul Passenger Two',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    passenger2Id = p2.id;
    passenger2Token = signTestJwt({ sub: passenger2AuthId, email: passenger2Email });

    // Seed Faculty Driver
    const f = await testPrisma.user.create({
      data: {
        authUserId: facultyAuthId,
        email: facultyEmail,
        fullName: 'Dr. Faculty Member',
        audience: Audience.FACULTY,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    facultyId = f.id;
    facultyToken = signTestJwt({ sub: facultyAuthId, email: facultyEmail });

    const fv = await testPrisma.vehicle.create({
      data: {
        userId: facultyId,
        make: 'Maruti',
        model: 'Brezza',
        color: 'Silver',
        registrationNumber: 'TN19FF9999',
        capacity: 5,
      },
    });
    facultyVehicleId = fv.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    commutesService = app.get(RecurringCommutesService);
  });

  afterAll(async () => {
    await testPrisma.notification.deleteMany();
    await testPrisma.rideAlert.deleteMany();
    await testPrisma.message.deleteMany();
    await testPrisma.conversation.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.recurringCommute.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.user.deleteMany();
    await testPrisma.$disconnect();
    if (app) {
      await app.close();
    }
  });

  // ===========================================================================
  // SECTION 1: Ride Alert CRUD, Validation & Ownership
  // ===========================================================================

  describe('Ride Alert Management (CRUD & Validation)', () => {
    let createdAlertId: string;

    it('should reject unauthenticated alert creation (401)', async () => {
      await request(app.getHttpServer())
        .post('/ride-alerts')
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
        })
        .expect(401);
    });

    it('should reject alert creation with invalid departure time format (400)', async () => {
      await request(app.getHttpServer())
        .post('/ride-alerts')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          earliestDepartureTime: '25:99',
        })
        .expect(400);
    });

    it('should reject alert creation when latest departure is earlier than earliest (400)', async () => {
      await request(app.getHttpServer())
        .post('/ride-alerts')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          earliestDepartureTime: '10:00',
          latestDepartureTime: '08:00',
        })
        .expect(400);
    });

    it('should create a valid ride alert for authenticated passenger (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/ride-alerts')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          origin: 'Tambaram Railway Station',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai Main Gate',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          radiusKm: 3.0,
          earliestDepartureTime: '08:00',
          latestDepartureTime: '09:30',
          minSeats: 2,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.origin).toBe('Tambaram Railway Station');
      expect(res.body.destination).toBe('VIT Chennai Main Gate');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.minSeats).toBe(2);
      expect(res.body.userId).toBe(passenger1Id);

      createdAlertId = res.body.id;
    });

    it('should list alerts belonging to the authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/ride-alerts')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body.some((a: any) => a.id === createdAlertId)).toBe(true);
    });

    it('should retrieve a single alert by ID for its owner', async () => {
      const res = await request(app.getHttpServer())
        .get(`/ride-alerts/${createdAlertId}`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(res.body.id).toBe(createdAlertId);
      expect(res.body.radiusKm).toBe(3.0);
    });

    it('should not allow another passenger to view the alert (404)', async () => {
      await request(app.getHttpServer())
        .get(`/ride-alerts/${createdAlertId}`)
        .set('Authorization', `Bearer ${passenger2Token}`)
        .expect(404);
    });

    it('should update alert preferences (PATCH /ride-alerts/:id)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/ride-alerts/${createdAlertId}`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          radiusKm: 5.0,
          minSeats: 1,
        })
        .expect(200);

      expect(res.body.radiusKm).toBe(5.0);
      expect(res.body.minSeats).toBe(1);
    });

    it('should pause an active alert (POST /ride-alerts/:id/pause)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/ride-alerts/${createdAlertId}/pause`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(res.body.status).toBe('PAUSED');
    });

    it('should resume a paused alert (POST /ride-alerts/:id/resume)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/ride-alerts/${createdAlertId}/resume`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
    });

    it('should reject pause/resume from non-owner (404)', async () => {
      await request(app.getHttpServer())
        .post(`/ride-alerts/${createdAlertId}/pause`)
        .set('Authorization', `Bearer ${passenger2Token}`)
        .expect(404);
    });

    it('should delete an alert (DELETE /ride-alerts/:id)', async () => {
      await request(app.getHttpServer())
        .delete(`/ride-alerts/${createdAlertId}`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      // Verify it is gone
      await request(app.getHttpServer())
        .get(`/ride-alerts/${createdAlertId}`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(404);
    });
  });

  // ===========================================================================
  // SECTION 2: Ride Matching Engine (Spatial, Directional, Time, Seats, Audience)
  // ===========================================================================

  describe('Ride Matching Engine', () => {
    let studentAlertId: string;
    let facultyAlertId: string;

    beforeEach(async () => {
      // Clear notifications and alerts before each matching test
      await testPrisma.notification.deleteMany();
      await testPrisma.rideAlert.deleteMany();
      await testPrisma.booking.deleteMany();
      await testPrisma.ride.deleteMany();

      // Create an active Student Alert for Passenger 1:
      // Route: Tambaram -> VIT Chennai, Radius: 3km, Time: 08:00 - 10:00 IST, minSeats: 2
      const sa = await testPrisma.rideAlert.create({
        data: {
          userId: passenger1Id,
          audience: Audience.STUDENT,
          origin: 'Tambaram Station',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          radiusKm: 3.0,
          earliestDepartureTime: '08:00',
          latestDepartureTime: '10:00',
          minSeats: 2,
          status: RideAlertStatus.ACTIVE,
        },
      });
      studentAlertId = sa.id;

      // Create an active Faculty Alert for Faculty Member:
      // Same route, but Audience = FACULTY
      const fa = await testPrisma.rideAlert.create({
        data: {
          userId: facultyId,
          audience: Audience.FACULTY,
          origin: 'Tambaram Station',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          radiusKm: 3.0,
          earliestDepartureTime: '08:00',
          latestDepartureTime: '10:00',
          minSeats: 1,
          status: RideAlertStatus.ACTIVE,
        },
      });
      facultyAlertId = fa.id;
    });

    it('should match a published ride and create RIDE_MATCH notification for passenger', async () => {
      // Publish ride by student driver:
      // Departure: tomorrow at 08:30 IST (03:00 UTC)
      const depDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const depDateStr = depDate.toISOString().slice(0, 10);
      const depTime = `${depDateStr}T03:00:00.000Z`; // 08:30 IST

      const rideRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: driverVehicleId,
          origin: 'Tambaram Sanatorium', // ~1.2km from Tambaram Station -> inside 3km radius
          originLatitude: 12.936,
          originLongitude: 80.148,
          destination: 'VIT Chennai North Gate', // ~200m from VIT Main Gate -> inside 3km radius
          destinationLatitude: 12.842,
          destinationLongitude: 80.154,
          departureTime: depTime,
          availableSeats: 3, // >= 2 minSeats
          costPerSeat: 80,
        })
        .expect(201);

      // Verify Passenger 1 received a RIDE_MATCH notification
      const notifications = await testPrisma.notification.findMany({
        where: { recipientId: passenger1Id, type: NotificationType.RIDE_MATCH },
      });

      expect(notifications.length).toBe(1);
      expect(notifications[0].rideId).toBe(rideRes.body.id);
      expect(notifications[0].rideAlertId).toBe(studentAlertId);
      expect(notifications[0].isRead).toBe(false);
      expect(notifications[0].title).toContain('New Ride Match');
    });

    it('should NOT match reverse direction (VIT Chennai -> Tambaram)', async () => {
      const depDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const depTime = `${depDate.toISOString().slice(0, 10)}T03:00:00.000Z`;

      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: driverVehicleId,
          origin: 'VIT Chennai Main Gate',
          originLatitude: 12.8406,
          originLongitude: 80.1534,
          destination: 'Tambaram Station',
          destinationLatitude: 12.9249,
          destinationLongitude: 80.1478,
          departureTime: depTime,
          availableSeats: 3,
        })
        .expect(201);

      const notifications = await testPrisma.notification.findMany({
        where: { recipientId: passenger1Id },
      });
      expect(notifications.length).toBe(0);
    });

    it('should NOT match ride outside search radius (e.g. Airport -> VIT Chennai)', async () => {
      const depDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const depTime = `${depDate.toISOString().slice(0, 10)}T03:00:00.000Z`;

      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: driverVehicleId,
          origin: 'Chennai Airport', // ~10km away -> exceeds 3km radius
          originLatitude: 12.9815,
          originLongitude: 80.1643,
          destination: 'VIT Chennai Main Gate',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: depTime,
          availableSeats: 3,
        })
        .expect(201);

      const notifications = await testPrisma.notification.findMany({
        where: { recipientId: passenger1Id },
      });
      expect(notifications.length).toBe(0);
    });

    it('should NOT match ride outside departure time window (e.g. 17:00 IST)', async () => {
      const depDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const depTime = `${depDate.toISOString().slice(0, 10)}T11:30:00.000Z`; // 17:00 IST

      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: driverVehicleId,
          origin: 'Tambaram Station',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: depTime,
          availableSeats: 3,
        })
        .expect(201);

      const notifications = await testPrisma.notification.findMany({
        where: { recipientId: passenger1Id },
      });
      expect(notifications.length).toBe(0);
    });

    it('should NOT match ride offering fewer seats than alert minSeats', async () => {
      const depDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const depTime = `${depDate.toISOString().slice(0, 10)}T03:00:00.000Z`; // 08:30 IST

      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: driverVehicleId,
          origin: 'Tambaram Station',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: depTime,
          availableSeats: 1, // Alert requires minSeats = 2
        })
        .expect(201);

      const notifications = await testPrisma.notification.findMany({
        where: { recipientId: passenger1Id },
      });
      expect(notifications.length).toBe(0);
    });

    it('should NOT notify driver for their own published ride', async () => {
      // Driver also has an alert on this route
      await testPrisma.rideAlert.create({
        data: {
          userId: driverId,
          audience: Audience.STUDENT,
          origin: 'Tambaram Station',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          radiusKm: 5.0,
          status: RideAlertStatus.ACTIVE,
        },
      });

      const depDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const depTime = `${depDate.toISOString().slice(0, 10)}T03:00:00.000Z`;

      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: driverVehicleId,
          origin: 'Tambaram Station',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: depTime,
          availableSeats: 3,
        })
        .expect(201);

      // Driver must NOT receive alert
      const driverNotifications = await testPrisma.notification.findMany({
        where: { recipientId: driverId, type: NotificationType.RIDE_MATCH },
      });
      expect(driverNotifications.length).toBe(0);
    });

    it('should strictly enforce Student / Faculty cohort isolation', async () => {
      const depDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const depTime = `${depDate.toISOString().slice(0, 10)}T03:00:00.000Z`;

      // Student Driver publishes a ride
      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: driverVehicleId,
          origin: 'Tambaram Station',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: depTime,
          availableSeats: 3,
        })
        .expect(201);

      // Faculty member must NOT receive notification for student ride
      const facultyNotifications = await testPrisma.notification.findMany({
        where: { recipientId: facultyId },
      });
      expect(facultyNotifications.length).toBe(0);

      // Student passenger must receive notification
      const studentNotifications = await testPrisma.notification.findMany({
        where: { recipientId: passenger1Id },
      });
      expect(studentNotifications.length).toBe(1);
    });

    it('should NOT notify paused alerts', async () => {
      // Pause student alert
      await testPrisma.rideAlert.update({
        where: { id: studentAlertId },
        data: { status: RideAlertStatus.PAUSED },
      });

      const depDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const depTime = `${depDate.toISOString().slice(0, 10)}T03:00:00.000Z`;

      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: driverVehicleId,
          origin: 'Tambaram Station',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: depTime,
          availableSeats: 3,
        })
        .expect(201);

      const notifications = await testPrisma.notification.findMany({
        where: { recipientId: passenger1Id },
      });
      expect(notifications.length).toBe(0);
    });

    it('should prevent duplicate notifications for repeated matching events', async () => {
      const depDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const depTime = `${depDate.toISOString().slice(0, 10)}T03:00:00.000Z`;

      const rideRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: driverVehicleId,
          origin: 'Tambaram Station',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: depTime,
          availableSeats: 3,
        })
        .expect(201);

      // Verify 1 notification created
      const initialCount = await testPrisma.notification.count({
        where: { recipientId: passenger1Id, rideId: rideRes.body.id },
      });
      expect(initialCount).toBe(1);

      // Manually trigger matcher again with the same ride (simulating retried worker)
      const ride = await testPrisma.ride.findUniqueOrThrow({ where: { id: rideRes.body.id } });
      const matcherService = app.get(require('../src/modules/ride-alerts/ride-alerts-matcher.service').RideAlertsMatcherService);
      const matchResult = await matcherService.matchRideAgainstAlerts(ride);

      expect(matchResult.matchedCount).toBe(1);
      expect(matchResult.notifiedCount).toBe(0); // Duplicate was skipped!

      const finalCount = await testPrisma.notification.count({
        where: { recipientId: passenger1Id, rideId: rideRes.body.id },
      });
      expect(finalCount).toBe(1);
    });

    it('should trigger alert matching when Recurring Commutes generates a ride', async () => {
      const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const endDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Create a recurring commute from Tambaram to VIT Chennai at 08:30 IST
      const res = await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: driverVehicleId,
          origin: 'Tambaram Station',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          weekdays: [1, 2, 3, 4, 5, 6, 7], // All days to guarantee generation
          departureTime: '08:30',
          startDate,
          endDate,
          availableSeats: 3,
        })
        .expect(201);

      // Passenger 1 should have received notifications for the materialized rides!
      const notifications = await testPrisma.notification.findMany({
        where: { recipientId: passenger1Id, type: NotificationType.RIDE_MATCH },
      });

      expect(notifications.length).toBeGreaterThanOrEqual(1);
      expect(notifications[0].title).toContain('New Ride Match');
    });
  });

  // ===========================================================================
  // SECTION 3: Event Notifications (Booking & Cancellation Lifecycle)
  // ===========================================================================

  describe('Booking & Ride Lifecycle Notifications', () => {
    let testRideId: string;
    let testBookingId: string;

    beforeEach(async () => {
      await testPrisma.notification.deleteMany();
      await testPrisma.booking.deleteMany();
      await testPrisma.ride.deleteMany();

      // Create a test ride
      const depDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const r = await testPrisma.ride.create({
        data: {
          driverId,
          vehicleId: driverVehicleId,
          audience: Audience.STUDENT,
          origin: 'Tambaram',
          originLatitude: 12.9249,
          originLongitude: 80.1478,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: depDate,
          availableSeats: 3,
          totalSeats: 3,
          status: RideStatus.SCHEDULED,
        },
      });
      testRideId = r.id;
    });

    it('should notify driver when passenger requests a booking (BOOKING_REQUESTED)', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          rideId: testRideId,
          requestedSeats: 1,
        })
        .expect(201);

      testBookingId = res.body.id;

      const driverNotifications = await testPrisma.notification.findMany({
        where: { recipientId: driverId, type: NotificationType.BOOKING_REQUESTED },
      });

      expect(driverNotifications.length).toBe(1);
      expect(driverNotifications[0].title).toContain('New Booking Request');
      expect(driverNotifications[0].bookingId).toBe(testBookingId);
    });

    it('should notify passenger when driver approves booking (BOOKING_APPROVED)', async () => {
      // Create pending booking
      const b = await testPrisma.booking.create({
        data: {
          rideId: testRideId,
          passengerId: passenger1Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      await request(app.getHttpServer())
        .post(`/bookings/${b.id}/approve`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      const passengerNotifications = await testPrisma.notification.findMany({
        where: { recipientId: passenger1Id, type: NotificationType.BOOKING_APPROVED },
      });

      expect(passengerNotifications.length).toBe(1);
      expect(passengerNotifications[0].title).toContain('Booking Approved');
    });

    it('should notify passenger when driver rejects booking (BOOKING_REJECTED)', async () => {
      const b = await testPrisma.booking.create({
        data: {
          rideId: testRideId,
          passengerId: passenger1Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      await request(app.getHttpServer())
        .post(`/bookings/${b.id}/reject`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ reason: 'Route full' })
        .expect(201);

      const passengerNotifications = await testPrisma.notification.findMany({
        where: { recipientId: passenger1Id, type: NotificationType.BOOKING_REJECTED },
      });

      expect(passengerNotifications.length).toBe(1);
      expect(passengerNotifications[0].title).toContain('Booking Declined');
    });

    it('should notify driver when passenger cancels their booking (BOOKING_CANCELLED)', async () => {
      const b = await testPrisma.booking.create({
        data: {
          rideId: testRideId,
          passengerId: passenger1Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED,
        },
      });

      // Since booking is CONFIRMED, decrement availableSeats to reflect seat allocation
      await testPrisma.ride.update({
        where: { id: testRideId },
        data: { availableSeats: 2 },
      });

      await request(app.getHttpServer())
        .post(`/bookings/${b.id}/cancel`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({ reason: 'Schedule changed' })
        .expect(201);

      const driverNotifications = await testPrisma.notification.findMany({
        where: { recipientId: driverId, type: NotificationType.BOOKING_CANCELLED },
      });

      expect(driverNotifications.length).toBe(1);
      expect(driverNotifications[0].title).toContain('Booking Cancelled');
    });

    it('should notify passengers when driver cancels scheduled ride (RIDE_CANCELLED)', async () => {
      // Passenger 1 has confirmed booking
      await testPrisma.booking.create({
        data: {
          rideId: testRideId,
          passengerId: passenger1Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED,
        },
      });

      // Passenger 2 has pending booking
      await testPrisma.booking.create({
        data: {
          rideId: testRideId,
          passengerId: passenger2Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      // Driver cancels ride
      await request(app.getHttpServer())
        .post(`/rides/${testRideId}/cancel`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      // Both Passenger 1 and Passenger 2 must receive RIDE_CANCELLED notifications
      const p1Notifs = await testPrisma.notification.findMany({
        where: { recipientId: passenger1Id, type: NotificationType.RIDE_CANCELLED },
      });
      const p2Notifs = await testPrisma.notification.findMany({
        where: { recipientId: passenger2Id, type: NotificationType.RIDE_CANCELLED },
      });

      expect(p1Notifs.length).toBe(1);
      expect(p1Notifs[0].title).toContain('Ride Cancelled by Driver');

      expect(p2Notifs.length).toBe(1);
      expect(p2Notifs[0].title).toContain('Ride Cancelled by Driver');
    });
  });

  // ===========================================================================
  // SECTION 4: Notifications API & State Management
  // ===========================================================================

  describe('Notifications API', () => {
    let notif1Id: string;
    let notif2Id: string;

    beforeEach(async () => {
      await testPrisma.notification.deleteMany();

      const n1 = await testPrisma.notification.create({
        data: {
          recipientId: passenger1Id,
          audience: Audience.STUDENT,
          type: NotificationType.RIDE_MATCH,
          title: 'Notification 1',
          message: 'Test message 1',
          isRead: false,
        },
      });
      notif1Id = n1.id;

      const n2 = await testPrisma.notification.create({
        data: {
          recipientId: passenger1Id,
          audience: Audience.STUDENT,
          type: NotificationType.BOOKING_APPROVED,
          title: 'Notification 2',
          message: 'Test message 2',
          isRead: false,
        },
      });
      notif2Id = n2.id;
    });

    it('should list notifications with pagination and accurate unread count', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications?page=1&limit=10')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(res.body.notifications.length).toBe(2);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.unreadCount).toBe(2);
    });

    it('should get persistent unread count (/notifications/unread-count)', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(res.body.count).toBe(2);
    });

    it('should mark a single notification as read (PATCH /notifications/:id/read)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/notifications/${notif1Id}/read`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(res.body.isRead).toBe(true);
      expect(res.body.readAt).not.toBeNull();

      // Verify unread count decremented
      const countRes = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(countRes.body.count).toBe(1);
    });

    it('should not allow another user to mark notification as read (404)', async () => {
      await request(app.getHttpServer())
        .patch(`/notifications/${notif1Id}/read`)
        .set('Authorization', `Bearer ${passenger2Token}`)
        .expect(404);
    });

    it('should mark all notifications as read (POST /notifications/mark-all-read)', async () => {
      const res = await request(app.getHttpServer())
        .post('/notifications/mark-all-read')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(res.body.count).toBe(2);

      const countRes = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(countRes.body.count).toBe(0);
    });

    it('should delete a notification (DELETE /notifications/:id)', async () => {
      await request(app.getHttpServer())
        .delete(`/notifications/${notif1Id}`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(listRes.body.notifications.length).toBe(1);
      expect(listRes.body.notifications[0].id).toBe(notif2Id);
    });
  });
});
