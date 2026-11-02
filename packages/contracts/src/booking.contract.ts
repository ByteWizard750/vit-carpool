import { z } from 'zod';
import { AudienceTypeSchema } from './audience.contract';
import { RideStatusSchema } from './ride.contract';
import { PublicVehicleSummarySchema } from './vehicle.contract';

export const BookingStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const BoardingStatusSchema = z.enum(['WAITING', 'BOARDING', 'BOARDED', 'MISSED']);
export type BoardingStatus = z.infer<typeof BoardingStatusSchema>;

/**
 * Passenger booking request schema.
 * Disallows client-supplied passengerId, driverId, audience, or status.
 */
export const CreateBookingRequestSchema = z
  .object({
    rideId: z.string().uuid('Invalid ride ID format'),
    requestedSeats: z
      .number({ invalid_type_error: 'Requested seats must be a number' })
      .int('Requested seats must be an integer')
      .min(1, 'Must request at least 1 passenger seat')
      .max(6, 'Cannot request more than 6 passenger seats'),
    pickupAddress: z.string().trim().max(255).optional().nullable(),
    pickupLatitude: z.number().min(-90).max(90).optional().nullable(),
    pickupLongitude: z.number().min(-180).max(180).optional().nullable(),
    pickupDescription: z.string().trim().max(255).optional().nullable(),
  })
  .strict();

export type CreateBookingRequestDto = z.infer<typeof CreateBookingRequestSchema>;

/**
 * Rejection reason payload from driver.
 */
export const RejectBookingSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(255, 'Rejection reason cannot exceed 255 characters')
      .optional(),
  })
  .strict();

export type RejectBookingDto = z.infer<typeof RejectBookingSchema>;

/**
 * Cancellation reason payload from passenger.
 */
export const CancelBookingSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(255, 'Cancellation reason cannot exceed 255 characters')
      .optional(),
  })
  .strict();

export type CancelBookingDto = z.infer<typeof CancelBookingSchema>;

/**
 * Passenger-facing booking response representation.
 * Conceals private pickup/dropoff landmarks and contact info until status === 'CONFIRMED'.
 */
export const PassengerBookingResponseSchema = z.object({
  id: z.string().uuid(),
  rideId: z.string().uuid(),
  passengerId: z.string().uuid(),
  driverId: z.string().uuid(),
  audience: AudienceTypeSchema,
  requestedSeats: z.number().int(),
  status: BookingStatusSchema,
  pickupAddress: z.string().nullable().optional(),
  pickupLatitude: z.number().nullable().optional(),
  pickupLongitude: z.number().nullable().optional(),
  pickupDescription: z.string().nullable().optional(),
  boardingStatus: BoardingStatusSchema.optional(),
  boardedAt: z.string().datetime().nullable().optional(),
  proximityNotifiedAt: z.string().datetime().nullable().optional(),
  confirmedAt: z.string().datetime().nullable(),
  rejectedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancellationReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  ride: z.object({
    id: z.string().uuid(),
    origin: z.string(),
    destination: z.string(),
    departureTime: z.string().datetime(),
    availableSeats: z.number().int(),
    costPerSeat: z.number().int().nullable(),
    status: RideStatusSchema,
    driverName: z.string(),
    // Strictly confidential: Only exposed if status === 'CONFIRMED'
    driverPhone: z.string().nullable().optional(),
    pickupDescription: z.string().nullable().optional(),
    dropoffDescription: z.string().nullable().optional(),
    vehicle: PublicVehicleSummarySchema.optional(),
  }),
});

export type PassengerBookingResponseDto = z.infer<typeof PassengerBookingResponseSchema>;

/**
 * Driver-facing booking request representation.
 * Discloses passenger name and seat requirements. Contact disclosed once confirmed.
 */
export const DriverBookingResponseSchema = z.object({
  id: z.string().uuid(),
  rideId: z.string().uuid(),
  passengerId: z.string().uuid(),
  passengerName: z.string(),
  passengerPhone: z.string().nullable().optional(),
  driverId: z.string().uuid(),
  audience: AudienceTypeSchema,
  requestedSeats: z.number().int(),
  status: BookingStatusSchema,
  pickupAddress: z.string().nullable().optional(),
  pickupLatitude: z.number().nullable().optional(),
  pickupLongitude: z.number().nullable().optional(),
  pickupDescription: z.string().nullable().optional(),
  boardingStatus: BoardingStatusSchema.optional(),
  boardedAt: z.string().datetime().nullable().optional(),
  proximityNotifiedAt: z.string().datetime().nullable().optional(),
  confirmedAt: z.string().datetime().nullable(),
  rejectedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancellationReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  ride: z.object({
    id: z.string().uuid(),
    origin: z.string(),
    destination: z.string(),
    departureTime: z.string().datetime(),
    availableSeats: z.number().int(),
    totalSeats: z.number().int(),
    status: RideStatusSchema,
  }),
});

export type DriverBookingResponseDto = z.infer<typeof DriverBookingResponseSchema>;
