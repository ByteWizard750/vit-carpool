import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  VerificationStatus,
  Audience,
  VerificationMethod,
  UserRole,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';

describe('User Profile Picture & Vehicle Photo Uploads (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  const userAuthId = 'c0000001-0000-4000-8000-000000000001';
  const userEmail = 'avatar.tester@vitstudent.ac.in';
  let userToken: string;
  let userId: string;

  const otherUserAuthId = 'c0000002-0000-4000-8000-000000000002';
  const otherUserEmail = 'other.driver@vitstudent.ac.in';
  let otherUserToken: string;
  let otherUserId: string;

  let vehicleId: string;

  // 1x1 transparent PNG buffer
  const validPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );

  // Minimal valid JPEG buffer
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x80, 0xff, 0xd9,
  ]);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.user.deleteMany();

    // Seed test users
    const user = await testPrisma.user.create({
      data: {
        authUserId: userAuthId,
        email: userEmail,
        fullName: 'Avatar Tester',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    userId = user.id;
    userToken = signTestJwt({ sub: userAuthId, email: userEmail });

    const otherUser = await testPrisma.user.create({
      data: {
        authUserId: otherUserAuthId,
        email: otherUserEmail,
        fullName: 'Other Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    otherUserId = otherUser.id;
    otherUserToken = signTestJwt({ sub: otherUserAuthId, email: otherUserEmail });

    // Seed a vehicle for user
    const vehicle = await testPrisma.vehicle.create({
      data: {
        userId,
        make: 'Honda',
        model: 'City ZX',
        color: 'Meteoroid Grey Metallic',
        registrationNumber: 'TN09AQ8888',
        capacity: 4,
      },
    });
    vehicleId = vehicle.id;

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
  });

  afterAll(async () => {
    if (testPrisma) {
      await testPrisma.booking.deleteMany();
      await testPrisma.ride.deleteMany();
      await testPrisma.vehicle.deleteMany();
      await testPrisma.user.deleteMany();
      await testPrisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('1. User Profile Picture Uploads', () => {
    it('uploads a valid PNG avatar and stores avatarUrl on user profile', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', validPngBuffer, 'profile.png')
        .expect(201);

      expect(res.body.avatarUrl).toMatch(/^\/uploads\/avatars\/avatars_[a-f0-9-]+\.png$/);
      expect(res.body.user.avatarUrl).toBe(res.body.avatarUrl);

      // Verify DB persistence
      const dbUser = await testPrisma.user.findUnique({ where: { id: userId } });
      expect(dbUser?.avatarUrl).toBe(res.body.avatarUrl);

      // Verify GET /users/me returns avatarUrl
      const profileRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(profileRes.body.avatarUrl).toBe(res.body.avatarUrl);
    });

    it('serves the uploaded avatar file publicly via GET /uploads/avatars/:filename', async () => {
      const profileRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const avatarPath = profileRes.body.avatarUrl;
      const fileRes = await request(app.getHttpServer())
        .get(avatarPath)
        .expect(200);

      expect(fileRes.headers['content-type']).toContain('image/png');
      expect(fileRes.headers['cache-control']).toContain('public, max-age=86400');
    });

    it('updates profile picture with JPEG and replaces the previous avatar', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', validJpegBuffer, 'avatar.jpg')
        .expect(201);

      expect(res.body.avatarUrl).toMatch(/^\/uploads\/avatars\/avatars_[a-f0-9-]+\.jpg$/);
    });

    it('removes profile picture via DELETE /users/me/avatar', async () => {
      const res = await request(app.getHttpServer())
        .delete('/users/me/avatar')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user.avatarUrl).toBeNull();

      const dbUser = await testPrisma.user.findUnique({ where: { id: userId } });
      expect(dbUser?.avatarUrl).toBeNull();
    });

    it('rejects unsupported file formats (e.g. text/plain)', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', Buffer.from('hello plain text'), 'test.txt')
        .expect(400);

      expect(res.body.message).toContain('Unsupported file format');
    });
  });

  describe('2. Vehicle Photo Uploads', () => {
    it('uploads a car photo to a registered vehicle', async () => {
      const res = await request(app.getHttpServer())
        .post(`/vehicles/${vehicleId}/image`)
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', validJpegBuffer, 'mycar.jpg')
        .expect(201);

      expect(res.body.imageUrl).toMatch(/^\/uploads\/vehicles\/vehicles_[a-f0-9-]+\.jpg$/);
      expect(res.body.vehicle.imageUrl).toBe(res.body.imageUrl);

      // Verify DB persistence
      const dbVehicle = await testPrisma.vehicle.findUnique({ where: { id: vehicleId } });
      expect(dbVehicle?.imageUrl).toBe(res.body.imageUrl);

      // Verify GET /vehicles includes imageUrl
      const listRes = await request(app.getHttpServer())
        .get('/vehicles')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const found = listRes.body.find((v: any) => v.id === vehicleId);
      expect(found.imageUrl).toBe(res.body.imageUrl);
    });

    it('serves the uploaded vehicle photo publicly via GET /uploads/vehicles/:filename', async () => {
      const dbVehicle = await testPrisma.vehicle.findUnique({ where: { id: vehicleId } });
      expect(dbVehicle?.imageUrl).toBeDefined();

      const fileRes = await request(app.getHttpServer())
        .get(dbVehicle!.imageUrl!)
        .expect(200);

      expect(fileRes.headers['content-type']).toContain('image/jpeg');
      expect(fileRes.headers['cache-control']).toContain('public, max-age=86400');
    });

    it('forbids another user from uploading photo to a vehicle they do not own (404)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/vehicles/${vehicleId}/image`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .attach('file', validPngBuffer, 'intruder.png')
        .expect(404);

      expect(res.body.message).toContain('Vehicle not found or you do not have permission');
    });

    it('removes vehicle photo via DELETE /vehicles/:id/image', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/vehicles/${vehicleId}/image`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.vehicle.imageUrl).toBeNull();

      const dbVehicle = await testPrisma.vehicle.findUnique({ where: { id: vehicleId } });
      expect(dbVehicle?.imageUrl).toBeNull();
    });

    it('allows registering a new vehicle with optional imageUrl directly', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/vehicles')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          make: 'Toyota',
          model: 'Innova Hycross',
          color: 'Super White',
          registrationNumber: 'TN09AZ9999',
          capacity: 6,
          imageUrl: '/uploads/vehicles/vehicles_sample_toyota.jpg',
        })
        .expect(201);

      expect(createRes.body.imageUrl).toBe('/uploads/vehicles/vehicles_sample_toyota.jpg');
    });
  });
});

