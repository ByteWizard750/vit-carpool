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

    it('Database Engine rejects available_seats = 0 or > 6 via check constraint', async () => {
      await expect(
        testPrisma.ride.create({
          data: {
            driverId: studentDriverId,
            vehicleId: studentVehicleId,
            audience: Audience.STUDENT,
            origin: 'Tambaram',
            destination: 'VIT Chennai',
            departureTime: new Date(Date.now() + 3600 * 1000),
            availableSeats: 0, // chk_rides_available_seats
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
});

