import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { io, Socket } from 'socket.io-client';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  UserRole,
  VerificationStatus,
  Audience,
  VerificationMethod,
} from '@vit-carpool/db';
import { signTestJwt, getTestKeyPair } from '../src/modules/auth/jwt-keys.fixture';

describe('Token Version Session Invalidation Architecture (E2E Regression)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let serverPort: number;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  const testUserEmail = 'token.version.tester@vitstudent.ac.in';
  const adminEmail = 'token.version.admin@vit.ac.in';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.OTP_HMAC_SECRET = 'test-deterministic-hmac-secret-min-16-chars';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean test data
    await testPrisma.cabFareAcknowledgement.deleteMany();
    await testPrisma.cabShareDetail.deleteMany();
    await testPrisma.driverLocationSnapshot.deleteMany();
    await testPrisma.rideTrackingSession.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.otpVerification.deleteMany();
    await testPrisma.user.deleteMany({
      where: { email: { in: [testUserEmail, adminEmail, 'multi.device@vitstudent.ac.in', 'concurrent.logout@vitstudent.ac.in'] } },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    );
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    serverPort = typeof address === 'string' ? 3000 : address.port;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPrisma) {
      await testPrisma.user.deleteMany({
        where: { email: { in: [testUserEmail, adminEmail, 'multi.device@vitstudent.ac.in', 'concurrent.logout@vitstudent.ac.in'] } },
      });
      await testPrisma.$disconnect();
    }
  });

  // ===========================================================================
  // A, B, C: Token A -> Logout -> Token A Rejected -> Immediate Login Token B -> Token A Remains Rejected
  // ===========================================================================
  describe('A, B, C: Token A Revocation & Permanent Rejection Across Re-Login', () => {
    let tokenA: string;
    let tokenB: string;

    it('A: Logs in, receives Token A with current tokenVersion, verifies access, then logs out', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: testUserEmail, fullName: 'Token Version User' })
        .expect(201);

      tokenA = loginRes.body.token;
      expect(tokenA).toBeDefined();

      const decodedA = jwt.decode(tokenA) as any;
      expect(decodedA.tokenVersion).toBe(1);

      // Verify Token A works
      const meRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(meRes.body.email).toBe(testUserEmail);

      // Perform logout with Token A
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(201);

      // Token A must immediately be rejected
      const rejectedRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(401);
      expect(rejectedRes.body.message).toMatch(/Session has expired due to logout/i);
    });

    it('B: Immediately logs in to obtain Token B and verifies Token B works', async () => {
      const reLoginRes = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: testUserEmail, fullName: 'Token Version User' })
        .expect(201);

      tokenB = reLoginRes.body.token;
      expect(tokenB).toBeDefined();

      const decodedB = jwt.decode(tokenB) as any;
      expect(decodedB.tokenVersion).toBe(2);

      // Token B must work
      const meRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(meRes.body.email).toBe(testUserEmail);
    });

    it('C: Token A remains strictly rejected after Token B is issued (No Token Resurrection)', async () => {
      const rejectedRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(401);

      expect(rejectedRes.body.message).toMatch(/Session has expired due to logout/i);
    });
  });

  // ===========================================================================
  // D, E, F: Sub-Second, Same-Millisecond & Multiple Rapid Cycles
  // ===========================================================================
  describe('D, E, F: High-Frequency Rapid Logout and Re-Login Cycles', () => {
    it('D & E: Rapid logout and re-login within the exact same second / millisecond window', async () => {
      // 1. Login
      const login1 = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: testUserEmail })
        .expect(201);
      const firstToken = login1.body.token;

      // 2. Immediately logout and re-login back-to-back with zero delay
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${firstToken}`)
        .expect(201);

      const login2 = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: testUserEmail })
        .expect(201);
      const secondToken = login2.body.token;

      // First token MUST remain rejected
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${firstToken}`)
        .expect(401);

      // Second token MUST succeed
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${secondToken}`)
        .expect(200);
    });

    it('F: Multiple consecutive rapid logout and login cycles (5 cycles)', async () => {
      const revokedTokens: string[] = [];

      for (let i = 0; i < 5; i++) {
        const login = await request(app.getHttpServer())
          .post('/auth/dev-login')
          .send({ email: testUserEmail })
          .expect(201);
        const currentToken = login.body.token;

        await request(app.getHttpServer())
          .post('/auth/logout')
          .set('Authorization', `Bearer ${currentToken}`)
          .expect(201);

        revokedTokens.push(currentToken);
      }

      // Final login to obtain active token
      const finalLogin = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: testUserEmail })
        .expect(201);
      const activeToken = finalLogin.body.token;

      // Verify active token works
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${activeToken}`)
        .expect(200);

      // Every single historical token MUST be rejected
      for (const oldToken of revokedTokens) {
        await request(app.getHttpServer())
          .get('/users/me')
          .set('Authorization', `Bearer ${oldToken}`)
          .expect(401);
      }
    });
  });

  // ===========================================================================
  // G: Multi-Device Session Invalidation
  // ===========================================================================
  describe('G: Multi-Device Session Invalidation', () => {
    it('invalidates tokens issued to all devices when logout occurs on any device', async () => {
      const multiEmail = 'multi.device@vitstudent.ac.in';

      // Simulate device 1 login
      const dev1Res = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: multiEmail, fullName: 'Multi Device User' })
        .expect(201);
      const device1Token = dev1Res.body.token;

      // Simulate device 2 login sharing the active tokenVersion
      const dev2Res = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: multiEmail })
        .expect(201);
      const device2Token = dev2Res.body.token;

      // Both devices initially valid
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${device1Token}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${device2Token}`)
        .expect(200);

      // Device 1 initiates logout
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${device1Token}`)
        .expect(201);

      // Both device 1 and device 2 tokens are now revoked
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${device1Token}`)
        .expect(401);

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${device2Token}`)
        .expect(401);
    });
  });

  // ===========================================================================
  // H: REST API Rejects Revoked Tokens Across Multiple Endpoints
  // ===========================================================================
  describe('H: REST API Rejection Across Protected Endpoints', () => {
    it('rejects revoked tokens across /users/me, /rides/my-rides, and /bookings/my-bookings', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: testUserEmail })
        .expect(201);
      const token = loginRes.body.token;

      // Logout
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      // Test multiple endpoints
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      await request(app.getHttpServer())
        .get('/rides/my-rides')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      await request(app.getHttpServer())
        .get('/bookings/my-bookings')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  // ===========================================================================
  // I & J: Tracking WebSocket Authentication
  // ===========================================================================
  describe('I & J: Tracking WebSocket Gateway Session Invalidation', () => {
    let freshToken: string;
    let revokedToken: string;

    beforeAll(async () => {
      // 1. Create a session to revoke
      const loginOld = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: testUserEmail })
        .expect(201);
      revokedToken = loginOld.body.token;

      // Logout to invalidate revokedToken
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${revokedToken}`)
        .expect(201);

      // 2. Create a fresh session
      const loginFresh = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: testUserEmail })
        .expect(201);
      freshToken = loginFresh.body.token;
    });

    it('I: Rejects revoked token on WebSocket connection to /tracking', (done) => {
      const wsUrl = `http://localhost:${serverPort}/tracking`;
      const socket: Socket = io(wsUrl, {
        transports: ['websocket'],
        auth: { token: revokedToken },
        timeout: 3000,
        reconnection: false,
      });

      let errorReceived = false;

      socket.on('error', (err: any) => {
        errorReceived = true;
        expect(err.code).toBe('UNAUTHORIZED');
        expect(err.message).toMatch(/Session has expired due to logout/i);
      });

      socket.on('disconnect', () => {
        expect(errorReceived).toBe(true);
        socket.close();
        done();
      });

      socket.on('connect', () => {
        // Socket should not stay connected for revoked token
        setTimeout(() => {
          if (!errorReceived) {
            socket.close();
            done(new Error('WebSocket connection was erroneously accepted for revoked token!'));
          }
        }, 1000);
      });
    });

    it('J: Successfully accepts fresh token on WebSocket connection to /tracking', (done) => {
      const wsUrl = `http://localhost:${serverPort}/tracking`;
      const socket: Socket = io(wsUrl, {
        transports: ['websocket'],
        auth: { token: freshToken },
        timeout: 3000,
        reconnection: false,
      });

      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        socket.close();
        done();
      });

      socket.on('error', (err: any) => {
        socket.close();
        done(new Error(`WebSocket failed to connect with fresh token: ${JSON.stringify(err)}`));
      });
    });
  });

  // ===========================================================================
  // K: Admin Authentication Unaffected
  // ===========================================================================
  describe('K: Admin Authentication and Privileges', () => {
    it('ensures admin accounts receive tokenVersion and maintain administrative RBAC access', async () => {
      // 1. Create admin user
      const adminAuthId = crypto.randomUUID();
      const adminUser = await testPrisma.user.upsert({
        where: { email: adminEmail },
        update: { role: UserRole.ADMIN, tokenVersion: 1 },
        create: {
          authUserId: adminAuthId,
          email: adminEmail,
          fullName: 'Security Regression Admin',
          role: UserRole.ADMIN,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
          audience: Audience.FACULTY,
          tokenVersion: 1,
        },
      });

      const adminToken = signTestJwt({
        sub: adminUser.authUserId,
        email: adminEmail,
        role: UserRole.ADMIN,
        tokenVersion: 1,
      });

      // Admin access to admin operations endpoint
      const res = await request(app.getHttpServer())
        .get('/admin/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toBeDefined();

      // Logout admin
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      // Old admin token now rejected
      await request(app.getHttpServer())
        .get('/admin/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(401);
    });
  });

  // ===========================================================================
  // L: Concurrent Logout Requests Atomicity
  // ===========================================================================
  describe('L: Concurrent Logout Requests Atomicity', () => {
    it('handles concurrent logout requests atomically without inconsistent versions', async () => {
      const concurrentEmail = 'concurrent.logout@vitstudent.ac.in';

      const login = await request(app.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: concurrentEmail, fullName: 'Concurrent Logout Tester' })
        .expect(201);
      const token = login.body.token;

      const userBefore = await testPrisma.user.findUnique({
        where: { email: concurrentEmail },
      });
      const initialVersion = userBefore!.tokenVersion;

      // Dispatch 5 concurrent logout requests simultaneously
      const logoutPromises = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/auth/logout')
          .set('Authorization', `Bearer ${token}`),
      );

      const results = await Promise.all(logoutPromises);
      for (const res of results) {
        expect(res.status).toBe(201);
      }

      // Database version MUST have incremented by exactly 5
      const userAfter = await testPrisma.user.findUnique({
        where: { email: concurrentEmail },
      });
      expect(userAfter!.tokenVersion).toBe(initialVersion + 5);

      // Old token must be rejected
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  // ===========================================================================
  // Additional Security Checks: Missing, Non-Number & Mismatched tokenVersion
  // ===========================================================================
  describe('Security Requirements: Strict tokenVersion Validation', () => {
    it('rejects tokens with missing tokenVersion claim', async () => {
      const user = await testPrisma.user.findUnique({ where: { email: testUserEmail } });
      expect(user).toBeDefined();

      // Sign test JWT with explicitly null tokenVersion (omitted from claim)
      const tokenWithoutVersion = signTestJwt({
        sub: user!.authUserId,
        email: user!.email,
        tokenVersion: null,
      });

      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${tokenWithoutVersion}`)
        .expect(401);

      expect(res.body.message).toMatch(/Session has expired due to logout/i);
    });

    it('rejects tokens with mismatched tokenVersion claim', async () => {
      const user = await testPrisma.user.findUnique({ where: { email: testUserEmail } });
      expect(user).toBeDefined();

      const mismatchedToken = signTestJwt({
        sub: user!.authUserId,
        email: user!.email,
        tokenVersion: user!.tokenVersion + 999,
      });

      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${mismatchedToken}`)
        .expect(401);

      expect(res.body.message).toMatch(/Session has expired due to logout/i);
    });
  });
});
