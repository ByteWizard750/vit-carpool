import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { io, Socket } from 'socket.io-client';
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

describe('Milestone 7.2: Secure WebSocket Gateway & Location Backend (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let serverPort: number;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Driver
  const driverAuthId = 'ba111111-7333-4111-8111-333333333333';
  const driverEmail = 'm72.driver@vitstudent.ac.in';
  let driverToken: string;
  let driverId: string;
  let vehicleId: string;

  // Passenger A (Confirmed)
  const passengerAAuthId = 'ba111111-7444-4111-8111-444444444444';
  const passengerAEmail = 'm72.passa@vitstudent.ac.in';
  let passengerAToken: string;
  let passengerAId: string;

  // Passenger B (Pending - should be denied tracking access)
  const passengerBAuthId = 'ba111111-7555-4111-8111-555555555555';
  const passengerBEmail = 'm72.passb@vitstudent.ac.in';
  let passengerBToken: string;
  let passengerBId: string;

  // Unrelated user
  const strangerAuthId = 'ba111111-7666-4111-8111-666666666666';
  const strangerEmail = 'm72.stranger@vitstudent.ac.in';
  let strangerToken: string;

  let activeRideId: string;
  let confirmedBookingId: string;

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
      where: { email: { in: [driverEmail, passengerAEmail, passengerBEmail, strangerEmail] } },
    });

    const driverUser = await testPrisma.user.create({
      data: {
        authUserId: driverAuthId,
        email: driverEmail,
        fullName: 'Tracking Driver M72',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    driverId = driverUser.id;

    const passengerAUser = await testPrisma.user.create({
      data: {
        authUserId: passengerAAuthId,
        email: passengerAEmail,
        fullName: 'Confirmed Passenger',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    passengerAId = passengerAUser.id;

    const passengerBUser = await testPrisma.user.create({
      data: {
        authUserId: passengerBAuthId,
        email: passengerBEmail,
        fullName: 'Pending Passenger',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    passengerBId = passengerBUser.id;

    await testPrisma.user.create({
      data: {
        authUserId: strangerAuthId,
        email: strangerEmail,
        fullName: 'Stranger Student',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.AUTOMATIC_EMAIL,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });

    const vehicle = await testPrisma.vehicle.create({
      data: {
        userId: driverId,
        make: 'Maruti',
        model: 'Swift',
        color: 'Blue',
        registrationNumber: 'TN 22 CD 8888',
        capacity: 5,
      },
    });
    vehicleId = vehicle.id;

    driverToken = signTestJwt({ sub: driverAuthId, email: driverEmail });
    passengerAToken = signTestJwt({ sub: passengerAAuthId, email: passengerAEmail });
    passengerBToken = signTestJwt({ sub: passengerBAuthId, email: passengerBEmail });
    strangerToken = signTestJwt({ sub: strangerAuthId, email: strangerEmail });

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
    await app.listen(0); // Bind to random free port for real WebSocket connections
    const address = app.getHttpServer().address();
    serverPort = typeof address === 'string' ? 3000 : address.port;
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
        where: { email: { in: [driverEmail, passengerAEmail, passengerBEmail, strangerEmail] } },
      });
      await testPrisma.$disconnect();
    }
  });

  it('enforces strict access control on live tracking state (GET /rides/:id/tracking)', async () => {
    // 1. Driver publishes a ride
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
        originLatitude: 12.9249,
        originLongitude: 80.1171,
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
      })
      .expect(201);

    activeRideId = createRes.body.id;

    // 2. Passenger A books and is CONFIRMED
    const bookARes = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({
        rideId: activeRideId,
        requestedSeats: 1,
        pickupAddress: 'Vandalur Bus Stop',
        pickupLatitude: 12.8912,
        pickupLongitude: 80.0817,
      })
      .expect(201);

    confirmedBookingId = bookARes.body.id;

    await request(app.getHttpServer())
      .post(`/bookings/${confirmedBookingId}/approve`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(201);

    // 3. Passenger B books but remains PENDING
    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${passengerBToken}`)
      .send({
        rideId: activeRideId,
        requestedSeats: 1,
      })
      .expect(201);

    // 4. Start ride
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/start`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(201);

    // 5. Driver access -> 200 OK
    const driverState = await request(app.getHttpServer())
      .get(`/rides/${activeRideId}/tracking`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(driverState.body.rideId).toBe(activeRideId);
    expect(driverState.body.status).toBe('IN_PROGRESS');
    expect(driverState.body.passengers.length).toBe(1); // Only confirmed passenger A

    // 6. Confirmed Passenger A access -> 200 OK
    const passengerAState = await request(app.getHttpServer())
      .get(`/rides/${activeRideId}/tracking`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .expect(200);

    expect(passengerAState.body.rideId).toBe(activeRideId);
    expect(passengerAState.body.myPickup).toBeDefined();
    expect(passengerAState.body.myPickup.bookingId).toBe(confirmedBookingId);

    // 7. Pending Passenger B access -> 403 Forbidden
    await request(app.getHttpServer())
      .get(`/rides/${activeRideId}/tracking`)
      .set('Authorization', `Bearer ${passengerBToken}`)
      .expect(403);

    // 8. Stranger access -> 403 Forbidden
    await request(app.getHttpServer())
      .get(`/rides/${activeRideId}/tracking`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(403);

    // 9. Unauthenticated access -> 401 Unauthorized
    await request(app.getHttpServer())
      .get(`/rides/${activeRideId}/tracking`)
      .expect(401);

    // 10. Expired JWT access -> 401 Unauthorized
    const expiredToken = signTestJwt({ sub: driverAuthId, email: driverEmail, exp: '-10s' });
    await request(app.getHttpServer())
      .get(`/rides/${activeRideId}/tracking`)
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  it('records driver location via REST bridge, calculates ETA, triggers proximity notification and maintains ring buffer', async () => {
    // 1. Non-driver attempting location update must be rejected with 403 Forbidden
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/location-update`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({
        latitude: 12.9249,
        longitude: 80.1171,
      })
      .expect(403);

    // 2. Driver sends location update approaching Passenger A's pickup (Vandalur: 12.8912, 80.0817)
    // Driver at 12.8930, 80.0830 (approx 200m away)
    const updateRes = await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/location-update`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        latitude: 12.8930,
        longitude: 80.0830,
        accuracy: 10,
        speedKmh: 25,
        heading: 180,
      })
      .expect(200);

    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.passengerETAs[passengerAId]).toBeDefined();

    // Verify Passenger A received proximity notification
    const notification = await testPrisma.notification.findFirst({
      where: {
        recipientId: passengerAId,
        type: NotificationType.DRIVER_APPROACHING,
        rideId: activeRideId,
      },
    });
    expect(notification).toBeDefined();
    expect(notification!.title).toContain('Approaching');

    // Wait 1.1s to avoid rate limiter on subsequent update
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // 3. Subsequent location update must NOT duplicate the notification
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/location-update`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        latitude: 12.8920,
        longitude: 80.0820,
        speedKmh: 15,
      })
      .expect(200);

    const notificationCount = await testPrisma.notification.count({
      where: {
        recipientId: passengerAId,
        type: NotificationType.DRIVER_APPROACHING,
        rideId: activeRideId,
      },
    });
    expect(notificationCount).toBe(1); // Deduplication enforced!

    // 4. Ring buffer verification: Directly insert extra snapshots to test DB pruning logic
    for (let i = 0; i < 22; i++) {
      await testPrisma.driverLocationSnapshot.create({
        data: {
          rideId: activeRideId,
          latitude: 12.8900 + i * 0.001,
          longitude: 80.0800 + i * 0.001,
          recordedAt: new Date(Date.now() - (25 - i) * 1000),
        },
      });
    }

    // Wait 1.1s for rate limit, then submit one through the service
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/location-update`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        latitude: 12.8950,
        longitude: 80.0850,
      })
      .expect(200);

    const totalSnapshots = await testPrisma.driverLocationSnapshot.count({
      where: { rideId: activeRideId },
    });
    expect(totalSnapshots).toBeLessThanOrEqual(20);
  });

  it('validates GPS coordinates, timestamp freshness, accuracy and enforces rate limiting', async () => {
    // Wait 1.1s to ensure rate limit window is clear
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // 1. Invalid coordinates (Latitude > 90) -> 400 Bad Request
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/location-update`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        latitude: 105.0,
        longitude: 80.08,
      })
      .expect(400);

    // 2. Excessively poor GPS accuracy (> 500m) -> 400 Bad Request
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/location-update`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        latitude: 12.89,
        longitude: 80.08,
        accuracy: 800,
      })
      .expect(400);

    // 3. Stale timestamp (> 5 minutes in the past) -> 400 Bad Request
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/location-update`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        latitude: 12.89,
        longitude: 80.08,
        timestamp: sixMinutesAgo,
      })
      .expect(400);

    // 4. Server-side Rate Limiting: Two updates within 1000ms -> 429 Too Many Requests
    // First update succeeds
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/location-update`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        latitude: 12.891,
        longitude: 80.081,
      })
      .expect(200);

    // Immediate second update fails with 429
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/location-update`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        latitude: 12.892,
        longitude: 80.082,
      })
      .expect(429);
  });

  it('updates passenger boarding status (WAITING -> BOARDING -> BOARDED)', async () => {
    // 1. Passenger marks BOARDING
    const boardingRes = await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/boarding`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .send({
        bookingId: confirmedBookingId,
        boardingStatus: 'BOARDING',
      })
      .expect(200);

    expect(boardingRes.body.boardingStatus).toBe('BOARDING');

    // 2. Direct transition to BOARDED is rejected with 403
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/boarding`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        bookingId: confirmedBookingId,
        boardingStatus: 'BOARDED',
      })
      .expect(403);

    // 3. Driver verifies passenger boarding OTP to transition to BOARDED
    const otpRes = await request(app.getHttpServer())
      .get(`/bookings/${confirmedBookingId}/boarding-otp`)
      .set('Authorization', `Bearer ${passengerAToken}`)
      .expect(200);

    const boardedRes = await request(app.getHttpServer())
      .post(`/bookings/${confirmedBookingId}/verify-boarding`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ otp: otpRes.body.rawOtp })
      .expect(200);

    expect(boardedRes.body.boardingStatus).toBe('BOARDED');
    expect(boardedRes.body.boardedAt).not.toBeNull();

    // 4. Stranger rejected with 403
    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/boarding`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({
        bookingId: confirmedBookingId,
        boardingStatus: 'WAITING',
      })
      .expect(403);
  });

  it('handles real-time WebSocket connection, room joining, location broadcast, error handling, and disconnection', async () => {
    const wsUrl = `http://127.0.0.1:${serverPort}/tracking`;

    // 1. Driver connects with valid JWT
    const driverSocket: Socket = io(wsUrl, {
      auth: { token: driverToken },
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve, reject) => {
      driverSocket.on('connect', () => resolve());
      driverSocket.on('connect_error', (err) => reject(err));
      setTimeout(() => reject(new Error('Driver socket connection timed out')), 5000);
    });

    expect(driverSocket.connected).toBe(true);

    // 2. Passenger connects with valid JWT
    const passengerSocket: Socket = io(wsUrl, {
      auth: { token: passengerAToken },
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve, reject) => {
      passengerSocket.on('connect', () => resolve());
      passengerSocket.on('connect_error', (err) => reject(err));
      setTimeout(() => reject(new Error('Passenger socket connection timed out')), 5000);
    });

    expect(passengerSocket.connected).toBe(true);

    // 3. Both join tracking room
    const driverStatePromise = new Promise<any>((resolve) => {
      driverSocket.once('tracking_state', (state) => resolve(state));
    });
    driverSocket.emit('join_tracking', { rideId: activeRideId });
    const driverState = await driverStatePromise;
    expect(driverState.rideId).toBe(activeRideId);

    const passengerStatePromise = new Promise<any>((resolve) => {
      passengerSocket.once('tracking_state', (state) => resolve(state));
    });
    passengerSocket.emit('join_tracking', { rideId: activeRideId });
    const passengerState = await passengerStatePromise;
    expect(passengerState.rideId).toBe(activeRideId);
    expect(passengerState.myPickup).toBeDefined();

    // 4. Passenger receives live broadcast when driver updates location over WebSocket
    // Wait 1.1s to avoid rate limit
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const locationBroadcastPromise = new Promise<any>((resolve) => {
      passengerSocket.once('location_updated', (data) => resolve(data));
    });

    driverSocket.emit('location_update', {
      rideId: activeRideId,
      location: {
        latitude: 12.8940,
        longitude: 80.0840,
        accuracy: 8,
        speedKmh: 35,
        heading: 190,
      },
    });

    const receivedLocation = await locationBroadcastPromise;
    expect(receivedLocation.rideId).toBe(activeRideId);
    expect(receivedLocation.location.latitude).toBe(12.8940);
    expect(receivedLocation.passengerETAs).toBeDefined();

    // 5. Passenger attempting location injection is rejected
    const passengerRejectPromise = new Promise<any>((resolve) => {
      passengerSocket.once('error', (err) => resolve(err));
    });

    passengerSocket.emit('location_update', {
      rideId: activeRideId,
      location: {
        latitude: 12.9000,
        longitude: 80.0900,
      },
    });

    const rejectError = await passengerRejectPromise;
    expect(rejectError.code).toBe('LOCATION_REJECTED');

    // 6. Stranger connects and attempts to join room -> rejected with FORBIDDEN
    const strangerSocket: Socket = io(wsUrl, {
      auth: { token: strangerToken },
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      strangerSocket.on('connect', () => resolve());
    });

    const strangerForbiddenPromise = new Promise<any>((resolve) => {
      strangerSocket.once('error', (err) => resolve(err));
    });

    strangerSocket.emit('join_tracking', { rideId: activeRideId });
    const forbiddenError = await strangerForbiddenPromise;
    expect(forbiddenError.code).toBe('FORBIDDEN');

    // 7. Expired JWT connection is immediately rejected
    const expiredToken = signTestJwt({ sub: strangerAuthId, email: strangerEmail, exp: '-10s' });
    const expiredSocket: Socket = io(wsUrl, {
      auth: { token: expiredToken },
      transports: ['websocket'],
      forceNew: true,
    });

    const expiredErrorPromise = new Promise<any>((resolve) => {
      expiredSocket.once('error', (err) => resolve(err));
    });

    const expiredError = await expiredErrorPromise;
    expect(expiredError.code).toBe('UNAUTHORIZED');

    // 8. Reconnection: Passenger disconnects, reconnects and gets latest state
    passengerSocket.disconnect();
    expect(passengerSocket.connected).toBe(false);

    const reconnectedPassengerSocket: Socket = io(wsUrl, {
      auth: { token: passengerAToken },
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      reconnectedPassengerSocket.on('connect', () => resolve());
    });

    const reconnectedStatePromise = new Promise<any>((resolve) => {
      reconnectedPassengerSocket.once('tracking_state', (state) => resolve(state));
    });
    reconnectedPassengerSocket.emit('join_tracking', { rideId: activeRideId });
    const reconnectedState = await reconnectedStatePromise;
    expect(reconnectedState.rideId).toBe(activeRideId);
    expect(reconnectedState.currentLocation.latitude).toBe(12.8940);
    expect(reconnectedState.isStale).toBe(false);

    // 9. Room access revocation: Driver completes ride -> room listeners receive access_revoked
    const accessRevokedPromise = new Promise<any>((resolve) => {
      reconnectedPassengerSocket.once('access_revoked', (data) => resolve(data));
    });

    await request(app.getHttpServer())
      .post(`/rides/${activeRideId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(201);

    const revokedData = await accessRevokedPromise;
    expect(revokedData.rideId).toBe(activeRideId);
    expect(revokedData.reason).toBe('RIDE_COMPLETED');

    // Cleanup sockets
    driverSocket.disconnect();
    passengerSocket.disconnect();
    strangerSocket.disconnect();
    expiredSocket.disconnect();
    reconnectedPassengerSocket.disconnect();
  });
});
