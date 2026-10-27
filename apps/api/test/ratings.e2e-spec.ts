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

describe('Milestone 7.2: Driver Ratings & Reviews (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Driver
  const driverAuthId = 'e1111111-1111-4111-8111-111111111111';
  const driverEmail = 'driver.rating@vitstudent.ac.in';
  let driverToken: string;
  let driverId: string;
  let driverVehicleId: string;

  // Passenger 1
  const pass1AuthId = 'e1111111-2222-4111-8111-222222222222';
  const pass1Email = 'pass1.rating@vitstudent.ac.in';
  let pass1Token: string;
  let pass1Id: string;

  // Passenger 2
  const pass2AuthId = 'e1111111-3333-4111-8111-333333333333';
  const pass2Email = 'pass2.rating@vitstudent.ac.in';
  let pass2Token: string;
  let pass2Id: string;

  // Unrelated User
  const unrelatedAuthId = 'e1111111-4444-4111-8111-444444444444';
  const unrelatedEmail = 'unrelated.rating@vitstudent.ac.in';
  let unrelatedToken: string;
  let unrelatedId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables
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
        fullName: 'Suraj Driver',
        phoneNumber: '+91 98765 77771',
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
        make: 'Honda',
        model: 'City',
        color: 'Silver',
        registrationNumber: 'TN19RT4400',
        capacity: 5,
      },
    });
    driverVehicleId = vehicle.id;

    // Seed Passenger 1
    const p1 = await testPrisma.user.create({
      data: {
        authUserId: pass1AuthId,
        email: pass1Email,
        fullName: 'Divya Passenger One',
        phoneNumber: '+91 98765 77772',
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
        fullName: 'Arjun Passenger Two',
        phoneNumber: '+91 98765 77773',
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
        fullName: 'Pooja Stranger',
        phoneNumber: '+91 98765 77774',
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

  describe('Rating Eligibility, Submission, and Invariants', () => {
    let completedRideId: string;
    let upcomingRideId: string;
    let confirmedBookingId: string;
    let pendingBookingId: string;
    let rejectedBookingId: string;
    let cancelledBookingId: string;

    beforeEach(async () => {
      // 1. Completed Ride (departed 3 hours ago)
      const pastDeparture = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const cRide = await testPrisma.ride.create({
        data: {
          driverId,
          vehicleId: driverVehicleId,
          audience: Audience.STUDENT,
          origin: 'Adyar',
          destination: 'VIT Chennai Campus',
          departureTime: pastDeparture,
          availableSeats: 2,
          totalSeats: 4,
          costPerSeat: 100,
          status: RideStatus.COMPLETED,
        },
      });
      completedRideId = cRide.id;

      // 2. Upcoming Ride (departing tomorrow)
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const uRide = await testPrisma.ride.create({
        data: {
          driverId,
          vehicleId: driverVehicleId,
          audience: Audience.STUDENT,
          origin: 'Guindy',
          destination: 'VIT Chennai Campus',
          departureTime: tomorrow,
          availableSeats: 3,
          totalSeats: 4,
          costPerSeat: 90,
          status: RideStatus.SCHEDULED,
        },
      });
      upcomingRideId = uRide.id;

      // Confirmed booking for Passenger 1 on completed ride
      const bConfirmed = await testPrisma.booking.create({
        data: {
          rideId: completedRideId,
          passengerId: pass1Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED,
          confirmedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        },
      });
      confirmedBookingId = bConfirmed.id;

      // Pending booking for Passenger 2 on completed ride
      const bPending = await testPrisma.booking.create({
        data: {
          rideId: completedRideId,
          passengerId: pass2Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });
      pendingBookingId = bPending.id;

      // Rejected booking on completed ride
      const bRejected = await testPrisma.booking.create({
        data: {
          rideId: completedRideId,
          passengerId: pass2Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.REJECTED,
          rejectedAt: new Date(),
        },
      });
      rejectedBookingId = bRejected.id;

      // Cancelled booking on completed ride
      const bCancelled = await testPrisma.booking.create({
        data: {
          rideId: completedRideId,
          passengerId: pass2Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
      cancelledBookingId = bCancelled.id;
    });

    afterEach(async () => {
      await testPrisma.driverRating.deleteMany();
      await testPrisma.booking.deleteMany();
      await testPrisma.ride.deleteMany();
    });

    it('1. A passenger can rate an eligible completed ride with 1-5 stars and review', async () => {
      // Check eligibility endpoint first
      const eligRes = await request(app.getHttpServer())
        .get(`/ratings/eligibility/${confirmedBookingId}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(eligRes.body.eligible).toBe(true);

      // Submit rating
      const rateRes = await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({
          bookingId: confirmedBookingId,
          rating: 5,
          review: 'Smooth commute, punctual and safe driver!',
        })
        .expect(201);

      expect(rateRes.body.bookingId).toBe(confirmedBookingId);
      expect(rateRes.body.driverId).toBe(driverId);
      expect(rateRes.body.passengerId).toBe(pass1Id);
      expect(rateRes.body.rating).toBe(5);
      expect(rateRes.body.review).toBe('Smooth commute, punctual and safe driver!');
      expect(rateRes.body.passengerName).toBe('Divya Passenger One');

      // Eligibility endpoint now reflects already rated
      const eligAfter = await request(app.getHttpServer())
        .get(`/ratings/eligibility/${confirmedBookingId}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(eligAfter.body.eligible).toBe(false);
      expect(eligAfter.body.existingRating.rating).toBe(5);
    });

    it('2. A passenger cannot rate an unfinished ride', async () => {
      // Confirmed booking on upcoming ride
      const upcomingBooking = await testPrisma.booking.create({
        data: {
          rideId: upcomingRideId,
          passengerId: pass1Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({
          bookingId: upcomingBooking.id,
          rating: 4,
          review: 'Premature rating',
        })
        .expect(400);

      expect(res.body.message).toContain('not been marked as completed');
    });

    it('2b. A passenger cannot rate a ride whose departure time has passed but status remains SCHEDULED', async () => {
      // Past departure ride that was never explicitly marked as COMPLETED by driver
      const pastDeparture = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const uncompletedRide = await testPrisma.ride.create({
        data: {
          driverId,
          vehicleId: driverVehicleId,
          audience: Audience.STUDENT,
          origin: 'Adyar',
          destination: 'VIT Chennai Campus',
          departureTime: pastDeparture,
          availableSeats: 3,
          totalSeats: 4,
          costPerSeat: 100,
          status: RideStatus.SCHEDULED, // Still SCHEDULED despite departureTime in past
        },
      });

      const bPastScheduled = await testPrisma.booking.create({
        data: {
          rideId: uncompletedRide.id,
          passengerId: pass1Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED,
        },
      });

      // 1. Eligibility check returns eligible: false with explicit reason
      const eligRes = await request(app.getHttpServer())
        .get(`/ratings/eligibility/${bPastScheduled.id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(eligRes.body.eligible).toBe(false);
      expect(eligRes.body.reason).toContain('not been marked as completed');

      // 2. Rating submission is rejected with 400 Bad Request
      const rateRes = await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({
          bookingId: bPastScheduled.id,
          rating: 5,
          review: 'Attempting to rate past-departure scheduled ride',
        })
        .expect(400);

      expect(rateRes.body.message).toContain('not been marked as completed');
    });

    it('3. A passenger cannot rate another user’s booking', async () => {
      // Passenger 2 tries to rate Passenger 1 confirmed booking
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass2Token}`)
        .send({
          bookingId: confirmedBookingId,
          rating: 4,
        })
        .expect(403);
    });

    it('4. A passenger cannot rate a ride they never booked', async () => {
      const nonExistentBookingId = '88888888-8888-4888-8888-888888888888';
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({
          bookingId: nonExistentBookingId,
          rating: 5,
        })
        .expect(404);
    });

    it('5. A driver cannot rate themselves or submit reviews on their own ride', async () => {
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          bookingId: confirmedBookingId,
          rating: 5,
          review: 'I was a great driver!',
        })
        .expect(403); // Driver is not the passenger of this booking
    });

    it('6. Pending, Rejected, and Cancelled bookings cannot be rated', async () => {
      // Pending
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass2Token}`)
        .send({ bookingId: pendingBookingId, rating: 5 })
        .expect(400);

      // Rejected
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass2Token}`)
        .send({ bookingId: rejectedBookingId, rating: 5 })
        .expect(400);

      // Cancelled
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass2Token}`)
        .send({ bookingId: cancelledBookingId, rating: 5 })
        .expect(400);
    });

    it('6b. Confirmed booking on a CANCELLED ride cannot be rated', async () => {
      const pastDeparture = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const cancelledRide = await testPrisma.ride.create({
        data: {
          driverId,
          vehicleId: driverVehicleId,
          audience: Audience.STUDENT,
          origin: 'Adyar',
          destination: 'VIT Chennai Campus',
          departureTime: pastDeparture,
          availableSeats: 3,
          totalSeats: 4,
          costPerSeat: 100,
          status: RideStatus.CANCELLED,
        },
      });

      const bCancelledRide = await testPrisma.booking.create({
        data: {
          rideId: cancelledRide.id,
          passengerId: pass1Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED,
        },
      });

      await request(app.getHttpServer())
        .get(`/ratings/eligibility/${bCancelledRide.id}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200)
        .then((res) => {
          expect(res.body.eligible).toBe(false);
          expect(res.body.reason).toContain('cancelled');
        });

      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({
          bookingId: bCancelledRide.id,
          rating: 5,
        })
        .expect(400)
        .then((res) => {
          expect(res.body.message).toContain('Cancelled rides cannot be rated');
        });
    });

    it('7. Ratings below 1, above 5, or fractional values are rejected', async () => {
      // 0 stars
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ bookingId: confirmedBookingId, rating: 0 })
        .expect(400);

      // Negative stars
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ bookingId: confirmedBookingId, rating: -1 })
        .expect(400);

      // 6 stars
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ bookingId: confirmedBookingId, rating: 6 })
        .expect(400);

      // Fractional 4.5
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ bookingId: confirmedBookingId, rating: 4.5 })
        .expect(400);
    });

    it('8. Duplicate ratings for one booking are rejected', async () => {
      // First submission succeeds
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ bookingId: confirmedBookingId, rating: 4, review: 'Good drive' })
        .expect(201);

      // Second submission for same booking returns 409 Conflict
      const dupRes = await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ bookingId: confirmedBookingId, rating: 5, review: 'Changed mind' })
        .expect(409);

      expect(dupRes.body.message).toContain('already submitted');
    });

    it('9. Concurrent rating submissions cannot create duplicate reviews', async () => {
      // 3 parallel rating submissions for the exact same booking
      const parallelSubmissions = [1, 2, 3].map(() =>
        request(app.getHttpServer())
          .post('/ratings')
          .set('Authorization', `Bearer ${pass1Token}`)
          .send({ bookingId: confirmedBookingId, rating: 5, review: 'Race test' }),
      );

      const results = await Promise.all(parallelSubmissions);
      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      expect(successes.length).toBe(1);
      expect(conflicts.length).toBe(2);

      // Verify DB contains exactly 1 rating row
      const count = await testPrisma.driverRating.count({
        where: { bookingId: confirmedBookingId },
      });
      expect(count).toBe(1);
    });

    it('10. Driver rating aggregation computes accurate average and count', async () => {
      // Transition Passenger 2 pending booking to CONFIRMED
      await testPrisma.booking.update({
        where: { id: pendingBookingId },
        data: {
          status: BookingStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
      });

      // Passenger 1 rates 5 stars
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ bookingId: confirmedBookingId, rating: 5, review: 'Excellent!' })
        .expect(201);

      // Passenger 2 rates 4 stars
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass2Token}`)
        .send({ bookingId: pendingBookingId, rating: 4, review: 'Very good' })
        .expect(201);

      // Fetch driver rating summary: (5 + 4) / 2 = 4.5
      const summaryRes = await request(app.getHttpServer())
        .get(`/ratings/driver/${driverId}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(summaryRes.body.driverId).toBe(driverId);
      expect(summaryRes.body.totalReviews).toBe(2);
      expect(summaryRes.body.averageRating).toBe(4.5);
      expect(summaryRes.body.reviews.length).toBe(2);
    });

    it('11. Drivers with no reviews return averageRating: null and totalReviews: 0', async () => {
      const summaryRes = await request(app.getHttpServer())
        .get(`/ratings/driver/${driverId}`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(200);

      expect(summaryRes.body.driverId).toBe(driverId);
      expect(summaryRes.body.averageRating).toBeNull();
      expect(summaryRes.body.totalReviews).toBe(0);
      expect(summaryRes.body.reviews).toEqual([]);
    });

    it('12. Ratings persist across DB queries and appear on ride search', async () => {
      // Rate booking with 5 stars
      await request(app.getHttpServer())
        .post('/ratings')
        .set('Authorization', `Bearer ${pass1Token}`)
        .send({ bookingId: confirmedBookingId, rating: 5, review: 'Top notch!' })
        .expect(201);

      // Query rides via /rides search endpoint
      const searchRes = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${pass2Token}`)
        .expect(200);

      // Driver rating should be attached to the public ride summary
      const foundRide = searchRes.body.rides.find((r: any) => r.driverId === driverId);
      if (foundRide) {
        expect(foundRide.driverRating).toBeDefined();
        expect(foundRide.driverRating.average).toBe(5);
        expect(foundRide.driverRating.count).toBe(1);
      }
    });

    it('13. Driver can explicitly mark ride as completed via POST /rides/:id/complete', async () => {
      // Driver marks upcoming ride as completed
      const compRes = await request(app.getHttpServer())
        .post(`/rides/${upcomingRideId}/complete`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      expect(compRes.body.id).toBe(upcomingRideId);
      expect(compRes.body.status).toBe('COMPLETED');

      // Passenger tries to mark driver ride -> 404 or 403
      await request(app.getHttpServer())
        .post(`/rides/${upcomingRideId}/complete`)
        .set('Authorization', `Bearer ${pass1Token}`)
        .expect(404);
    });

    it('14. Audience isolation: faculty member cannot access student driver rating summary', async () => {
      // Seed faculty user
      const facAuthId = 'e1111111-5555-4111-8111-555555555555';
      const facEmail = 'prof.rating@vit.ac.in';
      await testPrisma.user.upsert({
        where: { authUserId: facAuthId },
        create: {
          authUserId: facAuthId,
          email: facEmail,
          fullName: 'Prof. Faculty User',
          phoneNumber: '+91 98765 77775',
          audience: Audience.FACULTY,
          verificationStatus: VerificationStatus.VERIFIED,
          verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
          verifiedAt: new Date(),
          role: UserRole.USER,
        },
        update: {},
      });
      const facToken = signTestJwt({ sub: facAuthId, email: facEmail });

      // Faculty user tries to query student driver ratings -> 404
      await request(app.getHttpServer())
        .get(`/ratings/driver/${driverId}`)
        .set('Authorization', `Bearer ${facToken}`)
        .expect(404);
    });

    it('15. Ride completion explicitly cancels remaining PENDING passenger bookings', async () => {
      // Create a new ride with 1 confirmed and 1 pending booking
      const pastDep = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const activeRide = await testPrisma.ride.create({
        data: {
          driverId,
          vehicleId: driverVehicleId,
          audience: Audience.STUDENT,
          origin: 'Tambaram',
          destination: 'VIT Chennai Campus',
          departureTime: pastDep,
          availableSeats: 2,
          totalSeats: 4,
          costPerSeat: 100,
          status: RideStatus.SCHEDULED,
        },
      });

      const confirmedB = await testPrisma.booking.create({
        data: {
          rideId: activeRide.id,
          passengerId: pass1Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.CONFIRMED,
        },
      });

      const pendingB = await testPrisma.booking.create({
        data: {
          rideId: activeRide.id,
          passengerId: pass2Id,
          driverId,
          audience: Audience.STUDENT,
          requestedSeats: 1,
          status: BookingStatus.PENDING,
        },
      });

      // Driver completes ride
      await request(app.getHttpServer())
        .post(`/rides/${activeRide.id}/complete`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);

      // Confirmed booking remains CONFIRMED
      const refreshedConfirmed = await testPrisma.booking.findUnique({
        where: { id: confirmedB.id },
      });
      expect(refreshedConfirmed?.status).toBe(BookingStatus.CONFIRMED);

      // Pending booking transitioned to CANCELLED
      const refreshedPending = await testPrisma.booking.findUnique({
        where: { id: pendingB.id },
      });
      expect(refreshedPending?.status).toBe(BookingStatus.CANCELLED);
      expect(refreshedPending?.cancellationReason).toContain('Ride completed without accepting');
    });

    it('16. Driver cannot cancel or modify a ride after it is COMPLETED', async () => {
      // Attempt to cancel completed ride
      await request(app.getHttpServer())
        .post(`/rides/${completedRideId}/cancel`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(400)
        .then((res) => {
          expect(res.body.message).toContain('completed');
        });

      // Attempt to modify completed ride
      await request(app.getHttpServer())
        .patch(`/rides/${completedRideId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ availableSeats: 1 })
        .expect(400)
        .then((res) => {
          expect(res.body.message).toContain('completed');
        });
    });
  });
});
