import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  Audience,
  VerificationStatus,
  VerificationMethod,
  RideStatus,
  BookingStatus,
  RideType,
  NotificationType,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';

describe('Milestone B: Cab Share Publishing, Discovery, and Booking APIs (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Test users
  const organizerAuthId = 'c1111111-1111-4111-8111-111111111111';
  const organizerEmail = 'cab.organizer@vitstudent.ac.in';
  let organizerToken: string;
  let organizerId: string;

  const passengerAuthId = 'c2222222-2222-4222-8222-222222222222';
  const passengerEmail = 'cab.passenger@vitstudent.ac.in';
  let passengerToken: string;
  let passengerId: string;

  const facultyAuthId = 'c3333333-3333-4333-8333-333333333333';
  const facultyEmail = 'cab.faculty@vit.ac.in';
  let facultyToken: string;
  let facultyId: string;

  const driverWithCarAuthId = 'c4444444-4444-4444-8444-444444444444';
  const driverWithCarEmail = 'carpool.driver@vitstudent.ac.in';
  let driverWithCarToken: string;
  let driverWithCarId: string;
  let vehicleId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_TEST_MODE = 'true';
    process.env.ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION = 'false';
    process.env.CORRIDOR_SEARCH_MODE = 'CORRIDOR';
    process.env.ROUTE_GEOMETRY_PROVIDER = 'straight_line';

    testPrisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await testPrisma.$connect();

    // Clean tables (note: audit logs are strictly append-only, protected by DB trigger)
    await testPrisma.cabFareAcknowledgement.deleteMany();
    await testPrisma.cabShareDetail.deleteMany();
    await testPrisma.notification.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.user.deleteMany();

    // 1. Create Organizer (Student) - has NO vehicle!
    const org = await testPrisma.user.create({
      data: {
        authUserId: organizerAuthId,
        email: organizerEmail,
        fullName: 'Rahul Organizer',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
      },
    });
    organizerId = org.id;
    organizerToken = signTestJwt({ sub: organizerAuthId, email: organizerEmail });

    // 2. Create Passenger (Student)
    const pass = await testPrisma.user.create({
      data: {
        authUserId: passengerAuthId,
        email: passengerEmail,
        fullName: 'Sneha Passenger',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
      },
    });
    passengerId = pass.id;
    passengerToken = signTestJwt({ sub: passengerAuthId, email: passengerEmail });

    // 3. Create Faculty Member
    const fac = await testPrisma.user.create({
      data: {
        authUserId: facultyAuthId,
        email: facultyEmail,
        fullName: 'Dr. Subramanian',
        audience: Audience.FACULTY,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
      },
    });
    facultyId = fac.id;
    facultyToken = signTestJwt({ sub: facultyAuthId, email: facultyEmail });

    // 4. Create Driver with registered vehicle (for comparison / regression)
    const drv = await testPrisma.user.create({
      data: {
        authUserId: driverWithCarAuthId,
        email: driverWithCarEmail,
        fullName: 'Vikram Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
      },
    });
    driverWithCarId = drv.id;
    driverWithCarToken = signTestJwt({ sub: driverWithCarAuthId, email: driverWithCarEmail });

    const veh = await testPrisma.vehicle.create({
      data: {
        userId: driverWithCarId,
        make: 'Hyundai',
        model: 'i20',
        color: 'White',
        registrationNumber: 'TN22AA9999',
        capacity: 4,
      },
    });
    vehicleId = veh.id;

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
    await testPrisma.cabFareAcknowledgement.deleteMany();
    await testPrisma.cabShareDetail.deleteMany();
    await testPrisma.notification.deleteMany();
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.user.deleteMany();
    await testPrisma.$disconnect();
    await app.close();
  });

  let createdCabShareRideId: string;

  describe('1. Cab Share Publishing API (POST /api/rides/cab-share)', () => {
    it('rejects publishing if departure time is in the past or < 10 mins in future', async () => {
      const pastTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      const deadline = new Date(Date.now() + 1 * 60 * 1000).toISOString();

      await request(app.getHttpServer())
        .post('/rides/cab-share')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai',
          departureTime: pastTime,
          bookingDeadline: deadline,
          totalCapacity: 4,
          estimatedTotalFare: 800,
        })
        .expect(400);
    });

    it('rejects publishing if booking deadline is after departure time', async () => {
      const dep = new Date(Date.now() + 86400000).toISOString();
      const invalidDeadline = new Date(Date.now() + 90000000).toISOString();

      await request(app.getHttpServer())
        .post('/rides/cab-share')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai',
          departureTime: dep,
          bookingDeadline: invalidDeadline,
          totalCapacity: 4,
          estimatedTotalFare: 800,
        })
        .expect(400);
    });

    it('rejects invalid capacity (< 2 or > 8) or invalid fare bounds', async () => {
      const dep = new Date(Date.now() + 86400000).toISOString();
      const deadline = new Date(Date.now() + 72000000).toISOString();

      // capacity 1
      await request(app.getHttpServer())
        .post('/rides/cab-share')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: dep,
          bookingDeadline: deadline,
          totalCapacity: 1,
          estimatedTotalFare: 800,
        })
        .expect(400);

      // capacity 9
      await request(app.getHttpServer())
        .post('/rides/cab-share')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: dep,
          bookingDeadline: deadline,
          totalCapacity: 9,
          estimatedTotalFare: 800,
        })
        .expect(400);

      // fare < 50
      await request(app.getHttpServer())
        .post('/rides/cab-share')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: dep,
          bookingDeadline: deadline,
          totalCapacity: 4,
          estimatedTotalFare: 30,
        })
        .expect(400);
    });

    it('successfully publishes cab share without a vehicle, allocating 1 seat to organiser', async () => {
      const dep = new Date(Date.now() + 86400000).toISOString();
      const deadline = new Date(Date.now() + 72000000).toISOString();

      const res = await request(app.getHttpServer())
        .post('/rides/cab-share')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          origin: 'Tambaram Railway Station',
          originLatitude: 12.9249,
          originLongitude: 80.1000,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: dep,
          bookingDeadline: deadline,
          totalCapacity: 4,
          estimatedTotalFare: 800,
          cabService: 'Uber XL',
          cabBookingRef: 'CONFIDENTIAL-UBER-12345',
        })
        .expect(201);

      createdCabShareRideId = res.body.id;
      expect(res.body.rideType).toBe('CAB_SHARE');
      expect(res.body.vehicleId).toBeNull();
      expect(res.body.totalSeats).toBe(4);
      // Organiser occupies 1 seat -> 3 passenger seats remain
      expect(res.body.availableSeats).toBe(3);
      expect(res.body.cabShare).toBeDefined();
      expect(res.body.cabShare.totalCapacity).toBe(4);
      expect(res.body.cabShare.estimatedTotalFare).toBe(800);
      expect(res.body.cabShare.cabService).toBe('Uber XL');
      // Organiser view exposes cabBookingRef
      expect(res.body.cabShare.cabBookingRef).toBe('CONFIDENTIAL-UBER-12345');

      // Verify DB record
      const dbRide = await testPrisma.ride.findUnique({
        where: { id: createdCabShareRideId },
        include: { cabShareDetail: true },
      });
      expect(dbRide?.rideType).toBe(RideType.CAB_SHARE);
      expect(dbRide?.vehicleId).toBeNull();
      expect(dbRide?.cabShareDetail).not.toBeNull();
      expect(dbRide?.cabShareDetail?.estimatedTotalFare).toBe(800);
    });

    it('rejects starting live vehicle tracking on a CAB_SHARE', async () => {
      const res = await request(app.getHttpServer())
        .post(`/rides/${createdCabShareRideId}/start`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(400);

      expect(res.body.message).toContain('not supported for shared cab journeys');
    });
  });

  describe('2. Cab Share Discovery & Privacy (GET /api/rides)', () => {
    let vehicleRideId: string;

    beforeAll(async () => {
      // Create a standard VEHICLE_RIDE for filter comparison
      const dep = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app.getHttpServer())
        .post('/rides')
        .set('Authorization', `Bearer ${driverWithCarToken}`)
        .send({
          vehicleId,
          origin: 'Tambaram Railway Station',
          originLatitude: 12.9249,
          originLongitude: 80.1000,
          destination: 'VIT Chennai',
          destinationLatitude: 12.8406,
          destinationLongitude: 80.1534,
          departureTime: dep,
          availableSeats: 3,
          costPerSeat: 80,
        })
        .expect(201);
      vehicleRideId = res.body.id;
    });

    it('filters rides by rideType=CAB_SHARE', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides?rideType=CAB_SHARE')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.rides.length).toBeGreaterThanOrEqual(1);
      const cabShares = res.body.rides.filter((r: any) => r.rideType === 'CAB_SHARE');
      const vehicleRides = res.body.rides.filter((r: any) => r.rideType === 'VEHICLE_RIDE');
      expect(cabShares.length).toBe(res.body.rides.length);
      expect(vehicleRides.length).toBe(0);
    });

    it('filters rides by rideType=VEHICLE_RIDE', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides?rideType=VEHICLE_RIDE')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      const cabShares = res.body.rides.filter((r: any) => r.rideType === 'CAB_SHARE');
      expect(cabShares.length).toBe(0);
      const target = res.body.rides.find((r: any) => r.id === vehicleRideId);
      expect(target).toBeDefined();
    });

    it('returns both when rideType=ALL or omitted', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides?rideType=ALL')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      const hasCab = res.body.rides.some((r: any) => r.rideType === 'CAB_SHARE');
      const hasVehicle = res.body.rides.some((r: any) => r.rideType === 'VEHICLE_RIDE');
      expect(hasCab).toBe(true);
      expect(hasVehicle).toBe(true);
    });

    it('strictly enforces privacy: NEVER exposes cabBookingRef in public search', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides?rideType=CAB_SHARE')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      const cabRide = res.body.rides.find((r: any) => r.id === createdCabShareRideId);
      expect(cabRide).toBeDefined();
      expect(cabRide.cabShare).toBeDefined();
      expect(cabRide.cabShare.cabService).toBe('Uber XL');
      expect(cabRide.cabShare.estimatedTotalFare).toBe(800);
      expect(cabRide.cabShare.estimatedPerPersonIfFull).toBe(200); // 800 / 4
      expect(cabRide.cabShare.currentPerPerson).toBe(800); // Only organizer confirmed so far
      expect(cabRide.cabShare.totalConfirmedParticipants).toBe(1);
      // STRICT PRIVACY CHECK:
      expect(cabRide.cabShare.cabBookingRef).toBeUndefined();
      expect(JSON.stringify(cabRide)).not.toContain('CONFIDENTIAL-UBER-12345');
    });

    it('enforces strict cohort isolation (Faculty cannot see student cab share)', async () => {
      const res = await request(app.getHttpServer())
        .get('/rides?rideType=CAB_SHARE')
        .set('Authorization', `Bearer ${facultyToken}`)
        .expect(200);

      const found = res.body.rides.some((r: any) => r.id === createdCabShareRideId);
      expect(found).toBe(false);
    });
  });

  describe('3. Corridor Search Matching for Cab Shares', () => {
    it('discovers cab share when passenger route is along the cab corridor (Vandalur -> VIT)', async () => {
      // Ensure multi-point route_geom representing Tambaram -> Perungalathur -> Vandalur -> Mambakkam -> VIT is set
      await testPrisma.$executeRaw`
        UPDATE rides
        SET origin_geom = ST_SetSRID(ST_MakePoint(80.1000, 12.9249), 4326)::geography,
            destination_geom = ST_SetSRID(ST_MakePoint(80.1534, 12.8406), 4326)::geography,
            route_geom = ST_SetSRID(ST_GeomFromText('LINESTRING(80.1000 12.9249, 80.0880 12.8980, 80.0818 12.8797, 80.1250 12.8550, 80.1534 12.8406)'), 4326)::geography,
            route_status = 'READY'
        WHERE id = ${createdCabShareRideId}::uuid
      `;

      // Vandalur: 12.8797, 80.0818 (between Tambaram 12.9249 and VIT 12.8406)
      const res = await request(app.getHttpServer())
        .get(
          '/rides?rideType=CAB_SHARE&originLat=12.8797&originLon=80.0818&destLat=12.8406&destLon=80.1534&radiusKm=3',
        )
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      const match = res.body.rides.find((r: any) => r.id === createdCabShareRideId);
      expect(match).toBeDefined();
      expect(match.match).toBeDefined();
      expect(match.match.matchType).toBe('ALONG_ROUTE');
    });
  });

  describe('4. Booking Lifecycle for Cab Shares', () => {
    let bookingId: string;

    it('rejects organiser attempting to book seats on their own cab share', async () => {
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          rideId: createdCabShareRideId,
          requestedSeats: 1,
        })
        .expect(400);
    });

    it('allows passenger to request booking on a cab share', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          rideId: createdCabShareRideId,
          requestedSeats: 1,
          pickupAddress: 'Vandalur Gate',
        })
        .expect(201);

      bookingId = res.body.id;
      expect(res.body.status).toBe('PENDING');
      expect(res.body.requestedSeats).toBe(1);
    });

    it('organiser approves booking, atomically decrementing available seats and updating fare split', async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/approve`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(201);

      expect(res.body.status).toBe('CONFIRMED');

      // Verify ride available seats decremented from 3 to 2
      const updatedRide = await testPrisma.ride.findUnique({
        where: { id: createdCabShareRideId },
      });
      expect(updatedRide?.availableSeats).toBe(2);

      // Verify public summary now reflects 2 confirmed participants (organiser + 1 passenger)
      const pubRes = await request(app.getHttpServer())
        .get('/rides?rideType=CAB_SHARE')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      const cabRide = pubRes.body.rides.find((r: any) => r.id === createdCabShareRideId);
      expect(cabRide.cabShare.totalConfirmedParticipants).toBe(2);
      expect(cabRide.cabShare.currentPerPerson).toBe(400); // 800 / 2
    });

    it('rejects booking requests that exceed available seats', async () => {
      // 2 seats available; requesting 3 should fail
      await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${driverWithCarToken}`) // as another passenger
        .send({
          rideId: createdCabShareRideId,
          requestedSeats: 3,
        })
        .expect(400);
    });

    it('rejects booking requests after booking deadline has passed', async () => {
      // Create a cab share with a deadline in the past
      const pastDeadline = new Date(Date.now() - 60000);
      const futureDep = new Date(Date.now() + 86400000);

      const expiredCabRide = await testPrisma.ride.create({
        data: {
          driverId: organizerId,
          rideType: RideType.CAB_SHARE,
          audience: Audience.STUDENT,
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: futureDep,
          availableSeats: 3,
          totalSeats: 4,
          status: RideStatus.SCHEDULED,
          cabShareDetail: {
            create: {
              totalCapacity: 4,
              estimatedTotalFare: 800,
              bookingDeadline: pastDeadline,
            },
          },
        },
      });

      const res = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          rideId: expiredCabRide.id,
          requestedSeats: 1,
        })
        .expect(400);

      expect(res.body.message).toContain('booking deadline for this cab share journey has passed');
    });
  });

  describe('5. Fare Handling & Material Fare Revision Acknowledgements', () => {
    let activeBookingId: string;

    beforeAll(async () => {
      const active = await testPrisma.booking.findFirst({
        where: { rideId: createdCabShareRideId, status: BookingStatus.CONFIRMED },
      });
      activeBookingId = active!.id;
    });

    it('organiser updates fare with a material increase (> 15% / > ₹50/person)', async () => {
      // 800 -> 1000 (+25%, +₹50/person for 4 people)
      const res = await request(app.getHttpServer())
        .patch(`/rides/${createdCabShareRideId}/cab-fare`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          finalTotalFare: 1000,
          reason: 'Toll plaza charges and peak surge',
        })
        .expect(200);

      expect(res.body.cabShare.finalTotalFare).toBe(1000);
      expect(res.body.cabShare.fareRevision).toBe(2);

      // Verify notification sent to confirmed passenger
      const notif = await testPrisma.notification.findFirst({
        where: {
          recipientId: passengerId,
          type: NotificationType.CAB_FARE_UPDATED,
        },
      });
      expect(notif).toBeDefined();
      expect(notif?.message).toContain('1000');
    });

    it('passenger acknowledges the revised fare (revision 2)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${activeBookingId}/cab-fare/acknowledge`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          fareRevision: 2,
        })
        .expect(200);

      expect(res.body.acknowledged).toBe(true);
      expect(res.body.fareRevision).toBe(2);

      // Verify DB record with unique [bookingId, userId, fareRevision]
      const dbAck = await testPrisma.cabFareAcknowledgement.findUnique({
        where: {
          bookingId_userId_fareRevision: {
            bookingId: activeBookingId,
            userId: passengerId,
            fareRevision: 2,
          },
        },
      });
      expect(dbAck).not.toBeNull();
      expect(dbAck?.fareRevision).toBe(2);
    });

    it('subsequent acknowledgement of the same revision succeeds idempotently without error', async () => {
      const res = await request(app.getHttpServer())
        .post(`/bookings/${activeBookingId}/cab-fare/acknowledge`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          fareRevision: 2,
        })
        .expect(200);

      expect(res.body.acknowledged).toBe(true);
    });
  });

  describe('6. Organiser Cancellation and Passenger Notifications', () => {
    it('cancels the cab share and automatically cascades cancellation to active bookings', async () => {
      const res = await request(app.getHttpServer())
        .post(`/rides/${createdCabShareRideId}/cancel`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(201);

      expect(res.body.status).toBe('CANCELLED');

      // Verify all bookings on this ride are CANCELLED
      const bookings = await testPrisma.booking.findMany({
        where: { rideId: createdCabShareRideId },
      });
      for (const b of bookings) {
        expect(b.status).toBe(BookingStatus.CANCELLED);
        expect(b.cancellationReason).toContain('organiser');
      }

      // Verify passenger received cancellation notification
      const cancelNotif = await testPrisma.notification.findFirst({
        where: {
          recipientId: passengerId,
          type: NotificationType.RIDE_CANCELLED,
        },
      });
      expect(cancelNotif).toBeDefined();
    });
  });
});
