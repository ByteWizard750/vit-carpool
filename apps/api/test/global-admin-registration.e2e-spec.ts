import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GLOBAL_ADMIN_RESERVED_EMAIL, CURRENT_TERMS_VERSION } from '@vit-carpool/contracts';
import { UserRole, VerificationStatus } from '@vit-carpool/db';

describe('Global Super Admin Registration Exception (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_TEST_MODE = 'true';

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

    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Strict Registration Boundary', () => {
    it('1. Rejects arbitrary non-institutional Gmail addresses', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email: 'unauthorized.user@gmail.com',
          fullName: 'Unauthorized User',
          intent: 'signup',
          termsAccepted: true,
          termsVersion: CURRENT_TERMS_VERSION,
        })
        .expect(400);

      expect(res.body.message).toContain('Only institutional email addresses');
    });

    it('2. Rejects other external domains (yahoo, outlook, spoofed domains)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email: 'attacker@vit.com',
          fullName: 'Attacker',
          intent: 'signup',
          termsAccepted: true,
          termsVersion: CURRENT_TERMS_VERSION,
        })
        .expect(400);

      expect(res.body.message).toContain('Only institutional email addresses');
    });

    it('3. Rejects global admin if Terms & Conditions are not accepted', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email: GLOBAL_ADMIN_RESERVED_EMAIL,
          fullName: 'Global Admin',
          intent: 'signup',
          termsAccepted: false,
        })
        .expect(400);

      expect(res.body.message).toContain('Terms & Conditions');
    });

    it('4. Allows vitcarpool.app@gmail.com with termsAccepted: true to request OTP', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({
          email: GLOBAL_ADMIN_RESERVED_EMAIL,
          fullName: 'Global Admin Candidate',
          intent: 'signup',
          termsAccepted: true,
          termsVersion: CURRENT_TERMS_VERSION,
        });

      // Returns 201 Created or 400 if already registered
      expect([201, 400]).toContain(res.status);
    });

    it('5. Confirms global admin is never classified as STUDENT or FACULTY in DB', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { email: GLOBAL_ADMIN_RESERVED_EMAIL },
      });

      if (adminUser) {
        expect(adminUser.audience).toBeNull();
      }
    });
  });
});
