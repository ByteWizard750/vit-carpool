import {
  calculateCabFareSplit,
  isMaterialFareIncrease,
  CreateCabShareSchema,
  UpdateCabShareFareSchema,
  CabFareAcknowledgementSchema,
} from '@vit-carpool/contracts';

describe('Milestone A: Cab Share Contracts & Exact Integer Rupee Math', () => {
  describe('calculateCabFareSplit', () => {
    it('should split perfectly divisible fare with zero remainder', () => {
      // Fare ₹800, capacity 4, 3 confirmed passenger seats -> 4 participants total (organiser + 3)
      const result = calculateCabFareSplit(800, 4, 3);
      expect(result.totalFare).toBe(800);
      expect(result.totalCapacity).toBe(4);
      expect(result.confirmedParticipants).toBe(4);
      expect(result.baseSharePerPerson).toBe(200);
      expect(result.remainderRupees).toBe(0);
      expect(result.estimatedPerPersonIfFull).toBe(200);
      expect(result.currentPerPerson).toBe(200);
      expect(result.allocations).toEqual([
        { participantIndex: 0, amountRupees: 200 },
        { participantIndex: 1, amountRupees: 200 },
        { participantIndex: 2, amountRupees: 200 },
        { participantIndex: 3, amountRupees: 200 },
      ]);
      const sum = result.allocations.reduce((acc, curr) => acc + curr.amountRupees, 0);
      expect(sum).toBe(800);
    });

    it('should split fare with remainder fairly across participants', () => {
      // Fare ₹802, capacity 4, 3 confirmed passenger seats -> 4 participants total
      // 802 / 4 = 200 with remainder 2.
      // First 2 participants get ₹201, remaining 2 get ₹200.
      const result = calculateCabFareSplit(802, 4, 3);
      expect(result.totalFare).toBe(802);
      expect(result.baseSharePerPerson).toBe(200);
      expect(result.remainderRupees).toBe(2);
      expect(result.allocations).toEqual([
        { participantIndex: 0, amountRupees: 201 },
        { participantIndex: 1, amountRupees: 201 },
        { participantIndex: 2, amountRupees: 200 },
        { participantIndex: 3, amountRupees: 200 },
      ]);
      const sum = result.allocations.reduce((acc, curr) => acc + curr.amountRupees, 0);
      expect(sum).toBe(802);
    });

    it('should split fare ₹1000 among 3 participants with remainder 1', () => {
      // Organiser + 2 passengers = 3 participants.
      // 1000 / 3 = 333 with remainder 1.
      // Participant 0 gets 334, participants 1 and 2 get 333.
      const result = calculateCabFareSplit(1000, 4, 2);
      expect(result.confirmedParticipants).toBe(3);
      expect(result.baseSharePerPerson).toBe(333);
      expect(result.remainderRupees).toBe(1);
      expect(result.allocations).toEqual([
        { participantIndex: 0, amountRupees: 334 },
        { participantIndex: 1, amountRupees: 333 },
        { participantIndex: 2, amountRupees: 333 },
      ]);
      const sum = result.allocations.reduce((acc, curr) => acc + curr.amountRupees, 0);
      expect(sum).toBe(1000);
    });

    it('should support large capacity cabs (up to 8 seats)', () => {
      // 8-seater Innova: organiser + 7 passengers
      const result = calculateCabFareSplit(2550, 8, 7);
      expect(result.totalCapacity).toBe(8);
      expect(result.confirmedParticipants).toBe(8);
      const sum = result.allocations.reduce((acc, curr) => acc + curr.amountRupees, 0);
      expect(sum).toBe(2550);
    });

    it('invariant: sum of allocations ALWAYS strictly equals totalFare across extensive combinations', () => {
      const testFares = [50, 99, 100, 101, 499, 500, 753, 1200, 1555, 3499, 9999, 20000];
      const testCapacities = [2, 3, 4, 5, 6, 7, 8];

      for (const fare of testFares) {
        for (const cap of testCapacities) {
          for (let passengers = 0; passengers < cap; passengers++) {
            const split = calculateCabFareSplit(fare, cap, passengers);
            const sum = split.allocations.reduce((a, b) => a + b.amountRupees, 0);
            expect(sum).toBe(fare);
            expect(split.allocations.length).toBe(split.confirmedParticipants);
            // Remainder should never exceed participants count
            expect(split.remainderRupees).toBeLessThan(split.confirmedParticipants);
          }
        }
      }
    });
  });

  describe('isMaterialFareIncrease', () => {
    it('should return false if final fare is less than or equal to estimated fare', () => {
      expect(isMaterialFareIncrease(1000, 1000, 4)).toBe(false);
      expect(isMaterialFareIncrease(1000, 900, 4)).toBe(false);
    });

    it('should return false if increase is <= 15% and <= ₹50/person', () => {
      // 1000 -> 1100 (+10%, +₹25/person for 4 seats)
      expect(isMaterialFareIncrease(1000, 1100, 4)).toBe(false);
    });

    it('should return true if percentage increase exceeds 15%', () => {
      // 1000 -> 1180 (+18% > 15%)
      expect(isMaterialFareIncrease(1000, 1180, 4)).toBe(true);
    });

    it('should return true if per-person increase exceeds ₹50 even when <= 15%', () => {
      // 2000 -> 2250 (+12.5% <= 15%, but diff=250 / 4 = ₹63/person > ₹50)
      expect(isMaterialFareIncrease(2000, 2250, 4)).toBe(true);
    });
  });

  describe('CreateCabShareSchema validation', () => {
    const validPayload = {
      origin: 'Tambaram Railway Station',
      originLatitude: 12.9249,
      originLongitude: 80.1000,
      destination: 'VIT Chennai',
      destinationLatitude: 12.8406,
      destinationLongitude: 80.1534,
      departureTime: new Date(Date.now() + 86400000).toISOString(),
      bookingDeadline: new Date(Date.now() + 72000000).toISOString(),
      totalCapacity: 4,
      estimatedTotalFare: 800,
      cabService: 'Uber XL',
      cabBookingRef: 'UBER-98721',
    };

    it('should accept valid cab share creation payload', () => {
      const parsed = CreateCabShareSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
    });

    it('should reject booking deadline after departure time', () => {
      const invalid = {
        ...validPayload,
        departureTime: '2026-12-01T10:00:00.000Z',
        bookingDeadline: '2026-12-01T11:00:00.000Z', // 1 hour after departure!
      };
      const parsed = CreateCabShareSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain('Booking deadline must be before or equal to departure time');
      }
    });

    it('should reject totalCapacity < 2 or > 8', () => {
      expect(CreateCabShareSchema.safeParse({ ...validPayload, totalCapacity: 1 }).success).toBe(false);
      expect(CreateCabShareSchema.safeParse({ ...validPayload, totalCapacity: 9 }).success).toBe(false);
      expect(CreateCabShareSchema.safeParse({ ...validPayload, totalCapacity: 8 }).success).toBe(true);
      expect(CreateCabShareSchema.safeParse({ ...validPayload, totalCapacity: 2 }).success).toBe(true);
    });

    it('should reject un-paired coordinates', () => {
      const unpaired = {
        ...validPayload,
        originLatitude: 12.9249,
        originLongitude: undefined,
      };
      const parsed = CreateCabShareSchema.safeParse(unpaired);
      expect(parsed.success).toBe(false);
    });
  });

  describe('UpdateCabShareFareSchema & CabFareAcknowledgementSchema', () => {
    it('should validate final fare bounds', () => {
      expect(UpdateCabShareFareSchema.safeParse({ finalTotalFare: 40 }).success).toBe(false);
      expect(UpdateCabShareFareSchema.safeParse({ finalTotalFare: 35000 }).success).toBe(false);
      expect(UpdateCabShareFareSchema.safeParse({ finalTotalFare: 950 }).success).toBe(true);
    });

    it('should validate acknowledgement schema', () => {
      const validAck = {
        bookingId: '123e4567-e89b-12d3-a456-426614174000',
        fareRevision: 2,
      };
      expect(CabFareAcknowledgementSchema.safeParse(validAck).success).toBe(true);
      expect(
        CabFareAcknowledgementSchema.safeParse({
          bookingId: 'not-a-uuid',
          fareRevision: 1,
        }).success,
      ).toBe(false);
    });
  });
});

