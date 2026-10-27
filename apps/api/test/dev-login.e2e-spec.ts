import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  UserRole,
  VerificationStatus,
  VerificationMethod,
  Audience,
} from '@vit-carpool/db';
import { validateEnv } from '../src/config/env.validation';
import { getTestKeyPair, signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { AuthController } from '../src/modules/auth/auth.controller';

describe('Development Login Security (/auth/dev-login) (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

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
  // 1. Environment Gating & Fail-Closed Behavior
  // ===========================================================================
  describe('1. Environment Gating & Fail-Closed Behavior', () => {
    it('disallows JWT_TEST_MODE=true in production via environment validation', () => {
      expect(() => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_TEST_MODE: 'true',
          DATABASE_URL: testDbUrl,
        });
      }).toThrow(/JWT_TEST_MODE must not be enabled in production environment/);
    });

    it('throws error when test RSA keypair or token signing is attempted in production', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        expect(() => getTestKeyPair()).toThrow(
          /Test keypair fixture is strictly forbidden in production/,
        );
        expect(() =>
          signTestJwt({ sub: 'test-sub', email: 'test@example.com' }),
        ).toThrow(/Test token signing is strictly forbidden in production/);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('devLogin controller method rejects unset, unknown, or production environments with 404 NotFoundException', async () => {
      const mockPrisma = {} as any;
      const mockVerification = {} as any;
      const mockAuthService = {} as any;
      const mockJwksService = {} as any;

      const testScenarios = [
        { NODE_ENV: 'production', JWT_TEST_MODE: true },
        { NODE_ENV: 'production', JWT_TEST_MODE: false },
        { NODE_ENV: 'staging', JWT_TEST_MODE: true },
        { NODE_ENV: undefined, JWT_TEST_MODE: true },
        { NODE_ENV: 'development', JWT_TEST_MODE: false },
        { NODE_ENV: 'test', JWT_TEST_MODE: false },
      ];

      for (const scenario of testScenarios) {
        const mockConfig = {
          get: (key: string) => scenario[key as keyof typeof scenario],
        } as unknown as ConfigService;

        const controller = new AuthController(
          mockConfig,
          mockVerification,
          mockPrisma,
          mockAuthService,
          mockJwksService,
        );
        await expect(
          controller.devLogin({ email: 'test@vitstudent.ac.in' }),
        ).rejects.toThrow(NotFoundException);
      }
    });

    it('dev-login succeeds in explicitly allowed test environment with JWT_TEST_MODE=true', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({
          email: 'valid.student@vitstudent.ac.in',
        })
        .expect(201);

      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('valid.student@vitstudent.ac.in');
      expect(res.body.user.audience).toBe(Audience.STUDENT);
      expect(res.body.user.verificationStatus).toBe(VerificationStatus.VERIFIED);
    });
  });

  // ===========================================================================
  // 2. Privilege Elevation & Impersonation Prevention
  // ===========================================================================
  describe('2. Privilege Elevation & Impersonation Prevention', () => {
    it('rejects attempt to log in as an existing administrator account (403 Forbidden)', async () => {
      const adminEmail = 'super.admin@vit.ac.in';
      await testPrisma.user.upsert({
        where: { email: adminEmail },
        update: { role: UserRole.ADMIN },
        create: {
          authUserId: '00000000-0000-0000-0000-000000000099',
          email: adminEmail,
          fullName: 'Campus Administrator',
          role: UserRole.ADMIN,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
          audience: Audience.FACULTY,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: adminEmail })
        .expect(403);

      expect(res.body.message).toMatch(
        /Development login cannot be used to authenticate administrative accounts/i,
      );
    });

    it('rejects client-supplied audience tampering (student email cannot become faculty)', async () => {
      const email = 'sneaky.student@vitstudent.ac.in';
      const res = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({
          email,
          audience: Audience.FACULTY, // Tampering attempt
        })
        .expect(201);

      // Must be classified as STUDENT based on domain, NOT FACULTY
      expect(res.body.user.audience).toBe(Audience.STUDENT);

      const dbUser = await testPrisma.user.findUniqueOrThrow({ where: { email } });
      expect(dbUser.audience).toBe(Audience.STUDENT);
      expect(dbUser.role).toBe(UserRole.USER);
    });

    it('rejects client-supplied audience tampering (faculty email cannot become student)', async () => {
      const email = 'prof.test@vit.ac.in';
      const res = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({
          email,
          audience: Audience.STUDENT, // Tampering attempt
        })
        .expect(201);

      // Must be classified as FACULTY based on domain, NOT STUDENT
      expect(res.body.user.audience).toBe(Audience.FACULTY);

      const dbUser = await testPrisma.user.findUniqueOrThrow({ where: { email } });
      expect(dbUser.audience).toBe(Audience.FACULTY);
    });

    it('non-institutional emails cannot be verified or assigned an audience (always PENDING)', async () => {
      const email = 'outsider@gmail.com';
      const res = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({
          email,
          status: VerificationStatus.VERIFIED, // Tampering attempt
          audience: Audience.STUDENT, // Tampering attempt
        })
        .expect(201);

      expect(res.body.user.audience).toBeNull();
      expect(res.body.user.verificationStatus).toBe(VerificationStatus.PENDING);

      const dbUser = await testPrisma.user.findUniqueOrThrow({ where: { email } });
      expect(dbUser.audience).toBeNull();
      expect(dbUser.verificationStatus).toBe(VerificationStatus.PENDING);
    });

    it('does not overwrite existing database user audience or role on repeated dev-login', async () => {
      const email = 'existing.driver@vitstudent.ac.in';
      const originalUser = await testPrisma.user.upsert({
        where: { email },
        update: {},
        create: {
          authUserId: '11111111-2222-3333-4444-555555555555',
          email,
          fullName: 'Original Driver Name',
          audience: Audience.STUDENT,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
          role: UserRole.USER,
        },
      });

      // Attempt to pass different name/status
      const res = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({
          email,
          fullName: 'Overwritten Hacked Name',
          status: VerificationStatus.PENDING,
        })
        .expect(201);

      // Name and DB record remain unchanged
      expect(res.body.user.fullName).toBe('Original Driver Name');
      expect(res.body.user.verificationStatus).toBe(VerificationStatus.VERIFIED);

      const dbUser = await testPrisma.user.findUniqueOrThrow({ where: { email } });
      expect(dbUser.fullName).toBe('Original Driver Name');
      expect(dbUser.verificationStatus).toBe(VerificationStatus.VERIFIED);
    });
  });
});
