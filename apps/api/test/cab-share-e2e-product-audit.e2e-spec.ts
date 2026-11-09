import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { PrismaClient, UserRole, VerificationStatus, VerificationMethod, Audience, RideType, BookingStatus, NotificationType } from '@vit-carpool/db';
import { calculateCabFareSplit, isMaterialFareIncrease } from '@vit-carpool/contracts';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';

describe('Milestone D: Cab Sharing End-to-End Product Audit & Stabilisation (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Test identities
  const studentOrganiserId = '10000000-0000-4000-a000-000000000001';
  const studentOrganiserEmail = 'organiser.audit@vitstudent.ac.in';

  const studentPassenger1Id = '10000000-0000-4000-a000-000000000002';
  const studentPassenger1Email = 'passenger1.audit@vitstudent.ac.in';

  const studentPassenger2Id = '10000000-0000-4000-a000-000000000003';
  const studentPassenger2Email = 'passenger2.audit@vitstudent.ac.in';

  const facultyUserId = '10000000-0000-4000-a000-000000000004';
  const facultyUserEmail = 'faculty.audit@vit.ac.in';

  const blockedStudentId = '10000000-0000-4000-a000-000000000005';
  const blockedStudentEmail = 'blocked.audit@vitstudent.ac.in';

  let organiserToken: string;
  let passenger1Token: string;
  let passenger2Token: string;
  let facultyToken: string;
  let blockedStudentToken: string;


  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean test accounts
    const testEmails = [
      studentOrganiserEmail,
      studentPassenger1Email,
      studentPassenger2Email,
      facultyUserEmail,
      blockedStudentEmail,
    ];

    await testPrisma.notification.deleteMany({
      where: { recipient: { email: { in: testEmails } } },
    });
    await testPrisma.block.deleteMany();
    await testPrisma.cabFareAcknowledgement.deleteMany();
    await testPrisma.cabShareDetail.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany({
      where: { driver: { email: { in: testEmails } } },
    });
    await testPrisma.user.deleteMany({
      where: { email: { in: testEmails } },
    });

    // Seed Verified Users
    await testPrisma.user.createMany({
      data: [
        {
          id: studentOrganiserId,
          authUserId: '20000000-0000-4000-a000-000000000001',
          email: studentOrganiserEmail,
          fullName: 'Audit Organiser',
          role: UserRole.USER,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
          audience: Audience.STUDENT,
          verifiedAt: new Date(),
        },
        {
          id: studentPassenger1Id,
          authUserId: '20000000-0000-4000-a000-000000000002',
          email: studentPassenger1Email,
          fullName: 'Audit Passenger One',
          role: UserRole.USER,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
          audience: Audience.STUDENT,
          verifiedAt: new Date(),
        },
        {
          id: studentPassenger2Id,
          authUserId: '20000000-0000-4000-a000-000000000003',
          email: studentPassenger2Email,
          fullName: 'Audit Passenger Two',
          role: UserRole.USER,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
          audience: Audience.STUDENT,
          verifiedAt: new Date(),
        },
        {
          id: facultyUserId,
          authUserId: '20000000-0000-4000-a000-000000000004',
          email: facultyUserEmail,
          fullName: 'Faculty Member',
          role: UserRole.USER,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.ADMIN_OVERRIDE,
          audience: Audience.FACULTY,
          verifiedAt: new Date(),
        },
        {
          id: blockedStudentId,
          authUserId: '20000000-0000-4000-a000-000000000005',
          email: blockedStudentEmail,
          fullName: 'Blocked Peer',
          role: UserRole.USER,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
          audience: Audience.STUDENT,
          verifiedAt: new Date(),
        },
      ],
    });

    // Setup mutual block between Organiser and Blocked Peer
    await testPrisma.block.create({
      data: {
        blockerId: studentOrganiserId,
        blockedId: blockedStudentId,
        reason: 'Harassment during audit test',
      },
    });

    organiserToken = signTestJwt({ sub: '20000000-0000-4000-a000-000000000001', email: studentOrganiserEmail });
    passenger1Token = signTestJwt({ sub: '20000000-0000-4000-a000-000000000002', email: studentPassenger1Email });
    passenger2Token = signTestJwt({ sub: '20000000-0000-4000-a000-000000000003', email: studentPassenger2Email });
    facultyToken = signTestJwt({ sub: '20000000-0000-4000-a000-000000000004', email: facultyUserEmail });
    blockedStudentToken = signTestJwt({ sub: '20000000-0000-4000-a000-000000000005', email: blockedStudentEmail });

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
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    await testPrisma.$disconnect();
  });

  // ===========================================================================
  // 1. Organiser Journey: Publishing, Capacity, & My Rides State Consistency
  // ===========================================================================
  describe('1. Organiser Publishing & Journey Management Lifecycle', () => {
    let createdCabShareId: string;

    it('organizer publishes a shared cab with zero registered vehicles', async () => {
      const departureTime = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      const bookingDeadline = new Date(Date.now() + 1 * 3600 * 1000).toISOString();

      const res = await request(app.getHttpServer())
        .post('/api/rides/cab-share')
        .set('Authorization', `Bearer ${organiserToken}`)
        .send({
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai Campus',
          originAddress: 'GST Road, Tambaram, Chennai',
          originLatitude: 12.9249,
          originLongitude: 80.1000,
          destinationAddress: 'Vandalur-Kelambakkam Road, Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime,
          bookingDeadline,
          totalCapacity: 4,
          estimatedTotalFare: 600,
          cabService: 'Uber Premier Sedan',
          cabBookingRef: 'CRN-AUDIT-987654',
          pickupDescription: 'Wait near West Gate Auto Stand',
        })
        .expect(201);

      createdCabShareId = res.body.id;

      expect(res.body.rideType).toBe('CAB_SHARE');
      expect(res.body.vehicleId).toBeNull();
      expect(res.body.totalSeats).toBe(4);
      // Organiser automatically occupies 1 seat: 4 total - 1 organiser = 3 available for peers
      expect(res.body.availableSeats).toBe(3);
      expect(res.body.cabShare).toBeDefined();
      expect(res.body.cabShare.totalCapacity).toBe(4);
      expect(res.body.cabShare.estimatedTotalFare).toBe(600);
      expect(res.body.cabShare.cabService).toBe('Uber Premier Sedan');
      // Organiser sees their sensitive booking reference
      expect(res.body.cabShare.cabBookingRef).toBe('CRN-AUDIT-987654');
    });

    it('organiser sees the published cab journey in GET /api/rides/mine with cabShare details', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/rides/mine')
        .set('Authorization', `Bearer ${organiserToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const mine = res.body.find((r: any) => r.id === createdCabShareId);
      expect(mine).toBeDefined();
      expect(mine.rideType).toBe('CAB_SHARE');
      expect(mine.availableSeats).toBe(3);
      expect(mine.cabShare).toBeDefined();
      expect(mine.cabShare.totalCapacity).toBe(4);
      expect(mine.cabShare.cabBookingRef).toBe('CRN-AUDIT-987654');
    });

    it('enforces total capacity boundaries (rejects capacity < 2 and > 8)', async () => {
      const depTime = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
      const deadline = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

      // Too small
      await request(app.getHttpServer())
        .post('/api/rides/cab-share')
        .set('Authorization', `Bearer ${organiserToken}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: depTime,
          bookingDeadline: deadline,
          totalCapacity: 1, // Invalid
          estimatedTotalFare: 400,
        })
        .expect(400);

      // Too large
      await request(app.getHttpServer())
        .post('/api/rides/cab-share')
        .set('Authorization', `Bearer ${organiserToken}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: depTime,
          bookingDeadline: deadline,
          totalCapacity: 9, // Invalid
          estimatedTotalFare: 400,
        })
        .expect(400);
    });
  });

  // ===========================================================================
  // 2. Passenger Discovery, Privacy & Cohort Isolation Invariants
  // ===========================================================================
  describe('2. Passenger Discovery, Privacy & Cohort Isolation', () => {
    let cabShareRideId: string;

    beforeAll(async () => {
      const departureTime = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
      const bookingDeadline = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

      const res = await request(app.getHttpServer())
        .post('/api/rides/cab-share')
        .set('Authorization', `Bearer ${organiserToken}`)
        .send({
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai Campus',
          originLatitude: 12.9249,
          originLongitude: 80.1000,
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime,
          bookingDeadline,
          totalCapacity: 4,
          estimatedTotalFare: 400,
          cabService: 'Ola Prime Sedan',
          cabBookingRef: 'OLA-SENSITIVE-SECRET-1234',
        });
      cabShareRideId = res.body.id;
    });

    it('passenger discovers the cab share via GET /api/rides with rideType=CAB_SHARE filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/rides?rideType=CAB_SHARE')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(res.body.rides.length).toBeGreaterThanOrEqual(1);
      const cab = res.body.rides.find((r: any) => r.id === cabShareRideId);
      expect(cab).toBeDefined();
      expect(cab.rideType).toBe('CAB_SHARE');
      expect(cab.availableSeats).toBe(3);
      // Fares: total 400 / 4 capacity = 100 if full, 400 if only 1 participant (the organiser)
      expect(cab.cabShare.estimatedTotalFare).toBe(400);
      expect(cab.cabShare.estimatedPerPersonIfFull).toBe(100);
      expect(cab.cabShare.currentPerPerson).toBe(400);
    });

    it('PRIVACY INVARIANT: cabBookingRef is NEVER leaked in public search or public details', async () => {
      const searchRes = await request(app.getHttpServer())
        .get('/api/rides?rideType=CAB_SHARE')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      const cab = searchRes.body.rides.find((r: any) => r.id === cabShareRideId);
      expect(cab.cabShare.cabBookingRef).toBeUndefined();
      expect(JSON.stringify(searchRes.body)).not.toContain('OLA-SENSITIVE-SECRET-1234');

      const detailsRes = await request(app.getHttpServer())
        .get(`/api/rides/${cabShareRideId}`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(detailsRes.body.cabShare.cabBookingRef).toBeUndefined();
      expect(JSON.stringify(detailsRes.body)).not.toContain('OLA-SENSITIVE-SECRET-1234');
    });

    it('COHORT ISOLATION: Faculty member cannot discover student cab share', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/rides?rideType=CAB_SHARE')
        .set('Authorization', `Bearer ${facultyToken}`)
        .expect(200);

      const found = res.body.rides.find((r: any) => r.id === cabShareRideId);
      expect(found).toBeUndefined();

      // Direct ID query returns 404
      await request(app.getHttpServer())
        .get(`/api/rides/${cabShareRideId}`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .expect(404);
    });

    it('MODERATION BLOCKING: Mutually blocked student cannot discover or access organiser cab share', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/rides?rideType=CAB_SHARE')
        .set('Authorization', `Bearer ${blockedStudentToken}`)
        .expect(200);

      const found = res.body.rides.find((r: any) => r.id === cabShareRideId);
      expect(found).toBeUndefined();

      await request(app.getHttpServer())
        .get(`/api/rides/${cabShareRideId}`)
        .set('Authorization', `Bearer ${blockedStudentToken}`)
        .expect(404);
    });
  });

  // ===========================================================================
  // 3. Complete Booking & Seat Allocation Workflow
  // ===========================================================================
  describe('3. Booking Lifecycle, Atomic Capacity & Approval Workflow', () => {
    let cabShareId: string;
    let passenger1BookingId: string;
    let passenger2BookingId: string;

    beforeAll(async () => {
      const departureTime = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
      const bookingDeadline = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

      const res = await request(app.getHttpServer())
        .post('/api/rides/cab-share')
        .set('Authorization', `Bearer ${organiserToken}`)
        .send({
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai Campus',
          departureTime,
          bookingDeadline,
          totalCapacity: 3, // Organiser occupies 1 seat, leaves 2 passenger seats
          estimatedTotalFare: 300,
          cabService: 'FastTrack Taxi',
        });
      cabShareId = res.body.id;
    });

    it('rejects organiser attempting to book seats on their own cab share', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${organiserToken}`)
        .send({
          rideId: cabShareId,
          requestedSeats: 1,
        })
        .expect(400);

      expect(res.body.message).toMatch(/cannot book seats on (your|their) own/i);
    });

    it('passenger 1 requests 1 seat: creates PENDING booking without decrementing seats prematurely', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          rideId: cabShareId,
          requestedSeats: 1,
          pickupDescription: 'Will wait at West Gate',
        })
        .expect(201);

      passenger1BookingId = res.body.id;
      expect(res.body.status).toBe('PENDING');
      expect(res.body.ride.rideType).toBe('CAB_SHARE');

      // Verify ride available seats remains 2 while pending
      const checkRide = await request(app.getHttpServer())
        .get(`/api/rides/${cabShareId}`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);
      expect(checkRide.body.availableSeats).toBe(2);
    });

    it('rejects duplicate booking from same passenger while previous booking is active', async () => {
      await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          rideId: cabShareId,
          requestedSeats: 1,
        })
        .expect(409);
    });

    it('passenger 2 requests remaining 2 seats', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${passenger2Token}`)
        .send({
          rideId: cabShareId,
          requestedSeats: 2,
        })
        .expect(201);
      passenger2BookingId = res.body.id;
    });

    it('organiser approves Passenger 1: availableSeats atomically decrements from 2 to 1', async () => {
      await request(app.getHttpServer())
        .post(`/api/bookings/${passenger1BookingId}/approve`)
        .set('Authorization', `Bearer ${organiserToken}`)
        .expect(201);

      const checkRide = await request(app.getHttpServer())
        .get(`/api/rides/${cabShareId}`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      expect(checkRide.body.availableSeats).toBe(1);
      // Confirmed participants = 1 organiser + 1 confirmed passenger = 2 participants
      // ₹300 / 2 = ₹150 / person
      expect(checkRide.body.cabShare.totalConfirmedParticipants).toBe(2);
      expect(checkRide.body.cabShare.currentPerPerson).toBe(150);
    });

    it('attempting to approve Passenger 2 (requested 2 seats) fails safely with 409 Conflict (insufficient seats)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/bookings/${passenger2BookingId}/approve`)
        .set('Authorization', `Bearer ${organiserToken}`)
        .expect(409);

      expect(res.body.message).toMatch(/insufficient seats/i);
    });

    it('non-organiser cannot approve or reject bookings (404/403 access control)', async () => {
      await request(app.getHttpServer())
        .post(`/api/bookings/${passenger2BookingId}/approve`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(404);
    });
  });

  // ===========================================================================
  // 4. Material Fare Revisions & Explicit Acknowledgement Invariants
  // ===========================================================================
  describe('4. Fare Revisions & Explicit Passenger Acknowledgement Integrity', () => {
    let cabShareId: string;
    let confirmedBookingId: string;

    beforeAll(async () => {
      const departureTime = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
      const bookingDeadline = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

      const res = await request(app.getHttpServer())
        .post('/api/rides/cab-share')
        .set('Authorization', `Bearer ${organiserToken}`)
        .send({
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai Campus',
          departureTime,
          bookingDeadline,
          totalCapacity: 4,
          estimatedTotalFare: 400,
          cabService: 'Uber Premier',
        });
      cabShareId = res.body.id;

      // Passenger 1 books and organiser approves
      const bRes = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({ rideId: cabShareId, requestedSeats: 1 });
      confirmedBookingId = bRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/bookings/${confirmedBookingId}/approve`)
        .set('Authorization', `Bearer ${organiserToken}`);
    });

    it('minor non-material fare change (e.g. +₹10) updates total fare without incrementing fareRevision', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/rides/${cabShareId}/cab-fare`)
        .set('Authorization', `Bearer ${organiserToken}`)
        .send({
          finalTotalFare: 410,
          reason: 'Minor toll rounding',
        })
        .expect(200);

      expect(res.body.cabShare.finalTotalFare).toBe(410);
      expect(res.body.cabShare.fareRevision).toBe(1); // Not incremented
    });

    it('material fare change (> 15% / > ₹50/pax, e.g. ₹560) increments fareRevision to 2 and notifies passenger', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/rides/${cabShareId}/cab-fare`)
        .set('Authorization', `Bearer ${organiserToken}`)
        .send({
          finalTotalFare: 560,
          reason: 'Meter showed peak surcharge and airport toll',
        })
        .expect(200);

      expect(res.body.cabShare.finalTotalFare).toBe(560);
      expect(res.body.cabShare.fareRevision).toBe(2);

      // Verify notification generated for confirmed passenger
      const notifs = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      const fareNotif = notifs.body.notifications.find((n: any) => n.type === 'CAB_FARE_UPDATED');
      expect(fareNotif).toBeDefined();
      expect(fareNotif.message).toContain('₹560');
    });

    it('passenger views their booking in GET /api/bookings/mine: shows unacknowledged fare revision (fareRevisionAcknowledged = null)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/bookings/mine')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      const b = res.body.find((item: any) => item.id === confirmedBookingId);
      expect(b).toBeDefined();
      expect(b.ride.cabShare.fareRevision).toBe(2);
      expect(b.fareRevisionAcknowledged).toBeNull();
    });

    it('STALE FARE ACKNOWLEDGEMENT: rejects passenger attempting to acknowledge an outdated revision (revision 1 < current 2)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/bookings/${confirmedBookingId}/cab-fare/acknowledge`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          fareRevision: 1, // Outdated!
        })
        .expect(400);

      expect(res.body.message).toMatch(/outdated fare revision/i);
    });

    it('FUTURE FARE ACKNOWLEDGEMENT: rejects passenger attempting to acknowledge a future revision (revision 99 > current 2)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/bookings/${confirmedBookingId}/cab-fare/acknowledge`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          fareRevision: 99, // Future/invalid
        })
        .expect(400);

      expect(res.body.message).toMatch(/future or invalid fare revision/i);
    });

    it('passenger explicitly acknowledges revision 2 successfully', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/bookings/${confirmedBookingId}/cab-fare/acknowledge`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          fareRevision: 2,
        })
        .expect(200);

      expect(res.body.acknowledged).toBe(true);
      expect(res.body.fareRevision).toBe(2);

      // Verify GET /api/bookings/mine now reflects fareRevisionAcknowledged = 2
      const mineRes = await request(app.getHttpServer())
        .get('/api/bookings/mine')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      const b = mineRes.body.find((item: any) => item.id === confirmedBookingId);
      expect(b.fareRevisionAcknowledged).toBe(2);
    });

    it('idempotent acknowledgement: repeated submission of the current revision succeeds without error or duplicate rows', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/bookings/${confirmedBookingId}/cab-fare/acknowledge`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          fareRevision: 2,
        })
        .expect(200);

      expect(res.body.acknowledged).toBe(true);

      const count = await testPrisma.cabFareAcknowledgement.count({
        where: { bookingId: confirmedBookingId, fareRevision: 2 },
      });
      expect(count).toBe(1);
    });
  });

  // ===========================================================================
  // 5. Organiser Cancellation & Cascaded Booking Invariants
  // ===========================================================================
  describe('5. Organiser Cancellation & Cascaded Integrity', () => {
    let cabShareId: string;
    let confirmedBookingId: string;

    beforeAll(async () => {
      const departureTime = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
      const bookingDeadline = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

      const res = await request(app.getHttpServer())
        .post('/api/rides/cab-share')
        .set('Authorization', `Bearer ${organiserToken}`)
        .send({
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai Campus',
          departureTime,
          bookingDeadline,
          totalCapacity: 4,
          estimatedTotalFare: 400,
          cabService: 'Uber Premier',
        });
      cabShareId = res.body.id;

      const bRes = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({ rideId: cabShareId, requestedSeats: 1 });
      confirmedBookingId = bRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/bookings/${confirmedBookingId}/approve`)
        .set('Authorization', `Bearer ${organiserToken}`);
    });

    it('cancelling cab share journey transitions ride and active passenger bookings to CANCELLED atomically', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/rides/${cabShareId}/cancel`)
        .set('Authorization', `Bearer ${organiserToken}`)
        .expect(201);

      expect(res.body.status).toBe('CANCELLED');

      // Passenger booking state in DB is CANCELLED with organiser reason
      const booking = await testPrisma.booking.findUnique({
        where: { id: confirmedBookingId },
      });
      expect(booking?.status).toBe(BookingStatus.CANCELLED);
      expect(booking?.cancellationReason).toContain('organiser');

      // Passenger received cancellation notification
      const notifs = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${passenger1Token}`)
        .expect(200);

      const cancelNotif = notifs.body.notifications.find((n: any) => n.type === 'RIDE_CANCELLED');
      expect(cancelNotif).toBeDefined();
      expect(cancelNotif.title).toBe('❌ Shared Cab Cancelled by Organiser');
      expect(cancelNotif.message).toContain('cancelled by the organiser');
    });

    it('rejects updating cab fare on a cancelled journey', async () => {
      await request(app.getHttpServer())
        .patch(`/api/rides/${cabShareId}/cab-fare`)
        .set('Authorization', `Bearer ${organiserToken}`)
        .send({
          finalTotalFare: 500,
        })
        .expect(400);
    });

    it('rejects acknowledging fare revision on a cancelled journey', async () => {
      await request(app.getHttpServer())
        .post(`/api/bookings/${confirmedBookingId}/cab-fare/acknowledge`)
        .set('Authorization', `Bearer ${passenger1Token}`)
        .send({
          fareRevision: 1,
        })
        .expect(400);
    });
  });
});
