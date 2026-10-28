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
  ReportCategory,
  ReportStatus,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { RideAlertsMatcherService } from '../src/modules/ride-alerts/ride-alerts-matcher.service';

describe('Milestone 13: Trust, Safety, User Blocking, Reporting & Admin Moderation (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Admin User
  const adminAuthId = 'a1111111-0000-4111-8111-000000000000';
  const adminEmail = 'admin.safety@vitstudent.ac.in';
  let adminToken: string;
  let adminId: string;

  // Driver User
  const driverAuthId = 'a1111111-1111-4111-8111-111111111111';
  const driverEmail = 'driver.safety@vitstudent.ac.in';
  let driverToken: string;
  let driverId: string;
  let driverVehicleId: string;

  // Passenger / Rider User
  const riderAuthId = 'a1111111-2222-4111-8111-222222222222';
  const riderEmail = 'rider.safety@vitstudent.ac.in';
  let riderToken: string;
  let riderId: string;

  // Abusive / Target User
  const targetAuthId = 'a1111111-3333-4111-8111-333333333333';
  const targetEmail = 'target.safety@vitstudent.ac.in';
  let targetToken: string;
  let targetId: string;

  // Unrelated User
  const unrelatedAuthId = 'a1111111-4444-4111-8111-444444444444';
  const unrelatedEmail = 'unrelated.safety@vitstudent.ac.in';
  let unrelatedToken: string;
  let unrelatedId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables in reverse dependency order (auditLog is append-only by DB trigger)
    await testPrisma.report.deleteMany();
    await testPrisma.block.deleteMany();
    await testPrisma.message.deleteMany();
    await testPrisma.conversation.deleteMany();
    await testPrisma.driverRating.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.verificationRequest.deleteMany();
    await testPrisma.user.deleteMany();

    // Seed Admin
    const admin = await testPrisma.user.create({
      data: {
        authUserId: adminAuthId,
        email: adminEmail,
        fullName: 'Campus Admin Officer',
        phoneNumber: '+91 98765 00000',
        audience: Audience.FACULTY,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.ADMIN,
      },
    });
    adminId = admin.id;
    adminToken = signTestJwt({ sub: adminAuthId, email: adminEmail });

    // Seed Driver
    const driver = await testPrisma.user.create({
      data: {
        authUserId: driverAuthId,
        email: driverEmail,
        fullName: 'Arun Driver',
        phoneNumber: '+91 98765 11111',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    driverId = driver.id;
    driverToken = signTestJwt({ sub: driverAuthId, email: driverEmail });

    const vehicle = await testPrisma.vehicle.create({
      data: {
        userId: driverId,
        make: 'Tata',
        model: 'Nexon',
        color: 'Daytona Grey',
        registrationNumber: 'TN19CH9999',
        capacity: 4,
      },
    });
    driverVehicleId = vehicle.id;

    // Seed Rider
    const rider = await testPrisma.user.create({
      data: {
        authUserId: riderAuthId,
        email: riderEmail,
        fullName: 'Priya Rider',
        phoneNumber: '+91 98765 22222',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    riderId = rider.id;
    riderToken = signTestJwt({ sub: riderAuthId, email: riderEmail });

    // Seed Target User
    const target = await testPrisma.user.create({
      data: {
        authUserId: targetAuthId,
        email: targetEmail,
        fullName: 'Abusive Member',
        phoneNumber: '+91 98765 33333',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    targetId = target.id;
    targetToken = signTestJwt({ sub: targetAuthId, email: targetEmail });

    // Seed Unrelated User
    const unrelated = await testPrisma.user.create({
      data: {
        authUserId: unrelatedAuthId,
        email: unrelatedEmail,
        fullName: 'Neutral Student',
        phoneNumber: '+91 98765 44444',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    unrelatedId = unrelated.id;
    unrelatedToken = signTestJwt({ sub: unrelatedAuthId, email: unrelatedEmail });

    // Bootstrap Nest App
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
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPrisma) await testPrisma.$disconnect();
  });

  describe('1. User-Blocking Lifecycle & Invariants', () => {
    it('rejects self-blocking', async () => {
      const res = await request(app.getHttpServer())
        .post(`/moderation/blocks/${riderId}`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ reason: 'Self test' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('CANNOT_BLOCK_SELF');
    });

    it('allows a user to block another user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/moderation/blocks/${targetId}`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ reason: 'Harassment and spamming' });

      expect(res.status).toBe(201);
      expect(res.body.blockedId).toBe(targetId);
      expect(res.body.blockerId).toBe(riderId);

      // Verify audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: { action: 'USER_BLOCKED', actorId: riderId, targetId },
      });
      expect(audit).toBeDefined();
    });

    it('handles duplicate block requests idempotently', async () => {
      const res = await request(app.getHttpServer())
        .post(`/moderation/blocks/${targetId}`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ reason: 'Repeated block call' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.blockedId).toBe(targetId);
    });

    it('lists users blocked by the authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/moderation/blocks')
        .set('Authorization', `Bearer ${riderToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].blockedId).toBe(targetId);
      expect(res.body[0].blockedUser.fullName).toBe('Abusive Member');
      // Must not leak private contact info
      expect(res.body[0].phoneNumber).toBeUndefined();
    });

    it('returns mutual block status correctly for both parties', async () => {
      // From rider perspective
      const riderCheck = await request(app.getHttpServer())
        .get(`/moderation/blocks/status/${targetId}`)
        .set('Authorization', `Bearer ${riderToken}`);

      expect(riderCheck.status).toBe(200);
      expect(riderCheck.body.isBlockedByMe).toBe(true);
      expect(riderCheck.body.isBlockedByThem).toBe(false);
      expect(riderCheck.body.isBlockedMutual).toBe(true);

      // From target perspective
      const targetCheck = await request(app.getHttpServer())
        .get(`/moderation/blocks/status/${riderId}`)
        .set('Authorization', `Bearer ${targetToken}`);

      expect(targetCheck.status).toBe(200);
      expect(targetCheck.body.isBlockedByMe).toBe(false);
      expect(targetCheck.body.isBlockedByThem).toBe(true);
      expect(targetCheck.body.isBlockedMutual).toBe(true);
    });

    it('allows blocker to unblock the user', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/moderation/blocks/${targetId}`)
        .set('Authorization', `Bearer ${riderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Check status is now false
      const statusRes = await request(app.getHttpServer())
        .get(`/moderation/blocks/status/${targetId}`)
        .set('Authorization', `Bearer ${riderToken}`);

      expect(statusRes.body.isBlockedMutual).toBe(false);

      // Verify audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: { action: 'USER_UNBLOCKED', actorId: riderId, targetId },
      });
      expect(audit).toBeDefined();
    });
  });

  describe('2. Mutual Invisibility & Interaction Enforcement', () => {
    let testRideId: string;
    let existingBookingId: string;
    let existingConversationId: string;

    beforeAll(async () => {
      // Driver creates a ride
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const rideRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: driverVehicleId,
          origin: 'VIT Chennai Campus',
          originAddress: 'Kelambakkam Vandalur Road',
          originLatitude: 12.8406,
          originLongitude: 80.1534,
          destination: 'Chennai Airport T2',
          destinationAddress: 'Meenambakkam',
          destinationLatitude: 12.9941,
          destinationLongitude: 80.1709,
          departureTime: tomorrow.toISOString(),
          availableSeats: 3,
          costPerSeat: 150,
        });

      testRideId = rideRes.body.id;

      // Rider books a seat before any block
      const bookRes = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          rideId: testRideId,
          requestedSeats: 1,
        });

      existingBookingId = bookRes.body.id;

      // Initialize conversation
      const convRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${existingBookingId}`)
        .set('Authorization', `Bearer ${riderToken}`);

      existingConversationId = convRes.body.id;

      // Now Driver blocks Rider!
      await request(app.getHttpServer())
        .post(`/moderation/blocks/${riderId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ reason: 'Disruptive rider behavior' });
    });

    it('hides blocked driver rides from search results', async () => {
      const searchRes = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${riderToken}`);

      expect(searchRes.status).toBe(200);
      const found = searchRes.body.rides?.find((r: any) => r.id === testRideId);
      expect(found).toBeUndefined();
    });

    it('rejects ride details for mutually blocked driver', async () => {
      const res = await request(app.getHttpServer())
        .get(`/rides/${testRideId}`)
        .set('Authorization', `Bearer ${riderToken}`);

      expect(res.status).toBe(404);
    });

    it('rejects booking creation between mutually blocked users', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          rideId: testRideId,
          requestedSeats: 1,
        });

      expect(res.status).toBe(403);
      expect(res.body.error || res.body.message).toContain('BOOKING_NOT_PERMITTED');
    });

    it('prevents sending chat messages in existing conversation after block', async () => {
      const res = await request(app.getHttpServer())
        .post(`/chat/conversations/${existingConversationId}/messages`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ content: 'Hello are we still riding?' });

      expect(res.status).toBe(403);
      expect(res.body.error || res.body.message).toContain('CONVERSATION_BLOCKED');
    });

    it('marks conversation as readOnly when retrieved', async () => {
      const res = await request(app.getHttpServer())
        .get(`/chat/conversations/${existingConversationId}`)
        .set('Authorization', `Bearer ${riderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isReadOnly).toBe(true);
      expect(res.body.readOnlyReason).toContain('block');
    });

    it('rejects rating creation between mutually blocked users', async () => {
      const res = await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          bookingId: existingBookingId,
          rating: 1,
          review: 'Bad experience with blocked driver',
        });

      expect(res.status).toBe(403);
      expect(res.body.error || res.body.message).toContain('RATING_BLOCKED');
    });

    it('ride alert matching engine excludes alerts created by mutually blocked users', async () => {
      // Rider has created an alert matching Driver's ride route
      const alertRes = await request(app.getHttpServer())
        .post('/ride-alerts')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          origin: 'VIT Chennai Campus',
          originLatitude: 12.8406,
          originLongitude: 80.1534,
          destination: 'Chennai Airport T2',
          destinationLatitude: 12.9941,
          destinationLongitude: 80.1709,
        });

      expect(alertRes.status).toBe(201);
      const alertId = alertRes.body.id;

      // Because Driver and Rider are mutually blocked, Rider's alert must not match Driver's ride
      const ride = await testPrisma.ride.findUnique({ where: { id: testRideId } });
      const matcher = app.get(RideAlertsMatcherService);
      const matchResult = await matcher.matchRideAgainstAlerts(ride!);
      expect(matchResult.matchedCount).toBe(0);

      // Clean up alert
      await request(app.getHttpServer())
        .delete(`/ride-alerts/${alertId}`)
        .set('Authorization', `Bearer ${riderToken}`);
    });
  });

  describe('3. User and Incident Reporting', () => {
    let createdReportId: string;

    it('rejects reporting oneself', async () => {
      const res = await request(app.getHttpServer())
        .post('/moderation/reports')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          reportedUserId: riderId,
          category: 'HARASSMENT',
          description: 'Reporting myself for testing purposes',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('CANNOT_REPORT_SELF');
    });

    it('rejects report with invalid category or too short description', async () => {
      const res = await request(app.getHttpServer())
        .post('/moderation/reports')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          reportedUserId: targetId,
          category: 'INVALID_CATEGORY',
          description: 'Short',
        });

      expect(res.status).toBe(400);
    });

    it('submits a valid incident report successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/moderation/reports')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          reportedUserId: targetId,
          category: 'SAFETY_CONCERN',
          description: 'User repeatedly sent unsafe speed requests and offensive remarks.',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('PENDING');
      expect(res.body.category).toBe('SAFETY_CONCERN');
      createdReportId = res.body.id;

      // Verify audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: { action: 'REPORT_SUBMITTED', actorId: riderId },
      });
      expect(audit).toBeDefined();
    });

    it('rejects duplicate pending report against same target to prevent flood', async () => {
      const res = await request(app.getHttpServer())
        .post('/moderation/reports')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          reportedUserId: targetId,
          category: 'SAFETY_CONCERN',
          description: 'Another duplicate complaint against the exact same user.',
        });

      expect(res.status).toBe(409);
      expect(res.body.error || res.body.message).toContain('DUPLICATE_REPORT');
    });
  });

  describe('4. Administrative Moderation & Role Protection', () => {
    let reportToModerateId: string;

    beforeAll(async () => {
      const rep = await testPrisma.report.findFirst({
        where: { reportedUserId: targetId },
      });
      reportToModerateId = rep!.id;
    });

    it('rejects non-admin from accessing admin reports', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/reports')
        .set('Authorization', `Bearer ${riderToken}`);

      expect(res.status).toBe(403);
    });

    it('allows administrator to list reports', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/reports?status=PENDING')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.reports).toBeDefined();
      expect(res.body.reports.length).toBeGreaterThanOrEqual(1);
    });

    it('allows administrator to view report details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/admin/reports/${reportToModerateId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(reportToModerateId);
      expect(res.body.reporter).toBeDefined();
      expect(res.body.reportedUser).toBeDefined();
    });

    it('allows administrator to mark report as investigating', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/reports/${reportToModerateId}/investigate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('INVESTIGATING');

      // Verify audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: { action: 'REPORT_INVESTIGATING', actorId: adminId, targetId: reportToModerateId },
      });
      expect(audit).toBeDefined();
    });

    it('allows administrator to resolve report with resolution notes', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/reports/${reportToModerateId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'RESOLVED',
          resolutionNotes: 'Investigation completed. Disciplinary warning issued to violator.',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('RESOLVED');
      expect(res.body.resolutionNotes).toContain('Disciplinary warning');

      // Verify audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: { action: 'REPORT_RESOLVED', actorId: adminId, targetId: reportToModerateId },
      });
      expect(audit).toBeDefined();
    });
  });

  describe('5. Account Suspension & Server-Side JWT Invalidation', () => {
    it('prevents administrator from suspending themselves', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/users/${adminId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Accidental self suspension' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('CANNOT_SUSPEND_SELF');
    });

    it('allows administrator to suspend an abusive user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/users/${targetId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Repeated harassment and safety violations' });

      expect(res.status).toBe(200);
      expect(res.body.isSuspended).toBe(true);

      // Verify audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: { action: 'USER_SUSPENDED', actorId: adminId, targetId },
      });
      expect(audit).toBeDefined();
    });

    it('CRITICAL: suspended user with previously issued valid JWT is immediately blocked from protected operations', async () => {
      // The targetToken was minted before suspension!
      // Attempting to post a ride:
      const rideRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${targetToken}`)
        .send({
          originAddress: 'VIT Kelambakkam',
          originLat: 12.84,
          originLng: 80.15,
          destinationAddress: 'Airport',
          destinationLat: 12.99,
          destinationLng: 80.17,
          departureTime: new Date(Date.now() + 86400000).toISOString(),
          availableSeats: 2,
          pricePerSeat: 100,
        });

      expect(rideRes.status).toBe(403);
      expect(rideRes.body.message.toLowerCase()).toContain('suspended');

      // Attempting to request a booking:
      const bookRes = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${targetToken}`)
        .send({
          rideId: 'some-ride-id',
          seatsRequested: 1,
          pickupAddress: 'VIT',
          pickupLat: 12.84,
          pickupLng: 80.15,
          dropoffAddress: 'Airport',
          dropoffLat: 12.99,
          dropoffLng: 80.17,
        });

      expect(bookRes.status).toBe(403);
      expect(bookRes.body.message.toLowerCase()).toContain('suspended');
    });

    it('allows administrator to reinstate a suspended user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/users/${targetId}/reinstate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Formal appeal accepted after moderation review' });

      expect(res.status).toBe(200);
      expect(res.body.isSuspended).toBe(false);

      // Verify audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: { action: 'USER_REINSTATED', actorId: adminId, targetId },
      });
      expect(audit).toBeDefined();

      // Check DB isSuspended is false
      const user = await testPrisma.user.findUnique({ where: { id: targetId } });
      expect(user?.isSuspended).toBe(false);
    });
  });
});
