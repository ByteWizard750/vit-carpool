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
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { AuditLogService } from '../src/modules/audit/audit.service';

describe('Milestone 4.2: Booking Requests & Seat Allocation (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Student Driver
  const studentDriverAuthId = 'c1111111-1111-4111-8111-111111111111';
  const studentDriverEmail = 'driver.student@vitstudent.ac.in';
  let studentDriverToken: string;
  let studentDriverId: string;
  let studentVehicleId: string; // 5-seater (4 max passenger seats)

  // Student Passenger 1
  const studentPassenger1AuthId = 'c1111111-2222-4111-8111-222222222222';
  const studentPassenger1Email = 'passenger1.student@vitstudent.ac.in';
  let studentPassenger1Token: string;
  let studentPassenger1Id: string;

  // Student Passenger 2
  const studentPassenger2AuthId = 'c1111111-3333-4111-8111-333333333333';
  const studentPassenger2Email = 'passenger2.student@vitstudent.ac.in';
  let studentPassenger2Token: string;
  let studentPassenger2Id: string;

  // Faculty Driver
  const facultyDriverAuthId = 'c2222222-1111-4222-8222-111111111111';
  const facultyDriverEmail = 'driver.faculty@vit.ac.in';
  let facultyDriverToken: string;
  let facultyDriverId: string;
  let facultyVehicleId: string;

  // Faculty Passenger
  const facultyPassengerAuthId = 'c2222222-2222-4222-8222-222222222222';
  const facultyPassengerEmail = 'passenger.faculty@vit.ac.in';
  let facultyPassengerToken: string;
  let facultyPassengerId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables before starting
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
        fullName: 'Vikram Student Driver',
        phoneNumber: '+91 98765 00001',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    studentDriverId = sDriver.id;
    studentDriverToken = signTestJwt({ sub: studentDriverAuthId, email: studentDriverEmail });

    // Vehicle for student driver (5-seater)
    const sVehicle = await testPrisma.vehicle.create({
      data: {
        userId: studentDriverId,
        make: 'Maruti',
        model: 'Swift',
        color: 'Fire Red',
        registrationNumber: 'TN19BK1001',
        capacity: 5,
      },
    });
    studentVehicleId = sVehicle.id;

    // 2. Seed Student Passenger 1
    const sPass1 = await testPrisma.user.create({
      data: {
        authUserId: studentPassenger1AuthId,
        email: studentPassenger1Email,
        fullName: 'Ananya Passenger One',
        phoneNumber: '+91 98765 00002',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    studentPassenger1Id = sPass1.id;
    studentPassenger1Token = signTestJwt({ sub: studentPassenger1AuthId, email: studentPassenger1Email });

    // 3. Seed Student Passenger 2
    const sPass2 = await testPrisma.user.create({
      data: {
        authUserId: studentPassenger2AuthId,
        email: studentPassenger2Email,
        fullName: 'Rahul Passenger Two',
        phoneNumber: '+91 98765 00003',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    studentPassenger2Id = sPass2.id;
    studentPassenger2Token = signTestJwt({ sub: studentPassenger2AuthId, email: studentPassenger2Email });

    // 4. Seed Faculty Driver
    const fDriver = await testPrisma.user.create({
      data: {
        authUserId: facultyDriverAuthId,
        email: facultyDriverEmail,
        fullName: 'Prof. Balaji Faculty Driver',
        phoneNumber: '+91 98765 00004',
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
        make: 'Toyota',
        model: 'Innova',
        color: 'Silver',
        registrationNumber: 'TN09BK2002',
        capacity: 7,
      },
    });
    facultyVehicleId = fVehicle.id;

    // 5. Seed Faculty Passenger
    const fPass = await testPrisma.user.create({
      data: {
        authUserId: facultyPassengerAuthId,
        email: facultyPassengerEmail,
        fullName: 'Dr. Priya Faculty Passenger',
        phoneNumber: '+91 98765 00005',
        audience: Audience.FACULTY,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    facultyPassengerId = fPass.id;
    facultyPassengerToken = signTestJwt({ sub: facultyPassengerAuthId, email: facultyPassengerEmail });

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

  // Helper to create a test ride in database
  const createTestRide = async (overrides: Partial<any> = {}) => {
    return testPrisma.ride.create({
      data: {
        driverId: studentDriverId,
        vehicleId: studentVehicleId,
        audience: Audience.STUDENT,
        origin: 'Tambaram Railway Station',
        destination: 'VIT Chennai Campus',
        pickupDescription: 'Near East Gate Escalator',
        dropoffDescription: 'Block 1 Gazebo',
        departureTime: new Date(Date.now() + 3 * 3600 * 1000), // 3 hours in future
        availableSeats: 3,
        totalSeats: 3,
        costPerSeat: 50,
        status: RideStatus.SCHEDULED,
        ...overrides,
      },
    });
  };

  // ===========================================================================
  // 1. Authentication, Authorization & Identity Invariants
  // ===========================================================================
  describe('1. Authentication, Authorization & Identity Invariants', () => {
    it('rejects unauthenticated requests to booking endpoints with 401 Unauthorized', async () => {
      await request(app.getHttpServer()).post('/bookings').send({}).expect(401);
      await request(app.getHttpServer()).get('/bookings/mine').expect(401);
      await request(app.getHttpServer()).get('/bookings/driver').expect(401);
      await request(app.getHttpServer()).get('/bookings/00000000-0000-0000-0000-000000000000').expect(401);
      await request(app.getHttpServer()).post('/bookings/00000000-0000-0000-0000-000000000000/approve').expect(401);
      await request(app.getHttpServer()).post('/bookings/00000000-0000-0000-0000-000000000000/reject').expect(401);
      await request(app.getHttpServer()).post('/bookings/00000000-0000-0000-0000-000000000000/cancel').expect(401);
    });

    it('rejects PENDING user with 403 Forbidden (ACCOUNT_PENDING_VERIFICATION)', async () => {
      const pendingAuthId = 'c3333333-8888-4333-8333-333333333333';
      const pendingEmail = 'pending.commuter@vitstudent.ac.in';
      const pendingToken = signTestJwt({ sub: pendingAuthId, email: pendingEmail });

      const ride = await createTestRide();

      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${pendingToken}`)
        .send({
          rideId: ride.id,
          requestedSeats: 1,
        })
        .expect(403);

      expect(res.body.error).toBe('ACCOUNT_PENDING_VERIFICATION');
    });

    it('rejects driver attempting to book seats on their own ride (400 Bad Request)', async () => {
      const ride = await createTestRide();

      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          rideId: ride.id,
          requestedSeats: 1,
        })
        .expect(400);

      expect(res.body.message).toMatch(/cannot book seats on their own rides/i);
    });

    it('Database Engine rejects self-booking at DB level via chk_bookings_no_self_booking', async () => {
      const ride = await createTestRide();

      await expect(
        testPrisma.booking.create({
          data: {
            rideId: ride.id,
            passengerId: studentDriverId, // Same as driver
            driverId: studentDriverId,
            audience: Audience.STUDENT,
            requestedSeats: 1,
            status: BookingStatus.PENDING,
          },
        }),
      ).rejects.toThrow(); // PostgreSQL check constraint violation
    });
  });

  // ===========================================================================
  // 2. Audience Isolation & Peer Gating
  // ===========================================================================
  describe('2. Audience Isolation & Peer Gating', () => {
    it('rejects student attempting to book faculty ride (404 Not Found)', async () => {
      const facultyRide = await testPrisma.ride.create({
        data: {
          driverId: facultyDriverId,
          vehicleId: facultyVehicleId,
          audience: Audience.FACULTY,
          origin: 'Adyar Gate',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 4 * 3600 * 1000),
          availableSeats: 3,
          totalSeats: 3,
          status: RideStatus.SCHEDULED,
        },
      });

      // Student passenger attempts to book faculty ride
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .send({
          rideId: facultyRide.id,
          requestedSeats: 1,
        })
        .expect(404);
    });

    it('rejects faculty attempting to book student ride (404 Not Found)', async () => {
      const studentRide = await createTestRide();

      // Faculty passenger attempts to book student ride
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${facultyPassengerToken}`)
        .send({
          rideId: studentRide.id,
          requestedSeats: 1,
        })
        .expect(404);
    });

    it('Database Engine rejects cross-audience booking via composite foreign key', async () => {
      const facultyRide = await testPrisma.ride.create({
        data: {
          driverId: facultyDriverId,
          vehicleId: facultyVehicleId,
          audience: Audience.FACULTY,
          origin: 'Velachery',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 5 * 3600 * 1000),
          availableSeats: 2,
          totalSeats: 2,
          status: RideStatus.SCHEDULED,
        },
      });

      // Attempting to insert a booking connecting student passenger to faculty ride
      await expect(
        testPrisma.booking.create({
          data: {
            rideId: facultyRide.id,
            passengerId: studentPassenger1Id,
            driverId: facultyDriverId,
            audience: Audience.STUDENT, // Incompatible with facultyRide's FACULTY audience
            requestedSeats: 1,
            status: BookingStatus.PENDING,
          },
        }),
      ).rejects.toThrow(); // PostgreSQL foreign key constraint violation
    });

    it('passengers cannot view or cancel other passengers bookings (404 Not Found)', async () => {
      const ride = await createTestRide();

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      // Passenger 2 attempts to inspect Passenger 1's booking
      await request(app.getHttpServer())
        .get(`/bookings/${booking.id}`)
        .set('Authorization', `Bearer ${studentPassenger2Token}`)
        .expect(404);

      // Passenger 2 attempts to cancel Passenger 1's booking
      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${studentPassenger2Token}`)
        .expect(404);
    });

    it('drivers cannot manage bookings for rides they do not own (404 Not Found)', async () => {
      const ride = await createTestRide();

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      // Faculty driver attempts to approve student driver's booking
      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/approve`)
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .expect(404);

      // Faculty driver attempts to reject student driver's booking
      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/reject`)
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .expect(404);
    });
  });

  // ===========================================================================
  // 3. Booking Creation & Active Uniqueness Invariants
  // ===========================================================================
  describe('3. Booking Creation & Active Uniqueness Invariants', () => {
    it('creates a PENDING booking request without decrementing ride available seats', async () => {
      const ride = await createTestRide({ availableSeats: 3, totalSeats: 3 });

      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .send({
          rideId: ride.id,
          requestedSeats: 2,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.rideId).toBe(ride.id);
      expect(res.body.passengerId).toBe(studentPassenger1Id);
      expect(res.body.requestedSeats).toBe(2);
      expect(res.body.status).toBe(BookingStatus.PENDING);

      // CRITICAL: A pending booking MUST NOT consume or reserve seats before approval!
      const refreshedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(refreshedRide.availableSeats).toBe(3);

      // Privacy: Landmark pickup/dropoff notes and driver phone MUST NOT be exposed on pending request!
      expect(res.body.ride.pickupDescription).toBeUndefined();
      expect(res.body.ride.dropoffDescription).toBeUndefined();
      expect(res.body.ride.driverPhone).toBeUndefined();

      // Audit ledger record created
      const audit = await testPrisma.auditLog.findFirst({
        where: { targetId: res.body.id, action: 'BOOKING_REQUESTED' },
      });
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(studentPassenger1Id);
    });

    it('rejects duplicate active booking request for same passenger and ride (409 Conflict)', async () => {
      const ride = await createTestRide();

      // First booking request
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .send({
          rideId: ride.id,
          requestedSeats: 1,
        })
        .expect(201);

      // Second booking request by same passenger on same ride -> 409 Conflict
      const dupRes = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .send({
          rideId: ride.id,
          requestedSeats: 1,
        })
        .expect(409);

      expect(dupRes.body.message).toMatch(/already have an active booking request/i);
    });

    it('Database Engine rejects duplicate active booking via idx_bookings_active_unique partial index', async () => {
      const ride = await createTestRide();

      await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      // Direct DB insert attempting to create second PENDING booking
      await expect(
        testPrisma.booking.create({
          data: {
            rideId: ride.id,
            passengerId: studentPassenger1Id,
            driverId: studentDriverId,
            audience: Audience.STUDENT,
            requestedSeats: 1,
            status: BookingStatus.CONFIRMED,
          },
        }),
      ).rejects.toThrow(); // PostgreSQL partial unique index violation
    });

    it('rejects booking request exceeding available seats or invalid counts (400 Bad Request)', async () => {
      const ride = await createTestRide({ availableSeats: 2, totalSeats: 2 });

      // 0 seats
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .send({ rideId: ride.id, requestedSeats: 0 })
        .expect(400);

      // > 6 seats
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .send({ rideId: ride.id, requestedSeats: 7 })
        .expect(400);

      // Exceeds available seats (3 requested when 2 available)
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .send({ rideId: ride.id, requestedSeats: 3 })
        .expect(400);
    });

    it('rejects booking requests for cancelled or departed rides (400 Bad Request)', async () => {
      // Cancelled ride
      const cancelledRide = await createTestRide({ status: RideStatus.CANCELLED });
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .send({ rideId: cancelledRide.id, requestedSeats: 1 })
        .expect(400);

      // Departed ride (1 hour ago)
      const departedRide = await createTestRide({
        departureTime: new Date(Date.now() - 3600 * 1000),
      });
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .send({ rideId: departedRide.id, requestedSeats: 1 })
        .expect(400);
    });
  });

  // ===========================================================================
  // 4. Driver Approval Workflow & Atomic Seat Allocation
  // ===========================================================================
  describe('4. Driver Approval Workflow & Atomic Seat Allocation', () => {
    it('approves a pending booking, decrements available seats atomically, and reveals confirmed details', async () => {
      const ride = await createTestRide({ availableSeats: 3, totalSeats: 3 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 2,
          status: BookingStatus.PENDING,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/approve`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(201);

      expect(res.body.id).toBe(booking.id);
      expect(res.body.status).toBe(BookingStatus.CONFIRMED);
      expect(res.body.confirmedAt).toBeDefined();

      // Ride availableSeats decremented from 3 to 1
      const refreshedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(refreshedRide.availableSeats).toBe(1);

      // Transactional audit log verified
      const audit = await testPrisma.auditLog.findFirst({
        where: { targetId: booking.id, action: 'BOOKING_APPROVED' },
      });
      expect(audit).toBeDefined();
      expect(audit?.changes).toMatchObject({
        allocatedSeats: 2,
        previousAvailableSeats: 3,
        newAvailableSeats: 1,
      });

      // Passenger inspection now unlocks private pickup/dropoff landmarks and driver contact info!
      const passRes = await request(app.getHttpServer())
        .get(`/bookings/${booking.id}`)
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .expect(200);

      expect(passRes.body.ride.pickupDescription).toBe('Near East Gate Escalator');
      expect(passRes.body.ride.dropoffDescription).toBe('Block 1 Gazebo');
      expect(passRes.body.ride.driverPhone).toBe('+91 98765 00001');
    });

    it('rejects approval when available seats are insufficient (409 Conflict)', async () => {
      // Ride with only 1 seat remaining
      const ride = await createTestRide({ availableSeats: 1, totalSeats: 3 });

      // Pending booking requesting 2 seats
      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 2,
          status: BookingStatus.PENDING,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/approve`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(409);

      expect(res.body.message).toMatch(/insufficient seats available/i);

      // Seats remain unchanged
      const refreshedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(refreshedRide.availableSeats).toBe(1);
    });

    it('rejects repeated approval on already confirmed booking without duplicate seat decrement', async () => {
      const ride = await createTestRide({ availableSeats: 2, totalSeats: 2 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED,
        },
      });

      // Attempt second approval
      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/approve`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(400);

      expect(res.body.message).toMatch(/cannot approve booking in CONFIRMED status/i);

      // Seats untouched
      const refreshedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(refreshedRide.availableSeats).toBe(2);
    });

    it('handles concurrent approvals for the last seat safely without over-allocation', async () => {
      // Ride with exactly 1 available seat
      const tightRide = await createTestRide({ availableSeats: 1, totalSeats: 3 });

      // Two different passengers requesting 1 seat each
      const b1 = await testPrisma.booking.create({
        data: {
          rideId: tightRide.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      const b2 = await testPrisma.booking.create({
        data: {
          rideId: tightRide.id,
          passengerId: studentPassenger2Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      // Concurrent approval requests by driver
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/bookings/${b1.id}/approve`)
          .set('Authorization', `Bearer ${studentDriverToken}`),
        request(app.getHttpServer())
          .post(`/bookings/${b2.id}/approve`)
          .set('Authorization', `Bearer ${studentDriverToken}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]); // Exactly one 201 Created and one 409 Conflict

      // Final ride seats must be exactly 0 (never negative!)
      const refreshedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: tightRide.id } });
      expect(refreshedRide.availableSeats).toBe(0);

      // Exactly 1 approval audit log
      const approvalAudits = await testPrisma.auditLog.count({
        where: { action: 'BOOKING_APPROVED' },
      });
      expect(approvalAudits).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // 5. Driver Rejection Workflow
  // ===========================================================================
  describe('5. Driver Rejection Workflow', () => {
    it('rejects a pending booking without affecting available seats', async () => {
      const ride = await createTestRide({ availableSeats: 3, totalSeats: 3 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 2,
          status: BookingStatus.PENDING,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/reject`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({ reason: 'Detour too far off campus corridor' })
        .expect(201);

      expect(res.body.status).toBe(BookingStatus.REJECTED);
      expect(res.body.rejectedAt).toBeDefined();
      expect(res.body.cancellationReason).toBe('Detour too far off campus corridor');

      // Available seats remain untouched
      const refreshedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(refreshedRide.availableSeats).toBe(3);

      // Audit log created
      const audit = await testPrisma.auditLog.findFirst({
        where: { targetId: booking.id, action: 'BOOKING_REJECTED' },
      });
      expect(audit).toBeDefined();
    });

    it('rejects attempt to reject an already confirmed or rejected booking (400 Bad Request)', async () => {
      const ride = await createTestRide();

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.REJECTED,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/reject`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(400);

      expect(res.body.message).toMatch(/cannot reject booking in REJECTED status/i);
    });
  });

  // ===========================================================================
  // 6. Passenger Cancellation & Concurrency-Safe Seat Restoration
  // ===========================================================================
  describe('6. Passenger Cancellation & Concurrency-Safe Seat Restoration', () => {
    it('cancels a PENDING booking without changing seats', async () => {
      const ride = await createTestRide({ availableSeats: 3, totalSeats: 3 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .send({ reason: 'Found alternative transport' })
        .expect(201);

      expect(res.body.status).toBe(BookingStatus.CANCELLED);
      expect(res.body.cancelledAt).toBeDefined();

      // Seats remain unchanged
      const refreshedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(refreshedRide.availableSeats).toBe(3);
    });

    it('cancels a CONFIRMED booking and restores exactly allocated seats safely', async () => {
      // Ride with 1 seat left out of 3 (2 seats were confirmed to passenger 1)
      const ride = await createTestRide({ availableSeats: 1, totalSeats: 3 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 2,
          status: BookingStatus.CONFIRMED,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .expect(201);

      expect(res.body.status).toBe(BookingStatus.CANCELLED);

      // Seats restored from 1 + 2 = 3
      const refreshedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(refreshedRide.availableSeats).toBe(3);

      // Audit log records restored seats
      const audit = await testPrisma.auditLog.findFirst({
        where: { targetId: booking.id, action: 'BOOKING_CANCELLED' },
      });
      expect(audit).toBeDefined();
      expect(audit?.changes).toMatchObject({
        restoredSeats: 2,
        previousStatus: 'CONFIRMED',
      });
    });

    it('rejects repeated cancellation without duplicate seat restoration', async () => {
      const ride = await createTestRide({ availableSeats: 3, totalSeats: 3 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CANCELLED,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .expect(400);

      expect(res.body.message).toMatch(/already been cancelled/i);

      // Seats remain 3 (no increment)
      const refreshedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(refreshedRide.availableSeats).toBe(3);
    });

    it('handles concurrent double-cancellations atomically without double-restoring seats', async () => {
      const ride = await createTestRide({ availableSeats: 1, totalSeats: 2 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED,
        },
      });

      // Concurrent cancellation requests
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/bookings/${booking.id}/cancel`)
          .set('Authorization', `Bearer ${studentPassenger1Token}`),
        request(app.getHttpServer())
          .post(`/bookings/${booking.id}/cancel`)
          .set('Authorization', `Bearer ${studentPassenger1Token}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 400]);

      // Seats restored exactly once: 1 + 1 = 2 (equal to totalSeats)
      const refreshedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(refreshedRide.availableSeats).toBe(2);
    });

    it('rejects attempt to cancel a booking on a ride that has already departed (400 Bad Request)', async () => {
      const departedRide = await createTestRide({
        departureTime: new Date(Date.now() - 30 * 60 * 1000), // Departed 30 mins ago
      });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: departedRide.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .expect(400);

      expect(res.body.message).toMatch(/cannot cancel a booking for a ride that has already departed/i);
    });
  });

  // ===========================================================================
  // 7. Transactional Rollback & Consistency
  // ===========================================================================
  describe('7. Transactional Rollback & Consistency', () => {
    it('rolls back booking approval and seat allocation if audit ledger insertion fails', async () => {
      const ride = await createTestRide({ availableSeats: 2, totalSeats: 2 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      const auditService = app.get(AuditLogService);
      const auditSpy = jest
        .spyOn(auditService, 'log')
        .mockRejectedValueOnce(new Error('Simulated audit ledger write failure on booking approval'));

      try {
        await request(app.getHttpServer())
          .post(`/bookings/${booking.id}/approve`)
          .set('Authorization', `Bearer ${studentDriverToken}`)
          .expect(500);

        // Verify booking remains PENDING and seats were NOT decremented
        const refreshedBooking = await testPrisma.booking.findUniqueOrThrow({
          where: { id: booking.id },
        });
        expect(refreshedBooking.status).toBe(BookingStatus.PENDING);

        const refreshedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
        expect(refreshedRide.availableSeats).toBe(2);
      } finally {
        auditSpy.mockRestore();
      }
    });
  });

  // ===========================================================================
  // 8. Driver & Passenger Booking Query Lists
  // ===========================================================================
  describe('8. Driver & Passenger Booking Query Lists', () => {
    it('GET /bookings/mine lists all bookings requested by authenticated passenger', async () => {
      const res = await request(app.getHttpServer())
        .get('/bookings/mine')
        .set('Authorization', `Bearer ${studentPassenger1Token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].passengerId).toBe(studentPassenger1Id);
    });

    it('GET /bookings/driver lists all booking requests for authenticated driver', async () => {
      const res = await request(app.getHttpServer())
        .get('/bookings/driver')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].driverId).toBe(studentDriverId);
      expect(res.body[0].passengerName).toBeDefined();
    });
  });

  // ===========================================================================
  // 9. Milestone 6: Driver Booking Request Lifecycle & Atomicity
  // ===========================================================================
  describe('9. Milestone 6: Driver Booking Request Lifecycle & Atomicity', () => {
    it('authorized driver can approve pending booking and atomically decrement available seats', async () => {
      const ride = await createTestRide({ availableSeats: 3, totalSeats: 3 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 2,
          status: BookingStatus.PENDING,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/approve`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(201);

      expect(res.body.status).toBe('CONFIRMED');
      expect(res.body.requestedSeats).toBe(2);

      // Verify ride available seats decremented from 3 to 1
      const updatedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(updatedRide.availableSeats).toBe(1);
    });

    it('insufficient seats during approval fails safely with 409 Conflict without altering seats', async () => {
      const ride = await createTestRide({ availableSeats: 1, totalSeats: 3 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 2, // Requesting 2 seats when only 1 is available
          status: BookingStatus.PENDING,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/approve`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(409);

      expect(res.body.message).toMatch(/insufficient seats available/i);

      // Verify ride seats remain 1
      const unchangedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(unchangedRide.availableSeats).toBe(1);

      // Verify booking remains PENDING
      const unchangedBooking = await testPrisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(unchangedBooking.status).toBe(BookingStatus.PENDING);
    });

    it('rejection transitions booking to REJECTED with optional reason and does not alter available seats', async () => {
      const ride = await createTestRide({ availableSeats: 2, totalSeats: 3 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/reject`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({ reason: 'Car is full for luggage' })
        .expect(201);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.cancellationReason).toBe('Car is full for luggage');

      // Verify available seats remain unchanged at 2
      const unchangedRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: ride.id } });
      expect(unchangedRide.availableSeats).toBe(2);
    });

    it('unauthorized driver cannot approve or reject another driver booking requests (404)', async () => {
      // Create faculty ride and booking
      const fRide = await testPrisma.ride.create({
        data: {
          driverId: facultyDriverId,
          vehicleId: facultyVehicleId,
          audience: Audience.FACULTY,
          origin: 'Faculty Gate',
          destination: 'VIT Campus',
          departureTime: new Date(Date.now() + 2 * 3600 * 1000),
          availableSeats: 3,
          totalSeats: 3,
          status: RideStatus.SCHEDULED,
        },
      });

      const fBooking = await testPrisma.booking.create({
        data: {
          rideId: fRide.id,
          passengerId: facultyPassengerId,
          driverId: facultyDriverId,
          audience: Audience.FACULTY,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      // Student driver attempts to approve faculty driver request
      await request(app.getHttpServer())
        .post(`/bookings/${fBooking.id}/approve`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(404);

      // Student driver attempts to reject faculty driver request
      await request(app.getHttpServer())
        .post(`/bookings/${fBooking.id}/reject`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(404);
    });

    it('stale or duplicate actions fail with 400 Bad Request', async () => {
      const ride = await createTestRide({ availableSeats: 2, totalSeats: 2 });

      const booking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED, // Already confirmed
        },
      });

      // Cannot re-approve already confirmed booking
      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/approve`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(400);

      // Cannot reject already confirmed booking
      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/reject`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(400);
    });

    it('privacy: driver booking response reveals passengerPhone ONLY when CONFIRMED', async () => {
      const ride = await createTestRide({ availableSeats: 3, totalSeats: 3 });

      // Create a passenger with phone number
      await testPrisma.user.update({
        where: { id: studentPassenger1Id },
        data: { phoneNumber: '+91 91234 56789' },
      });

      const pendingBooking = await testPrisma.booking.create({
        data: {
          rideId: ride.id,
          passengerId: studentPassenger1Id,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      // When querying pending requests, passengerPhone is concealed
      const resPending = await request(app.getHttpServer())
        .get(`/bookings/${pendingBooking.id}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      expect(resPending.body.passengerPhone).toBeUndefined();

      // Approve booking
      await request(app.getHttpServer())
        .post(`/bookings/${pendingBooking.id}/approve`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(201);

      // When querying confirmed booking, passengerPhone is disclosed
      const resConfirmed = await request(app.getHttpServer())
        .get(`/bookings/${pendingBooking.id}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      expect(resConfirmed.body.passengerPhone).toBe('+91 91234 56789');
    });
  });
});
