import { z } from 'zod';
import { AudienceTypeSchema } from './audience.contract';
import { PublicVehicleSummarySchema } from './vehicle.contract';

// -----------------------------------------------------------------------------
// Milestone 11: Recurring Commutes Contracts & Validation Schemas
// -----------------------------------------------------------------------------

export const RecurringCommuteStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']);
export type RecurringCommuteStatus = z.infer<typeof RecurringCommuteStatusSchema>;

/**
 * Schema for creating a new recurring commute schedule.
 */
export const CreateRecurringCommuteSchema = z
  .object({
    origin: z.string().trim().min(2, 'Origin must be at least 2 characters.').max(128, 'Origin cannot exceed 128 characters.'),
    originAddress: z.string().trim().max(255).optional(),
    originLatitude: z.number().min(-90).max(90).optional(),
    originLongitude: z.number().min(-180).max(180).optional(),
    originPlaceId: z.string().trim().max(128).optional(),
    destination: z.string().trim().min(2, 'Destination must be at least 2 characters.').max(128, 'Destination cannot exceed 128 characters.'),
    destinationAddress: z.string().trim().max(255).optional(),
    destinationLatitude: z.number().min(-90).max(90).optional(),
    destinationLongitude: z.number().min(-180).max(180).optional(),
    destinationPlaceId: z.string().trim().max(128).optional(),
    pickupDescription: z.string().trim().max(255).optional(),
    dropoffDescription: z.string().trim().max(255).optional(),
    vehicleId: z.string().uuid('Please select a valid registered vehicle.'),
    weekdays: z
      .array(z.number().int().min(1, 'Weekday must be between 1 and 7 (Mon-Sun)').max(7, 'Weekday must be between 1 and 7 (Mon-Sun)'))
      .min(1, 'Please select at least one day of the week.')
      .refine((arr) => new Set(arr).size === arr.length, {
        message: 'Weekdays must not contain duplicate entries.',
      }),
    departureTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Departure time must be in HH:mm 24-hour format (e.g. 08:30).'),
    startDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format.'),
    endDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format.'),
    availableSeats: z
      .number()
      .int()
      .min(1, 'You must offer at least 1 passenger seat.')
      .max(6, 'Cannot offer more than 6 passenger seats.'),
    costPerSeat: z
      .number()
      .int()
      .min(0, 'Cost per seat cannot be negative.')
      .max(500, 'Cost per seat cannot exceed ₹500.')
      .optional(),
  })
  .refine(
    (data) => data.startDate <= data.endDate,
    {
      message: 'Schedule end date must be on or after start date.',
      path: ['endDate'],
    },
  )
  .refine(
    (data) => data.origin.toLowerCase() !== data.destination.toLowerCase(),
    {
      message: 'Origin and destination cannot be identical.',
      path: ['destination'],
    },
  );

export type CreateRecurringCommuteDto = z.infer<typeof CreateRecurringCommuteSchema>;

/**
 * Schema for updating an existing recurring commute schedule.
 * Affects future occurrences that have not already been generated.
 */
export const UpdateRecurringCommuteSchema = z
  .object({
    vehicleId: z.string().uuid('Please select a valid registered vehicle.').optional(),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Please select at least one day of the week.')
      .refine((arr) => new Set(arr).size === arr.length, {
        message: 'Weekdays must not contain duplicate entries.',
      })
      .optional(),
    departureTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Departure time must be in HH:mm 24-hour format.')
      .optional(),
    endDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format.')
      .optional(),
    availableSeats: z
      .number()
      .int()
      .min(1, 'You must offer at least 1 passenger seat.')
      .max(6, 'Cannot offer more than 6 passenger seats.')
      .optional(),
    costPerSeat: z
      .number()
      .int()
      .min(0, 'Cost per seat cannot be negative.')
      .max(500, 'Cost per seat cannot exceed ₹500.')
      .nullable()
      .optional(),
    pickupDescription: z.string().trim().max(255).optional(),
    dropoffDescription: z.string().trim().max(255).optional(),
  });

export type UpdateRecurringCommuteDto = z.infer<typeof UpdateRecurringCommuteSchema>;

/**
 * Response DTO returned to client for a recurring commute schedule.
 */
export const RecurringCommuteResponseSchema = z.object({
  id: z.string().uuid(),
  driverId: z.string().uuid(),
  driverName: z.string(),
  audience: AudienceTypeSchema,
  origin: z.string(),
  originAddress: z.string().optional(),
  originLatitude: z.number().optional(),
  originLongitude: z.number().optional(),
  originPlaceId: z.string().optional(),
  destination: z.string(),
  destinationAddress: z.string().optional(),
  destinationLatitude: z.number().optional(),
  destinationLongitude: z.number().optional(),
  destinationPlaceId: z.string().optional(),
  pickupDescription: z.string().optional(),
  dropoffDescription: z.string().optional(),
  weekdays: z.array(z.number().int()),
  departureTime: z.string(), // "HH:mm"
  startDate: z.string(), // "YYYY-MM-DD"
  endDate: z.string(), // "YYYY-MM-DD"
  availableSeats: z.number(),
  costPerSeat: z.number().nullable().optional(),
  status: RecurringCommuteStatusSchema,
  vehicle: PublicVehicleSummarySchema.optional(),
  generatedRidesCount: z.number().int(),
  nextOccurrence: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RecurringCommuteResponseDto = z.infer<typeof RecurringCommuteResponseSchema>;
