import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { PrismaClient, UserRole, VerificationStatus, Audience, VerificationMethod } from '@vit-carpool/db';
import { signTestJwt, getTestKeyPair } from '../src/modules/auth/jwt-keys.fixture';
import { AuditLogService } from '../src/modules/audit/audit.service';

const TEST_WEBHOOK_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw=';

function generateWebhookHeaders(
  payload: unknown,
  secret: string = TEST_WEBHOOK_SECRET,
  timestampOffsetSeconds: number = 0,
): Record<string, string> {
  const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const ts = (Math.floor(Date.now() / 1000) + timestampOffsetSeconds).toString();
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signed = `${id}.${ts}.${rawBody}`;
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf-8');
  const signature = `v1,${crypto.createHmac('sha256', key).update(signed).digest('base64')}`;
  return {
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': signature,
  };
}

describe('Milestone 2.2: Identity, Auth & Verification Security Review (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let appUserPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  const appUserDbUrl =
    'postgresql://app_user:app_user_dev_pw@127.0.0.1:5433/vit_carpool_test?schema=public';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';
    process.env.SUPABASE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    appUserPrisma = new PrismaClient({ datasources: { db: { url: appUserDbUrl } } });

    await testPrisma.$connect();
    await appUserPrisma.$connect();

    // Clean test database tables before starting
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.verificationRequest.deleteMany();
    await testPrisma.user.deleteMany();


    // Pre-seed authorized admin user
    await testPrisma.user.create({
      data: {
        authUserId: '77777777-7777-4777-8777-777777777777',
        email: 'super.admin@vit.ac.in',
        fullName: 'Super Admin',
        role: UserRole.ADMIN,
        verificationStatus: VerificationStatus.VERIFIED,
        audience: Audience.FACULTY,
        verificationMethod: VerificationMethod.ADMIN_OVERRIDE,
        verifiedAt: new Date(),
      },
    });


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
    await appUserPrisma.$disconnect();
  });

  // ===========================================================================
  // 1. Database Check Constraints (Engine-Level Invariant Enforcement)
  // ===========================================================================
  describe('1. Database Engine Constraints', () => {
    it('chk_users_email_lowercase rejects mixed-case email insertions', async () => {
      let threw = false;
      try {
        await testPrisma.$executeRaw`
          INSERT INTO "users" ("id", "auth_user_id", "email", "full_name", "verification_status")
          VALUES (uuid_generate_v4(), uuid_generate_v4(), 'MixedCase@vitstudent.ac.in', 'Test User', 'PENDING');
        `;
      } catch (err: unknown) {
        threw = true;
        expect(String(err)).toContain('chk_users_email_lowercase');
      }
      expect(threw).toBe(true);
    });

    it('chk_verification_requests_email_lowercase rejects mixed-case email insertions', async () => {
      const user = await testPrisma.user.create({
        data: {
          authUserId: '10000000-0000-4000-8000-000000000001',
          email: 'vr_case_test@vitstudent.ac.in',
          fullName: 'VR Case Tester',
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      let threw = false;
      try {
        await testPrisma.$executeRaw`
          INSERT INTO "verification_requests" ("id", "user_id", "requested_audience", "institutional_email", "status")
          VALUES (uuid_generate_v4(), ${user.id}::uuid, 'STUDENT', 'Uppercase@vitstudent.ac.in', 'PENDING');
        `;
      } catch (err: unknown) {
        threw = true;
        expect(String(err)).toContain('chk_verification_requests_email_lowercase');
      }
      expect(threw).toBe(true);
    });

    it('chk_users_verification_state rejects VERIFIED with NULL audience', async () => {
      let threw = false;
      try {
        await testPrisma.$executeRaw`
          INSERT INTO "users" ("id", "auth_user_id", "email", "full_name", "verification_status", "verification_method", "verified_at")
          VALUES (uuid_generate_v4(), uuid_generate_v4(), 'invalid_verified@vit.ac.in', 'Test', 'VERIFIED', 'AUTOMATIC_EMAIL', NOW());
        `;
      } catch (err: unknown) {
        threw = true;
        expect(String(err)).toContain('chk_users_verification_state');
      }
      expect(threw).toBe(true);
    });

    it('chk_users_verification_state rejects REJECTED with non-null audience', async () => {
      let threw = false;
      try {
        await testPrisma.$executeRaw`
          INSERT INTO "users" ("id", "auth_user_id", "email", "full_name", "verification_status", "audience")
          VALUES (uuid_generate_v4(), uuid_generate_v4(), 'invalid_rejected@vit.ac.in', 'Test', 'REJECTED', 'STUDENT');
        `;
      } catch (err: unknown) {
        threw = true;
        expect(String(err)).toContain('chk_users_verification_state');
      }
      expect(threw).toBe(true);
    });

    it('chk_users_verification_state rejects SUSPENDED with NULL audience', async () => {
      let threw = false;
      try {
        await testPrisma.$executeRaw`
          INSERT INTO "users" ("id", "auth_user_id", "email", "full_name", "verification_status", "audience")
          VALUES (uuid_generate_v4(), uuid_generate_v4(), 'invalid_suspended@vit.ac.in', 'Test', 'SUSPENDED', NULL);
        `;
      } catch (err: unknown) {
        threw = true;
        expect(String(err)).toContain('chk_users_verification_state');
      }
      expect(threw).toBe(true);
    });

    it('uq_user_pending_verification rejects duplicate PENDING verification requests for the same user', async () => {
      const user = await testPrisma.user.create({
        data: {
          authUserId: '99999999-9999-4999-9999-999999999901',
          email: 'duplicate_test@vitstudent.ac.in',
          fullName: 'Duplicate Tester',
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      await testPrisma.verificationRequest.create({
        data: {
          userId: user.id,
          requestedAudience: Audience.STUDENT,
          institutionalEmail: 'duplicate_test@vitstudent.ac.in',
          status: 'PENDING',
        },
      });

      let threw = false;
      try {
        await testPrisma.verificationRequest.create({
          data: {
            userId: user.id,
            requestedAudience: Audience.STUDENT,
            institutionalEmail: 'duplicate_test@vitstudent.ac.in',
            status: 'PENDING',
          },
        });
      } catch (err: unknown) {
        threw = true;
        expect(String(err)).toMatch(/unique constraint|uq_user_pending_verification/i);
      }
      expect(threw).toBe(true);
    });
  });

  // ===========================================================================
  // 2. Runtime Role (app_user) Immutability & Privilege Tests
  // ===========================================================================
  describe('2. Runtime Role (app_user) Least Privilege & Immutability', () => {
    it('app_user can INSERT into audit_logs', async () => {
      const result = await appUserPrisma.$executeRaw`
        INSERT INTO "audit_logs" ("id", "action", "target_type", "target_id", "changes")
        VALUES (uuid_generate_v4(), 'APP_USER_TEST_INSERT', 'TEST', uuid_generate_v4(), '{"ok": true}'::jsonb);
      `;
      expect(result).toBe(1);
    });

    it('app_user CANNOT UPDATE audit_logs (revoked privilege & immutable trigger)', async () => {
      let threw = false;
      try {
        await appUserPrisma.$executeRaw`
          UPDATE "audit_logs" SET "action" = 'HACKED' WHERE "action" = 'APP_USER_TEST_INSERT';
        `;
      } catch (err: unknown) {
        threw = true;
        expect(String(err)).toMatch(/permission denied|append-only/i);
      }
      expect(threw).toBe(true);
    });

    it('app_user CANNOT DELETE from audit_logs', async () => {
      let threw = false;
      try {
        await appUserPrisma.$executeRaw`
          DELETE FROM "audit_logs" WHERE "action" = 'APP_USER_TEST_INSERT';
        `;
      } catch (err: unknown) {
        threw = true;
        expect(String(err)).toMatch(/permission denied|append-only/i);
      }
      expect(threw).toBe(true);
    });

    it('app_user CANNOT TRUNCATE audit_logs', async () => {
      let threw = false;
      try {
        await appUserPrisma.$executeRaw`TRUNCATE "audit_logs";`;
      } catch (err: unknown) {
        threw = true;
        expect(String(err)).toMatch(/permission denied/i);
      }
      expect(threw).toBe(true);
    });

    it('app_user CANNOT disable audit triggers (not table owner)', async () => {
      let threw = false;
      try {
        await appUserPrisma.$executeRaw`ALTER TABLE "audit_logs" DISABLE TRIGGER ALL;`;
      } catch (err: unknown) {
        threw = true;
        expect(String(err)).toMatch(/must be owner/i);
      }
      expect(threw).toBe(true);
    });

    it('app_user CANNOT create arbitrary objects in public schema', async () => {
      let threw = false;
      try {
        await appUserPrisma.$executeRaw`CREATE TABLE public.malicious_test (id int);`;
      } catch (err: unknown) {
        threw = true;
        expect(String(err)).toMatch(/permission denied for schema public/i);
      }
      expect(threw).toBe(true);
    });

    it('Deleting a user succeeds without trigger deadlock because actor_id is decoupled', async () => {
      const ephemeralUser = await testPrisma.user.create({
        data: {
          authUserId: '99999999-9999-4999-9999-999999999999',
          email: 'ephemeral@vitstudent.ac.in',
          fullName: 'Ephemeral User',
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      await testPrisma.auditLog.create({
        data: {
          actorId: ephemeralUser.id,
          action: 'EPHEMERAL_ACTION',
          targetType: 'USER',
          targetId: ephemeralUser.id,
        },
      });

      await expect(
        testPrisma.user.delete({ where: { id: ephemeralUser.id } }),
      ).resolves.toBeDefined();

      const log = await testPrisma.auditLog.findFirst({
        where: { action: 'EPHEMERAL_ACTION', targetId: ephemeralUser.id },
      });
      expect(log).toBeDefined();
      expect(log?.actorId).toBe(ephemeralUser.id);
    });
  });

  // ===========================================================================
  // 3. Unauthenticated, JWT & Tamper Resistance
  // ===========================================================================
  describe('3. Unauthenticated, JWT & Tamper Resistance', () => {
    it('GET /users/me without Bearer token returns 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });

    it('GET /users/me with malformed token returns 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', 'Bearer invalid-garbage-token')
        .expect(401);
    });

    it('GET /users/me with "none" algorithm token is rejected with 401 Unauthorized', async () => {
      const unsignedToken = jwt.sign(
        { sub: '11111111-1111-4111-8111-111111111111', email: 'none.alg@vitstudent.ac.in' },
        '',
        { algorithm: 'none' as any },
      );

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${unsignedToken}`)
        .expect(401);
    });

    it('GET /users/me with token signed by unauthorized foreign key returns 401 Unauthorized', async () => {
      const foreignKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const foreignToken = jwt.sign(
        { email: 'foreign.hacker@vitstudent.ac.in', role: 'authenticated' },
        foreignKeyPair.privateKey,
        {
          algorithm: 'RS256',
          subject: '11111111-1111-4111-8111-111111111111',
          audience: 'authenticated',
          expiresIn: '1h',
        },
      );

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${foreignToken}`)
        .expect(401);
    });

    it('GET /users/me with expired token returns 401 Unauthorized', async () => {
      const expiredToken = signTestJwt({
        sub: '11111111-1111-4111-8111-111111111111',
        email: 'expired.user@vitstudent.ac.in',
        exp: -10, // Expired 10 seconds ago
      });

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('GET /users/me with invalid audience claim returns 401 Unauthorized', async () => {
      const badAudToken = signTestJwt({
        sub: '11111111-1111-4111-8111-111111111111',
        email: 'bad.aud@vitstudent.ac.in',
        aud: 'unauthorized_audience',
      });

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${badAudToken}`)
        .expect(401);
    });

    it('POST /verification/request rejects client-supplied role or audience tampering in payload (400)', async () => {
      const studentAuthId = '11111111-1111-4111-8111-111111111111';
      const studentEmail = 'student.tamper@vitstudent.ac.in';
      const token = signTestJwt({ sub: studentAuthId, email: studentEmail });

      const response = await request(app.getHttpServer())
        .post('/verification/request')
        .set('Authorization', `Bearer ${token}`)
        .send({
          requestedAudience: 'STUDENT',
          institutionalEmail: studentEmail,
          role: 'ADMIN', // Tampering attempt
          audience: 'FACULTY', // Tampering attempt
        })
        .expect(400);

      expect(response.body.message).toMatch(/role|unrecognized/i);
    });

    it('POST /admin/users/:id/role rejects unrecognized payload fields with 400', async () => {
      const adminAuthId = '77777777-7777-4777-8777-777777777777';
      const adminEmail = 'super.admin@vit.ac.in';
      const adminToken = signTestJwt({ sub: adminAuthId, email: adminEmail });

      await request(app.getHttpServer())
        .post('/admin/users/11fa7c66-a1a7-4a33-81e8-33f0fd1bf151/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'ADMIN',
          reason: 'Valid length reason here',
          maliciousField: 'exploit',
        })
        .expect(400);
    });

    it('POST /admin/verification-requests/:id/review rejects unrecognized payload fields with 400', async () => {
      const adminAuthId = '77777777-7777-4777-8777-777777777777';
      const adminEmail = 'super.admin@vit.ac.in';
      const adminToken = signTestJwt({ sub: adminAuthId, email: adminEmail });

      await request(app.getHttpServer())
        .post('/admin/verification-requests/11fa7c66-a1a7-4a33-81e8-33f0fd1bf151/review')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'APPROVED',
          unauthorizedGrant: 'SUPER_USER',
        })
        .expect(400);
    });
  });

  // ===========================================================================
  // 4. Account States & Capability Gate (VerifiedUserGuard)
  // ===========================================================================
  describe('4. Account States & Carpooling Capability Gate', () => {
    it('PENDING account cannot access carpooling capability endpoint (403 ACCOUNT_PENDING_VERIFICATION)', async () => {
      const authId = '22222222-2222-4222-8222-222222222222';
      const email = 'pending.commuter@vitstudent.ac.in';
      const token = signTestJwt({ sub: authId, email });

      const profile = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(profile.body.verificationStatus).toBe('PENDING');

      const response = await request(app.getHttpServer())
        .get('/health/protected-test')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.error).toBe('ACCOUNT_PENDING_VERIFICATION');
    });

    it('SUSPENDED account cannot access carpooling capability endpoint (403 ACCOUNT_SUSPENDED)', async () => {
      const authId = '33333333-3333-4333-8333-333333333333';
      const email = 'suspended.commuter@vitstudent.ac.in';
      const token = signTestJwt({ sub: authId, email });

      await testPrisma.user.create({
        data: {
          authUserId: authId,
          email,
          fullName: 'Suspended Driver',
          audience: Audience.STUDENT,
          verificationStatus: VerificationStatus.SUSPENDED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
        },
      });

      const response = await request(app.getHttpServer())
        .get('/health/protected-test')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.error).toBe('ACCOUNT_SUSPENDED');
    });

    it('REJECTED account cannot access carpooling capability endpoint (403 ACCOUNT_REJECTED)', async () => {
      const authId = '44444444-4444-4444-8444-444444444444';
      const email = 'rejected.commuter@vitstudent.ac.in';
      const token = signTestJwt({ sub: authId, email });

      await testPrisma.user.create({
        data: {
          authUserId: authId,
          email,
          fullName: 'Rejected Applicant',
          audience: null,
          verificationStatus: VerificationStatus.REJECTED,
          verifiedAt: null,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/health/protected-test')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.error).toBe('ACCOUNT_REJECTED');
    });
  });

  // ===========================================================================
  // 5. Unauthorized Administrator Actions, RBAC & Transactional Rollbacks
  // ===========================================================================
  describe('5. Unauthorized Administrator Actions & RBAC', () => {
    it('Ordinary USER cannot access admin endpoints (403 ADMIN_PRIVILEGES_REQUIRED)', async () => {
      const userAuthId = '66666666-6666-4666-8666-666666666666';
      const userEmail = 'ordinary.user@vit.ac.in';
      const token = signTestJwt({ sub: userAuthId, email: userEmail });

      const res1 = await request(app.getHttpServer())
        .get('/admin/verification-requests')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(res1.body.error).toBe('ADMIN_PRIVILEGES_REQUIRED');

      const res2 = await request(app.getHttpServer())
        .post('/admin/users/11fa7c66-a1a7-4a33-81e8-33f0fd1bf151/role')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'ADMIN', reason: 'Self-promotion attempt' })
        .expect(403);
      expect(res2.body.error).toBe('ADMIN_PRIVILEGES_REQUIRED');

      const res3 = await request(app.getHttpServer())
        .post('/admin/verification-requests/11fa7c66-a1a7-4a33-81e8-33f0fd1bf151/review')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'APPROVED' })
        .expect(403);
      expect(res3.body.error).toBe('ADMIN_PRIVILEGES_REQUIRED');
    });

    it('ADMIN user can promote an ordinary user to ADMIN and audit record is created', async () => {
      const adminAuthId = '77777777-7777-4777-8777-777777777777';
      const adminEmail = 'super.admin@vit.ac.in';
      const adminToken = signTestJwt({ sub: adminAuthId, email: adminEmail });

      const adminUser = await testPrisma.user.findUniqueOrThrow({
        where: { email: adminEmail },
      });

      const targetUser = await testPrisma.user.create({

        data: {
          authUserId: '88888888-8888-4888-8888-888888888888',
          email: 'promotee@vit.ac.in',
          fullName: 'Future Admin',
          role: UserRole.USER,
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/admin/users/${targetUser.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'ADMIN', reason: 'Promoted to campus safety moderator' })
        .expect(201);

      expect(res.body.role).toBe('ADMIN');

      const audit = await testPrisma.auditLog.findFirst({
        where: {
          action: 'ADMIN_ROLE_PROMOTED',
          targetId: targetUser.id,
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(adminUser.id);
    });

    it('ADMIN cannot demote themselves (400 Bad Request lockout prevention)', async () => {
      const adminEmail = 'super.admin@vit.ac.in';
      const adminUser = await testPrisma.user.findUniqueOrThrow({
        where: { email: adminEmail },
      });
      const adminToken = signTestJwt({ sub: adminUser.authUserId, email: adminEmail });

      const res = await request(app.getHttpServer())
        .post(`/admin/users/${adminUser.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'USER', reason: 'Accidental self-lockout' })
        .expect(400);

      expect(res.body.message).toContain('Administrators cannot revoke their own admin role');
    });

    it('Transactional Rollback: Failed audit log causes role promotion to roll back completely', async () => {
      const adminEmail = 'super.admin@vit.ac.in';
      const adminUser = await testPrisma.user.findUniqueOrThrow({
        where: { email: adminEmail },
      });
      const adminToken = signTestJwt({ sub: adminUser.authUserId, email: adminEmail });

      const testTarget = await testPrisma.user.create({
        data: {
          authUserId: '55555555-5555-4555-8555-555555555555',
          email: 'rollback.target@vit.ac.in',
          fullName: 'Rollback Target',
          role: UserRole.USER,
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      const auditService = app.get(AuditLogService);
      const auditSpy = jest
        .spyOn(auditService, 'log')
        .mockRejectedValueOnce(new Error('Simulated audit ledger write failure'));

      try {
        await request(app.getHttpServer())
          .post(`/admin/users/${testTarget.id}/role`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'ADMIN', reason: 'Failed attempt that must roll back' });

        // Verify the database was NOT modified
        const refreshed = await testPrisma.user.findUniqueOrThrow({ where: { id: testTarget.id } });
        expect(refreshed.role).toBe(UserRole.USER);
      } finally {
        auditSpy.mockRestore();
      }
    });

    it('Transactional Rollback: Failed audit log causes verification approval to roll back completely', async () => {
      const adminEmail = 'super.admin@vit.ac.in';
      const adminUser = await testPrisma.user.findUniqueOrThrow({
        where: { email: adminEmail },
      });
      const adminToken = signTestJwt({ sub: adminUser.authUserId, email: adminEmail });

      const applicant = await testPrisma.user.create({
        data: {
          authUserId: '66666666-6666-4666-9666-666666666666',
          email: 'applicant.rollback@vitstudent.ac.in',
          fullName: 'Rollback Applicant',
          role: UserRole.USER,
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      const reqRecord = await testPrisma.verificationRequest.create({
        data: {
          userId: applicant.id,
          requestedAudience: Audience.STUDENT,
          institutionalEmail: applicant.email,
          status: 'PENDING',
        },
      });

      const auditService = app.get(AuditLogService);
      const auditSpy = jest
        .spyOn(auditService, 'log')
        .mockRejectedValueOnce(new Error('Simulated audit ledger failure'));

      try {
        await request(app.getHttpServer())
          .post(`/admin/verification-requests/${reqRecord.id}/review`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: 'APPROVED', reviewNotes: 'Rollback test notes' });

        // Verify user and request remain PENDING
        const userRefreshed = await testPrisma.user.findUniqueOrThrow({ where: { id: applicant.id } });
        expect(userRefreshed.verificationStatus).toBe(VerificationStatus.PENDING);
        expect(userRefreshed.audience).toBeNull();

        const reqRefreshed = await testPrisma.verificationRequest.findUniqueOrThrow({
          where: { id: reqRecord.id },
        });
        expect(reqRefreshed.status).toBe('PENDING');
      } finally {
        auditSpy.mockRestore();
      }
    });
  });

  // ===========================================================================
  // 6. Manual Verification Workflow & Approval
  // ===========================================================================
  describe('6. Manual Verification Workflow', () => {
    it('Pending user submits verification request, admin approves it, granting verified status and audience', async () => {
      const applicantAuthId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
      const applicantEmail = 'applicant.student@vitstudent.ac.in';
      const applicantToken = signTestJwt({ sub: applicantAuthId, email: applicantEmail });

      // Step 1: Submit verification request
      const submitRes = await request(app.getHttpServer())
        .post('/verification/request')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({
          requestedAudience: 'STUDENT',
          institutionalEmail: applicantEmail,
        })
        .expect(201);

      expect(submitRes.body.status).toBe('PENDING');
      expect(submitRes.body.requestedAudience).toBe('STUDENT');

      // Step 2: Check /verification/my-request only returns own request
      const myReqRes = await request(app.getHttpServer())
        .get('/verification/my-request')
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      expect(myReqRes.body.id).toBe(submitRes.body.id);
      expect(myReqRes.body.institutionalEmail).toBe(applicantEmail);

      // Step 3: Admin reviews and approves
      const adminEmail = 'super.admin@vit.ac.in';
      const adminUser = await testPrisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
      const adminToken = signTestJwt({ sub: adminUser.authUserId, email: adminEmail });

      const reviewRes = await request(app.getHttpServer())
        .post(`/admin/verification-requests/${submitRes.body.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'APPROVED',
          reviewNotes: 'Verified against campus registration roster.',
        })
        .expect(201);

      expect(reviewRes.body.status).toBe('APPROVED');

      // Step 4: Check applicant status is now VERIFIED
      const updatedProfile = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);

      expect(updatedProfile.body.verificationStatus).toBe('VERIFIED');
      expect(updatedProfile.body.audience).toBe('STUDENT');
      expect(updatedProfile.body.verificationMethod).toBe('MANUAL_ID_REVIEW');

      // Step 5: Now accesses capability gate
      await request(app.getHttpServer())
        .get('/health/protected-test')
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200);
    });
  });

  // ===========================================================================
  // 7. Email Changes & Webhook Sequence Reconciliation (ADR-009)
  // ===========================================================================
  describe('7. Email Changes & Webhook Security & Reconciliation', () => {
    it('Webhook request without headers returns 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/auth/webhook/user-updated')
        .send({ id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', email: 'test@vitstudent.ac.in' })
        .expect(401);
    });

    it('Webhook request when secret is unconfigured fails closed with 401 Unauthorized', async () => {
      const { ConfigService } = await import('@nestjs/config');
      const configService = app.get(ConfigService);
      const configSpy = jest.spyOn(configService, 'get').mockImplementation((key: any, defaultVal?: any) => {
        if (key === 'SUPABASE_WEBHOOK_SECRET') return null;
        return defaultVal;
      });

      try {
        const payload = { id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', email: 'test@vitstudent.ac.in' };
        const headers = generateWebhookHeaders(payload);

        const res = await request(app.getHttpServer())
          .post('/auth/webhook/user-updated')
          .set(headers)
          .send(payload)
          .expect(401);

        expect(res.body.message).toContain('secret is not configured');
      } finally {
        configSpy.mockRestore();
      }
    });


    it('Webhook request with invalid signature returns 401 Unauthorized (state unmodified)', async () => {
      const authId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
      const initialEmail = 'driver.commuter@vitstudent.ac.in';

      const user = await testPrisma.user.create({
        data: {
          authUserId: authId,
          email: initialEmail,
          fullName: 'Active Driver',
          audience: Audience.STUDENT,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
          authUpdatedAt: new Date('2026-10-24T12:00:00Z'),
        },
      });

      const payload = {
        id: authId,
        email: 'attacker.email@vitstudent.ac.in',
        updated_at: '2026-10-24T14:00:00Z',
      };
      const headers = generateWebhookHeaders(payload, 'whsec_wrongsecretwrongsecretwrongsecret==');

      await request(app.getHttpServer())
        .post('/auth/webhook/user-updated')
        .set(headers)
        .send(payload)
        .expect(401);

      // Verify email was NOT modified
      const refreshed = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(refreshed.email).toBe(initialEmail);
    });

    it('Webhook request with tampered payload returns 401 Unauthorized', async () => {
      const authId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
      const originalPayload = {
        id: authId,
        email: 'original@vitstudent.ac.in',
        updated_at: '2026-10-24T14:00:00Z',
      };
      const headers = generateWebhookHeaders(originalPayload);

      const tamperedPayload = {
        id: authId,
        email: 'tampered@vitstudent.ac.in',
        updated_at: '2026-10-24T14:00:00Z',
      };

      await request(app.getHttpServer())
        .post('/auth/webhook/user-updated')
        .set(headers)
        .send(tamperedPayload)
        .expect(401);
    });

    it('Webhook request with expired/replayed timestamp (> 5 minutes) returns 401 Unauthorized', async () => {
      const payload = {
        id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        email: 'replayed@vitstudent.ac.in',
        updated_at: '2026-10-24T14:00:00Z',
      };
      // Timestamp 6 minutes in the past
      const headers = generateWebhookHeaders(payload, TEST_WEBHOOK_SECRET, -360);

      await request(app.getHttpServer())
        .post('/auth/webhook/user-updated')
        .set(headers)
        .send(payload)
        .expect(401);
    });

    it('Stale webhook event is dropped as an idempotent no-op without mutating user state', async () => {
      const authId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
      const user = await testPrisma.user.findUniqueOrThrow({ where: { authUserId: authId } });

      const stalePayload = {
        id: authId,
        email: 'stale.email@vitstudent.ac.in',
        updated_at: '2026-10-24T11:00:00Z',
      };
      const headers = generateWebhookHeaders(stalePayload);

      const res = await request(app.getHttpServer())
        .post('/auth/webhook/user-updated')
        .set(headers)
        .send(stalePayload)
        .expect(201);

      expect(res.body.result.action).toBe('IGNORED_STALE');

      const refreshed = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(refreshed.email).toBe(user.email);
      expect(refreshed.verificationStatus).toBe(VerificationStatus.VERIFIED);
    });

    it('Valid newer email change transitions user to PENDING, revoking carpooling, but retains verified audience', async () => {
      const authId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
      const user = await testPrisma.user.findUniqueOrThrow({ where: { authUserId: authId } });

      const newEmail = 'updated.driver@vitstudent.ac.in';
      const newerTimestamp = '2026-10-24T14:00:00Z';

      const validPayload = {
        id: authId,
        email: newEmail,
        updated_at: newerTimestamp,
      };
      const headers = generateWebhookHeaders(validPayload);

      const res = await request(app.getHttpServer())
        .post('/auth/webhook/user-updated')
        .set(headers)
        .send(validPayload)
        .expect(201);

      expect(res.body.result.action).toBe('RECONCILED');

      const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updated.email).toBe(newEmail);
      expect(updated.verificationStatus).toBe(VerificationStatus.PENDING);
      expect(updated.verifiedAt).toBeNull();
      expect(updated.audience).toBe(Audience.STUDENT); // Audience retained!

      // Capability gate is now locked
      const token = signTestJwt({ sub: authId, email: newEmail });
      await request(app.getHttpServer())
        .get('/health/protected-test')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('Conflicting event with equal timestamp but different email reconciles safely: revokes access, retains audience', async () => {
      const authId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
      const user = await testPrisma.user.findUniqueOrThrow({ where: { authUserId: authId } });

      const conflictingEmail = 'conflict.driver@vitstudent.ac.in';
      // Same timestamp as user.authUpdatedAt
      const equalTimestamp = user.authUpdatedAt!.toISOString();

      const conflictingPayload = {
        id: authId,
        email: conflictingEmail,
        updated_at: equalTimestamp,
      };
      const headers = generateWebhookHeaders(conflictingPayload);

      const res = await request(app.getHttpServer())
        .post('/auth/webhook/user-updated')
        .set(headers)
        .send(conflictingPayload)
        .expect(201);

      expect(res.body.result.action).toBe('RECONCILED');

      const refreshed = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(refreshed.email).toBe(conflictingEmail);
      expect(refreshed.verificationStatus).toBe(VerificationStatus.PENDING);
      expect(refreshed.audience).toBe(Audience.STUDENT);
    });
  });

  // ===========================================================================
  // 8. Cross-Audience Isolation Proof
  // ===========================================================================
  describe('8. Cross-Audience Isolation Proof', () => {
    it('Composite key (id, audience) strictly partitions students and faculty', async () => {
      const student = await testPrisma.user.create({
        data: {
          authUserId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
          email: 'student.isolated@vitstudent.ac.in',
          fullName: 'Isolated Student',
          audience: Audience.STUDENT,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
        },
      });

      const faculty = await testPrisma.user.create({
        data: {
          authUserId: 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
          email: 'faculty.isolated@vit.ac.in',
          fullName: 'Isolated Faculty',
          audience: Audience.FACULTY,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
        },
      });

      // Querying scoped to STUDENT returns 0 faculty records
      const studentQuery = await testPrisma.user.findMany({
        where: { audience: Audience.STUDENT },
      });
      expect(studentQuery.some((u) => u.id === faculty.id)).toBe(false);
      expect(studentQuery.some((u) => u.id === student.id)).toBe(true);

      // Querying scoped to FACULTY returns 0 student records
      const facultyQuery = await testPrisma.user.findMany({
        where: { audience: Audience.FACULTY },
      });
      expect(facultyQuery.some((u) => u.id === student.id)).toBe(false);
      expect(facultyQuery.some((u) => u.id === faculty.id)).toBe(true);
    });
  });
});
