import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  UserRole,
  VerificationStatus,
  VerificationMethod,
  Audience,
} from '@vit-carpool/db';
import { AuthService } from '../src/modules/auth/auth.service';
import { EmailClassifierService } from '../src/modules/verification/email-classifier.service';

describe('Milestone 5.2: Authentication, Automatic Classification & Onboarding (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let authService: AuthService;
  let classifierService: EmailClassifierService;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'true';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean test tables
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.verificationRequest.deleteMany();
    await testPrisma.user.deleteMany();

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

    authService = app.get(AuthService);
    classifierService = app.get(EmailClassifierService);
  });

  afterAll(async () => {
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';
    if (app) {
      await app.close();
    }
    await testPrisma.$disconnect();
  });

  // ===========================================================================
  // 1. Sign Up OTP Request Flow
  // ===========================================================================
  describe('1. Sign Up OTP Request', () => {
    it('requests OTP successfully for a student institutional email', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email: 'rohan.student2023@vitstudent.ac.in',
          fullName: 'Rohan Student',
          intent: 'signup',
        })
        .expect(201);

      expect(res.body.message).toContain('Verification code sent');
      expect(res.body.cooldownSeconds).toBe(30);
    });

    it('requests OTP successfully for a faculty institutional email', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email: 'renukadevi.faculty@vit.ac.in',
          fullName: 'Dr. Renuka Devi',
          intent: 'signup',
        })
        .expect(201);

      expect(res.body.message).toContain('Verification code sent');
    });

    it('rejects signup OTP request when fullName is missing (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email: 'noname@vitstudent.ac.in',
          intent: 'signup',
        })
        .expect(400);

      expect(res.body.message).toMatch(/full name/i);
    });

    it('rejects signup OTP request when email is non-institutional (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email: 'intruder@gmail.com',
          fullName: 'Gmail User',
          intent: 'signup',
        })
        .expect(400);

      expect(res.body.message).toMatch(/institutional email/i);
    });
  });

  // ===========================================================================
  // 2. Successful OTP Verification & Server-Side Automatic Classification
  // ===========================================================================
  describe('2. OTP Verification & Automatic Audience Classification', () => {
    it('verifies student OTP, automatically assigns STUDENT audience and VERIFIED status', async () => {
      const email = 'arjun.student2024@vitstudent.ac.in';
      const fullName = 'Arjun Student';

      // Request OTP
      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName, intent: 'signup' })
        .expect(201);

      // Verify OTP with default test mock code '123456'
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({
          email,
          token: '123456',
          intent: 'signup',
          fullName,
        })
        .expect(201);

      expect(verifyRes.body.token).toBeDefined();
      expect(verifyRes.body.user).toBeDefined();
      expect(verifyRes.body.user.email).toBe(email);
      expect(verifyRes.body.user.fullName).toBe(fullName);
      expect(verifyRes.body.user.audience).toBe('STUDENT');
      expect(verifyRes.body.user.verificationStatus).toBe('VERIFIED');
      expect(verifyRes.body.user.verificationMethod).toBe('AUTOMATIC_EMAIL');
      expect(verifyRes.body.user.verifiedAt).not.toBeNull();

      // Verify PostgreSQL database state matches exactly
      const dbUser = await testPrisma.user.findUniqueOrThrow({ where: { email } });
      expect(dbUser.audience).toBe(Audience.STUDENT);
      expect(dbUser.verificationStatus).toBe(VerificationStatus.VERIFIED);
      expect(dbUser.verificationMethod).toBe(VerificationMethod.AUTOMATIC_EMAIL);
      expect(dbUser.role).toBe(UserRole.USER); // Never elevated to ADMIN
    });

    it('verifies faculty OTP, automatically assigns FACULTY audience and VERIFIED status', async () => {
      const email = 'suresh.faculty@vit.ac.in';
      const fullName = 'Dr. Suresh Kumar';

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName, intent: 'signup' })
        .expect(201);

      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({
          email,
          token: '123456',
          intent: 'signup',
          fullName,
        })
        .expect(201);

      expect(verifyRes.body.user.audience).toBe('FACULTY');
      expect(verifyRes.body.user.verificationStatus).toBe('VERIFIED');
      expect(verifyRes.body.user.verificationMethod).toBe('AUTOMATIC_EMAIL');

      const dbUser = await testPrisma.user.findUniqueOrThrow({ where: { email } });
      expect(dbUser.audience).toBe(Audience.FACULTY);
      expect(dbUser.verificationStatus).toBe(VerificationStatus.VERIFIED);
    });

    it('rejects duplicate signup request when email is already registered (400)', async () => {
      const email = 'arjun.student2024@vitstudent.ac.in';

      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email,
          fullName: 'Arjun Impersonator',
          intent: 'signup',
        })
        .expect(400);

      expect(res.body.message).toMatch(/already exists/i);
    });
  });

  // ===========================================================================
  // 3. Invalid & Expired OTP Code Handling
  // ===========================================================================
  describe('3. Invalid and Expired OTP Codes', () => {
    it('rejects incorrect OTP code with 400', async () => {
      const email = 'otp.test@vitstudent.ac.in';
      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName: 'OTP Tester', intent: 'signup' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({
          email,
          token: '999999', // Incorrect code
          intent: 'signup',
        })
        .expect(400);

      expect(res.body.message).toMatch(/invalid verification code/i);
    });

    it('rejects expired OTP code with 400', async () => {
      const email = 'expired.test@vitstudent.ac.in';
      // Simulate expired code in test mock boundary
      authService.setTestOtp(email, '654321', 'signup', true);

      const res = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({
          email,
          token: '654321',
          intent: 'signup',
        })
        .expect(400);

      expect(res.body.message).toMatch(/expired/i);
    });

    it('rejects verification when no OTP was requested for that email (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({
          email: 'unsolicited@vitstudent.ac.in',
          token: '123456',
          intent: 'signup',
        })
        .expect(400);

      expect(res.body.message).toMatch(/expired or was not requested/i);
    });
  });

  // ===========================================================================
  // 4. OTP Resend & Cooldown Enforcement
  // ===========================================================================
  describe('4. OTP Resend and Cooldown Enforcement', () => {
    it('enforces 30-second cooldown on rapid resend requests (400)', async () => {
      const email = 'cooldown.user@vitstudent.ac.in';

      // First request
      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName: 'Cooldown User', intent: 'signup' })
        .expect(201);

      // Immediate second request without waiting
      const res = await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ email, intent: 'signup' })
        .expect(400);

      expect(res.body.message).toMatch(/wait.*seconds/i);
    });
  });

  // ===========================================================================
  // 5. Existing User Sign In & Identity Preservation
  // ===========================================================================
  describe('5. Existing User Sign In', () => {
    it('rejects signin request if account does not exist (404)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email: 'nonexistent.user@vitstudent.ac.in',
          intent: 'signin',
        })
        .expect(404);

      expect(res.body.message).toMatch(/no account found/i);
    });

    it('signs in existing user, verifies OTP, restores session, and preserves authoritative database record', async () => {
      const email = 'existing.student@vitstudent.ac.in';

      // Pre-seed user in database
      const initialUser = await testPrisma.user.create({
        data: {
          authUserId: '55555555-5555-4555-8555-555555555555',
          email,
          fullName: 'Existing Commuter',
          audience: Audience.STUDENT,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
          verifiedAt: new Date('2026-10-01T10:00:00Z'),
          role: UserRole.USER,
        },
      });

      // Request signin OTP
      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, intent: 'signin' })
        .expect(201);

      // Verify signin OTP
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({
          email,
          token: '123456',
          intent: 'signin',
        })
        .expect(201);

      expect(verifyRes.body.token).toBeDefined();
      expect(verifyRes.body.user.id).toBe(initialUser.id);
      expect(verifyRes.body.user.email).toBe(email);
      expect(verifyRes.body.user.fullName).toBe('Existing Commuter');
      expect(verifyRes.body.user.audience).toBe('STUDENT');
      expect(verifyRes.body.user.verificationStatus).toBe('VERIFIED');
      expect(verifyRes.body.user.role).toBe('USER');

      // Verify database record was NOT overwritten or mutated
      const refreshedUser = await testPrisma.user.findUniqueOrThrow({ where: { email } });
      expect(refreshedUser.id).toBe(initialUser.id);
      expect(refreshedUser.audience).toBe(Audience.STUDENT);
      expect(refreshedUser.verificationStatus).toBe(VerificationStatus.VERIFIED);
      expect(refreshedUser.verifiedAt?.toISOString()).toBe(initialUser.verifiedAt?.toISOString());
    });
  });

  // ===========================================================================
  // 6. Session Restoration via GET /users/me & Logout
  // ===========================================================================
  describe('6. Session Restoration & Logout', () => {
    it('restores authenticated user profile using Bearer JWT', async () => {
      const email = 'existing.student@vitstudent.ac.in';

      // Verify OTP to obtain token
      authService.setTestOtp(email, '123456', 'signin');
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signin' })
        .expect(201);

      const token = verifyRes.body.token;

      // Call /users/me with Bearer token
      const meRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meRes.body.email).toBe(email);
      expect(meRes.body.audience).toBe('STUDENT');
      expect(meRes.body.verificationStatus).toBe('VERIFIED');
    });

    it('POST /auth/logout returns success', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .expect(201);

      expect(res.body.message).toMatch(/logged out/i);
    });
  });

  // ===========================================================================
  // 7. Security: Client Audience / Role Tampering Protection
  // ===========================================================================
  describe('7. Client Tampering Protection', () => {
    it('rejects request-otp containing client-supplied audience or role (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email: 'tamper@vitstudent.ac.in',
          fullName: 'Tamper Tester',
          intent: 'signup',
          audience: 'FACULTY', // Tamper attempt
          role: 'ADMIN', // Tamper attempt
        })
        .expect(400);
    });

    it('rejects verify-otp containing client-supplied audience or verificationStatus (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({
          email: 'tamper@vitstudent.ac.in',
          token: '123456',
          intent: 'signup',
          audience: 'FACULTY', // Tamper attempt
          verificationStatus: 'VERIFIED', // Tamper attempt
        })
        .expect(400);
    });
  });

  // ===========================================================================
  // 8. Suspended User Restrictions
  // ===========================================================================
  describe('8. Suspended User Access Restrictions', () => {
    it('suspended user can sign in, but retains SUSPENDED status and is blocked from carpooling', async () => {
      const email = 'suspended.commuter2@vitstudent.ac.in';

      // Pre-seed suspended user in database
      await testPrisma.user.create({
        data: {
          authUserId: '99999999-9999-4999-8999-999999999999',
          email,
          fullName: 'Suspended Member',
          audience: Audience.STUDENT,
          verificationStatus: VerificationStatus.SUSPENDED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date('2026-09-01T10:00:00Z'),
        },
      });

      // Sign in
      authService.setTestOtp(email, '123456', 'signin');
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signin' })
        .expect(201);

      expect(verifyRes.body.user.verificationStatus).toBe('SUSPENDED');
      expect(verifyRes.body.user.audience).toBe('STUDENT');

      // Attempting to access carpooling capability endpoint is blocked (403)
      const token = verifyRes.body.token;
      const protectedRes = await request(app.getHttpServer())
        .get('/health/protected-test')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(protectedRes.body.error).toBe('ACCOUNT_SUSPENDED');
    });
  });

  // ===========================================================================
  // 9. Email Classification Service Unit & Edge Case Proofs
  // ===========================================================================
  describe('9. Email Classification Service Edge Cases', () => {
    it('correctly classifies standard student emails', () => {
      const result = classifierService.classify('rayavarapu.rohan2023@vitstudent.ac.in');
      expect(result.isClassified).toBe(true);
      expect(result.audience).toBe(Audience.STUDENT);
      expect(result.ruleMatched).toBe('STUDENT_EMAIL_REGEX');
    });

    it('correctly classifies standard faculty emails', () => {
      const result = classifierService.classify('renukadevi.r@vit.ac.in');
      expect(result.isClassified).toBe(true);
      expect(result.audience).toBe(Audience.FACULTY);
      expect(result.ruleMatched).toBe('FACULTY_EMAIL_REGEX');
    });

    it('fails closed for non-institutional domain (gmail.com)', () => {
      const result = classifierService.classify('student@gmail.com');
      expect(result.isClassified).toBe(false);
      expect(result.audience).toBeNull();
      expect(result.ruleMatched).toBeNull();
    });

    it('fails closed for subdomains or modified domains (vitstudent.com)', () => {
      const result = classifierService.classify('user@vitstudent.com');
      expect(result.isClassified).toBe(false);
      expect(result.audience).toBeNull();
    });
  });
});
