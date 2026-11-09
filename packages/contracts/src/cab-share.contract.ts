import { z } from 'zod';

/**
 * Ride type discriminator distinguishing private vehicle carpools from shared cab journeys.
 */
export const RideTypeSchema = z.enum(['VEHICLE_RIDE', 'CAB_SHARE']);
export type RideType = z.infer<typeof RideTypeSchema>;

/**
 * Full details of a cab share journey (Organiser view).
 */
export const CabShareDetailSchema = z.object({
  id: z.string().uuid(),
  rideId: z.string().uuid(),
  totalCapacity: z.number().int().min(2).max(8),
  estimatedTotalFare: z.number().int().min(50).max(20000),
  finalTotalFare: z.number().int().min(50).max(30000).nullable().optional(),
  fareRevision: z.number().int().min(1),
  bookingDeadline: z.string().datetime(),
  cabService: z.string().max(64).nullable().optional(),
  cabBookingRef: z.string().max(32).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CabShareDetailDto = z.infer<typeof CabShareDetailSchema>;

/**
 * Privacy-preserving cab share summary for public search and passenger discovery.
 * Strictly excludes booking references while exposing clear fare-split estimates.
 */
export const CabSharePublicSummarySchema = z.object({
  totalCapacity: z.number().int().min(2).max(8),
  estimatedTotalFare: z.number().int().min(50).max(20000),
  finalTotalFare: z.number().int().min(50).max(30000).nullable().optional(),
  fareRevision: z.number().int().min(1),
  bookingDeadline: z.string().datetime(),
  cabService: z.string().max(64).nullable().optional(),
  estimatedPerPersonIfFull: z.number().int(),
  currentPerPerson: z.number().int(),
  totalConfirmedParticipants: z.number().int(), // Organiser (1) + Confirmed passenger seats
});

export type CabSharePublicSummaryDto = z.infer<typeof CabSharePublicSummarySchema>;

/**
 * Schema for publishing a new shared cab journey.
 */
export const CreateCabShareSchema = z
  .object({
    origin: z.string().trim().min(3).max(128),
    originAddress: z.string().trim().max(255).optional(),
    originLatitude: z.number().min(-90).max(90).optional(),
    originLongitude: z.number().min(-180).max(180).optional(),
    originPlaceId: z.string().trim().max(128).optional(),
    destination: z.string().trim().min(3).max(128),
    destinationAddress: z.string().trim().max(255).optional(),
    destinationLatitude: z.number().min(-90).max(90).optional(),
    destinationLongitude: z.number().min(-180).max(180).optional(),
    destinationPlaceId: z.string().trim().max(128).optional(),
    departureTime: z.string().datetime(),
    bookingDeadline: z.string().datetime(),
    totalCapacity: z
      .number()
      .int()
      .min(2, 'Total cab capacity must be at least 2 (organiser + 1 passenger)')
      .max(8, 'Total cab capacity cannot exceed 8'),
    estimatedTotalFare: z
      .number()
      .int()
      .min(50, 'Estimated total fare must be at least ₹50')
      .max(20000, 'Estimated total fare cannot exceed ₹20,000'),
    cabService: z.string().trim().max(64).optional(),
    cabBookingRef: z.string().trim().max(32).optional(),
    pickupDescription: z.string().trim().max(255).optional(),
    dropoffDescription: z.string().trim().max(255).optional(),
    maxDetourMinutes: z.number().int().min(0).max(60).optional(),
  })
  .refine(
    (data) => {
      const hasOriginLat = data.originLatitude !== undefined;
      const hasOriginLon = data.originLongitude !== undefined;
      return hasOriginLat === hasOriginLon;
    },
    { message: 'Both origin latitude and longitude must be provided together.' },
  )
  .refine(
    (data) => {
      const hasDestLat = data.destinationLatitude !== undefined;
      const hasDestLon = data.destinationLongitude !== undefined;
      return hasDestLat === hasDestLon;
    },
    { message: 'Both destination latitude and longitude must be provided together.' },
  )
  .refine(
    (data) => {
      const dep = new Date(data.departureTime).getTime();
      const dline = new Date(data.bookingDeadline).getTime();
      return !isNaN(dep) && !isNaN(dline) && dline <= dep;
    },
    { message: 'Booking deadline must be before or equal to departure time.' },
  );

export type CreateCabShareDto = z.infer<typeof CreateCabShareSchema>;

/**
 * Schema for updating the final cab fare when the bill arrives.
 */
export const UpdateCabShareFareSchema = z.object({
  finalTotalFare: z
    .number()
    .int()
    .min(50, 'Final fare must be at least ₹50')
    .max(30000, 'Final fare cannot exceed ₹30,000'),
  reason: z.string().trim().max(255).optional(),
});

export type UpdateCabShareFareDto = z.infer<typeof UpdateCabShareFareSchema>;

/**
 * Schema for passenger acknowledging a material fare revision.
 */
export const CabFareAcknowledgementSchema = z.object({
  bookingId: z.string().uuid(),
  fareRevision: z.number().int().min(1),
});

export type CabFareAcknowledgementDto = z.infer<typeof CabFareAcknowledgementSchema>;

/**
 * Result structure for transparent integer rupee fare splitting.
 */
export interface CabFareSplitResult {
  totalFare: number;
  totalCapacity: number;
  confirmedParticipants: number; // Organiser (1) + confirmed passenger seats
  baseSharePerPerson: number;
  remainderRupees: number;
  estimatedPerPersonIfFull: number;
  currentPerPerson: number;
  allocations: {
    participantIndex: number; // 0 is organiser, 1..N are confirmed passengers
    amountRupees: number;
  }[];
}

/**
 * Computes exact integer rupee fare allocation with fair remainder distribution.
 * Guarantee: The sum of allocations ALWAYS exactly equals totalFare.
 */
export function calculateCabFareSplit(
  totalFare: number,
  totalCapacity: number,
  confirmedPassengerSeats: number,
): CabFareSplitResult {
  const safeCapacity = Math.max(2, Math.min(8, Math.floor(totalCapacity)));
  // Organiser is always 1 confirmed participant
  const confirmedParticipants = Math.max(1, Math.min(safeCapacity, 1 + confirmedPassengerSeats));
  const safeFare = Math.max(0, Math.floor(totalFare));

  const baseSharePerPerson = Math.floor(safeFare / confirmedParticipants);
  const remainderRupees = safeFare % confirmedParticipants;

  // Estimated share if every seat in the cab is filled
  const estimatedPerPersonIfFull = Math.ceil(safeFare / safeCapacity);
  // Current share based on participants confirmed right now
  const currentPerPerson = Math.ceil(safeFare / confirmedParticipants);

  // Distribute remainder rupees 1-by-1 across participants
  const allocations: { participantIndex: number; amountRupees: number }[] = [];
  for (let i = 0; i < confirmedParticipants; i++) {
    allocations.push({
      participantIndex: i,
      amountRupees: baseSharePerPerson + (i < remainderRupees ? 1 : 0),
    });
  }

  return {
    totalFare: safeFare,
    totalCapacity: safeCapacity,
    confirmedParticipants,
    baseSharePerPerson,
    remainderRupees,
    estimatedPerPersonIfFull,
    currentPerPerson,
    allocations,
  };
}

/**
 * Determines whether a fare revision constitutes a material increase requiring passenger acknowledgement.
 * Threshold: Increase of > 15% OR > ₹50 per person compared to the estimated share.
 */
export function isMaterialFareIncrease(
  estimatedTotalFare: number,
  finalTotalFare: number,
  totalCapacity: number,
): boolean {
  if (finalTotalFare <= estimatedTotalFare) {
    return false;
  }
  const diff = finalTotalFare - estimatedTotalFare;
  const pctIncrease = (diff / estimatedTotalFare) * 100;
  const perPersonDiff = Math.ceil(diff / Math.max(2, totalCapacity));

  return pctIncrease > 15 || perPersonDiff > 50;
}

