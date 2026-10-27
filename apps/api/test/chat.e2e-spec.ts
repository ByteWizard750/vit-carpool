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
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';

describe('Milestone 7.1: Private Ride Chat (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Driver
  const driverAuthId = 'd1111111-1111-4111-8111-111111111111';
  const driverEmail = 'driver.chat@vitstudent.ac.in';
  let driverToken: string;
  let driverId: string;
  let driverVehicleId: string;

  // Passenger 1
  const pass1AuthId = 'd1111111-2222-4111-8111-222222222222';
  const pass1Email = 'pass1.chat@vitstudent.ac.in';
  let pass1Token: string;
  let pass1Id: string;

  // Passenger 2 (same ride)
  const pass2AuthId = 'd1111111-3333-4111-8111-333333333333';
  const pass2Email = 'pass2.chat@vitstudent.ac.in';
  let pass2Token: string;
  let pass2Id: string;

  // Unrelated User
  const unrelatedAuthId = 'd1111111-4444-4111-8111-444444444444';
  const unrelatedEmail = 'unrelated.chat@vitstudent.ac.in';
  let unrelatedToken: string;
  let unrelatedId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables in reverse dependency order
    await testPrisma.message.deleteMany();
    await testPrisma.conversation.deleteMany();
    await testPrisma.driverRating.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.verificationRequest.deleteMany();
    await testPrisma.user.deleteMany();

    // Seed Driver
    const driver = await testPrisma.user.create({
      data: {
        authUserId: driverAuthId,
        email: driverEmail,
        fullName: 'Karthik Driver',
        phoneNumber: '+91 98765 11111',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    driverId = driver.id;
    driverToken = signTestJwt({ sub: driverAuthId, email: driverEmail });

    const vehicle = await testPrisma.vehicle.create({
      data: {
        userId: driverId,
        make: 'Hyundai',
        model: 'i20',
        color: 'Polar White',
        registrationNumber: 'TN19CH7001',
        capacity: 5,
      },
    });
    driverVehicleId = vehicle.id;

    // Seed Passenger 1
    const p1 = await testPrisma.user.create({
      data: {
        authUserId: pass1AuthId,
        email: pass1Email,
        fullName: 'Meera Passenger One',
        phoneNumber: '+91 98765 22222',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    pass1Id = p1.id;
    pass1Token = signTestJwt({ sub: pass1AuthId, email: pass1Email });

    // Seed Passenger 2
    const p2 = await testPrisma.user.create({
      data: {
        authUserId: pass2AuthId,
        email: pass2Email,
        fullName: 'Rahul Passenger Two',
        phoneNumber: '+91 98765 33333',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    pass2Id = p2.id;
    pass2Token = signTestJwt({ sub: pass2AuthId, email: pass2Email });

    // Seed Unrelated User
    const un = await testPrisma.user.create({
      data: {
        authUserId: unrelatedAuthId,
        email: unrelatedEmail,
        fullName: 'Stranger Student',
        phoneNumber: '+91 98765 44444',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    unrelatedId = un.id;
    unrelatedToken = signTestJwt({ sub: unrelatedAuthId, email: unrelatedEmail });

    // Bootstrap Nest App
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
      await testPrisma.message.deleteMany();
      await testPrisma.conversation.deleteMany();
      await testPrisma.driverRating.deleteMany();
      await testPrisma.booking.deleteMany();
      await testPrisma.ride.deleteMany();
      await testPrisma.vehicle.deleteMany();
      await testPrisma.verificationRequest.deleteMany();
      await testPrisma.user.deleteMany();
      await testPrisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('Private Chat Lifecycle and Authorization', () => {
    let testRideId: string;
    let booking1Id: string;
    let booking2Id: string;
    let conversation1Id: string;
    let conversation2Id: string;

    beforeEach(async () => {
      // Create a test ride departing tomorrow
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const ride = await testPrisma.ride.create({
        data: {
          driverId,
          vehicleId: driverVehicleId,
          audience: Audience.STUDENT,
          origin: 'Tambaram Station',
          destination: 'VIT Chennai Campus',
          departureTime: tomorrow,
          availableSeats: 3,
          totalSeats: 4,
          costPerSeat: 80,
          status: RideStatus.SCHEDULED,
        },
      });
      testRideId = ride.id;

      // Create booking 1 for Passenger 1
      const b1 = await testPrisma.booking.create({
        data: {
          rideId: testRideId,
          passengerId: pass1Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });
      booking1Id = b1.id;

      // Create booking 2 for Passenger 2
      const b2 = await testPrisma.booking.create({
        data: {
          rideId: testRideId,
          passengerId: pass2Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });
      booking2Id = b2.id;
    });

    afterEach(async () => {
      await testPrisma.message.deleteMany();
      await testPrisma.conversation.deleteMany();
      await testPrisma.booking.deleteMany();
      await testPrisma.ride.deleteMany();
    });

    it('1. A valid passenger can open/create a conversation for their booking', async () => {
      const res = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(res.body.bookingId).toBe(booking1Id);
      expect(res.body.passengerId).toBe(pass1Id);
      expect(res.body.driverId).toBe(driverId);
      expect(res.body.otherParticipant.fullName).toBe('Karthik Driver');
      expect(res.body.otherParticipant.role).toBe('DRIVER');
      expect(res.body.isReadOnly).toBe(false);
      expect(Array.isArray(res.body.messages)).toBe(true);

      conversation1Id = res.body.id;
    });

    it('2. The corresponding driver can access that conversation', async () => {
      // First ensure conversation is initialized
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      const convId = initRes.body.id;

      // Driver accesses the conversation
      const driverRes = await request(app.getHttpServer())
        .get(`/chat/conversations/${convId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(driverRes.body.id).toBe(convId);
      expect(driverRes.body.otherParticipant.fullName).toBe('Meera Passenger One');
      expect(driverRes.body.otherParticipant.role).toBe('PASSENGER');
      expect(driverRes.body.isReadOnly).toBe(false);
    });

    it('3. Another passenger on the same ride cannot access conversation 1', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      const conv1Id = initRes.body.id;

      // Passenger 2 tries to access conversation 1
      await request(app.getHttpServer())
        .get(`/chat/conversations/${conv1Id}`)
        .set('Authorization', `Bearer ${pass2Token}`)
        .expect(403);

      // Passenger 2 tries to access via booking 1 URL
      await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass2Token}`)
        .expect(403);
    });

    it('4. An unrelated user cannot access conversation 1', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      const conv1Id = initRes.body.id;

      await request(app.getHttpServer())
        .get(`/chat/conversations/${conv1Id}`)
        .set('Authorization', `Bearer ${unrelatedToken}`)
        .expect(403);
    });

    it('5. Guessing or changing conversation IDs does not bypass authorization', async () => {
      const fakeUuid = '99999999-9999-4999-8999-999999999999';
      await request(app.getHttpServer())
        .get(`/chat/conversations/${fakeUuid}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(404);
    });

    it('6. Senders cannot impersonate each other; senderId is authoritatively set', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      const convId = initRes.body.id;

      // 6a. Attempting to pass senderId in payload is rejected by strict validation
      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({
          content: 'Hello driver',
          senderId: driverId, // Spoof attempt
        })
        .expect(400);

      // 6b. Legitimate send authoritatively binds senderId to the authenticated passenger
      const sendRes = await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({
          content: 'Hello driver, where is the pickup point?',
        })
        .expect(201);

      expect(sendRes.body.senderId).toBe(pass1Id); // Must be actual authenticated user!
      expect(sendRes.body.senderName).toBe('Meera Passenger One');
      expect(sendRes.body.content).toBe('Hello driver, where is the pickup point?');
      expect(sendRes.body.isMine).toBe(true);
    });

    it('7. Empty or whitespace-only messages are rejected', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      const convId = initRes.body.id;

      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ content: '' })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ content: '     ' })
        .expect(400);
    });

    it('8. Oversized messages (>1000 chars) are rejected', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      const convId = initRes.body.id;
      const longMessage = 'A'.repeat(1001);

      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ content: longMessage })
        .expect(400);
    });

    it('9. Messages persist and are retrieved in chronological order', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      const convId = initRes.body.id;

      // 1. Passenger sends first message
      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ content: 'First message from passenger' })
        .expect(201);

      // 2. Driver sends reply
      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ content: 'Second message: Driver reply' })
        .expect(201);

      // 3. Passenger sends follow up
      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ content: 'Third message: Passenger confirmation' })
        .expect(201);

      // Retrieve conversation
      const getRes = await request(app.getHttpServer())
        .get(`/chat/conversations/${convId}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(getRes.body.messages.length).toBe(3);
      expect(getRes.body.messages[0].content).toBe('First message from passenger');
      expect(getRes.body.messages[1].content).toBe('Second message: Driver reply');
      expect(getRes.body.messages[2].content).toBe('Third message: Passenger confirmation');
      expect(new Date(getRes.body.messages[0].createdAt).getTime()).toBeLessThanOrEqual(
        new Date(getRes.body.messages[1].createdAt).getTime(),
      );
    });

    it('10. Multiple passengers have completely separate conversations', async () => {
      // Passenger 1 opens conversation
      const c1Res = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);
      conversation1Id = c1Res.body.id;

      // Passenger 2 opens conversation
      const c2Res = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking2Id}`)
        .set('Authorization', `Bearer ${pass2Token}`)
        .expect(200);
      conversation2Id = c2Res.body.id;

      expect(conversation1Id).not.toBe(conversation2Id);

      // Passenger 1 sends secret message
      await request(app.getHttpServer())
        .post(`/chat/conversations/${conversation1Id}/messages`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ content: 'Private message for Passenger 1 only' })
        .expect(201);

      // Passenger 2 retrieves their conversation: must have 0 messages
      const p2Conv = await request(app.getHttpServer())
        .get(`/chat/conversations/${conversation2Id}`)
        .set('Authorization', `Bearer ${pass2Token}`)
        .expect(200);

      expect(p2Conv.body.messages.length).toBe(0);

      // Passenger 2 cannot read Passenger 1 conversation
      await request(app.getHttpServer())
        .get(`/chat/conversations/${conversation1Id}`)
        .set('Authorization', `Bearer ${pass2Token}`)
        .expect(403);
    });

    it('11. Rejected booking transitions messaging to read-only', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);
      const convId = initRes.body.id;

      // Send initial message while pending
      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ content: 'Pending request note' })
        .expect(201);

      // Driver rejects booking
      await testPrisma.booking.update({
        where: { id: booking1Id },
        data: { status: BookingStatus.REJECTED, rejectedAt: new Date() },
      });

      // Try sending message after rejection -> 400 Bad Request
      const rejectSendRes = await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ content: 'Are you sure you want to reject?' })
        .expect(400);

      expect(rejectSendRes.body.message).toContain('declined');

      // Conversation history remains viewable in read-only mode
      const viewRes = await request(app.getHttpServer())
        .get(`/chat/conversations/${convId}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(viewRes.body.isReadOnly).toBe(true);
      expect(viewRes.body.messages.length).toBe(1);
    });

    it('12. Cancelled booking transitions messaging to read-only', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);
      const convId = initRes.body.id;

      // Passenger cancels booking
      await testPrisma.booking.update({
        where: { id: booking1Id },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
      });

      // Sending messages is disabled
      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ content: 'Why did you cancel?' })
        .expect(400);
    });

    it('13. Completed ride retains message history in read-only mode', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);
      const convId = initRes.body.id;

      // Confirm booking and send pre-trip message
      await testPrisma.booking.update({
        where: { id: booking1Id },
        data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
      });

      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ content: 'See you at the gate' })
        .expect(201);

      // Transition ride to COMPLETED (departureTime in past)
      await testPrisma.ride.update({
        where: { id: testRideId },
        data: {
          status: RideStatus.COMPLETED,
          departureTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      });

      // Sending new messages is prohibited on completed ride
      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ content: 'Thanks for the ride!' })
        .expect(400);

      // Message history remains fully viewable
      const histRes = await request(app.getHttpServer())
        .get(`/chat/conversations/${convId}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(histRes.body.isReadOnly).toBe(true);
      expect(histRes.body.messages.length).toBe(1);
      expect(histRes.body.messages[0].content).toBe('See you at the gate');
    });

    it('14. Unread count and mark-as-read work reliably', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);
      const convId = initRes.body.id;

      // Driver sends 2 messages to Passenger 1
      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ content: 'Message 1' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ content: 'Message 2' })
        .expect(201);

      // Check unread count for Passenger 1 -> 2
      const unreadRes = await request(app.getHttpServer())
        .get('/chat/unread-count')
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(unreadRes.body.unreadCount).toBe(2);

      // Mark conversation as read
      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/read`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(201);

      // Check unread count again -> 0
      const unreadAfter = await request(app.getHttpServer())
        .get('/chat/unread-count')
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(unreadAfter.body.unreadCount).toBe(0);
    });

    it('15. Concurrent message sends do not corrupt data or timestamps', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);
      const convId = initRes.body.id;

      // 5 concurrent sends
      const sends = Array.from({ length: 5 }, (_, i) =>
        request(app.getHttpServer())
          .post(`/chat/conversations/${convId}/messages`)
          .set('Authorization', `Bearer ${pass1Token}`)
          .send({ content: `Concurrent message ${i + 1}` }),
      );

      const results = await Promise.all(sends);
      for (const r of results) {
        expect(r.status).toBe(201);
      }

      const conv = await request(app.getHttpServer())
        .get(`/chat/conversations/${convId}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(conv.body.messages.length).toBe(5);
    });

    it('16. A faculty user cannot access or view a student conversation', async () => {
      // Seed faculty user
      const facAuthId = 'd1111111-5555-4111-8111-555555555555';
      const facEmail = 'prof.chat@vit.ac.in';
      await testPrisma.user.upsert({
        where: { authUserId: facAuthId },
        create: {
          authUserId: facAuthId,
          email: facEmail,
          fullName: 'Prof. Faculty Chat User',
          phoneNumber: '+91 98765 55555',
          audience: Audience.FACULTY,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
          role: UserRole.USER,
        },
        update: {},
      });
      const facToken = signTestJwt({ sub: facAuthId, email: facEmail });

      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);
      const convId = initRes.body.id;

      // Faculty user tries to get conversation by ID -> 403
      await request(app.getHttpServer())
        .get(`/chat/conversations/${convId}`)
        .set('Authorization', `Bearer ${facToken}`)
        .expect(403);

      // Faculty user tries to get conversation via booking ID -> 403
      await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${facToken}`)
        .expect(403);
    });

    it('17. A non-participant cannot send a message to a conversation', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);
      const convId = initRes.body.id;

      // Passenger 2 (who is not part of conversation 1) tries to send a message to conv1
      await request(app.getHttpServer())
        .post(`/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${pass2Token}`)
        .send({ content: 'Intruding message' })
        .expect(403);
    });

    it('18. Concurrent conversation initialization for the same booking creates exactly one record', async () => {
      // Both passenger and driver request conversation initialization concurrently
      const [resPassenger, resDriver] = await Promise.all([
        request(app.getHttpServer())
          .get(`/chat/conversations/booking/${booking2Id}`)
          .set('Authorization', `Bearer ${pass2Token}`),
        request(app.getHttpServer())
          .get(`/chat/conversations/booking/${booking2Id}`)
          .set('Authorization', `Bearer ${driverToken}`),
      ]);

      expect(resPassenger.status).toBe(200);
      expect(resDriver.status).toBe(200);
      expect(resPassenger.body.id).toBe(resDriver.body.id);

      // Verify DB contains exactly 1 conversation for booking2
      const convCount = await testPrisma.conversation.count({
        where: { bookingId: booking2Id },
      });
      expect(convCount).toBe(1);
    });

    it('19. Conversation responses protect user privacy and do not expose phone numbers or pickup notes', async () => {
      const initRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${booking1Id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      const body = initRes.body;
      // Phone numbers must not be present in payload
      expect((body as any).phoneNumber).toBeUndefined();
      expect((body.otherParticipant as any).phoneNumber).toBeUndefined();

      // Private pickup and dropoff descriptions must not be present in chat ride representation
      expect((body.ride as any).pickupDescription).toBeUndefined();
      expect((body.ride as any).dropoffDescription).toBeUndefined();
      expect((body.ride as any).originAddress).toBeUndefined();
    });
  });
});
