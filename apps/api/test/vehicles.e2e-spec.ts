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
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { AuditLogService } from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Milestone 3.1: Vehicle Management (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Seed verified users for tests
  const studentUserAuthId = 'ba111111-1111-4111-8111-111111111111';
  const studentUserEmail = 'verified.driver@vitstudent.ac.in';
  let studentUserToken: string;
  let studentUserId: string;

  const facultyUserAuthId = 'ba222222-2222-4222-8222-222222222222';
  const facultyUserEmail = 'verified.faculty@vit.ac.in';
  let facultyUserToken: string;
  let facultyUserId: string;


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

    // Create verified student user
    const studentUser = await testPrisma.user.create({
      data: {
        authUserId: studentUserAuthId,
        email: studentUserEmail,
        fullName: 'Verified Student Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    studentUserId = studentUser.id;
    studentUserToken = signTestJwt({ sub: studentUserAuthId, email: studentUserEmail });

    // Create verified faculty user
    const facultyUser = await testPrisma.user.create({
      data: {
        authUserId: facultyUserAuthId,
        email: facultyUserEmail,
        fullName: 'Verified Faculty Driver',
        audience: Audience.FACULTY,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    facultyUserId = facultyUser.id;
    facultyUserToken = signTestJwt({ sub: facultyUserAuthId, email: facultyUserEmail });

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

  // ===========================================================================
  // 1. Authentication & Account Eligibility Gates
  // ===========================================================================
  describe('1. Authentication & Account Eligibility Gates', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/vehicles').expect(401);
      await request(app.getHttpServer()).post('/vehicles').send({}).expect(401);
    });

    it('rejects PENDING user with 403 Forbidden (ACCOUNT_PENDING_VERIFICATION)', async () => {
      const pendingAuthId = 'ba333333-3333-4333-8333-333333333333';
      const pendingEmail = 'pending.applicant@vitstudent.ac.in';
      const pendingToken = signTestJwt({ sub: pendingAuthId, email: pendingEmail });

      const res = await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${pendingToken}`)
        .send({
          make: 'Honda',
          model: 'City',
          color: 'White',
          registrationNumber: 'TN09AB1234',
          capacity: 4,
        })
        .expect(403);

      expect(res.body.error).toBe('ACCOUNT_PENDING_VERIFICATION');
    });

    it('rejects SUSPENDED user with 403 Forbidden (ACCOUNT_SUSPENDED)', async () => {
      const suspendedAuthId = 'ba444444-4444-4444-8444-444444444444';
      const suspendedEmail = 'suspended.driver@vitstudent.ac.in';
      const suspendedToken = signTestJwt({ sub: suspendedAuthId, email: suspendedEmail });

      await testPrisma.user.create({
        data: {
          authUserId: suspendedAuthId,
          email: suspendedEmail,
          fullName: 'Suspended Driver',
          audience: Audience.STUDENT,
          verificationStatus: VerificationStatus.SUSPENDED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .get('/vehicles')
        .set('Authorization', `Bearer ${suspendedToken}`)
        .expect(403);

      expect(res.body.error).toBe('ACCOUNT_SUSPENDED');
    });

    it('rejects REJECTED user with 403 Forbidden (ACCOUNT_REJECTED)', async () => {
      const rejectedAuthId = 'ba555555-5555-4555-8555-555555555555';
      const rejectedEmail = 'rejected.driver@vitstudent.ac.in';
      const rejectedToken = signTestJwt({ sub: rejectedAuthId, email: rejectedEmail });

      await testPrisma.user.create({
        data: {
          authUserId: rejectedAuthId,
          email: rejectedEmail,
          fullName: 'Rejected User',
          audience: null,
          verificationStatus: VerificationStatus.REJECTED,
          verifiedAt: null,
        },
      });


      const res = await request(app.getHttpServer())
        .get('/vehicles')
        .set('Authorization', `Bearer ${rejectedToken}`)
        .expect(403);

      expect(res.body.error).toBe('ACCOUNT_REJECTED');
    });
  });

  // ===========================================================================
  // 2. Input Validation & Strict Schema Enforcement
  // ===========================================================================
  describe('2. Input Validation & Strict Schema Enforcement', () => {
    it('rejects client attempt to supply userId or ownerId in payload (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${studentUserToken}`)
        .send({
          make: 'Maruti Suzuki',
          model: 'Swift',
          color: 'Red',
          registrationNumber: 'TN01AA1111',
          capacity: 4,
          userId: facultyUserId, // Tampering attempt
        })
        .expect(400);

      expect(res.body.message).toMatch(/userId|unrecognized/i);
    });

    it('rejects invalid capacity values (0, negative, > 7) with 400 Bad Request', async () => {
      // Capacity = 0
      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${studentUserToken}`)
        .send({
          make: 'Maruti Suzuki',
          model: 'Swift',
          color: 'Red',
          registrationNumber: 'TN01AA1112',
          capacity: 0,
        })
        .expect(400);

      // Capacity = 8 (Cars only: max 7 passenger seats)
      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${studentUserToken}`)
        .send({
          make: 'Force',
          model: 'Traveller', // Bus/van
          color: 'White',
          registrationNumber: 'TN01AA1113',
          capacity: 8,
        })
        .expect(400);
    });

    it('rejects empty or whitespace-only make, model, or color with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${studentUserToken}`)
        .send({
          make: '   ',
          model: 'Swift',
          color: 'Red',
          registrationNumber: 'TN01AA1114',
          capacity: 4,
        })
        .expect(400);
    });

    it('rejects invalid registration numbers with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${studentUserToken}`)
        .send({
          make: 'Hyundai',
          model: 'i20',
          color: 'Blue',
          registrationNumber: '??!@#$', // Invalid chars
          capacity: 4,
        })
        .expect(400);
    });
  });

  // ===========================================================================
  // 3. Vehicle Creation, Normalization & Uniqueness Policy
  // ===========================================================================
  describe('3. Vehicle Creation & Uniqueness Policy', () => {
    it('creates a vehicle for a verified user and normalizes registration number to uppercase without spaces', async () => {
      const res = await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${studentUserToken}`)
        .send({
          make: 'Hyundai',
          model: 'Creta',
          color: 'Polar White',
          registrationNumber: 'tn 19 ab 1234', // Mixed case with spaces
          capacity: 4,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.userId).toBe(studentUserId);
      expect(res.body.registrationNumber).toBe('TN19AB1234'); // Normalized!
      expect(res.body.capacity).toBe(4);

      // Verify audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: {
          targetId: res.body.id,
          action: 'VEHICLE_REGISTERED',
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(studentUserId);
    });

    it('rejects duplicate registration number with 409 Conflict', async () => {
      // Another user (or same user) attempts to register the same physical car
      const res = await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${facultyUserToken}`)
        .send({
          make: 'Hyundai',
          model: 'Creta',
          color: 'White',
          registrationNumber: 'TN-19-AB-1234', // Hyphens stripped -> matches TN19AB1234
          capacity: 4,
        })
        .expect(409);

      expect(res.body.error).toBe('VEHICLE_ALREADY_REGISTERED');
    });

    it('prevents concurrent race conditions from registering duplicates (Promise.all)', async () => {
      const concurrentRegNo = 'TN20CC7777';
      await testPrisma.vehicle.deleteMany({ where: { registrationNumber: concurrentRegNo } });

      const payload = {
        make: 'Maruti Suzuki',
        model: 'Ignis',
        color: 'Glistening Grey',
        registrationNumber: concurrentRegNo,
        capacity: 4,
      };

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/vehicles')
          .set('Authorization', `Bearer ${studentUserToken}`)
          .send(payload),
        request(app.getHttpServer())
          .post('/vehicles')
          .set('Authorization', `Bearer ${facultyUserToken}`)
          .send(payload),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      // Assert only 1 active vehicle exists in the database
      const count = await testPrisma.vehicle.count({
        where: { registrationNumber: concurrentRegNo, deletedAt: null },
      });
      expect(count).toBe(1);
    });

    it('converts direct database Prisma P2002 unique constraint violations into 409 Conflict', async () => {
      // Simulate race condition where application-level findFirst check is passed by both requests
      // but PostgreSQL partial unique index uq_vehicles_active_registration catches it at the database layer
      const prismaService = app.get(PrismaService);
      const findFirstSpy = jest.spyOn(prismaService.vehicle, 'findFirst').mockResolvedValueOnce(null);

      try {
        const res = await request(app.getHttpServer())
          .post('/vehicles')
          .set('Authorization', `Bearer ${studentUserToken}`)
          .send({
            make: 'Hyundai',
            model: 'Creta',
            color: 'White',
            registrationNumber: 'TN19AB1234', // Already exists from previous test
            capacity: 4,
          })
          .expect(409);

        expect(res.body.error).toBe('VEHICLE_ALREADY_REGISTERED');
        expect(res.body.message).toMatch(/already registered/i);
      } finally {
        findFirstSpy.mockRestore();
      }
    });
  });

  // ===========================================================================
  // 4. Vehicle Retrieval & Ownership Isolation
  // ===========================================================================
  describe('4. Vehicle Retrieval & Ownership Isolation', () => {
    let studentVehicleId: string;
    let facultyVehicleId: string;

    beforeAll(async () => {
      const sv = await testPrisma.vehicle.create({
        data: {
          userId: studentUserId,
          make: 'Tata',
          model: 'Nexon',
          color: 'Daytona Grey',
          registrationNumber: 'TN14BC5678',
          capacity: 4,
        },
      });
      studentVehicleId = sv.id;

      const fv = await testPrisma.vehicle.create({
        data: {
          userId: facultyUserId,
          make: 'Toyota',
          model: 'Innova',
          color: 'Silver',
          registrationNumber: 'TN02CD9999',
          capacity: 6,
        },
      });
      facultyVehicleId = fv.id;
    });

    it('GET /vehicles returns only vehicles owned by the authenticated user', async () => {
      const studentRes = await request(app.getHttpServer())
        .get('/vehicles')
        .set('Authorization', `Bearer ${studentUserToken}`)
        .expect(200);

      // Student sees their Nexon and previously created Creta, but NOT Faculty Innova
      expect(studentRes.body.some((v: any) => v.id === studentVehicleId)).toBe(true);
      expect(studentRes.body.some((v: any) => v.id === facultyVehicleId)).toBe(false);

      const facultyRes = await request(app.getHttpServer())
        .get('/vehicles')
        .set('Authorization', `Bearer ${facultyUserToken}`)
        .expect(200);

      // Faculty sees only their Innova
      expect(facultyRes.body.some((v: any) => v.id === facultyVehicleId)).toBe(true);
      expect(facultyRes.body.some((v: any) => v.id === studentVehicleId)).toBe(false);
    });

    it('GET /vehicles/:id returns vehicle details to the owner', async () => {
      const res = await request(app.getHttpServer())
        .get(`/vehicles/${studentVehicleId}`)
        .set('Authorization', `Bearer ${studentUserToken}`)
        .expect(200);

      expect(res.body.id).toBe(studentVehicleId);
      expect(res.body.make).toBe('Tata');
    });

    it('GET /vehicles/:id returns 404 Not Found when attempting to access another user vehicle', async () => {
      // Student attempts to view faculty's vehicle
      await request(app.getHttpServer())
        .get(`/vehicles/${facultyVehicleId}`)
        .set('Authorization', `Bearer ${studentUserToken}`)
        .expect(404);
    });
  });

  // ===========================================================================
  // 5. Vehicle Update & Ownership Isolation
  // ===========================================================================
  describe('5. Vehicle Update & Ownership Isolation', () => {
    let testVehicleId: string;

    beforeAll(async () => {
      const v = await testPrisma.vehicle.create({
        data: {
          userId: studentUserId,
          make: 'Maruti Suzuki',
          model: 'Baleno',
          color: 'Blue',
          registrationNumber: 'TN22DE1001',
          capacity: 4,
        },
      });
      testVehicleId = v.id;
    });

    it('PATCH /vehicles/:id updates vehicle fields for the owner', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/vehicles/${testVehicleId}`)
        .set('Authorization', `Bearer ${studentUserToken}`)
        .send({
          color: 'Midnight Blue',
          capacity: 3, // Reduced by 1 seat for luggage
        })
        .expect(200);

      expect(res.body.color).toBe('Midnight Blue');
      expect(res.body.capacity).toBe(3);

      // Verify audit log
      const audit = await testPrisma.auditLog.findFirst({
        where: {
          targetId: testVehicleId,
          action: 'VEHICLE_UPDATED',
        },
      });
      expect(audit).toBeDefined();
    });

    it('PATCH /vehicles/:id returns 404 Not Found when attempting to edit another user vehicle', async () => {
      // Faculty attempts to edit student's vehicle
      await request(app.getHttpServer())
        .patch(`/vehicles/${testVehicleId}`)
        .set('Authorization', `Bearer ${facultyUserToken}`)
        .send({
          color: 'Hacked Color',
        })
        .expect(404);

      // Ensure color was not changed
      const v = await testPrisma.vehicle.findUniqueOrThrow({ where: { id: testVehicleId } });
      expect(v.color).toBe('Midnight Blue');
    });
  });

  // ===========================================================================
  // 6. Safe Vehicle Deletion (Soft Deletion & Relational Safety)
  // ===========================================================================
  describe('6. Safe Vehicle Deletion & Relational Safety', () => {
    let vehicleToDeleteId: string;
    const regNo = 'TN11FF8888';

    beforeEach(async () => {
      await testPrisma.vehicle.deleteMany({ where: { registrationNumber: regNo } });
      const v = await testPrisma.vehicle.create({
        data: {
          userId: studentUserId,
          make: 'Volkswagen',
          model: 'Polo',
          color: 'Flash Red',
          registrationNumber: regNo,
          capacity: 4,
        },
      });
      vehicleToDeleteId = v.id;
    });


    it('DELETE /vehicles/:id returns 404 when attempting to delete another user vehicle', async () => {
      await request(app.getHttpServer())
        .delete(`/vehicles/${vehicleToDeleteId}`)
        .set('Authorization', `Bearer ${facultyUserToken}`)
        .expect(404);

      // Vehicle remains active
      const v = await testPrisma.vehicle.findUniqueOrThrow({ where: { id: vehicleToDeleteId } });
      expect(v.deletedAt).toBeNull();
    });

    it('DELETE /vehicles/:id soft-deletes the vehicle, preserves audit history, and removes from active list', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/vehicles/${vehicleToDeleteId}`)
        .set('Authorization', `Bearer ${studentUserToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Record still exists in database with deleted_at populated (safe for historical ride references)
      const v = await testPrisma.vehicle.findUniqueOrThrow({ where: { id: vehicleToDeleteId } });
      expect(v.deletedAt).not.toBeNull();

      // No longer returned in active list
      const listRes = await request(app.getHttpServer())
        .get('/vehicles')
        .set('Authorization', `Bearer ${studentUserToken}`)
        .expect(200);

      expect(listRes.body.some((item: any) => item.id === vehicleToDeleteId)).toBe(false);

      // Audit log recorded
      const audit = await testPrisma.auditLog.findFirst({
        where: {
          targetId: vehicleToDeleteId,
          action: 'VEHICLE_DELETED',
        },
      });
      expect(audit).toBeDefined();

      // The registration number of a soft-deleted vehicle can be re-registered if vehicle was sold/transferred
      const reRegisterRes = await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${facultyUserToken}`)
        .send({
          make: 'Volkswagen',
          model: 'Polo',
          color: 'Flash Red',
          registrationNumber: regNo,
          capacity: 4,
        })
        .expect(201);

      expect(reRegisterRes.body.registrationNumber).toBe(regNo);
    });
  });

  // ===========================================================================
  // 7. Transactional Audit Logging & Atomic Rollback
  // ===========================================================================
  describe('7. Transactional Audit Logging & Atomic Rollback', () => {
    it('rolls back vehicle creation if transactional audit logging fails', async () => {
      const auditService = app.get(AuditLogService);
      const auditSpy = jest
        .spyOn(auditService, 'log')
        .mockRejectedValueOnce(new Error('Simulated audit ledger write failure during vehicle create'));

      const regNo = 'TN05RR1111';
      await testPrisma.vehicle.deleteMany({ where: { registrationNumber: regNo } });

      try {
        await request(app.getHttpServer())
          .post('/vehicles')
          .set('Authorization', `Bearer ${studentUserToken}`)
          .send({
            make: 'Tata',
            model: 'Altroz',
            color: 'Golden',
            registrationNumber: regNo,
            capacity: 4,
          })
          .expect(500);

        // Verify the vehicle was NOT created in the database
        const vehicle = await testPrisma.vehicle.findFirst({
          where: { registrationNumber: regNo },
        });
        expect(vehicle).toBeNull();
      } finally {
        auditSpy.mockRestore();
      }
    });

    it('rolls back vehicle update if transactional audit logging fails', async () => {
      const v = await testPrisma.vehicle.create({
        data: {
          userId: studentUserId,
          make: 'Toyota',
          model: 'Glanza',
          color: 'White',
          registrationNumber: 'TN07GL9999',
          capacity: 4,
        },
      });

      const auditService = app.get(AuditLogService);
      const auditSpy = jest
        .spyOn(auditService, 'log')
        .mockRejectedValueOnce(new Error('Simulated audit ledger write failure during vehicle update'));

      try {
        await request(app.getHttpServer())
          .patch(`/vehicles/${v.id}`)
          .set('Authorization', `Bearer ${studentUserToken}`)
          .send({
            color: 'Black',
            capacity: 3,
          })
          .expect(500);

        // Verify the database was NOT modified
        const refreshed = await testPrisma.vehicle.findUniqueOrThrow({ where: { id: v.id } });
        expect(refreshed.color).toBe('White');
        expect(refreshed.capacity).toBe(4);
      } finally {
        auditSpy.mockRestore();
      }
    });

    it('rolls back vehicle deletion if transactional audit logging fails', async () => {
      const v = await testPrisma.vehicle.create({
        data: {
          userId: studentUserId,
          make: 'Skoda',
          model: 'Slavia',
          color: 'Blue',
          registrationNumber: 'TN09SK8888',
          capacity: 4,
        },
      });

      const auditService = app.get(AuditLogService);
      const auditSpy = jest
        .spyOn(auditService, 'log')
        .mockRejectedValueOnce(new Error('Simulated audit ledger write failure during vehicle delete'));

      try {
        await request(app.getHttpServer())
          .delete(`/vehicles/${v.id}`)
          .set('Authorization', `Bearer ${studentUserToken}`)
          .expect(500);

        // Verify vehicle was NOT deleted and deletedAt remains null
        const refreshed = await testPrisma.vehicle.findUniqueOrThrow({ where: { id: v.id } });
        expect(refreshed.deletedAt).toBeNull();
      } finally {
        auditSpy.mockRestore();
      }
    });
  });
});
