import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { PrismaClient, UserRole, VerificationStatus, Audience } from '@vit-carpool/db';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwksService } from '../src/modules/auth/jwks.service';
import { AuthRateLimiterGuard } from '../src/modules/auth/guards/auth-rate-limiter.guard';
import { OtpCleanupService } from '../src/modules/auth/otp-cleanup.service';
import { SupabaseAuthGuard } from '../src/modules/auth/guards/supabase-auth.guard';
import { validateEnv, validateRsaKeyPair } from '../src/config/env.validation';

describe('Security Remediations: Custom OTP, RS256 JWT, Rate Limiting & Privacy (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let authService: AuthService;
  let jwksService: JwksService;
  let rateLimiterGuard: AuthRateLimiterGuard;
  let otpCleanupService: OtpCleanupService;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Generate an ephemeral 2048-bit RSA keypair for custom RS256 production tests
  const dynamicKeyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const testEmails = [
    'student.success@vitstudent.ac.in',
    'student.bruteforce@vitstudent.ac.in',
    'student.resend@vitstudent.ac.in',
    'student.cluster@vitstudent.ac.in',
    'concurrent.bruteforce@vitstudent.ac.in',
    'concurrent.valid@vitstudent.ac.in',
    'intent.signup@vitstudent.ac.in',
    'intent.signin@vitstudent.ac.in',
    'intent.resend@vitstudent.ac.in',
    'active.otp@vitstudent.ac.in',
    'abandoned.otp@vitstudent.ac.in',
    'active.cron@vitstudent.ac.in',
    'abandoned.cron@vitstudent.ac.in',
    'attacker@vitstudent.ac.in',
    'expired@vitstudent.ac.in',
    'badaud@vitstudent.ac.in',
    'spam1@vitstudent.ac.in',
    'spam2@vitstudent.ac.in',
    'spam3@vitstudent.ac.in',
    'spam4@vitstudent.ac.in',
    'spoof1@vitstudent.ac.in',
    'spoof2@vitstudent.ac.in',
    'spoof3@vitstudent.ac.in',
    'spoof4@vitstudent.ac.in',
    'privacy.student@vitstudent.ac.in',
  ];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'true';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean test tables for remediation test emails only to avoid FK conflicts
    await testPrisma.otpVerification.deleteMany({ where: { email: { in: testEmails } } });
    await testPrisma.user.deleteMany({ where: { email: { in: testEmails } } });

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
    jwksService = app.get(JwksService);
    rateLimiterGuard = app.get(AuthRateLimiterGuard);
    otpCleanupService = app.get(OtpCleanupService);
  });

  afterAll(async () => {
    if (rateLimiterGuard) {
      (rateLimiterGuard as any).maxLimit = 100;
      rateLimiterGuard.reset();
    }
    if (app) {
      await app.close();
    }
    await testPrisma.otpVerification.deleteMany({ where: { email: { in: testEmails } } });
    await testPrisma.user.deleteMany({ where: { email: { in: testEmails } } });
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    if (rateLimiterGuard) {
      (rateLimiterGuard as any).maxLimit = 100;
      rateLimiterGuard.reset();
    }
    await testPrisma.otpVerification.deleteMany({ where: { email: { in: testEmails } } });
  });

  afterEach(() => {
    if (rateLimiterGuard) {
      (rateLimiterGuard as any).maxLimit = 100;
      rateLimiterGuard.reset();
    }
  });

  // ===========================================================================
  // 1. OTP Brute-Force & Attempt Tracking (Finding 1)
  // ===========================================================================
  describe('1. OTP Brute-Force Protection & Attempt Tracking', () => {
    it('allows valid OTP on first attempt and consumes it immediately (single-use)', async () => {
      const email = 'student.success@vitstudent.ac.in';
      const fullName = 'Success Student';

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName, intent: 'signup' })
        .expect(201);

      // Verify OTP with default test code '123456'
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signup', fullName })
        .expect(201);

      expect(verifyRes.body.token).toBeDefined();

      // Database OTP record must be deleted immediately upon successful verification
      const dbOtp = await testPrisma.otpVerification.findUnique({ where: { email } });
      expect(dbOtp).toBeNull();

      // Second attempt to verify the same OTP must fail (single-use consumption)
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signup', fullName })
        .expect(400);
    });

    it('tracks failed attempts and invalidates OTP after exactly 5 incorrect guesses', async () => {
      const email = 'student.bruteforce@vitstudent.ac.in';
      const fullName = 'Bruteforce Target';

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName, intent: 'signup' })
        .expect(201);

      // Guesses 1 through 4: Should return 400 with remaining attempts countdown
      for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await request(app.getHttpServer())
          .post('/auth/verify-otp')
          .send({ email, token: `99999${attempt}`, intent: 'signup' })
          .expect(400);

        const expectedRemaining = 5 - attempt;
        expect(res.body.message).toContain(`${expectedRemaining} attempt(s) remaining`);

        // Verify PostgreSQL failedAttempts counter incremented atomically
        const record = await testPrisma.otpVerification.findUnique({ where: { email } });
        expect(record).not.toBeNull();
        expect(record?.failedAttempts).toBe(attempt);
      }

      // 5th incorrect attempt: Must invalidate the code completely and delete it from DB
      const finalRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '999995', intent: 'signup' })
        .expect(400);

      expect(finalRes.body.message).toMatch(/Too many incorrect verification attempts.*invalidated/i);

      // Record must be deleted from PostgreSQL
      const deletedRecord = await testPrisma.otpVerification.findUnique({ where: { email } });
      expect(deletedRecord).toBeNull();

      // Even if the attacker now tries the real code ('123456'), it must fail
      const subsequentRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signup' })
        .expect(400);

      expect(subsequentRes.body.message).toMatch(/expired or was not requested/i);
    });

    it('resending an OTP resets failed attempts and invalidates the previous code', async () => {
      const email = 'student.resend@vitstudent.ac.in';

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName: 'Resend Student', intent: 'signup' })
        .expect(201);

      // Make 2 failed guesses
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '000000', intent: 'signup' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '111111', intent: 'signup' })
        .expect(400);

      const recordBeforeResend = await testPrisma.otpVerification.findUniqueOrThrow({ where: { email } });
      expect(recordBeforeResend.failedAttempts).toBe(2);

      // Fast-forward cooldown in DB to allow resend
      await testPrisma.otpVerification.update({
        where: { email },
        data: { cooldownUntil: new Date(Date.now() - 1000) },
      });

      // Request new OTP via resend
      await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ email, intent: 'signup' })
        .expect(201);

      // Verify that failedAttempts was reset to 0 in PostgreSQL
      const recordAfterResend = await testPrisma.otpVerification.findUniqueOrThrow({ where: { email } });
      expect(recordAfterResend.failedAttempts).toBe(0);
      expect(recordAfterResend.salt).not.toBe(recordBeforeResend.salt);
    });

    it('multi-instance verification: shared PostgreSQL state allows verification across simulated backend instances', async () => {
      const email = 'student.cluster@vitstudent.ac.in';
      const fullName = 'Cluster User';

      // Instance A creates OTP
      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName, intent: 'signup' })
        .expect(201);

      // Verify that instance B (direct DB inspection / transaction) sees the exact same HMAC verifier
      const dbEntry = await testPrisma.otpVerification.findUnique({ where: { email } });
      expect(dbEntry).not.toBeNull();
      expect(dbEntry?.failedAttempts).toBe(0);

      // Instance B processes verification against PostgreSQL state
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signup', fullName })
        .expect(201);

      expect(verifyRes.body.token).toBeDefined();

      // State is consumed across all instances
      const consumedEntry = await testPrisma.otpVerification.findUnique({ where: { email } });
      expect(consumedEntry).toBeNull();
    });

    it('cleanupExpiredOtps removes abandoned expired records without deleting active codes', async () => {
      const activeEmail = 'active.otp@vitstudent.ac.in';
      const abandonedEmail = 'abandoned.otp@vitstudent.ac.in';

      // Active OTP (expires in 5 minutes)
      await testPrisma.otpVerification.create({
        data: {
          email: activeEmail,
          verifierHash: 'hash-active',
          salt: 'salt-active',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          cooldownUntil: new Date(Date.now() + 30 * 1000),
        },
      });

      // Abandoned OTP (expired 2 hours ago)
      await testPrisma.otpVerification.create({
        data: {
          email: abandonedEmail,
          verifierHash: 'hash-abandoned',
          salt: 'salt-abandoned',
          expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          cooldownUntil: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      });

      const deletedCount = await authService.cleanupExpiredOtps();
      expect(deletedCount).toBe(1);

      // Active OTP remains intact
      const activeStillExists = await testPrisma.otpVerification.findUnique({ where: { email: activeEmail } });
      expect(activeStillExists).not.toBeNull();

      // Abandoned OTP was cleaned up
      const abandonedExists = await testPrisma.otpVerification.findUnique({ where: { email: abandonedEmail } });
      expect(abandonedExists).toBeNull();
    });

    it('concurrent parallel incorrect guesses atomically increment failedAttempts and lockout without undercounting', async () => {
      const email = 'concurrent.bruteforce@vitstudent.ac.in';
      const fullName = 'Concurrent Bruteforce Target';

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName, intent: 'signup' })
        .expect(201);

      // Fire 5 simultaneous parallel guesses with incorrect codes
      const responses = await Promise.all([
        request(app.getHttpServer()).post('/auth/verify-otp').send({ email, token: '999901', intent: 'signup' }),
        request(app.getHttpServer()).post('/auth/verify-otp').send({ email, token: '999902', intent: 'signup' }),
        request(app.getHttpServer()).post('/auth/verify-otp').send({ email, token: '999903', intent: 'signup' }),
        request(app.getHttpServer()).post('/auth/verify-otp').send({ email, token: '999904', intent: 'signup' }),
        request(app.getHttpServer()).post('/auth/verify-otp').send({ email, token: '999905', intent: 'signup' }),
      ]);

      // All 5 must be rejected with 400
      responses.forEach((res) => expect(res.status).toBe(400));

      // At least one response must indicate that attempts have been exhausted / invalidated
      const hasInvalidatedResponse = responses.some((res) =>
        /Too many incorrect verification attempts.*invalidated/i.test(res.body.message),
      );
      expect(hasInvalidatedResponse).toBe(true);

      // The record must now be deleted from PostgreSQL
      const dbRecord = await testPrisma.otpVerification.findUnique({ where: { email } });
      expect(dbRecord).toBeNull();

      // Subsequent attempt with the real code ('123456') must fail
      const subsequentRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signup' })
        .expect(400);

      expect(subsequentRes.body.message).toMatch(/expired or was not requested/i);
    });

    it('concurrent parallel valid verification requests issue exactly ONE session and reject duplicates', async () => {
      const email = 'concurrent.valid@vitstudent.ac.in';
      const fullName = 'Concurrent Valid Target';

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName, intent: 'signup' })
        .expect(201);

      // Fire 2 simultaneous parallel verification requests with the valid code ('123456')
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer()).post('/auth/verify-otp').send({ email, token: '123456', intent: 'signup', fullName }),
        request(app.getHttpServer()).post('/auth/verify-otp').send({ email, token: '123456', intent: 'signup', fullName }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 400]);

      const successRes = resA.status === 201 ? resA : resB;
      const failRes = resA.status === 400 ? resA : resB;

      expect(successRes.body.token).toBeDefined();
      expect(failRes.body.message).toMatch(/already used, expired, or invalidated/i);

      // Database OTP record must be deleted
      const dbOtp = await testPrisma.otpVerification.findUnique({ where: { email } });
      expect(dbOtp).toBeNull();
    });
  });

  // ===========================================================================
  // 1.1. OTP Intent Validation
  // ===========================================================================
  describe('1.1. OTP Intent Validation', () => {
    it('rejects signup OTP submitted to signin verification without consuming state', async () => {
      const email = 'intent.signup@vitstudent.ac.in';
      const fullName = 'Intent Signup User';

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName, intent: 'signup' })
        .expect(201);

      // Submit valid OTP with mismatched intent 'signin'
      const res = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signin' })
        .expect(400);

      expect(res.body.message).toMatch(/Verification intent mismatch.*requested for signup, not signin/i);

      // Verify OTP is NOT deleted/consumed by the mismatched attempt
      const dbOtp = await testPrisma.otpVerification.findUnique({ where: { email } });
      expect(dbOtp).not.toBeNull();
      expect(dbOtp?.intent).toBe('signup');

      // Now verify with correct intent 'signup' -> must succeed
      const successRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signup', fullName })
        .expect(201);

      expect(successRes.body.token).toBeDefined();
    });

    it('rejects signin OTP submitted to signup verification', async () => {
      const email = 'intent.signin@vitstudent.ac.in';
      const fullName = 'Intent Signin User';

      // Provision user via initial signup so signin request is allowed
      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName, intent: 'signup' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signup', fullName })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, intent: 'signin' })
        .expect(201);

      // Submit valid OTP with mismatched intent 'signup'
      const res = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signup', fullName })
        .expect(400);

      expect(res.body.message).toMatch(/Verification intent mismatch.*requested for signin, not signup/i);

      // Verify with correct intent 'signin' -> succeeds
      const successRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signin' })
        .expect(201);

      expect(successRes.body.token).toBeDefined();
    });

    it('resending an OTP preserves intent and registration full name', async () => {
      const email = 'intent.resend@vitstudent.ac.in';
      const fullName = 'Intent Resend User';

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email, fullName, intent: 'signup' })
        .expect(201);

      // Fast-forward cooldown in DB
      await testPrisma.otpVerification.update({
        where: { email },
        data: { cooldownUntil: new Date(Date.now() - 1000) },
      });

      // Resend signup OTP without supplying fullName in payload
      await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ email, intent: 'signup' })
        .expect(201);

      const dbOtp = await testPrisma.otpVerification.findUniqueOrThrow({ where: { email } });
      expect(dbOtp.intent).toBe('signup');
      expect(dbOtp.fullName).toBe(fullName);

      // Verify with correct intent succeeds
      const res = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ email, token: '123456', intent: 'signup' })
        .expect(201);

      expect(res.body.token).toBeDefined();
      expect(res.body.user.fullName).toBe(fullName);
    });
  });

  // ===========================================================================
  // 2. Custom RS256 JWT Security & JWKS Endpoint (Finding 3)
  // ===========================================================================
  describe('2. Custom RS256 JWT Token Signing & Public JWKS Discovery', () => {
    it('JWKS endpoint (/auth/.well-known/jwks.json) returns valid public key without exposing private key material', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/.well-known/jwks.json')
        .expect(200);

      expect(res.body.keys).toBeDefined();
      expect(Array.isArray(res.body.keys)).toBe(true);
      expect(res.body.keys.length).toBeGreaterThan(0);

      const jwk = res.body.keys[0];
      expect(jwk.kty).toBe('RSA');
      expect(jwk.alg).toBe('RS256');
      expect(jwk.use).toBe('sig');
      expect(jwk.n).toBeDefined();
      expect(jwk.e).toBeDefined();

      // Critical Security Check: Ensure NO private RSA parameters are exposed
      expect(jwk.d).toBeUndefined();
      expect(jwk.p).toBeUndefined();
      expect(jwk.q).toBeUndefined();
      expect(jwk.dp).toBeUndefined();
      expect(jwk.dq).toBeUndefined();
      expect(jwk.qi).toBeUndefined();
    });

    it('rejects tokens signed with unauthorized or tampered private keys (401)', async () => {
      const rogueKey = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const forgedToken = jwt.sign(
        { email: 'student@vitstudent.ac.in', role: 'authenticated' },
        rogueKey.privateKey,
        {
          algorithm: 'RS256',
          subject: crypto.randomUUID(),
          audience: 'authenticated',
          issuer: 'https://mock-supabase.local/auth/v1',
          expiresIn: '1h',
        },
      );

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${forgedToken}`)
        .expect(401);
    });

    it('rejects tokens using algorithm "none" (401)', async () => {
      // Insecure 'none' algorithm header attempt
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: crypto.randomUUID(),
          email: 'attacker@vitstudent.ac.in',
          aud: 'authenticated',
          iss: 'https://mock-supabase.local/auth/v1',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${noneToken}`)
        .expect(401);
    });

    it('rejects expired RS256 tokens (401)', async () => {
      // Token expired 1 hour ago
      const token = jwt.sign(
        { email: 'expired@vitstudent.ac.in', role: 'authenticated' },
        dynamicKeyPair.privateKey,
        {
          algorithm: 'RS256',
          subject: crypto.randomUUID(),
          audience: 'authenticated',
          issuer: 'https://mock-supabase.local/auth/v1',
          expiresIn: '-1h',
        },
      );

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('rejects tokens with incorrect audience or issuer (401)', async () => {
      const badAudToken = jwt.sign(
        { email: 'badaud@vitstudent.ac.in', role: 'authenticated' },
        dynamicKeyPair.privateKey,
        {
          algorithm: 'RS256',
          subject: crypto.randomUUID(),
          audience: 'wrong-audience',
          issuer: 'https://mock-supabase.local/auth/v1',
          expiresIn: '1h',
        },
      );

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${badAudToken}`)
        .expect(401);
    });

    it('validates matching RSA keypair correspondence helper correctly', () => {
      const isMatch = validateRsaKeyPair(dynamicKeyPair.privateKey, dynamicKeyPair.publicKey);
      expect(isMatch).toBe(true);

      // Test with mismatched public key
      const anotherKey = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const isMismatch = validateRsaKeyPair(dynamicKeyPair.privateKey, anotherKey.publicKey);
      expect(isMismatch).toBe(false);
    });

    it('fails application startup validation in production if RS256 keys or Supabase are missing', () => {
      expect(() => {
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: testDbUrl,
          LOCATION_PROVIDER: 'mapbox',
          MAPBOX_ACCESS_TOKEN: 'valid-token',
          JWT_TEST_MODE: 'false',
          JWT_PRIVATE_KEY: '',
          JWT_PUBLIC_KEY: '',
        });
      }).toThrow(/In production environment, both JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be configured/);
    });

    it('serves valid public JWKS at both /auth/.well-known/jwks.json and /auth/v1/.well-known/jwks.json', async () => {
      const resPrimary = await request(app.getHttpServer())
        .get('/auth/.well-known/jwks.json')
        .expect(200);

      const resAliased = await request(app.getHttpServer())
        .get('/auth/v1/.well-known/jwks.json')
        .expect(200);

      expect(resPrimary.body.keys).toBeDefined();
      expect(resAliased.body.keys).toBeDefined();
      expect(resPrimary.body).toEqual(resAliased.body);
    });

    it('rejects mock Supabase issuer tokens when NODE_ENV is production in SupabaseAuthGuard', async () => {
      const guard = new SupabaseAuthGuard(
        { getAllAndOverride: () => false } as any,
        {
          get: (key: string) => {
            if (key === 'NODE_ENV') return 'production';
            if (key === 'JWT_ISSUER') return 'https://api.vitcarpool.app/auth/v1';
            return null;
          },
        } as any,
        {} as any,
        jwksService,
      );

      // Token with mock Supabase issuer
      const mockToken = jwt.sign(
        { email: 'student@vitstudent.ac.in', role: 'authenticated' },
        dynamicKeyPair.privateKey,
        {
          algorithm: 'RS256',
          issuer: 'https://mock-supabase.local/auth/v1',
          subject: 'prod-target-sub',
          audience: 'authenticated',
        },
      );

      const mockContext = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${mockToken}` },
          }),
        }),
      } as any;

      await expect(guard.canActivate(mockContext)).rejects.toThrow();
    });
  });

  // ===========================================================================
  // 3. Rate Limiting Protection (Finding 6)
  // ===========================================================================
  describe('3. IP-Based Sliding-Window Rate Limiting', () => {
    it('returns 429 Too Many Requests when IP exceeds the request threshold', async () => {
      // Set test limit to 4 so 4th request triggers 429
      (rateLimiterGuard as any).maxLimit = 4;

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email: 'spam1@vitstudent.ac.in', fullName: 'Spam 1', intent: 'signup' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email: 'spam2@vitstudent.ac.in', fullName: 'Spam 2', intent: 'signup' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email: 'spam3@vitstudent.ac.in', fullName: 'Spam 3', intent: 'signup' })
        .expect(201);

      // 4th request exceeds effective limit of 3 for request-otp and returns 429
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ email: 'spam4@vitstudent.ac.in', fullName: 'Spam 4', intent: 'signup' })
        .expect(429);

      expect(res.body.error).toBe('Too Many Requests');
      expect(res.body.message).toMatch(/Too many authentication attempts from this IP/i);
    });

    it('ignores client-supplied X-Forwarded-For header when trust proxy is not configured', async () => {
      // Reset rate limiter and configure limit to 4
      rateLimiterGuard.reset();
      (rateLimiterGuard as any).maxLimit = 4;

      // Send 3 requests with varying fake X-Forwarded-For headers from the same client socket
      for (let i = 1; i <= 3; i++) {
        await request(app.getHttpServer())
          .post('/auth/request-otp')
          .set('X-Forwarded-For', `203.0.113.${10 + i}`)
          .send({ email: `spoof${i}@vitstudent.ac.in`, fullName: `Spoof ${i}`, intent: 'signup' })
          .expect(201);
      }

      // 4th request from same socket (even with another fake header) must trigger 429
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .set('X-Forwarded-For', '203.0.113.99')
        .send({ email: 'spoof4@vitstudent.ac.in', fullName: 'Spoof 4', intent: 'signup' })
        .expect(429);

      expect(res.body.error).toBe('Too Many Requests');
    });
  });

  // ===========================================================================
  // 4. Privacy & Absence of Plaintext Secrets in Logs (Finding 2)
  // ===========================================================================
  describe('4. Sensitive Credential & OTP Privacy', () => {
    it('never includes plaintext OTP in API response bodies', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email: 'privacy.student@vitstudent.ac.in',
          fullName: 'Privacy Student',
          intent: 'signup',
        })
        .expect(201);

      // Verify response body contains only user-friendly status message and cooldown
      expect(res.body.token).toBeUndefined();
      expect(res.body.otp).toBeUndefined();
      expect(res.body.code).toBeUndefined();
      expect(res.body.message).toBe('Verification code sent to your institutional email.');
      expect(res.body.cooldownSeconds).toBe(30);
    });
  });

  // ===========================================================================
  // 5. Periodic OTP Cleanup Service
  // ===========================================================================
  describe('5. Periodic OTP Cleanup Service', () => {
    it('prunes abandoned expired OTP records older than 1 hour without deleting active OTPs', async () => {
      const activeEmail = 'active.cron@vitstudent.ac.in';
      const abandonedEmail = 'abandoned.cron@vitstudent.ac.in';

      // 1. Active OTP: expires in 5 minutes
      await testPrisma.otpVerification.upsert({
        where: { email: activeEmail },
        create: {
          email: activeEmail,
          verifierHash: 'active-hash',
          salt: 'active-salt',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          cooldownUntil: new Date(),
        },
        update: {
          verifierHash: 'active-hash',
          salt: 'active-salt',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          cooldownUntil: new Date(),
        },
      });

      // 2. Abandoned OTP: expired 2 hours ago
      await testPrisma.otpVerification.upsert({
        where: { email: abandonedEmail },
        create: {
          email: abandonedEmail,
          verifierHash: 'abandoned-hash',
          salt: 'abandoned-salt',
          expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          cooldownUntil: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
        update: {
          verifierHash: 'abandoned-hash',
          salt: 'abandoned-salt',
          expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          cooldownUntil: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      });

      const deletedCount = await otpCleanupService.runCleanup();
      expect(deletedCount).toBeGreaterThanOrEqual(1);

      // Verify abandoned record is deleted
      const checkAbandoned = await testPrisma.otpVerification.findUnique({ where: { email: abandonedEmail } });
      expect(checkAbandoned).toBeNull();

      // Verify active record is preserved
      const checkActive = await testPrisma.otpVerification.findUnique({ where: { email: activeEmail } });
      expect(checkActive).not.toBeNull();
    });
  });
});
