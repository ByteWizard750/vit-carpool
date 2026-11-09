import {
  PrismaClient,
  RideType,
  Audience,
  RideStatus,
  VerificationStatus,
  VerificationMethod,
} from '@vit-carpool/db';
import { calculateCabFareSplit, isMaterialFareIncrease } from '@vit-carpool/contracts';

describe('Milestone A Review: Database Integrity & Capacity Semantics', () => {
  let prisma: PrismaClient;
  let testUserId1: string;
  let testUserId2: string;
  let testVehicleId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.TEST_DATABASE_URL ||
            'postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_test?schema=public',
        },
      },
    });
    await prisma.$connect();

    // Create 2 test users (students)
    const user1 = await prisma.user.create({
      data: {
        authUserId: '11111111-1111-1111-1111-111111111111',
        email: 'organizer.test@vitstudent.ac.in',
        fullName: 'Cab Organizer',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
      },
    });
    testUserId1 = user1.id;

    const user2 = await prisma.user.create({
      data: {
        authUserId: '22222222-2222-2222-2222-222222222222',
        email: 'passenger.test@vitstudent.ac.in',
        fullName: 'Cab Passenger',
        audience: Audience.STUDENT,
        verificationStatus: VerificationStatus.VERIFIED,
        verificationMethod: VerificationMethod.MANUAL_ID_REVIEW,
        verifiedAt: new Date(),
      },
    });
    testUserId2 = user2.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        userId: testUserId1,
        make: 'Maruti',
        model: 'Swift',
        color: 'White',
        capacity: 4,
        registrationNumber: 'TN09AB1234',
      },
    });
    testVehicleId = vehicle.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.cabFareAcknowledgement.deleteMany({
      where: { userId: { in: [testUserId1, testUserId2] } },
    });
    await prisma.cabShareDetail.deleteMany({
      where: { ride: { driverId: testUserId1 } },
    });
    await prisma.booking.deleteMany({
      where: { passengerId: { in: [testUserId1, testUserId2] } },
    });
    await prisma.ride.deleteMany({
      where: { driverId: testUserId1 },
    });
    await prisma.vehicle.deleteMany({
      where: { id: testVehicleId },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId1, testUserId2] } },
    });
    await prisma.$disconnect();
  });

  describe('Database Discriminator & Integrity Constraints', () => {
    it('should reject VEHICLE_RIDE if vehicle_id is NULL', async () => {
      await expect(
        prisma.ride.create({
          data: {
            driverId: testUserId1,
            vehicleId: null, // Invalid for VEHICLE_RIDE!
            rideType: RideType.VEHICLE_RIDE,
            audience: Audience.STUDENT,
            origin: 'Tambaram',
            destination: 'VIT Chennai',
            departureTime: new Date(Date.now() + 86400000),
            availableSeats: 3,
            totalSeats: 3,
            status: RideStatus.SCHEDULED,
          },
        }),
      ).rejects.toThrow();
    });

    it('should reject CAB_SHARE if vehicle_id is NOT NULL', async () => {
      await expect(
        prisma.ride.create({
          data: {
            driverId: testUserId1,
            vehicleId: testVehicleId, // Invalid for CAB_SHARE!
            rideType: RideType.CAB_SHARE,
            audience: Audience.STUDENT,
            origin: 'Tambaram',
            destination: 'VIT Chennai',
            departureTime: new Date(Date.now() + 86400000),
            availableSeats: 3,
            totalSeats: 4,
            status: RideStatus.SCHEDULED,
          },
        }),
      ).rejects.toThrow();
    });

    it('should allow valid CAB_SHARE creation with vehicle_id = NULL and associated cabShareDetail', async () => {
      const depTime = new Date(Date.now() + 86400000);
      const deadline = new Date(Date.now() + 72000000);

      const ride = await prisma.ride.create({
        data: {
          driverId: testUserId1,
          vehicleId: null,
          rideType: RideType.CAB_SHARE,
          audience: Audience.STUDENT,
          origin: 'Tambaram Railway Station',
          destination: 'VIT Chennai',
          departureTime: depTime,
          availableSeats: 3, // 4-seater cab: 1 organiser + 3 passenger seats
          totalSeats: 4,
          status: RideStatus.SCHEDULED,
          cabShareDetail: {
            create: {
              totalCapacity: 4,
              estimatedTotalFare: 800,
              bookingDeadline: deadline,
              cabService: 'Uber XL',
              cabBookingRef: 'REF-CONFIDENTIAL-999',
            },
          },
        },
        include: {
          cabShareDetail: true,
        },
      });

      expect(ride.id).toBeDefined();
      expect(ride.rideType).toBe(RideType.CAB_SHARE);
      expect(ride.vehicleId).toBeNull();
      expect(ride.cabShareDetail?.totalCapacity).toBe(4);
      expect(ride.cabShareDetail?.estimatedTotalFare).toBe(800);
      expect(ride.cabShareDetail?.fareRevision).toBe(1);

      // Verify cascade delete: deleting the ride deletes cabShareDetail
      await prisma.ride.delete({ where: { id: ride.id } });
      const detail = await prisma.cabShareDetail.findUnique({
        where: { rideId: ride.id },
      });
      expect(detail).toBeNull();
    });
  });

  describe('cab_fare_acknowledgements constraint [booking_id, user_id, fare_revision]', () => {
    let testRideId: string;
    let testCabDetailId: string;
    let testBookingId: string;

    beforeEach(async () => {
      const ride = await prisma.ride.create({
        data: {
          driverId: testUserId1,
          vehicleId: null,
          rideType: RideType.CAB_SHARE,
          audience: Audience.STUDENT,
          origin: 'Tambaram',
          destination: 'VIT Chennai',
          departureTime: new Date(Date.now() + 86400000),
          availableSeats: 3,
          totalSeats: 4,
          status: RideStatus.SCHEDULED,
          cabShareDetail: {
            create: {
              totalCapacity: 4,
              estimatedTotalFare: 800,
              bookingDeadline: new Date(Date.now() + 72000000),
            },
          },
        },
        include: {
          cabShareDetail: true,
        },
      });
      testRideId = ride.id;
      testCabDetailId = ride.cabShareDetail!.id;

      const booking = await prisma.booking.create({
        data: {
          rideId: testRideId,
          driverId: testUserId1,
          audience: Audience.STUDENT,
          passengerId: testUserId2,
          requestedSeats: 1,
          status: 'CONFIRMED',
          pickupAddress: 'Tambaram West',
        },
      });
      testBookingId = booking.id;
    });

    afterEach(async () => {
      await prisma.cabFareAcknowledgement.deleteMany({
        where: { cabDetailId: testCabDetailId },
      });
      await prisma.booking.deleteMany({
        where: { id: testBookingId },
      });
      await prisma.cabShareDetail.deleteMany({
        where: { id: testCabDetailId },
      });
      await prisma.ride.deleteMany({
        where: { id: testRideId },
      });
    });

    it('should allow a passenger to acknowledge fare revision 2', async () => {
      const ack = await prisma.cabFareAcknowledgement.create({
        data: {
          cabDetailId: testCabDetailId,
          bookingId: testBookingId,
          userId: testUserId2,
          fareRevision: 2,
        },
      });

      expect(ack.id).toBeDefined();
      expect(ack.fareRevision).toBe(2);
      expect(ack.userId).toBe(testUserId2);
      expect(ack.bookingId).toBe(testBookingId);
    });

    it('should reject duplicate acknowledgement from the same passenger for the same fare revision', async () => {
      await prisma.cabFareAcknowledgement.create({
        data: {
          cabDetailId: testCabDetailId,
          bookingId: testBookingId,
          userId: testUserId2,
          fareRevision: 2,
        },
      });

      // Attempt duplicate
      await expect(
        prisma.cabFareAcknowledgement.create({
          data: {
            cabDetailId: testCabDetailId,
            bookingId: testBookingId,
            userId: testUserId2,
            fareRevision: 2,
          },
        }),
      ).rejects.toThrow();
    });

    it('should allow the same passenger to acknowledge a subsequent fare revision (e.g. revision 3)', async () => {
      await prisma.cabFareAcknowledgement.create({
        data: {
          cabDetailId: testCabDetailId,
          bookingId: testBookingId,
          userId: testUserId2,
          fareRevision: 2,
        },
      });

      const nextAck = await prisma.cabFareAcknowledgement.create({
        data: {
          cabDetailId: testCabDetailId,
          bookingId: testBookingId,
          userId: testUserId2,
          fareRevision: 3,
        },
      });

      expect(nextAck.fareRevision).toBe(3);
    });
  });

  describe('Capacity and Fare-Splitting Semantics Verification', () => {
    it('verifies organiser occupies 1 seat and total_capacity includes organiser', () => {
      const totalCapacity = 4;
      const confirmedPassengerSeats = 0;
      const split0 = calculateCabFareSplit(800, totalCapacity, confirmedPassengerSeats);
      // Organiser is 1 participant
      expect(split0.confirmedParticipants).toBe(1);
      // Fare is divided among organiser and confirmed passengers
      expect(split0.baseSharePerPerson).toBe(800);
      expect(split0.allocations[0].amountRupees).toBe(800);

      // When 3 passengers join (max allowed for 4-seater cab):
      const split3 = calculateCabFareSplit(800, totalCapacity, 3);
      expect(split3.confirmedParticipants).toBe(4);
      expect(split3.baseSharePerPerson).toBe(200);
      expect(split3.allocations.length).toBe(4);
      expect(split3.allocations[0].amountRupees).toBe(200); // Organiser pays ₹200
      expect(split3.allocations[1].amountRupees).toBe(200); // Passenger 1 pays ₹200
      expect(split3.allocations[2].amountRupees).toBe(200); // Passenger 2 pays ₹200
      expect(split3.allocations[3].amountRupees).toBe(200); // Passenger 3 pays ₹200
    });

    it('verifies odd rupee distribution always strictly matches total fare', () => {
      // ₹1001 across 4 participants: 1001 = 250*4 + 1
      const split = calculateCabFareSplit(1001, 4, 3);
      expect(split.remainderRupees).toBe(1);
      expect(split.allocations[0].amountRupees).toBe(251);
      expect(split.allocations[1].amountRupees).toBe(250);
      expect(split.allocations[2].amountRupees).toBe(250);
      expect(split.allocations[3].amountRupees).toBe(250);
      const totalSum = split.allocations.reduce((sum, a) => sum + a.amountRupees, 0);
      expect(totalSum).toBe(1001);
    });
  });
});
