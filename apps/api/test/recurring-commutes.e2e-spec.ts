import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PrismaClient,
  Audience,
  VerificationStatus,
  VerificationMethod,
  UserRole,
  RideStatus,
  RecurringCommuteStatus,
  BookingStatus,
} from '@vit-carpool/db';
import { signTestJwt } from '../src/modules/auth/jwt-keys.fixture';
import { RecurringCommuteSchedulerService } from '../src/modules/recurring-commutes/recurring-commutes.scheduler.service';
import { RecurringCommutesService } from '../src/modules/recurring-commutes/recurring-commutes.service';
import {
  getKolkataTodayString,
  getApplicableOccurrenceDates,
  getIsoWeekday,
  formatWeekdays,
  formatTime12Hour,
} from '@vit-carpool/contracts';

describe('Milestone 11: Recurring Commutes & Materialization Engine (e2e)', () => {
  let app: INestApplication;
  let testPrisma: PrismaClient;
  let scheduler: RecurringCommuteSchedulerService;
  let commutesService: RecurringCommutesService;

  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public';

  // Test Driver 1 (Verified Student)
  const driver1AuthId = 'c1111111-1111-4111-8111-111111111111';
  const driver1Email = 'recurring.driver1@vitstudent.ac.in';
  let driver1Token: string;
  let driver1Id: string;
  let driver1VehicleId: string; // 5-seater (4 passenger seats max)

  // Test Driver 2 (Verified Student - Different user for ownership tests)
  const driver2AuthId = 'c2222222-2222-4222-8222-222222222222';
  const driver2Email = 'recurring.driver2@vitstudent.ac.in';
  let driver2Token: string;
  let driver2Id: string;
  let driver2VehicleId: string; // 4-seater (3 passenger seats max)

  // Test Rider (Verified Student Passenger)
  const riderAuthId = 'c3333333-3333-4333-8333-333333333333';
  const riderEmail = 'recurring.rider@vitstudent.ac.in';
  let riderToken: string;
  let riderId: string;

  // Unverified User
  const unverifiedAuthId = 'c4444444-4444-4444-8444-444444444444';
  const unverifiedEmail = 'unverified.user@vitstudent.ac.in';
  let unverifiedToken: string;

  // Faculty Driver (For audience separation tests)
  const facultyDriverAuthId = 'c5555555-5555-4555-8555-555555555555';
  const facultyDriverEmail = 'recurring.faculty@vit.ac.in';
  let facultyDriverToken: string;
  let facultyDriverId: string;
  let facultyVehicleId: string;

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
    await testPrisma.booking.deleteMany();
    await testPrisma.ride.deleteMany();
    await testPrisma.recurringCommute.deleteMany();
    await testPrisma.vehicle.deleteMany();
    await testPrisma.user.deleteMany();

    // 1. Seed Verified Student Driver 1
    const d1 = await testPrisma.user.create({
      data: {
        authUserId: driver1AuthId,
        email: driver1Email,
        fullName: 'Arjun Commuter Driver',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    driver1Id = d1.id;
    driver1Token = signTestJwt({ sub: driver1AuthId, email: driver1Email });

    const v1 = await testPrisma.vehicle.create({
      data: {
        userId: driver1Id,
        make: 'Honda',
        model: 'City',
        color: 'White',
        registrationNumber: 'TN09CC1111',
        capacity: 5, // max 4 passenger seats
      },
    });
    driver1VehicleId = v1.id;

    // 2. Seed Verified Student Driver 2
    const d2 = await testPrisma.user.create({
      data: {
        authUserId: driver2AuthId,
        email: driver2Email,
        fullName: 'Bhavna Driver 2',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    driver2Id = d2.id;
    driver2Token = signTestJwt({ sub: driver2AuthId, email: driver2Email });

    const v2 = await testPrisma.vehicle.create({
      data: {
        userId: driver2Id,
        make: 'Maruti',
        model: 'Swift',
        color: 'Silver',
        registrationNumber: 'TN09DD2222',
        capacity: 4, // max 3 passenger seats
      },
    });
    driver2VehicleId = v2.id;

    // 3. Seed Verified Student Rider
    const r = await testPrisma.user.create({
      data: {
        authUserId: riderAuthId,
        email: riderEmail,
        fullName: 'Rahul Student Rider',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    riderId = r.id;
    riderToken = signTestJwt({ sub: riderAuthId, email: riderEmail });

    // 4. Seed Unverified User
    await testPrisma.user.create({
      data: {
        authUserId: unverifiedAuthId,
        email: unverifiedEmail,
        fullName: 'Pending Unverified',
        verificationStatus: VerificationStatus.PENDING,
        role: UserRole.USER,
      },
    });
    unverifiedToken = signTestJwt({ sub: unverifiedAuthId, email: unverifiedEmail });

    // 5. Seed Faculty Driver
    const fDriver = await testPrisma.user.create({
      data: {
        authUserId: facultyDriverAuthId,
        email: facultyDriverEmail,
        fullName: 'Dr. Ramesh Faculty Driver',
        audience: Audience.FACULTY,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
        role: UserRole.USER,
      },
    });
    facultyDriverId = fDriver.id;
    facultyDriverToken = signTestJwt({ sub: facultyDriverAuthId, email: facultyDriverEmail });

    const fVehicle = await testPrisma.vehicle.create({
      data: {
        userId: facultyDriverId,
        make: 'Toyota',
        model: 'Innova',
        color: 'Black',
        registrationNumber: 'TN09EE3333',
        capacity: 7,
      },
    });
    facultyVehicleId = fVehicle.id;

    // Initialize Nest app
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    scheduler = app.get(RecurringCommuteSchedulerService);
    commutesService = app.get(RecurringCommutesService);
  });

  afterAll(async () => {
    if (testPrisma) {
      await testPrisma.message.deleteMany();
      await testPrisma.conversation.deleteMany();
      await testPrisma.booking.deleteMany();
      await testPrisma.ride.deleteMany();
      await testPrisma.recurringCommute.deleteMany();
      await testPrisma.vehicle.deleteMany();
      await testPrisma.user.deleteMany();
      await testPrisma.$disconnect();
    }
    if (app) await app.close();
  });

  // ===========================================================================
  // SECTION 1: Pure Date and Schedule Computation Utilities
  // ===========================================================================
  describe('1. Date and Schedule Computation Utilities', () => {
    it('accurately identifies ISO weekdays (1=Mon to 7=Sun) in Asia/Kolkata', () => {
      // 2026-10-26 is Monday
      expect(getIsoWeekday('2026-10-26')).toBe(1);
      // 2026-10-27 is Tuesday
      expect(getIsoWeekday('2026-10-27')).toBe(2);
      // 2026-10-28 is Wednesday
      expect(getIsoWeekday('2026-10-28')).toBe(3);
      // 2026-10-31 is Saturday
      expect(getIsoWeekday('2026-10-31')).toBe(6);
      // 2026-11-01 is Sunday
      expect(getIsoWeekday('2026-11-01')).toBe(7);
    });

    it('formats weekday arrays into human-friendly strings', () => {
      expect(formatWeekdays([1, 2, 3, 4, 5])).toBe('Weekdays (Mon - Fri)');
      expect(formatWeekdays([6, 7])).toBe('Weekends (Sat - Sun)');
      expect(formatWeekdays([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
      expect(formatWeekdays([1, 3, 5])).toBe('Mon, Wed, Fri');
      expect(formatWeekdays([])).toBe('None');
    });

    it('formats 24-hour departure times into 12-hour format with AM/PM', () => {
      expect(formatTime12Hour('08:00')).toBe('8:00 AM');
      expect(formatTime12Hour('08:30')).toBe('8:30 AM');
      expect(formatTime12Hour('12:00')).toBe('12:00 PM');
      expect(formatTime12Hour('17:45')).toBe('5:45 PM');
      expect(formatTime12Hour('00:15')).toBe('12:15 AM');
    });

    it('calculates applicable occurrence dates bounded by rolling horizon', () => {
      // Reference date: 2026-11-01 (Sunday, ISO 7)
      const refDate = new Date('2026-11-01T10:00:00+05:30');
      // Horizon 14 days -> up to 2026-11-15
      // Weekdays: Mon(1), Wed(3), Fri(5)
      const dates = getApplicableOccurrenceDates(
        '2026-11-01',
        '2026-11-30',
        [1, 3, 5],
        14,
        refDate,
      );

      // In range 2026-11-01 to 2026-11-15:
      // Nov 2 (Mon), Nov 4 (Wed), Nov 6 (Fri), Nov 9 (Mon), Nov 11 (Wed), Nov 13 (Fri)
      expect(dates).toEqual([
        '2026-11-02',
        '2026-11-04',
        '2026-11-06',
        '2026-11-09',
        '2026-11-11',
        '2026-11-13',
      ]);
    });

    it('handles leap years and month transitions smoothly across horizon', () => {
      // Reference date: 2028-02-25 in leap year 2028
      const refDate = new Date('2028-02-25T10:00:00+05:30');
      const dates = getApplicableOccurrenceDates(
        '2028-02-20',
        '2028-03-10',
        [1, 2, 3, 4, 5, 6, 7], // every day
        7,
        refDate,
      );

      // Should include 2028-02-29 (leap day)
      expect(dates).toContain('2028-02-29');
      expect(dates).toContain('2028-03-01');
    });
  });

  // ===========================================================================
  // SECTION 2: Creation & Input Validation (API)
  // ===========================================================================
  describe('2. Schedule Creation & Input Validation', () => {
    it('rejects unauthenticated requests (401)', async () => {
      await request(app.getHttpServer())
        .post('/recurring-commutes')
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          vehicleId: driver1VehicleId,
          weekdays: [1, 2, 3, 4, 5],
          departureTime: '08:00',
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          availableSeats: 3,
        })
        .expect(401);
    });

    it('rejects unverified user requests (403)', async () => {
      await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${unverifiedToken}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          vehicleId: driver1VehicleId,
          weekdays: [1, 2, 3, 4, 5],
          departureTime: '08:00',
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          availableSeats: 3,
        })
        .expect(403);
    });

    it('rejects vehicle belonging to another driver (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          vehicleId: driver2VehicleId, // belongs to driver 2
          weekdays: [1, 2, 3, 4, 5],
          departureTime: '08:00',
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          availableSeats: 2,
        })
        .expect(400);

      expect(res.body.message).toMatch(/not found, does not belong to you/i);
    });

    it('rejects seat count exceeding vehicle passenger capacity (400)', async () => {
      // driver1 vehicle has capacity 5 (max 4 passenger seats)
      const res = await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          vehicleId: driver1VehicleId,
          weekdays: [1, 2, 3, 4, 5],
          departureTime: '08:00',
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          availableSeats: 5, // exceeds 4
        })
        .expect(400);

      expect(res.body.message).toMatch(/cannot offer more than 4 passenger seats/i);
    });

    it('rejects schedule end date earlier than start date (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          vehicleId: driver1VehicleId,
          weekdays: [1, 2, 3, 4, 5],
          departureTime: '08:00',
          startDate: '2026-11-30',
          endDate: '2026-11-01', // earlier
          availableSeats: 3,
        })
        .expect(400);

      expect(res.body.message).toMatch(/must be on or after start date/i);
    });

    it('rejects empty or invalid weekdays (400)', async () => {
      await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          vehicleId: driver1VehicleId,
          weekdays: [], // empty
          departureTime: '08:00',
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          availableSeats: 3,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          vehicleId: driver1VehicleId,
          weekdays: [0, 8], // invalid day numbers
          departureTime: '08:00',
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          availableSeats: 3,
        })
        .expect(400);
    });

    it('rejects invalid departure time format (400)', async () => {
      await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          vehicleId: driver1VehicleId,
          weekdays: [1, 2, 3, 4, 5],
          departureTime: '25:00', // invalid hour
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          availableSeats: 3,
        })
        .expect(400);
    });

    it('successfully creates recurring commute and immediately materializes initial rides', async () => {
      // Future dates for testing: start 2 days from today, end 30 days from today
      const today = new Date();
      const startD = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
      const endD = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const startStr = startD.toISOString().slice(0, 10);
      const endStr = endD.toISOString().slice(0, 10);

      const res = await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai Main Gate',
          originAddress: 'West Tambaram, Chennai',
          destinationAddress: 'Vandalur-Kelambakkam Road, Chennai',
          vehicleId: driver1VehicleId,
          weekdays: [1, 2, 3, 4, 5],
          departureTime: '08:00',
          startDate: startStr,
          endDate: endStr,
          availableSeats: 3,
          costPerSeat: 60,
          pickupDescription: 'Near platform 1 exit',
          dropoffDescription: 'Near Academic Block 1',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.driverId).toBe(driver1Id);
      expect(res.body.origin).toBe('Tambaram Railway Station');
      expect(res.body.destination).toBe('VIT Chennai Main Gate');
      expect(res.body.weekdays).toEqual([1, 2, 3, 4, 5]);
      expect(res.body.departureTime).toBe('08:00');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.availableSeats).toBe(3);
      expect(res.body.costPerSeat).toBe(60);
      expect(res.body.vehicle.make).toBe('Honda');
      expect(res.body.generatedRidesCount).toBeGreaterThan(0);

      // Verify rides exist in the database with recurringCommuteId and scheduledOccurrence populated
      const rides = await testPrisma.ride.findMany({
        where: { recurringCommuteId: res.body.id },
      });

      expect(rides.length).toBe(res.body.generatedRidesCount);
      for (const ride of rides) {
        expect(ride.driverId).toBe(driver1Id);
        expect(ride.vehicleId).toBe(driver1VehicleId);
        expect(ride.audience).toBe(Audience.STUDENT);
        expect(ride.availableSeats).toBe(3);
        expect(ride.costPerSeat).toBe(60);
        expect(ride.scheduledOccurrence).toBeDefined();
        expect(ride.recurringCommuteId).toBe(res.body.id);
      }
    });
  });

  // ===========================================================================
  // SECTION 3: Idempotency, Concurrency & Bounded Horizon
  // ===========================================================================
  describe('3. Idempotency, Duplicate Prevention & Concurrency Safety', () => {
    let commuteId: string;

    beforeEach(async () => {
      // Create clean test schedule
      const today = new Date();
      const startD = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000);
      const endD = new Date(today.getTime() + 25 * 24 * 60 * 60 * 1000);

      const commute = await testPrisma.recurringCommute.create({
        data: {
          driverId: driver1Id,
          audience: Audience.STUDENT,
          vehicleId: driver1VehicleId,
          origin: 'Velachery',
          destination: 'VIT Chennai',
          weekdays: [1, 2, 3, 4, 5],
          departureTime: '08:30',
          startDate: new Date(`${startD.toISOString().slice(0, 10)}T00:00:00.000Z`),
          endDate: new Date(`${endD.toISOString().slice(0, 10)}T00:00:00.000Z`),
          availableSeats: 3,
          costPerSeat: 75,
          status: RecurringCommuteStatus.ACTIVE,
        },
      });
      commuteId = commute.id;
    });

    it('repeated scheduler executions do NOT generate duplicate rides (Idempotency)', async () => {
      // Run 1: initial generation
      const run1 = await scheduler.triggerGeneration(14);
      const countAfterRun1 = await testPrisma.ride.count({
        where: { recurringCommuteId: commuteId },
      });
      expect(countAfterRun1).toBeGreaterThan(0);

      // Run 2: immediately rerun
      const run2 = await scheduler.triggerGeneration(14);
      expect(run2.totalCreated).toBe(0); // 0 new rides created
      expect(run2.totalSkipped).toBeGreaterThan(0);

      // Total count in DB must remain exactly identical
      const countAfterRun2 = await testPrisma.ride.count({
        where: { recurringCommuteId: commuteId },
      });
      expect(countAfterRun2).toBe(countAfterRun1);
    });

    it('concurrent parallel workers cannot create duplicate occurrences for the same date', async () => {
      const commute = await testPrisma.recurringCommute.findUniqueOrThrow({
        where: { id: commuteId },
      });

      // Fire 5 simultaneous parallel generation tasks
      const results = await Promise.all([
        commutesService.generateRidesForSchedule(commute, 14),
        commutesService.generateRidesForSchedule(commute, 14),
        commutesService.generateRidesForSchedule(commute, 14),
        commutesService.generateRidesForSchedule(commute, 14),
        commutesService.generateRidesForSchedule(commute, 14),
      ]);

      // All 5 completed without crashing
      expect(results.length).toBe(5);

      // Verify that in the database, each scheduled_occurrence date has EXACTLY ONE ride
      const rides = await testPrisma.ride.findMany({
        where: { recurringCommuteId: commuteId },
      });

      const occurrenceDates = rides.map((r) => r.scheduledOccurrence!.toISOString().slice(0, 10));
      const uniqueDates = new Set(occurrenceDates);

      // Invariant: number of rows in DB == number of unique occurrence dates
      expect(rides.length).toBe(uniqueDates.size);
    });

    it('does not generate rides beyond the configured horizon window', async () => {
      const today = new Date();
      // Horizon = 7 days
      const horizonDays = 7;
      const commute = await testPrisma.recurringCommute.findUniqueOrThrow({
        where: { id: commuteId },
      });

      await testPrisma.ride.deleteMany({ where: { recurringCommuteId: commuteId } });
      await commutesService.generateRidesForSchedule(commute, horizonDays);

      const rides = await testPrisma.ride.findMany({
        where: { recurringCommuteId: commuteId },
      });

      const maxAllowedDate = new Date(today.getTime() + (horizonDays + 1) * 24 * 60 * 60 * 1000);
      for (const ride of rides) {
        expect(ride.departureTime.getTime()).toBeLessThanOrEqual(maxAllowedDate.getTime());
      }
    });

    it('does NOT recreate an individual generated ride that the driver intentionally cancelled', async () => {
      const commute = await testPrisma.recurringCommute.findUniqueOrThrow({
        where: { id: commuteId },
      });

      // 1. Generate rides
      await commutesService.generateRidesForSchedule(commute, 14);

      const rides = await testPrisma.ride.findMany({
        where: { recurringCommuteId: commuteId },
        orderBy: { departureTime: 'asc' },
      });
      expect(rides.length).toBeGreaterThan(0);

      // 2. Driver intentionally cancels the first generated ride
      const rideToCancel = rides[0];
      await request(app.getHttpServer())
        .post(`/rides/${rideToCancel.id}/cancel`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ reason: 'Personal conflict on this date' })
        .expect(201);

      // Verify ride status is CANCELLED
      const cancelledRide = await testPrisma.ride.findUnique({
        where: { id: rideToCancel.id },
      });
      expect(cancelledRide?.status).toBe(RideStatus.CANCELLED);

      // 3. Trigger generator again
      await commutesService.generateRidesForSchedule(commute, 14);

      // 4. Verify that the cancelled occurrence was NOT recreated or duplicated
      const matchingRides = await testPrisma.ride.findMany({
        where: {
          recurringCommuteId: commuteId,
          scheduledOccurrence: rideToCancel.scheduledOccurrence,
        },
      });

      expect(matchingRides.length).toBe(1);
      expect(matchingRides[0].status).toBe(RideStatus.CANCELLED);
    });
  });

  // ===========================================================================
  // SECTION 4: Schedule Lifecycle (View, Edit, Pause, Resume, Cancel)
  // ===========================================================================
  describe('4. Schedule Lifecycle & State Transitions', () => {
    let activeCommuteId: string;

    beforeEach(async () => {
      const today = new Date();
      const startD = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000);
      const endD = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000);

      const commute = await testPrisma.recurringCommute.create({
        data: {
          driverId: driver1Id,
          audience: Audience.STUDENT,
          vehicleId: driver1VehicleId,
          origin: 'Adyar',
          destination: 'VIT Chennai',
          weekdays: [1, 3, 5],
          departureTime: '07:45',
          startDate: new Date(`${startD.toISOString().slice(0, 10)}T00:00:00.000Z`),
          endDate: new Date(`${endD.toISOString().slice(0, 10)}T00:00:00.000Z`),
          availableSeats: 3,
          costPerSeat: 80,
          status: RecurringCommuteStatus.ACTIVE,
        },
      });
      activeCommuteId = commute.id;
    });

    it('allows driver to list their own schedules and protects private schedule details from other users', async () => {
      // Driver 1 lists schedules -> sees their schedule
      const resD1 = await request(app.getHttpServer())
        .get('/recurring-commutes')
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      expect(resD1.body.some((s: any) => s.id === activeCommuteId)).toBe(true);

      // Driver 2 lists schedules -> does NOT see Driver 1's schedule
      const resD2 = await request(app.getHttpServer())
        .get('/recurring-commutes')
        .set('Authorization', `Bearer ${driver2Token}`)
        .expect(200);

      expect(resD2.body.some((s: any) => s.id === activeCommuteId)).toBe(false);

      // Driver 2 attempts to get Driver 1's schedule by ID -> 404
      await request(app.getHttpServer())
        .get(`/recurring-commutes/${activeCommuteId}`)
        .set('Authorization', `Bearer ${driver2Token}`)
        .expect(404);
    });

    it('pausing an active schedule transitions state to PAUSED and stops future generation', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/recurring-commutes/${activeCommuteId}/pause`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      expect(res.body.status).toBe('PAUSED');
      expect(res.body.nextOccurrence).toBeNull();

      // Paused schedule generates 0 rides
      const commute = await testPrisma.recurringCommute.findUniqueOrThrow({
        where: { id: activeCommuteId },
      });
      const genResult = await commutesService.generateRidesForSchedule(commute, 14);
      expect(genResult.created).toBe(0);

      // Attempting to pause already paused schedule -> 400
      await request(app.getHttpServer())
        .patch(`/recurring-commutes/${activeCommuteId}/pause`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(400);
    });

    it('resuming a paused schedule transitions state to ACTIVE and generates future occurrences', async () => {
      // First pause
      await request(app.getHttpServer())
        .patch(`/recurring-commutes/${activeCommuteId}/pause`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      // Clean rides
      await testPrisma.ride.deleteMany({ where: { recurringCommuteId: activeCommuteId } });

      // Resume
      const res = await request(app.getHttpServer())
        .patch(`/recurring-commutes/${activeCommuteId}/resume`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.nextOccurrence).toBeDefined();

      // Rides were materialized
      const rideCount = await testPrisma.ride.count({
        where: { recurringCommuteId: activeCommuteId },
      });
      expect(rideCount).toBeGreaterThan(0);

      // Attempting to resume already active schedule -> 400
      await request(app.getHttpServer())
        .patch(`/recurring-commutes/${activeCommuteId}/resume`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(400);
    });

    it('cancelling a schedule marks it CANCELLED and disallows editing or resuming', async () => {
      // Cancel
      const res = await request(app.getHttpServer())
        .patch(`/recurring-commutes/${activeCommuteId}/cancel`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      expect(res.body.status).toBe('CANCELLED');

      // Attempting to resume cancelled schedule -> 400
      await request(app.getHttpServer())
        .patch(`/recurring-commutes/${activeCommuteId}/resume`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(400);

      // Attempting to edit cancelled schedule -> 400
      await request(app.getHttpServer())
        .patch(`/recurring-commutes/${activeCommuteId}`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ costPerSeat: 90 })
        .expect(400);

      // Attempting to cancel already cancelled schedule -> 400
      await request(app.getHttpServer())
        .patch(`/recurring-commutes/${activeCommuteId}/cancel`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(400);
    });

    it('updating schedule preferences preserves existing rides and updates future parameters', async () => {
      // 1. Initial generation
      const commute = await testPrisma.recurringCommute.findUniqueOrThrow({
        where: { id: activeCommuteId },
      });
      await commutesService.generateRidesForSchedule(commute, 14);

      const initialRides = await testPrisma.ride.findMany({
        where: { recurringCommuteId: activeCommuteId },
      });
      const initialCount = initialRides.length;

      // 2. Update price from 80 to 95 and departure time from 07:45 to 08:15
      const res = await request(app.getHttpServer())
        .patch(`/recurring-commutes/${activeCommuteId}`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({
          costPerSeat: 95,
          departureTime: '08:15',
          pickupDescription: 'Updated pickup location',
        })
        .expect(200);

      expect(res.body.costPerSeat).toBe(95);
      expect(res.body.departureTime).toBe('08:15');
      expect(res.body.pickupDescription).toBe('Updated pickup location');

      // 3. Existing rides must not be deleted or overwritten
      const ridesAfterUpdate = await testPrisma.ride.findMany({
        where: { recurringCommuteId: activeCommuteId },
      });
      expect(ridesAfterUpdate.length).toBe(initialCount);
    });
  });

  // ===========================================================================
  // SECTION 5: Full Ride Lifecycle Integration
  // ===========================================================================
  describe('5. Integration with Full Ride & Booking Lifecycle', () => {
    it('materialized recurring rides work seamlessly with discovery, booking, approval, seats, and chat', async () => {
      // 1. Create recurring commute
      const today = new Date();
      const startD = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000);
      const endD = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000);

      const resCommute = await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({
          origin: 'Chromepet',
          destination: 'VIT Chennai Campus',
          vehicleId: driver1VehicleId,
          weekdays: [1, 2, 3, 4, 5, 6, 7], // every day
          departureTime: '08:30',
          startDate: startD.toISOString().slice(0, 10),
          endDate: endD.toISOString().slice(0, 10),
          availableSeats: 3,
          costPerSeat: 50,
        })
        .expect(201);

      // 2. Passenger discovers the generated ride on the standard ride board
      const discoveryRes = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${riderToken}`)
        .query({ destination: 'VIT Chennai Campus' })
        .expect(200);

      expect(discoveryRes.body.rides.length).toBeGreaterThan(0);
      const generatedRide = discoveryRes.body.rides.find(
        (r: any) => r.origin === 'Chromepet' && r.driverId === driver1Id,
      );
      expect(generatedRide).toBeDefined();
      expect(generatedRide.availableSeats).toBe(3);

      // 3. Passenger requests a booking for 2 seats
      const bookingRes = await request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({
          rideId: generatedRide.id,
          requestedSeats: 2,
        })
        .expect(201);

      expect(bookingRes.body.id).toBeDefined();
      expect(bookingRes.body.status).toBe(BookingStatus.PENDING);
      const bookingId = bookingRes.body.id;

      // 4. Driver approves booking request
      const approveRes = await request(app.getHttpServer())
        .post(`/bookings/${bookingId}/approve`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(201);

      expect(approveRes.body.status).toBe(BookingStatus.CONFIRMED);

      // 5. Verify available seats decremented from 3 to 1
      const updatedRide = await testPrisma.ride.findUnique({
        where: { id: generatedRide.id },
      });
      expect(updatedRide?.availableSeats).toBe(1);

      // 6. Passenger and driver can open chat for this booking
      const chatRes = await request(app.getHttpServer())
        .get(`/chat/conversations/booking/${bookingId}`)
        .set('Authorization', `Bearer ${riderToken}`)
        .expect(200);

      expect(chatRes.body.id).toBeDefined();

      // 7. Send message
      await request(app.getHttpServer())
        .post(`/chat/conversations/${chatRes.body.id}/messages`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ content: 'Hi, I will be at Chromepet bus stop on time!' })
        .expect(201);

      // 8. Driver completes the ride
      await request(app.getHttpServer())
        .post(`/rides/${generatedRide.id}/complete`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(201);

      const completedRide = await testPrisma.ride.findUnique({
        where: { id: generatedRide.id },
      });
      expect(completedRide?.status).toBe(RideStatus.COMPLETED);
    });

    it('enforces audience isolation: faculty commute generates faculty rides that students cannot view', async () => {
      const today = new Date();
      const startD = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000);
      const endD = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000);

      // Faculty creates recurring commute
      const facCommuteRes = await request(app.getHttpServer())
        .post('/recurring-commutes')
        .set('Authorization', `Bearer ${facultyDriverToken}`)
        .send({
          origin: 'Anna Nagar',
          destination: 'VIT Chennai Faculty Block',
          vehicleId: facultyVehicleId,
          weekdays: [1, 2, 3, 4, 5],
          departureTime: '08:00',
          startDate: startD.toISOString().slice(0, 10),
          endDate: endD.toISOString().slice(0, 10),
          availableSeats: 4,
          costPerSeat: 100,
        })
        .expect(201);

      expect(facCommuteRes.body.audience).toBe(Audience.FACULTY);

      // Student rider searches for rides to Faculty Block -> sees 0 faculty rides
      const studentSearchRes = await request(app.getHttpServer())
        .get('/rides')
        .set('Authorization', `Bearer ${riderToken}`)
        .query({ destination: 'VIT Chennai Faculty Block' })
        .expect(200);

      expect(
        studentSearchRes.body.rides.some((r: any) => r.origin === 'Anna Nagar'),
      ).toBe(false);
    });
  });
});
