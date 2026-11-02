import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  UserRole,
  VerificationStatus,
  Audience,
  VerificationMethod,
  RideStatus,
  BookingStatus,
  NotificationType,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';

describe('Milestone 7.1: Ride Lifecycle & Tracking Session (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Driver
  const driverAuthId = 'ba111111-7111-4111-8111-111111111111';
  const driverEmail = 'm7.driver@vitstudent.ac.in';
  let driverToken: string;
  let driverId: string;
  let vehicleId: string;

  // Passenger
  const passengerAuthId = 'ba111111-7222-4111-8111-222222222222';
  const passengerEmail = 'm7.passenger@vitstudent.ac.in';
  let passengerToken: string;
  let passengerId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables before starting
    await testPrisma.driverLocationSnapshot.deleteMany();
    await testPrisma.rideTrackingSession.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.user.deleteMany({
      where: { email: { in: [driverEmail, passengerEmail] } },
    });

    const driverUser = await testPrisma.user.create({
      data: {
        authUserId: driverAuthId,
        email: driverEmail,
        fullName: 'Tracking Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    driverId = driverUser.id;

    const passengerUser = await testPrisma.user.create({
      data: {
        authUserId: passengerAuthId,
        email: passengerEmail,
        fullName: 'Tracking Passenger',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    passengerId = passengerUser.id;

    const vehicle = await testPrisma.vehicle.create({
      data: {
        userId: driverId,
        make: 'Hyundai',
        model: 'i20',
        color: 'White',
        registrationNumber: 'TN 22 AB 7777',
        capacity: 5,
      },
    });
    vehicleId = vehicle.id;

    driverToken = signTestJwt({
      sub: driverAuthId,
      email: driverEmail,
    });

    passengerToken = signTestJwt({
      sub: passengerAuthId,
      email: passengerEmail,
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
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPrisma) {
      await testPrisma.driverLocationSnapshot.deleteMany();
      await testPrisma.rideTrackingSession.deleteMany();
      await testPrisma.booking.deleteMany();
      await testPrisma.ride.deleteMany();
      await testPrisma.vehicle.deleteMany();
      await testPrisma.user.deleteMany({
        where: { email: { in: [driverEmail, passengerEmail] } },
      });
      await testPrisma.$disconnect();
    }
  });

  it('driver can start a scheduled ride, which transitions to IN_PROGRESS and creates tracking session', async () => {
    // 1. Publish ride
    const departureTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const createRes = await request(app.getHttpServer())
      .post('/rides')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        vehicleId,
        origin: 'Tambaram Railway Station',
        destination: 'VIT Chennai Campus',
        departureTime,
        availableSeats: 3,
        costPerSeat: 50,
      })
      .expect(201);

    const rideId = createRes.body.id;
    expect(createRes.body.status).toBe('SCHEDULED');

    // 2. Passenger books seats with custom pickup point
    const bookRes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        rideId,
        requestedSeats: 1,
        pickupAddress: 'Vandalur Bus Stop',
        pickupLatitude: 12.8912,
        pickupLongitude: 80.0817,
        pickupDescription: 'Near the skywalk',
      })
      .expect(201);

    const bookingId = bookRes.body.id;
    expect(bookRes.body.status).toBe('PENDING');
    expect(bookRes.body.pickupAddress).toBe('Vandalur Bus Stop');
    expect(bookRes.body.boardingStatus).toBe('WAITING');

    // 3. Driver approves booking
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/approve`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(201);

    // 4. Driver starts ride
    const startRes = await request(app.getHttpServer())
      .post(`/rides/${rideId}/start`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(201);

    expect(startRes.body.status).toBe('IN_PROGRESS');

    // Verify DB tracking session
    const session = await testPrisma.rideTrackingSession.findUnique({
      where: { rideId },
    });
    expect(session).toBeDefined();
    expect(session!.isStale).toBe(false);
    expect(session!.endedAt).toBeNull();

    // Verify passenger received RIDE_STARTED notification
    const notification = await testPrisma.notification.findFirst({
      where: {
        recipientId: passengerId,
        type: NotificationType.RIDE_STARTED,
        rideId,
      },
    });
    expect(notification).toBeDefined();
    expect(notification!.title).toContain('Ride Started');

    // 5. Trying to book an IN_PROGRESS ride must be rejected
    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        rideId,
        requestedSeats: 1,
      })
      .expect(400);

    // 6. Driver completes the ride
    const completeRes = await request(app.getHttpServer())
      .post(`/rides/${rideId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(201);

    expect(completeRes.body.status).toBe('COMPLETED');

    // Verify tracking session is closed
    const closedSession = await testPrisma.rideTrackingSession.findUnique({
      where: { rideId },
    });
    expect(closedSession!.endedAt).not.toBeNull();

    // Verify passenger received RIDE_COMPLETED notification
    const completeNotification = await testPrisma.notification.findFirst({
      where: {
        recipientId: passengerId,
        type: NotificationType.RIDE_COMPLETED,
        rideId,
      },
    });
    expect(completeNotification).toBeDefined();
    expect(completeNotification!.title).toContain('Ride Completed');
  });

  it('cancelling an in-progress ride ends tracking session cleanly', async () => {
    // 1. Publish ride
    const departureTime = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const createRes = await request(app.getHttpServer())
      .post('/rides')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        vehicleId,
        origin: 'Perungalathur',
        destination: 'VIT Chennai Campus',
        departureTime,
        availableSeats: 2,
      })
      .expect(201);

    const rideId = createRes.body.id;

    // 2. Start ride
    await request(app.getHttpServer())
      .post(`/rides/${rideId}/start`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(201);

    // 3. Cancel ride
    const cancelRes = await request(app.getHttpServer())
      .post(`/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(201);

    expect(cancelRes.body.status).toBe('CANCELLED');

    // Tracking session endedAt must be populated
    const session = await testPrisma.rideTrackingSession.findUnique({
      where: { rideId },
    });
    expect(session!.endedAt).not.toBeNull();
  });
});
