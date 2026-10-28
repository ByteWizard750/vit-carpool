import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  Prisma,
  UserRole,
  VerificationStatus,
  Audience,
  VerificationMethod,
  RideStatus,
  BookingStatus,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { AuditLogService } from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Milestone 3.2: Ride Publishing & Management (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Verified student driver
  const studentDriverAuthId = 'ba111111-2222-4111-8111-111111111111';
  const studentDriverEmail = 'student.driver@vitstudent.ac.in';
  let studentDriverToken: string;
  let studentDriverId: string;
  let studentVehicleId: string; // 5-seater (4 passenger seats max)

  // Verified student rider
  const studentRiderAuthId = 'ba111111-3333-4111-8111-111111111111';
  const studentRiderEmail = 'student.rider@vitstudent.ac.in';
  let studentRiderToken: string;
  let studentRiderId: string;

  // Verified faculty driver
  const facultyDriverAuthId = 'ba222222-4444-4222-8222-222222222222';
  const facultyDriverEmail = 'faculty.driver@vit.ac.in';
  let facultyDriverToken: string;
  let facultyDriverId: string;
  let facultyVehicleId: string; // 4-seater (3 passenger seats max)

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables before starting
    await testPrisma.booking.deleteMany();
    await testPrisma.recurringCommute.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.verificationRequest.deleteMany();
    await testPrisma.user.deleteMany();

    // 1. Seed verified student driver
    const sDriver = await testPrisma.user.create({
      data: {
        authUserId: studentDriverAuthId,
        email: studentDriverEmail,
        fullName: 'Arjun Student Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    studentDriverId = sDriver.id;
    studentDriverToken = signTestJwt({ sub: studentDriverAuthId, email: studentDriverEmail });

    // Vehicle for student driver: 5-seater
    const sVehicle = await testPrisma.vehicle.create({
      data: {
        userId: studentDriverId,
        make: 'Hyundai',
        model: 'i20',
        color: 'Polar White',
        registrationNumber: 'TN19AA5001',
        capacity: 5,
      },
    });
    studentVehicleId = sVehicle.id;

    // 2. Seed verified student rider
    const sRider = await testPrisma.user.create({
      data: {
        authUserId: studentRiderAuthId,
        email: studentRiderEmail,
        fullName: 'Kavya Student Rider',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    studentRiderId = sRider.id;
    studentRiderToken = signTestJwt({ sub: studentRiderAuthId, email: studentRiderEmail });

    // 3. Seed verified faculty driver
    const fDriver = await testPrisma.user.create({
      data: {
        authUserId: facultyDriverAuthId,
        email: facultyDriverEmail,
        fullName: 'Dr. Ramesh Faculty Driver',
        audience: Audience.FACULTY,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    facultyDriverId = fDriver.id;
    facultyDriverToken = signTestJwt({ sub: facultyDriverAuthId, email: facultyDriverEmail });

    // Vehicle for faculty driver: 4-seater
    const fVehicle = await testPrisma.vehicle.create({
      data: {
        userId: facultyDriverId,
        make: 'Honda',
        model: 'Amaze',
        color: 'Lunar Silver',
        registrationNumber: 'TN02BB6002',
        capacity: 4,
      },
    });
    facultyVehicleId = fVehicle.id;

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

  // Helper: Generates a departure time N hours in the future
  const getFutureDeparture = (hoursAhead: number = 2): string => {
    return new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();
  };

  // ===========================================================================
  // 1. Authentication & Account Eligibility Gates
  // ===========================================================================
  describe('1. Authentication & Account Eligibility Gates', () => {
    it('rejects unauthenticated requests to ride endpoints with 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/rides/mine').expect(401);
      await request(app.getHttpServer()).post('/rides').send({}).expect(401);
      await request(app.getHttpServer()).get('/rides/00000000-0000-0000-0000-000000000000').expect(401);
      await request(app.getHttpServer()).patch('/rides/00000000-0000-0000-0000-000000000000').send({}).expect(401);
      await request(app.getHttpServer()).delete('/rides/00000000-0000-0000-0000-000000000000').expect(401);
    });

    it('rejects PENDING user with 403 Forbidden (ACCOUNT_PENDING_VERIFICATION)', async () => {
      const pendingAuthId = 'ba333333-8888-4333-8333-333333333333';
      const pendingEmail = 'pending.driver@vitstudent.ac.in';
      const pendingToken = signTestJwt({ sub: pendingAuthId, email: pendingEmail });

      const res = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${pendingToken}`)
        .send({
          vehicleId: studentVehicleId,
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: getFutureDeparture(3),
          availableSeats: 3,
        })
        .expect(403);

      expect(res.body.error).toBe('ACCOUNT_PENDING_VERIFICATION');
    });

    it('rejects SUSPENDED user with 403 Forbidden (ACCOUNT_SUSPENDED)', async () => {
      const suspendedAuthId = 'ba444444-8888-4444-8444-444444444444';
      const suspendedEmail = 'suspended.commuter@vitstudent.ac.in';
      const suspendedToken = signTestJwt({ sub: suspendedAuthId, email: suspendedEmail });

      await testPrisma.user.create({
        data: {
          authUserId: suspendedAuthId,
          email: suspendedEmail,
          fullName: 'Suspended Commuter',
          audience: Audience.STUDENT,
          verificationStatus: VerificationStatus.SUSPENDED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .get('/rides/mine')
        .set('Authorization', `Bearer ${suspendedToken}`)
        .expect(403);

      expect(res.body.error).toBe('ACCOUNT_SUSPENDED');
    });
  });

  // ===========================================================================
  // 2. Input Validation & Strict Schema Enforcement
  // ===========================================================================
  describe('2. Input Validation & Strict Schema Enforcement', () => {
    it('rejects client attempts to inject driverId, audience, or status (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentVehicleId,
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: getFutureDeparture(2),
          availableSeats: 3,
          driverId: facultyDriverId, // Tampering attempt
          audience: Audience.FACULTY, // Cross-audience tampering attempt
          status: 'COMPLETED', // Status tampering attempt
        })
        .expect(400);

      expect(res.body.message).toMatch(/driverId|audience|status|unrecognized/i);
    });

    it('rejects invalid availableSeats counts (0, negative, > 6) with 400 Bad Request', async () => {
      // 0 seats
      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentVehicleId,
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: getFutureDeparture(2),
          availableSeats: 0,
        })
        .expect(400);

      // > 6 seats
      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentVehicleId,
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: getFutureDeparture(2),
          availableSeats: 7,
        })
        .expect(400);
    });

    it('rejects negative costPerSeat or costPerSeat > 1000 with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentVehicleId,
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: getFutureDeparture(2),
          availableSeats: 3,
          costPerSeat: -50,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentVehicleId,
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: getFutureDeparture(2),
          availableSeats: 3,
          costPerSeat: 1500, // Above non-commercial campus ceiling
        })
        .expect(400);
    });

    it('rejects past departure times or times less than 10 minutes in the future', async () => {
      // Past time
      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentVehicleId,
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() - 3600 * 1000).toISOString(),
          availableSeats: 3,
        })
        .expect(400);

      // 5 minutes in future (less than 10-minute threshold)
      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentVehicleId,
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          availableSeats: 3,
        })
        .expect(400);
    });
  });

  // ===========================================================================
  // 3. Vehicle Ownership & Passenger Capacity Rules
  // ===========================================================================
  describe('3. Vehicle Ownership & Passenger Capacity Rules', () => {
    it('rejects ride publication using another user vehicle (400 Bad Request)', async () => {
      // Student driver attempts to publish ride using faculty vehicle
      const res = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: facultyVehicleId, // Belongs to Dr. Ramesh
          origin: 'Velachery',
          destination: 'VIT Chennai',
          departureTime: getFutureDeparture(3),
          availableSeats: 2,
        })
        .expect(400);

      expect(res.body.message).toMatch(/not found|does not belong to you/i);
    });

    it('rejects ride publication using a soft-deleted vehicle (400 Bad Request)', async () => {
      // Create and delete a vehicle
      const tempVehicle = await testPrisma.vehicle.create({
        data: {
          userId: studentDriverId,
          make: 'Maruti',
          model: 'WagonR',
          color: 'Silver',
          registrationNumber: 'TN11DEL001',
          capacity: 4,
          deletedAt: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: tempVehicle.id,
          origin: 'Guindy',
          destination: 'VIT Chennai',
          departureTime: getFutureDeparture(3),
          availableSeats: 2,
        })
        .expect(400);

      expect(res.body.message).toMatch(/not found|deactivated/i);
    });

    it('enforces vehicle passenger capacity ceiling (vehicle capacity includes driver)', async () => {
      // Student vehicle has capacity 5 (1 driver + max 4 passenger seats)
      // Attempting to offer 5 passenger seats must be rejected
      const res = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentVehicleId,
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: getFutureDeparture(3),
          availableSeats: 5, // Exceeds capacity - 1 = 4
        })
        .expect(400);

      expect(res.body.message).toMatch(/cannot offer more than 4 passenger seats/i);
    });
  });

  // ===========================================================================
  // 4. Successful Ride Publishing & Audience Derivation
  // ===========================================================================
  describe('4. Successful Ride Publishing & Audience Derivation', () => {
    let publishedStudentRideId: string;

    it('publishes a ride successfully and derives audience strictly from database record', async () => {
      const departureTime = getFutureDeparture(4);
      const res = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentVehicleId,
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai Main Campus',
          pickupDescription: 'Near East Tambaram Bus Stop',
          dropoffDescription: 'Campus Gazebo / Academic Block 1',
          departureTime,
          availableSeats: 3,
          costPerSeat: 60,
        })
        .expect(201);

      publishedStudentRideId = res.body.id;
      expect(res.body.id).toBeDefined();
      expect(res.body.driverId).toBe(studentDriverId);
      expect(res.body.audience).toBe(Audience.STUDENT); // Authoritative audience derived
      expect(res.body.status).toBe(RideStatus.SCHEDULED);
      expect(res.body.availableSeats).toBe(3);
      expect(res.body.costPerSeat).toBe(60);
      expect(res.body.vehicle?.make).toBe('Hyundai');
      expect(res.body.vehicle?.registrationNumber).toBe('TN19AA5001');

      // Verify transactional audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: {
          targetId: publishedStudentRideId,
          action: 'RIDE_PUBLISHED',
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(studentDriverId);
    });

    it('GET /rides/mine returns all rides published by the driver', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides/mine')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const myRide = res.body.find((r: any) => r.id === publishedStudentRideId);
      expect(myRide).toBeDefined();
      expect(myRide.driverId).toBe(studentDriverId);
      expect(myRide.vehicle.make).toBe('Hyundai');
    });

    it('GET /rides/:id provides privacy-preserving view to eligible peer rider of matching audience', async () => {
      // Student rider views student driver's ride
      const res = await request(app.getHttpServer())
        .get(`/rides/${publishedStudentRideId}`)
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      expect(res.body.id).toBe(publishedStudentRideId);
      expect(res.body.driverName).toBe('Arjun Student Driver');
      expect(res.body.audience).toBe(Audience.STUDENT);
      expect(res.body.origin).toBe('Tambaram Railway Station');

      // Privacy verification: Vehicle registration number, private pickup/dropoff notes, and driver email/phone are NOT exposed to peer searcher!
      expect(res.body.vehicle).toBeDefined();
      expect(res.body.vehicle.make).toBe('Hyundai');
      expect(res.body.vehicle.registrationNumber).toBeUndefined();
      expect(res.body.pickupDescription).toBeUndefined();
      expect(res.body.dropoffDescription).toBeUndefined();
      expect(res.body.driverEmail).toBeUndefined();
      expect(res.body.driverPhone).toBeUndefined();
    });

    it('GET /rides/:id enforces strict audience isolation (Faculty receives 404 for Student ride)', async () => {
      // Faculty member attempts to access Student ride
      await request(app.getHttpServer())
        .get(`/rides/${publishedStudentRideId}`)
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .expect(404);
    });

    it('GET /rides/:id enforces strict audience isolation (Student receives 404 for Faculty ride)', async () => {
      // Seed a faculty ride
      const facultyRide = await testPrisma.ride.create({
        data: {
          driverId: facultyDriverId,
          vehicleId: facultyVehicleId,
          audience: Audience.FACULTY,
          origin: 'Velachery',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 4 * 3600 * 1000),
          availableSeats: 3,
        },
      });

      // Student attempts to access Faculty ride
      await request(app.getHttpServer())
        .get(`/rides/${facultyRide.id}`)
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(404);
    });
  });

  // ===========================================================================
  // 5. Ride Modification & Departure Lock Policy
  // ===========================================================================
  describe('5. Ride Modification & Departure Lock Policy', () => {
    let rideToEditId: string;

    beforeEach(async () => {
      const r = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Adyar',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours in future
          availableSeats: 3,
          costPerSeat: 80,
          status: RideStatus.SCHEDULED,
        },
      });
      rideToEditId = r.id;
    });

    it('allows driver to update origin, destination, seats, and cost share', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/rides/${rideToEditId}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          origin: 'Adyar Bus Depot',
          availableSeats: 2,
          costPerSeat: 70,
        })
        .expect(200);

      expect(res.body.origin).toBe('Adyar Bus Depot');
      expect(res.body.availableSeats).toBe(2);
      expect(res.body.costPerSeat).toBe(70);

      // Verify audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: { targetId: rideToEditId, action: 'RIDE_UPDATED' },
      });
      expect(audit).toBeDefined();
    });

    it('rejects update attempt by another driver (404 Not Found)', async () => {
      // Faculty driver attempts to modify student ride
      await request(app.getHttpServer())
        .patch(`/rides/${rideToEditId}`)
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .send({ origin: 'Hacked Origin' })
        .expect(404);

      // Same-audience peer (student rider) also attempts to modify student ride -> 404
      await request(app.getHttpServer())
        .patch(`/rides/${rideToEditId}`)
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .send({ origin: 'Hacked Peer Origin' })
        .expect(404);

      // Verify ride was not changed
      const r = await testPrisma.ride.findUniqueOrThrow({ where: { id: rideToEditId } });
      expect(r.origin).toBe('Adyar');
    });

    it('rejects update exceeding vehicle passenger capacity (400 Bad Request)', async () => {
      // Student vehicle has capacity 5 (max 4 passenger seats)
      const res = await request(app.getHttpServer())
        .patch(`/rides/${rideToEditId}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({ availableSeats: 5 })
        .expect(400);

      expect(res.body.message).toMatch(/cannot offer more than 4 passenger seats/i);
    });

    it('enforces 15-minute departure lock policy (rejects edit within 15 mins of departure)', async () => {
      // Move departure time to 10 minutes in the future
      await testPrisma.ride.update({
        where: { id: rideToEditId },
        data: { departureTime: new Date(Date.now() + 10 * 60 * 1000) },
      });

      const res = await request(app.getHttpServer())
        .patch(`/rides/${rideToEditId}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({ availableSeats: 1 })
        .expect(400);

      expect(res.body.message).toMatch(/cannot be modified within 15 minutes of departure/i);
    });

    it('handles concurrent ride edits safely without inconsistent state', async () => {
      const concurrentEditRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Besant Nagar',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 4 * 3600 * 1000),
          availableSeats: 3,
          costPerSeat: 50,
          status: RideStatus.SCHEDULED,
        },
      });

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/rides/${concurrentEditRide.id}`)
          .set('Authorization', `Bearer ${studentDriverToken}`)
          .send({ origin: 'Besant Nagar Beach' }),
        request(app.getHttpServer())
          .patch(`/rides/${concurrentEditRide.id}`)
          .set('Authorization', `Bearer ${studentDriverToken}`)
          .send({ costPerSeat: 65 }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const refreshed = await testPrisma.ride.findUniqueOrThrow({
        where: { id: concurrentEditRide.id },
      });
      expect(refreshed.origin).toBe('Besant Nagar Beach');
      expect(refreshed.costPerSeat).toBe(65);

      const editAudits = await testPrisma.auditLog.count({
        where: { targetId: concurrentEditRide.id, action: 'RIDE_UPDATED' },
      });
      expect(editAudits).toBe(2);
    });
  });

  // ===========================================================================
  // 6. Ride Cancellation & Terminal State Policy
  // ===========================================================================
  describe('6. Ride Cancellation & Terminal State Policy', () => {
    let rideToCancelId: string;

    beforeEach(async () => {
      const r = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Sholinganallur',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
          availableSeats: 3,
          status: RideStatus.SCHEDULED,
        },
      });
      rideToCancelId = r.id;
    });

    it('cancels scheduled ride and transitions status to CANCELLED via DELETE /rides/:id', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/rides/${rideToCancelId}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      expect(res.body.status).toBe(RideStatus.CANCELLED);

      // Verify database record
      const r = await testPrisma.ride.findUniqueOrThrow({ where: { id: rideToCancelId } });
      expect(r.status).toBe(RideStatus.CANCELLED);

      // Verify audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: { targetId: rideToCancelId, action: 'RIDE_CANCELLED' },
      });
      expect(audit).toBeDefined();
    });

    it('cancels scheduled ride and transitions status to CANCELLED via POST /rides/:id/cancel', async () => {
      const postCancelRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Thiruvanmiyur',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
          availableSeats: 2,
          status: RideStatus.SCHEDULED,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/rides/${postCancelRide.id}/cancel`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(201);

      expect(res.body.status).toBe(RideStatus.CANCELLED);

      const r = await testPrisma.ride.findUniqueOrThrow({ where: { id: postCancelRide.id } });
      expect(r.status).toBe(RideStatus.CANCELLED);
    });

    it('rejects attempt to cancel a ride that has already departed (400 Bad Request)', async () => {
      const departedRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Central',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() - 30 * 60 * 1000), // Departed 30 mins ago
          availableSeats: 2,
          status: RideStatus.SCHEDULED,
        },
      });

      const res = await request(app.getHttpServer())
        .delete(`/rides/${departedRide.id}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(400);

      expect(res.body.message).toMatch(/cannot cancel a ride that has already departed/i);
    });

    it('rejects attempt to modify or re-cancel an already cancelled ride (400 Bad Request)', async () => {
      // Cancel the ride first
      await testPrisma.ride.update({
        where: { id: rideToCancelId },
        data: { status: RideStatus.CANCELLED },
      });

      // Attempt update
      const editRes = await request(app.getHttpServer())
        .patch(`/rides/${rideToCancelId}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({ origin: 'Tambaram' })
        .expect(400);
      expect(editRes.body.message).toMatch(/already been cancelled/i);

      // Attempt re-cancel
      const cancelRes = await request(app.getHttpServer())
        .delete(`/rides/${rideToCancelId}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(400);
      expect(cancelRes.body.message).toMatch(/already cancelled/i);
    });

    it('blocks vehicle deletion while an active scheduled ride references it (409 Conflict)', async () => {
      // studentVehicleId is referenced by a scheduled ride in the future
      const res = await request(app.getHttpServer())
        .delete(`/vehicles/${studentVehicleId}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(409);

      expect(res.body.error).toBe('VEHICLE_HAS_SCHEDULED_RIDES');

      // Vehicle was NOT deleted
      const v = await testPrisma.vehicle.findUniqueOrThrow({ where: { id: studentVehicleId } });
      expect(v.deletedAt).toBeNull();
    });

    it('permits vehicle deletion once all rides referencing it are cancelled or completed', async () => {
      const disposableVehicle = await testPrisma.vehicle.create({
        data: {
          userId: studentDriverId,
          make: 'Tata',
          model: 'Altroz',
          color: 'Blue',
          registrationNumber: 'TN22CANC01',
          capacity: 5,
        },
      });

      const disposableRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: disposableVehicle.id,
          audience: Audience.STUDENT,
          origin: 'Kotturpuram',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 2 * 3600 * 1000),
          availableSeats: 3,
          status: RideStatus.CANCELLED, // Already cancelled
        },
      });

      const res = await request(app.getHttpServer())
        .delete(`/vehicles/${disposableVehicle.id}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const v = await testPrisma.vehicle.findUniqueOrThrow({ where: { id: disposableVehicle.id } });
      expect(v.deletedAt).not.toBeNull();
    });

    it('rejects attempt to cancel another user ride (404 Not Found)', async () => {
      // Faculty driver attempts to cancel student ride
      await request(app.getHttpServer())
        .delete(`/rides/${rideToCancelId}`)
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .expect(404);

      // Same-audience peer (student rider) attempts to cancel student ride
      await request(app.getHttpServer())
        .delete(`/rides/${rideToCancelId}`)
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(404);

      // Verify ride remains SCHEDULED
      const r = await testPrisma.ride.findUniqueOrThrow({ where: { id: rideToCancelId } });
      expect(r.status).toBe(RideStatus.SCHEDULED);
    });

    it('handles concurrent ride cancellation requests atomically without duplicate state transitions', async () => {
      const concurrentRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Adyar',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 4 * 3600 * 1000),
          availableSeats: 3,
          status: RideStatus.SCHEDULED,
        },
      });

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .delete(`/rides/${concurrentRide.id}`)
          .set('Authorization', `Bearer ${studentDriverToken}`),
        request(app.getHttpServer())
          .delete(`/rides/${concurrentRide.id}`)
          .set('Authorization', `Bearer ${studentDriverToken}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 400]);

      // Exactly 1 cancellation audit log is created
      const auditCount = await testPrisma.auditLog.count({
        where: { targetId: concurrentRide.id, action: 'RIDE_CANCELLED' },
      });
      expect(auditCount).toBe(1);
    });
  });

  // ===========================================================================
  // 7. Transactional Audit Logging & Atomic Rollback
  // ===========================================================================
  describe('7. Transactional Audit Logging & Atomic Rollback', () => {
    it('rolls back ride publication if transactional audit logging fails', async () => {
      const auditService = app.get(AuditLogService);
      const auditSpy = jest
        .spyOn(auditService, 'log')
        .mockRejectedValueOnce(new Error('Simulated audit ledger write failure on ride publish'));

      const departureTime = getFutureDeparture(5);

      try {
        await request(app.getHttpServer())
          .post('/rides')
          .set('Authorization', `Bearer ${studentDriverToken}`)
          .send({
            vehicleId: studentVehicleId,
            origin: 'Rollback Origin',
            destination: 'VIT Chennai',
            departureTime,
            availableSeats: 3,
          })
          .expect(500);

        // Verify ride was NOT inserted into database
        const ride = await testPrisma.ride.findFirst({
          where: { origin: 'Rollback Origin' },
        });
        expect(ride).toBeNull();
      } finally {
        auditSpy.mockRestore();
      }
    });

    it('rolls back ride update if transactional audit logging fails', async () => {
      const r = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Original Origin',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          availableSeats: 3,
        },
      });

      const auditService = app.get(AuditLogService);
      const auditSpy = jest
        .spyOn(auditService, 'log')
        .mockRejectedValueOnce(new Error('Simulated audit ledger write failure on ride update'));

      try {
        await request(app.getHttpServer())
          .patch(`/rides/${r.id}`)
          .set('Authorization', `Bearer ${studentDriverToken}`)
          .send({ origin: 'Hacked Updated Origin' })
          .expect(500);

        // Verify database row was NOT modified
        const refreshed = await testPrisma.ride.findUniqueOrThrow({ where: { id: r.id } });
        expect(refreshed.origin).toBe('Original Origin');
      } finally {
        auditSpy.mockRestore();
      }
    });

    it('rolls back ride cancellation if transactional audit logging fails', async () => {
      const r = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Airport',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          availableSeats: 3,
          status: RideStatus.SCHEDULED,
        },
      });

      const auditService = app.get(AuditLogService);
      const auditSpy = jest
        .spyOn(auditService, 'log')
        .mockRejectedValueOnce(new Error('Simulated audit ledger write failure on ride cancel'));

      try {
        await request(app.getHttpServer())
          .delete(`/rides/${r.id}`)
          .set('Authorization', `Bearer ${studentDriverToken}`)
          .expect(500);

        // Verify ride remains SCHEDULED
        const refreshed = await testPrisma.ride.findUniqueOrThrow({ where: { id: r.id } });
        expect(refreshed.status).toBe(RideStatus.SCHEDULED);
      } finally {
        auditSpy.mockRestore();
      }
    });
  });

  // ===========================================================================
  // 8. Direct Database-Level Foreign Key & Constraint Verification
  // ===========================================================================
  describe('8. Direct Database-Level Foreign Key & Constraint Verification', () => {
    it('Database Engine rejects a ride whose audience does not match driver audience', async () => {
      // Direct raw query / Prisma create attempting to insert FACULTY audience for STUDENT driver
      await expect(
        testPrisma.ride.create({
          data: {
            driverId: studentDriverId,
            vehicleId: studentVehicleId,
            audience: Audience.FACULTY, // Incompatible with studentDriverId's STUDENT audience
            origin: 'Tambaram',
            destination: 'VIT Chennai',
            departureTime: new Date(Date.now() + 3600 * 1000),
            availableSeats: 3,
          },
        }),
      ).rejects.toThrow(); // PostgreSQL foreign key constraint violation on (driver_id, audience)
    });

    it('Database Engine rejects a ride referencing another user vehicle', async () => {
      // Direct insert attempting to use facultyVehicleId with studentDriverId
      await expect(
        testPrisma.ride.create({
          data: {
            driverId: studentDriverId,
            vehicleId: facultyVehicleId, // Belongs to facultyDriverId
            audience: Audience.STUDENT,
            origin: 'Tambaram',
            destination: 'VIT Chennai',
            departureTime: new Date(Date.now() + 3600 * 1000),
            availableSeats: 3,
          },
        }),
      ).rejects.toThrow(); // PostgreSQL foreign key constraint violation on (vehicle_id, driver_id)
    });

    it('Database Engine rejects available_seats < 0 or > 6 via check constraint', async () => {
      await expect(
        testPrisma.ride.create({
          data: {
            driverId: studentDriverId,
            vehicleId: studentVehicleId,
            audience: Audience.STUDENT,
            origin: 'Tambaram',
            destination: 'VIT Chennai',
            departureTime: new Date(Date.now() + 3600 * 1000),
            availableSeats: -1, // chk_rides_available_seats
          },
        }),
      ).rejects.toThrow();

      await expect(
        testPrisma.ride.create({
          data: {
            driverId: studentDriverId,
            vehicleId: studentVehicleId,
            audience: Audience.STUDENT,
            origin: 'Tambaram',
            destination: 'VIT Chennai',
            departureTime: new Date(Date.now() + 3600 * 1000),
            availableSeats: 7, // chk_rides_available_seats
          },
        }),
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // 9. Milestone 4.1: Ride Discovery & Search (GET /rides)
  // ===========================================================================
  describe('9. Milestone 4.1: Ride Discovery & Search (GET /rides)', () => {
    let studentSearchRide1Id: string;
    let studentSearchRide2Id: string;
    let facultySearchRideId: string;
    let cancelledStudentRideId: string;
    let departedStudentRideId: string;

    beforeAll(async () => {
      // 1. Student Ride 1: Tambaram -> VIT Chennai, 3 seats, 2 hours ahead
      const r1 = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai Campus',
          pickupDescription: 'Secret Landmark Behind Gate 1',
          dropoffDescription: 'Admin Block Porch',
          departureTime: new Date(Date.now() + 2 * 3600 * 1000),
          availableSeats: 3,
          costPerSeat: 60,
          status: RideStatus.SCHEDULED,
        },
      });
      studentSearchRide1Id = r1.id;

      // 2. Student Ride 2: Velachery -> VIT Chennai, 1 seat, 5 hours ahead
      const r2 = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Velachery Vijaya Nagar',
          destination: 'VIT Chennai Kelambakkam',
          pickupDescription: 'Bus stop',
          departureTime: new Date(Date.now() + 5 * 3600 * 1000),
          availableSeats: 1,
          costPerSeat: 80,
          status: RideStatus.SCHEDULED,
        },
      });
      studentSearchRide2Id = r2.id;

      // 3. Faculty Ride: Tambaram -> VIT Chennai, 2 seats, 3 hours ahead
      const fRide = await testPrisma.ride.create({
        data: {
          driverId: facultyDriverId,
          vehicleId: facultyVehicleId,
          audience: Audience.FACULTY,
          origin: 'Tambaram Sanatorium',
          destination: 'VIT Chennai Faculty Quarters',
          pickupDescription: 'Faculty Gate',
          departureTime: new Date(Date.now() + 3 * 3600 * 1000),
          availableSeats: 2,
          costPerSeat: 50,
          status: RideStatus.SCHEDULED,
        },
      });
      facultySearchRideId = fRide.id;

      // 4. Cancelled Student Ride: should never appear in discovery results
      const cRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Tambaram West',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 4 * 3600 * 1000),
          availableSeats: 4,
          status: RideStatus.CANCELLED,
        },
      });
      cancelledStudentRideId = cRide.id;

      // 5. Departed Student Ride: departed 1 hour ago; should never appear
      const dRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Tambaram East',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() - 3600 * 1000),
          availableSeats: 3,
          status: RideStatus.SCHEDULED,
        },
      });
      departedStudentRideId = dRide.id;
    });

    it('rejects unauthenticated search requests with 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/rides').expect(401);
    });

    it('rejects PENDING user with 403 Forbidden (ACCOUNT_PENDING_VERIFICATION)', async () => {
      const pendingAuthId = 'ba333333-8888-4333-8333-333333333333';
      const pendingEmail = 'pending.driver@vitstudent.ac.in';
      const pendingToken = signTestJwt({ sub: pendingAuthId, email: pendingEmail });

      const res = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${pendingToken}`)
        .expect(403);

      expect(res.body.error).toBe('ACCOUNT_PENDING_VERIFICATION');
    });

    it('strict cohort isolation: student search returns student rides and zero faculty rides', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      expect(res.body.rides).toBeDefined();
      expect(res.body.pagination).toBeDefined();

      // All returned rides must belong to STUDENT audience
      const returnedAudiences = res.body.rides.map((r: any) => r.audience);
      expect(returnedAudiences.every((a: string) => a === Audience.STUDENT)).toBe(true);

      // Faculty ride must NOT be present
      const hasFacultyRide = res.body.rides.some((r: any) => r.id === facultySearchRideId);
      expect(hasFacultyRide).toBe(false);

      // Student scheduled rides must be present
      const returnedIds = res.body.rides.map((r: any) => r.id);
      expect(returnedIds).toContain(studentSearchRide1Id);
      expect(returnedIds).toContain(studentSearchRide2Id);
    });

    it('strict cohort isolation: faculty search returns faculty rides and zero student rides', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .expect(200);

      expect(res.body.rides).toBeDefined();

      // All returned rides must belong to FACULTY audience
      const returnedAudiences = res.body.rides.map((r: any) => r.audience);
      expect(returnedAudiences.every((a: string) => a === Audience.FACULTY)).toBe(true);

      // Student rides must NOT be present
      const hasStudentRide1 = res.body.rides.some((r: any) => r.id === studentSearchRide1Id);
      const hasStudentRide2 = res.body.rides.some((r: any) => r.id === studentSearchRide2Id);
      expect(hasStudentRide1).toBe(false);
      expect(hasStudentRide2).toBe(false);

      // Faculty ride must be present
      const returnedIds = res.body.rides.map((r: any) => r.id);
      expect(returnedIds).toContain(facultySearchRideId);
    });

    it('excludes cancelled rides from discovery results', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const returnedIds = res.body.rides.map((r: any) => r.id);
      expect(returnedIds).not.toContain(cancelledStudentRideId);
    });

    it('excludes past departed rides from discovery results', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const returnedIds = res.body.rides.map((r: any) => r.id);
      expect(returnedIds).not.toContain(departedStudentRideId);
    });

    it('filters by available passenger seats (minSeats)', async () => {
      // Student Ride 1 has 3 seats; Student Ride 2 has 1 seat.
      // Filtering for minSeats = 2 should return Ride 1 and exclude Ride 2.
      const res = await request(app.getHttpServer())
        .get('/rides?minSeats=2')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const returnedIds = res.body.rides.map((r: any) => r.id);
      expect(returnedIds).toContain(studentSearchRide1Id);
      expect(returnedIds).not.toContain(studentSearchRide2Id);
    });

    it('filters by origin and destination with case-insensitive substring matching', async () => {
      // Case-insensitive origin match "tambaram"
      const originRes = await request(app.getHttpServer())
        .get('/rides?origin=tambaram')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const originIds = originRes.body.rides.map((r: any) => r.id);
      expect(originIds).toContain(studentSearchRide1Id);
      expect(originIds).not.toContain(studentSearchRide2Id);

      // Case-insensitive destination match "kelambakkam"
      const destRes = await request(app.getHttpServer())
        .get('/rides?destination=kelambakkam')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const destIds = destRes.body.rides.map((r: any) => r.id);
      expect(destIds).toContain(studentSearchRide2Id);
      expect(destIds).not.toContain(studentSearchRide1Id);

      // Non-matching query returns empty results
      const emptyRes = await request(app.getHttpServer())
        .get('/rides?origin=NonExistentLoc999')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      expect(emptyRes.body.rides).toEqual([]);
      expect(emptyRes.body.pagination.total).toBe(0);
    });

    it('rejects invalid date formats and query parameters with 400 Bad Request', async () => {
      // Date in the past
      await request(app.getHttpServer())
        .get('/rides?departureDate=2020-01-01')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);

      // Malformed date
      await request(app.getHttpServer())
        .get('/rides?departureDate=invalid-date')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);

      // Invalid calendar day (Feb 31)
      await request(app.getHttpServer())
        .get('/rides?departureDate=2026-02-31')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);

      // departureTo earlier than departureFrom
      const from = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      const to = new Date(Date.now() + 1 * 3600 * 1000).toISOString();
      await request(app.getHttpServer())
        .get(`/rides?departureFrom=${from}&departureTo=${to}`)
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);

      // Malformed minSeats
      await request(app.getHttpServer())
        .get('/rides?minSeats=0')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/rides?minSeats=7')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);

      // Client injection attempt: unrecognized query parameters
      await request(app.getHttpServer())
        .get('/rides?status=CANCELLED&audience=FACULTY')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);
    });

    it('supports pagination parameters (page, limit, totalPages)', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides?page=1&limit=1')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      expect(res.body.rides.length).toBe(1);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(1);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);
      expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(2);
    });

    it('enforces privacy protections: strips registration numbers, pickup descriptions, and driver contact info', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const ride1 = res.body.rides.find((r: any) => r.id === studentSearchRide1Id);
      expect(ride1).toBeDefined();

      // Exposed necessary fields
      expect(ride1.id).toBe(studentSearchRide1Id);
      expect(ride1.origin).toBe('Tambaram Railway Station');
      expect(ride1.destination).toBe('VIT Chennai Campus');
      expect(ride1.availableSeats).toBe(3);
      expect(ride1.costPerSeat).toBe(60);
      expect(ride1.driverName).toBe('Arjun Student Driver');
      expect(ride1.vehicle.make).toBe('Hyundai');
      expect(ride1.vehicle.model).toBe('i20');
      expect(ride1.vehicle.color).toBe('Polar White');

      // STRICTLY STRIPPED / NOT EXPOSED
      expect(ride1.vehicle.registrationNumber).toBeUndefined();
      expect(ride1.pickupDescription).toBeUndefined();
      expect(ride1.dropoffDescription).toBeUndefined();
      expect(ride1.driverEmail).toBeUndefined();
      expect(ride1.driverPhone).toBeUndefined();
      expect(ride1.audit).toBeUndefined();
    });

    it('excludes rides whose vehicle has been soft-deleted', async () => {
      const tempVehicle = await testPrisma.vehicle.create({
        data: {
          userId: studentDriverId,
          make: 'Nissan',
          model: 'Micra',
          color: 'Red',
          registrationNumber: 'TN07DEACT01',
          capacity: 5,
        },
      });

      const tempRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: tempVehicle.id,
          audience: Audience.STUDENT,
          origin: 'Adyar Gate',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 6 * 3600 * 1000),
          availableSeats: 3,
          status: RideStatus.SCHEDULED,
        },
      });

      // Initially appears in discovery
      const beforeRes = await request(app.getHttpServer())
        .get(`/rides?origin=Adyar`)
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);
      expect(beforeRes.body.rides.some((r: any) => r.id === tempRide.id)).toBe(true);

      // Soft-delete the vehicle directly
      await testPrisma.vehicle.update({
        where: { id: tempVehicle.id },
        data: { deletedAt: new Date() },
      });

      // Now excluded from discovery
      const afterRes = await request(app.getHttpServer())
        .get(`/rides?origin=Adyar`)
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);
      expect(afterRes.body.rides.some((r: any) => r.id === tempRide.id)).toBe(false);
    });
  });

  // ===========================================================================
  // 10. Asia/Kolkata Local Date Correctness & Deterministic Pagination
  // ===========================================================================
  describe('10. Asia/Kolkata Local Date Correctness & Deterministic Pagination', () => {
    const kolkataTargetDate = '2027-04-15';
    let earlyMorningRideId: string;
    let lateNightRideId: string;
    let nextDayMidnightRideId: string;

    beforeAll(async () => {
      // 1. Early morning IST: 2027-04-15 00:30:00 IST -> 2027-04-14 19:00:00 UTC
      const rEarly = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'IST Early Morning Origin',
          destination: 'VIT Chennai',
          departureTime: new Date('2027-04-14T19:00:00.000Z'),
          availableSeats: 3,
          status: RideStatus.SCHEDULED,
        },
      });
      earlyMorningRideId = rEarly.id;

      // 2. Late night IST: 2027-04-15 23:30:00 IST -> 2027-04-15 18:00:00 UTC
      const rLate = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'IST Late Night Origin',
          destination: 'VIT Chennai',
          departureTime: new Date('2027-04-15T18:00:00.000Z'),
          availableSeats: 3,
          status: RideStatus.SCHEDULED,
        },
      });
      lateNightRideId = rLate.id;

      // 3. Exactly next day 00:00 IST: 2027-04-16 00:00:00 IST -> 2027-04-15 18:30:00 UTC
      // Must be excluded by the exclusive [start, nextDayStart) boundary
      const rNext = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'IST Next Day Midnight Origin',
          destination: 'VIT Chennai',
          departureTime: new Date('2027-04-15T18:30:00.000Z'),
          availableSeats: 3,
          status: RideStatus.SCHEDULED,
        },
      });
      nextDayMidnightRideId = rNext.id;
    });

    it('matches correct calendar day in Asia/Kolkata (IST UTC+05:30) and respects exclusive upper bound', async () => {
      const res = await request(app.getHttpServer())
        .get(`/rides?departureDate=${kolkataTargetDate}`)
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const returnedIds = res.body.rides.map((r: any) => r.id);

      // 00:30 IST on 2027-04-15 (19:00 UTC on 2027-04-14) must be matched!
      expect(returnedIds).toContain(earlyMorningRideId);

      // 23:30 IST on 2027-04-15 (18:00 UTC on 2027-04-15) must be matched!
      expect(returnedIds).toContain(lateNightRideId);

      // 00:00 IST on 2027-04-16 (18:30 UTC on 2027-04-15) must be EXCLUDED (exclusive upper bound)
      expect(returnedIds).not.toContain(nextDayMidnightRideId);
    });

    it('does not leak rides into previous calendar day in Asia/Kolkata', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides?departureDate=2027-04-14')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const returnedIds = res.body.rides.map((r: any) => r.id);

      // The ride departing at 19:00 UTC on 2027-04-14 is 00:30 IST on 2027-04-15,
      // so it MUST NOT appear when searching for IST calendar day 2027-04-14!
      expect(returnedIds).not.toContain(earlyMorningRideId);
    });

    it('rejects invalid calendar dates (e.g. Feb 30, April 31) with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .get('/rides?departureDate=2027-02-30')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/rides?departureDate=2027-04-31')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);
    });

    it('rejects contradictory departure range where departureTo is earlier than departureFrom or in past', async () => {
      const from = '2027-06-10T12:00:00.000Z';
      const to = '2027-06-10T10:00:00.000Z'; // Contradictory: to < from

      await request(app.getHttpServer())
        .get(`/rides?departureFrom=${encodeURIComponent(from)}&departureTo=${encodeURIComponent(to)}`)
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);
    });

    it('maintains deterministic sorting and pagination when multiple rides share the exact same departure time', async () => {
      const collidingDeparture = '2027-07-20T10:00:00.000Z';

      // Create 3 rides with identical departure time
      const r1 = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Colliding Origin A',
          destination: 'VIT Chennai',
          departureTime: new Date(collidingDeparture),
          availableSeats: 2,
          status: RideStatus.SCHEDULED,
        },
      });

      const r2 = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Colliding Origin B',
          destination: 'VIT Chennai',
          departureTime: new Date(collidingDeparture),
          availableSeats: 2,
          status: RideStatus.SCHEDULED,
        },
      });

      const r3 = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Colliding Origin C',
          destination: 'VIT Chennai',
          departureTime: new Date(collidingDeparture),
          availableSeats: 2,
          status: RideStatus.SCHEDULED,
        },
      });

      const expectedIdsInOrder = [r1.id, r2.id, r3.id].sort();

      // Paginate 1 item at a time across pages 1, 2, 3
      const [p1, p2, p3] = await Promise.all([
        request(app.getHttpServer())
          .get(`/rides?origin=Colliding&page=1&limit=1`)
          .set('Authorization', `Bearer ${studentRiderToken}`),
        request(app.getHttpServer())
          .get(`/rides?origin=Colliding&page=2&limit=1`)
          .set('Authorization', `Bearer ${studentRiderToken}`),
        request(app.getHttpServer())
          .get(`/rides?origin=Colliding&page=3&limit=1`)
          .set('Authorization', `Bearer ${studentRiderToken}`),
      ]);

      expect(p1.status).toBe(200);
      expect(p2.status).toBe(200);
      expect(p3.status).toBe(200);

      expect(p1.body.rides.length).toBe(1);
      expect(p2.body.rides.length).toBe(1);
      expect(p3.body.rides.length).toBe(1);

      const returnedP1Id = p1.body.rides[0].id;
      const returnedP2Id = p2.body.rides[0].id;
      const returnedP3Id = p3.body.rides[0].id;

      // Verify each page returned a distinct ride
      const allRetrieved = [returnedP1Id, returnedP2Id, returnedP3Id];
      const uniqueRetrieved = Array.from(new Set(allRetrieved));
      expect(uniqueRetrieved.length).toBe(3);

      // Verify the order is deterministic by id asc
      expect(allRetrieved).toEqual(expectedIdsInOrder);
    });
  });

  // ===========================================================================
  // 11. Milestone 5.1: Location Autocomplete & Geographic Proximity Search
  // ===========================================================================
  describe('11. Milestone 5.1: Location Autocomplete & Geographic Proximity Search', () => {
    let spatialRideId: string;
    const futureDeparture = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

    it('publishes a ride with valid coordinates and persists spatial attributes', async () => {
      const response = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: studentVehicleId,
          origin: 'Vandalur Flyover',
          originAddress: 'Vandalur, GST Road, Chennai 600048',
          originLatitude: 12.8914,
          originLongitude: 80.0815,
          originPlaceId: 'mock-chennai-vandalur',
          destination: 'VIT Chennai North Gate',
          destinationAddress: 'VIT Chennai Campus, Vandalur-Kelambakkam Rd',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          destinationPlaceId: 'mock-chennai-vit-campus',
          departureTime: futureDeparture,
          availableSeats: 3,
          costPerSeat: 50,
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.origin).toBe('Vandalur Flyover');
      expect(response.body.originLatitude).toBeCloseTo(12.8914, 4);
      expect(response.body.originLongitude).toBeCloseTo(80.0815, 4);
      expect(response.body.destinationLatitude).toBeCloseTo(12.8406, 4);
      expect(response.body.destinationLongitude).toBeCloseTo(80.1534, 4);

      spatialRideId = response.body.id;
    });

    it('matches rides within origin proximity radius (PostGIS ST_DWithin)', async () => {
      // Query near Vandalur (approx 100m away, radius 2km)
      const res = await request(app.getHttpServer())
        .get('/rides')
        .query({
          originLat: 12.8910,
          originLon: 80.0820,
          originRadiusKm: 2,
        })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const rideIds = res.body.rides.map((r: any) => r.id);
      expect(rideIds).toContain(spatialRideId);
    });

    it('excludes rides outside proximity radius', async () => {
      // Query from Central Chennai (13.0827, 80.2707 - ~25km away from Vandalur) with radius 3km
      const res = await request(app.getHttpServer())
        .get('/rides')
        .query({
          originLat: 13.0827,
          originLon: 80.2707,
          originRadiusKm: 3,
        })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const rideIds = res.body.rides.map((r: any) => r.id);
      expect(rideIds).not.toContain(spatialRideId);
    });

    it('does not allow rides with missing coordinates to match spatial queries', async () => {
      // Create a legacy text-only ride without coordinates
      const legacyRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Legacy No Coordinates',
          destination: 'VIT Campus',
          departureTime: new Date(Date.now() + 5 * 60 * 60 * 1000),
          availableSeats: 2,
          status: RideStatus.SCHEDULED,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/rides')
        .query({
          originLat: 12.8914,
          originLon: 80.0815,
          originRadiusKm: 10,
        })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const rideIds = res.body.rides.map((r: any) => r.id);
      expect(rideIds).not.toContain(legacyRide.id);

      // Clean up legacy ride
      await testPrisma.ride.delete({ where: { id: legacyRide.id } });
    });

    it('preserves legacy text-search fallback when coordinates are omitted', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides')
        .query({
          origin: 'Vandalur Flyover',
        })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const rideIds = res.body.rides.map((r: any) => r.id);
      expect(rideIds).toContain(spatialRideId);
    });

    it('strictly preserves student/faculty cohort isolation in geographic search', async () => {
      // Faculty user searching near Vandalur must NOT receive the student ride
      const res = await request(app.getHttpServer())
        .get('/rides')
        .query({
          originLat: 12.8914,
          originLon: 80.0815,
          originRadiusKm: 5,
        })
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .expect(200);

      const rideIds = res.body.rides.map((r: any) => r.id);
      expect(rideIds).not.toContain(spatialRideId);
    });

    it('updating ride coordinates correctly synchronizes PostGIS geometry and updates spatial discovery', async () => {
      // Driver updates origin coordinates from Vandalur to Guindy
      const updateRes = await request(app.getHttpServer())
        .patch(`/rides/${spatialRideId}`)
        .send({
          origin: 'Guindy Kathipara',
          originAddress: 'Kathipara Junction, Guindy, Chennai',
          originLatitude: 13.0067,
          originLongitude: 80.2025,
        })
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      expect(updateRes.body.originLatitude).toBeCloseTo(13.0067, 4);
      expect(updateRes.body.originLongitude).toBeCloseTo(80.2025, 4);

      // Verify geometry point in DB was updated by trigger
      const rawRows = await testPrisma.$queryRaw<Array<{ has_origin_geom: boolean }>>`
        SELECT (origin_geom IS NOT NULL) AS has_origin_geom
        FROM rides
        WHERE id = ${spatialRideId}::uuid
      `;
      expect(rawRows[0].has_origin_geom).toBe(true);

      // Search near Guindy (within 3km) matches the updated ride
      const guindySearch = await request(app.getHttpServer())
        .get('/rides')
        .query({
          originLat: 13.0065,
          originLon: 80.2020,
          originRadiusKm: 3,
        })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const guindyRideIds = guindySearch.body.rides.map((r: any) => r.id);
      expect(guindyRideIds).toContain(spatialRideId);

      // Search near Vandalur (within 3km) NO LONGER matches the updated ride
      const vandalurSearch = await request(app.getHttpServer())
        .get('/rides')
        .query({
          originLat: 12.8914,
          originLon: 80.0815,
          originRadiusKm: 3,
        })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const vandalurRideIds = vandalurSearch.body.rides.map((r: any) => r.id);
      expect(vandalurRideIds).not.toContain(spatialRideId);
    });

    it('rejects ride update with mismatched coordinate pairs (latitude without longitude)', async () => {
      await request(app.getHttpServer())
        .patch(`/rides/${spatialRideId}`)
        .send({
          originLatitude: 13.05,
          // originLongitude omitted
        })
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(400);
    });

    it('rejects spatial search with out-of-bound coordinates or radius', async () => {
      // Latitude > 90
      await request(app.getHttpServer())
        .get('/rides')
        .query({
          originLat: 95.0,
          originLon: 80.0,
        })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);

      // Radius > 50 km
      await request(app.getHttpServer())
        .get('/rides')
        .query({
          originLat: 12.89,
          originLon: 80.08,
          originRadiusKm: 100,
        })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);
    });
  });

  // ===========================================================================
  // 11. Milestone 5.2: Enhanced Search Filters & Privacy Polish
  // ===========================================================================
  describe('11. Milestone 5.2: Enhanced Search Filters & Privacy Polish', () => {
    it('filters rides correctly by maxCost', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides')
        .query({ maxCost: 65 })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      expect(Array.isArray(res.body.rides)).toBe(true);
      for (const ride of res.body.rides) {
        expect(ride.costPerSeat).toBeLessThanOrEqual(65);
      }
    });

    it('rejects invalid maxCost (negative or non-numeric)', async () => {
      await request(app.getHttpServer())
        .get('/rides')
        .query({ maxCost: -10 })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/rides')
        .query({ maxCost: 'cheap' })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);
    });

    it('supports sorting by cost ascending', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides')
        .query({ sortBy: 'cost', sortOrder: 'asc' })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const nonNullCosts = res.body.rides
        .map((r: any) => r.costPerSeat)
        .filter((c: any) => c !== null);
      for (let i = 1; i < nonNullCosts.length; i++) {
        expect(nonNullCosts[i]).toBeGreaterThanOrEqual(nonNullCosts[i - 1]);
      }
    });

    it('supports sorting by available seats descending', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides')
        .query({ sortBy: 'seats', sortOrder: 'desc' })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      const seatsList = res.body.rides.map((r: any) => r.availableSeats);
      for (let i = 1; i < seatsList.length; i++) {
        expect(seatsList[i]).toBeLessThanOrEqual(seatsList[i - 1]);
      }
    });

    it('supports unified radiusKm filter parameter and validates upper bound', async () => {
      await request(app.getHttpServer())
        .get('/rides')
        .query({
          originLat: 12.8914,
          originLon: 80.0815,
          radiusKm: 5,
        })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/rides')
        .query({
          originLat: 12.8914,
          originLon: 80.0815,
          radiusKm: 60, // Exceeds max 50
        })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(400);
    });

    it('preserves strict vehicle and location privacy in public search responses', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      for (const ride of res.body.rides) {
        // Private landmark notes MUST NOT be present
        expect(ride.pickupDescription).toBeUndefined();
        expect(ride.dropoffDescription).toBeUndefined();

        // Vehicle registration plate MUST NOT be disclosed in public summary
        if (ride.vehicle) {
          expect(ride.vehicle.registrationNumber).toBeUndefined();
          expect(ride.vehicle.make).toBeDefined();
          expect(ride.vehicle.model).toBeDefined();
          expect(ride.vehicle.color).toBeDefined();
        }
      }
    });

    it('returns empty list gracefully with total: 0 when no rides match criteria', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides')
        .query({ origin: 'NonExistentCorridor123xyz' })
        .set('Authorization', `Bearer ${studentRiderToken}`)
        .expect(200);

      expect(res.body.rides).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.totalPages).toBe(1);
    });
  });

  // ===========================================================================
  // 12. Milestone 6: Driver Ride Management & Lifecycle Controls
  // ===========================================================================
  describe('12. Milestone 6: Driver Ride Management & Lifecycle Controls', () => {
    let testRideId: string;

    beforeEach(async () => {
      // Create a fresh scheduled ride for the student driver departing in 3 hours
      const ride = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Tambaram Bus Stand',
          destination: 'VIT Chennai Campus',
          departureTime: new Date(Date.now() + 3 * 3600 * 1000),
          availableSeats: 3,
          totalSeats: 3,
          costPerSeat: 50,
          status: RideStatus.SCHEDULED,
        },
      });
      testRideId = ride.id;
    });

    it('GET /rides/mine returns only rides owned by the authenticated driver with booking metrics', async () => {
      // Seed a pending and a confirmed booking on this ride
      await testPrisma.booking.create({
        data: {
          rideId: testRideId,
          passengerId: studentRiderId,
          driverId: studentDriverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/rides/mine')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const foundRide = res.body.find((r: any) => r.id === testRideId);
      expect(foundRide).toBeDefined();
      expect(foundRide.driverId).toBe(studentDriverId);
      expect(foundRide.pendingBookingsCount).toBe(1);
      expect(foundRide.confirmedBookingsCount).toBe(0);

      // Driver can see their own vehicle registration plate
      expect(foundRide.vehicle).toBeDefined();
      expect(foundRide.vehicle.registrationNumber).toBe('TN19AA5001');

      // Faculty driver querying /rides/mine does not see student driver rides
      const facultyRes = await request(app.getHttpServer())
        .get('/rides/mine')
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .expect(200);

      const hasStudentRide = facultyRes.body.some((r: any) => r.id === testRideId);
      expect(hasStudentRide).toBe(false);
    });

    it('PATCH /rides/:id allows driver to edit upcoming ride schedule and seat counts', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/rides/${testRideId}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          origin: 'Tambaram Railway Station West',
          costPerSeat: 60,
          availableSeats: 4, // 5-seater vehicle has max 4 passenger seats
        })
        .expect(200);

      expect(res.body.origin).toBe('Tambaram Railway Station West');
      expect(res.body.costPerSeat).toBe(60);
      expect(res.body.availableSeats).toBe(4);
    });

    it('PATCH /rides/:id rejects modification within 15 minutes of departure (400 Bad Request)', async () => {
      // Create ride departing in 10 minutes (within 15-minute lock window)
      const imminentRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Kelambakkam Junction',
          destination: 'VIT Campus',
          departureTime: new Date(Date.now() + 10 * 60 * 1000), // 10 mins ahead
          availableSeats: 2,
          totalSeats: 2,
          status: RideStatus.SCHEDULED,
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/rides/${imminentRide.id}`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({ costPerSeat: 30 })
        .expect(400);

      expect(res.body.message).toMatch(/cannot be modified within 15 minutes of departure/i);
    });

    it('PATCH /rides/:id rejects modification of a ride owned by another driver (404 Not Found)', async () => {
      await request(app.getHttpServer())
        .patch(`/rides/${testRideId}`)
        .set('Authorization', `Bearer ${facultyDriverToken}`) // Faculty driver attempting to edit student ride
        .send({ costPerSeat: 30 })
        .expect(404);
    });

    it('POST /rides/:id/cancel allows driver to cancel their upcoming scheduled ride', async () => {
      const res = await request(app.getHttpServer())
        .post(`/rides/${testRideId}/cancel`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(201);

      expect(res.body.status).toBe('CANCELLED');

      // Verify in DB
      const dbRide = await testPrisma.ride.findUniqueOrThrow({ where: { id: testRideId } });
      expect(dbRide.status).toBe(RideStatus.CANCELLED);

      // Verify active bookings on this ride were atomically transitioned to CANCELLED
      const bookingsOnRide = await testPrisma.booking.findMany({ where: { rideId: testRideId } });
      for (const b of bookingsOnRide) {
        expect(b.status).toBe(BookingStatus.CANCELLED);
        expect(b.cancellationReason).toBe('Ride was cancelled by driver');
      }

      // Attempting to cancel an already cancelled ride returns 400 Bad Request
      const duplicateCancelRes = await request(app.getHttpServer())
        .post(`/rides/${testRideId}/cancel`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(400);

      expect(duplicateCancelRes.body.message).toMatch(/already cancelled/i);
    });

    it('POST /rides/:id/cancel rejects cancellation of another driver ride (404 Not Found)', async () => {
      await request(app.getHttpServer())
        .post(`/rides/${testRideId}/cancel`)
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .expect(404);
    });

    it('POST /rides/:id/cancel rejects cancellation of a ride that has already departed', async () => {
      const departedRide = await testPrisma.ride.create({
        data: {
          driverId: studentDriverId,
          vehicleId: studentVehicleId,
          audience: Audience.STUDENT,
          origin: 'Vandalur Zoo',
          destination: 'VIT Campus',
          departureTime: new Date(Date.now() - 3600 * 1000), // Departed 1 hour ago
          availableSeats: 2,
          totalSeats: 2,
          status: RideStatus.SCHEDULED,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/rides/${departedRide.id}/cancel`)
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(400);

      expect(res.body.message).toMatch(/cannot cancel a ride that has already departed/i);
    });
  });

  // 12. Quick Ride Templates & Repeat Last Ride Posting
  describe('12. Quick Ride Templates & Repeat Last Ride Posting', () => {
    it('GET /rides/quick-templates returns empty state when driver has never published a ride', async () => {
      // Create fresh driver with active vehicle but no rides
      const freshAuthId = 'f9999999-9999-4999-8999-999999999999';
      const freshEmail = 'fresh.driver@vitstudent.ac.in';
      const freshUser = await testPrisma.user.create({
        data: {
          authUserId: freshAuthId,
          email: freshEmail,
          fullName: 'Fresh Quick Driver',
          audience: Audience.STUDENT,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
          role: UserRole.USER,
        },
      });

      const freshVehicle = await testPrisma.vehicle.create({
        data: {
          userId: freshUser.id,
          make: 'Maruti',
          model: 'Swift',
          color: 'Blue',
          registrationNumber: 'TN19QR9999',
          capacity: 4,
        },
      });

      const freshToken = signTestJwt({ sub: freshAuthId, email: freshEmail });

      const res = await request(app.getHttpServer())
        .get('/rides/quick-templates')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);

      expect(res.body.recentRide).toBeNull();
      expect(res.body.routes).toEqual([]);
      expect(res.body.hasActiveVehicle).toBe(true);

      // Clean up fresh user and vehicle
      await testPrisma.vehicle.delete({ where: { id: freshVehicle.id } });
      await testPrisma.user.delete({ where: { id: freshUser.id } });
    });

    it('GET /rides/quick-templates retrieves the driver’s most recent ride and deduplicated routes', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides/quick-templates')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      expect(res.body.recentRide).toBeDefined();
      expect(res.body.recentRide.origin).toBeDefined();
      expect(res.body.recentRide.destination).toBeDefined();
      expect(res.body.recentRide.vehicleId).toBe(studentVehicleId);
      expect(res.body.hasActiveVehicle).toBe(true);

      // Verify privacy: private notes are NOT returned
      expect(res.body.recentRide.pickupDescription).toBeUndefined();
      expect(res.body.recentRide.dropoffDescription).toBeUndefined();

      // Verify routes list exists and is deduplicated
      expect(Array.isArray(res.body.routes)).toBe(true);
      expect(res.body.routes.length).toBeGreaterThan(0);
    });

    it('Cross-driver isolation: Driver A cannot see Driver B’s templates', async () => {
      const facultyRes = await request(app.getHttpServer())
        .get('/rides/quick-templates')
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .expect(200);

      // If faculty driver has rides, their vehicleId must belong to faculty, not student
      if (facultyRes.body.recentRide) {
        expect(facultyRes.body.recentRide.vehicleId).toBe(facultyVehicleId);
      }
    });

    it('Quick Ride posting via POST /rides creates a completely new ride record without mutating the original', async () => {
      // 1. Fetch reusable templates
      const templatesRes = await request(app.getHttpServer())
        .get('/rides/quick-templates')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      const template = templatesRes.body.recentRide;
      expect(template).toBeDefined();

      const originalRide = await testPrisma.ride.findUnique({
        where: { id: template.id },
      });
      expect(originalRide).toBeDefined();

      // 2. Publish new quick ride with updated future departure time
      const futureDeparture = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
      const postRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: template.vehicleId,
          origin: template.origin,
          destination: template.destination,
          originLatitude: template.originLatitude,
          originLongitude: template.originLongitude,
          destinationLatitude: template.destinationLatitude,
          destinationLongitude: template.destinationLongitude,
          departureTime: futureDeparture,
          availableSeats: template.availableSeats,
          costPerSeat: template.costPerSeat || 50,
        })
        .expect(201);

      expect(postRes.body.id).toBeDefined();
      expect(postRes.body.id).not.toBe(template.id); // Completely new ride ID
      expect(postRes.body.origin).toBe(template.origin);
      expect(postRes.body.destination).toBe(template.destination);
      expect(postRes.body.status).toBe('SCHEDULED');

      // 3. Verify original ride record was NOT modified or overwritten
      const checkOriginal = await testPrisma.ride.findUnique({
        where: { id: template.id },
      });
      expect(checkOriginal?.id).toBe(originalRide?.id);
      expect(checkOriginal?.status).toBe(originalRide?.status);
      expect(checkOriginal?.departureTime.toISOString()).toBe(originalRide?.departureTime.toISOString());
    });

    it('Quick Ride posting rejects past departure times using existing validation', async () => {
      const templatesRes = await request(app.getHttpServer())
        .get('/rides/quick-templates')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .expect(200);

      const template = templatesRes.body.recentRide;
      const pastDeparture = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .send({
          vehicleId: template.vehicleId,
          origin: template.origin,
          destination: template.destination,
          departureTime: pastDeparture,
          availableSeats: template.availableSeats,
          costPerSeat: 50,
        })
        .expect(400);
    });
  });

  // ===========================================================================
  // 13. Ride Creation Idempotency & Concurrency Safety
  // ===========================================================================
  describe('13. Ride Creation Idempotency', () => {
    const baseRidePayload = () => ({
      vehicleId: studentVehicleId,
      origin: 'VIT Chennai Main Gate',
      destination: 'Tambaram Railway Station',
      departureTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      availableSeats: 3,
      costPerSeat: 50,
    });

    it('first request with Idempotency-Key creates exactly one ride and records key in database', async () => {
      const key = `idemp-first-${Date.now()}`;
      const payload = baseRidePayload();

      const res = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .set('Idempotency-Key', key)
        .send(payload)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.origin).toBe(payload.origin);

      // Verify idempotency record in DB
      const record = await testPrisma.idempotencyKey.findUnique({
        where: {
          userId_key: {
            userId: studentDriverId,
            key,
          },
        },
      });
      expect(record).toBeDefined();
      expect(record?.rideId).toBe(res.body.id);
    });

    it('repeating the same request with the same key and payload returns original result without creating duplicate ride', async () => {
      const key = `idemp-retry-${Date.now()}`;
      const payload = baseRidePayload();

      // First publication attempt
      const firstRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .set('Idempotency-Key', key)
        .send(payload)
        .expect(201);

      const originalRideId = firstRes.body.id;
      expect(originalRideId).toBeDefined();

      const rideCountBefore = await testPrisma.ride.count({
        where: { driverId: studentDriverId, origin: payload.origin },
      });

      // Network retry attempt with same key and identical payload
      const retryRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .set('Idempotency-Key', key)
        .send(payload)
        .expect(201);

      // Returns the original ride ID
      expect(retryRes.body.id).toBe(originalRideId);
      expect(retryRes.body.origin).toBe(payload.origin);

      // Verify no duplicate ride was created
      const rideCountAfter = await testPrisma.ride.count({
        where: { driverId: studentDriverId, origin: payload.origin },
      });
      expect(rideCountAfter).toBe(rideCountBefore);
    });

    it('reusing the same key with a modified payload returns 409 Conflict', async () => {
      const key = `idemp-conflict-${Date.now()}`;
      const payload = baseRidePayload();

      // First request
      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .set('Idempotency-Key', key)
        .send(payload)
        .expect(201);

      // Retry with modified costPerSeat
      const conflictRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .set('Idempotency-Key', key)
        .send({
          ...payload,
          costPerSeat: 80, // altered payload
        })
        .expect(409);

      expect(conflictRes.body.message).toMatch(/idempotency key/i);
    });

    it('concurrent requests with the same key create no more than one ride', async () => {
      const key = `idemp-concurrent-${Date.now()}`;
      const payload = {
        ...baseRidePayload(),
        origin: 'VIT Concurrency Test Origin',
      };

      // Launch 5 concurrent publication requests
      const promises = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/rides')
          .set('Authorization', `Bearer ${studentDriverToken}`)
          .set('Idempotency-Key', key)
          .send(payload),
      );

      const responses = await Promise.all(promises);

      // All responses should succeed (201)
      for (const res of responses) {
        expect(res.status).toBe(201);
      }

      // All responses must return the EXACT same ride ID
      const rideIds = responses.map((r) => r.body.id);
      const uniqueIds = Array.from(new Set(rideIds));
      expect(uniqueIds.length).toBe(1);

      // Verify exactly 1 ride exists in the database
      const ridesInDb = await testPrisma.ride.findMany({
        where: { driverId: studentDriverId, origin: 'VIT Concurrency Test Origin' },
      });
      expect(ridesInDb.length).toBe(1);
    });

    it('two different keys can create two separate legitimate rides with same route and time', async () => {
      const key1 = `idemp-diff-1-${Date.now()}`;
      const key2 = `idemp-diff-2-${Date.now()}`;
      const payload = baseRidePayload();

      const res1 = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .set('Idempotency-Key', key1)
        .send(payload)
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .set('Idempotency-Key', key2)
        .send(payload)
        .expect(201);

      expect(res1.body.id).not.toBe(res2.body.id);

      const ride1 = await testPrisma.ride.findUnique({ where: { id: res1.body.id } });
      const ride2 = await testPrisma.ride.findUnique({ where: { id: res2.body.id } });
      expect(ride1).toBeDefined();
      expect(ride2).toBeDefined();
    });

    it('different authenticated drivers using the same key do not collide or leak each other results', async () => {
      const sharedKey = `driver-isolated-${Date.now()}`;

      // Student driver creates ride with sharedKey
      const studentPayload = baseRidePayload();
      const studentRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .set('Idempotency-Key', sharedKey)
        .send(studentPayload)
        .expect(201);

      // Faculty driver uses the same sharedKey with their own vehicle
      const facultyPayload = {
        vehicleId: facultyVehicleId,
        origin: 'VIT Faculty Quarters',
        destination: 'Chennai Central',
        departureTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        availableSeats: 2,
        costPerSeat: 60,
      };

      const facultyRes = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .set('Idempotency-Key', sharedKey)
        .send(facultyPayload)
        .expect(201);

      // Distinct rides created; faculty driver does NOT get student's ride
      expect(studentRes.body.id).not.toBe(facultyRes.body.id);
      expect(studentRes.body.driverId).toBe(studentDriverId);
      expect(facultyRes.body.driverId).toBe(facultyDriverId);

      // In DB, two separate idempotency records exist scoped by userId
      const studentRecord = await testPrisma.idempotencyKey.findUnique({
        where: { userId_key: { userId: studentDriverId, key: sharedKey } },
      });
      const facultyRecord = await testPrisma.idempotencyKey.findUnique({
        where: { userId_key: { userId: facultyDriverId, key: sharedKey } },
      });
      expect(studentRecord?.rideId).toBe(studentRes.body.id);
      expect(facultyRecord?.rideId).toBe(facultyRes.body.id);
    });

    it('requests without idempotency key continue to work as normal', async () => {
      const payload = baseRidePayload();

      const res = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        // No Idempotency-Key header
        .send(payload)
        .expect(201);

      expect(res.body.id).toBeDefined();
    });

    it('a failed transaction does not leave an orphaned idempotency record', async () => {
      const key = `idemp-failed-${Date.now()}`;

      // Invalid request: past departure time fails validation before/during creation
      await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .set('Idempotency-Key', key)
        .send({
          ...baseRidePayload(),
          departureTime: new Date(Date.now() - 3600000).toISOString(),
        })
        .expect(400);

      // Verify no idempotency record was created
      const record = await testPrisma.idempotencyKey.findUnique({
        where: { userId_key: { userId: studentDriverId, key } },
      });
      expect(record).toBeNull();
    });

    it('submitting modified payload with a new key after a previous attempt succeeds cleanly without conflict', async () => {
      const key1 = `idemp-attempt1-${Date.now()}`;
      const payload1 = baseRidePayload();

      // Attempt 1 with key1
      const res1 = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .set('Idempotency-Key', key1)
        .send(payload1)
        .expect(201);

      // Attempt 2 with modified payload (e.g. 2 seats instead of 3, cost 75) and fresh key2
      const key2 = `idemp-attempt2-${Date.now()}`;
      const payload2 = {
        ...payload1,
        availableSeats: 2,
        costPerSeat: 75,
      };

      const res2 = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${studentDriverToken}`)
        .set('Idempotency-Key', key2)
        .send(payload2)
        .expect(201);

      expect(res1.body.id).not.toBe(res2.body.id);
      expect(res2.body.availableSeats).toBe(2);
      expect(res2.body.costPerSeat).toBe(75);

      // Both keys recorded for their respective rides
      const rec1 = await testPrisma.idempotencyKey.findUnique({
        where: { userId_key: { userId: studentDriverId, key: key1 } },
      });
      const rec2 = await testPrisma.idempotencyKey.findUnique({
        where: { userId_key: { userId: studentDriverId, key: key2 } },
      });
      expect(rec1?.rideId).toBe(res1.body.id);
      expect(rec2?.rideId).toBe(res2.body.id);
    });
  });
});
