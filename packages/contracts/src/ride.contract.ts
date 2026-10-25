import { z } from 'zod';
import { AudienceTypeSchema } from './audience.contract';
import { VehicleResponseSchema, PublicVehicleSummarySchema } from './vehicle.contract';

export const RideStatusSchema = z.enum(['SCHEDULED', 'CANCELLED']);
export type RideStatus = z.infer<typeof RideStatusSchema>;

/**
 * Zod schema for publishing a new ride.
 * Disallows client-supplied driverId, audience, status, or timestamps.
 */
export const CreateRideSchema = z
  .object({
    vehicleId: z.string().uuid('Invalid vehicle ID format'),
    origin: z
      .string()
      .trim()
      .min(1, 'Origin location is required')
      .max(128, 'Origin cannot exceed 128 characters'),
    destination: z
      .string()
      .trim()
      .min(1, 'Destination location is required')
      .max(128, 'Destination cannot exceed 128 characters'),
    pickupDescription: z
      .string()
      .trim()
      .max(255, 'Pickup description cannot exceed 255 characters')
      .optional()
      .nullable(),
    dropoffDescription: z
      .string()
      .trim()
      .max(255, 'Dropoff description cannot exceed 255 characters')
      .optional()
      .nullable(),
    departureTime: z
      .string()
      .datetime({ message: 'Departure time must be a valid ISO-8601 datetime' }),
    availableSeats: z
      .number({ invalid_type_error: 'Available passenger seats must be a number' })
      .int('Available seats must be an integer')
      .min(1, 'Must offer at least 1 passenger seat')
      .max(6, 'Cannot offer more than 6 passenger seats'),
    costPerSeat: z
      .number({ invalid_type_error: 'Cost per seat must be a number' })
      .int('Cost share must be an integer')
      .min(0, 'Cost share cannot be negative')
      .max(1000, 'Cost share cannot exceed ₹1000 per seat')
      .optional()
      .nullable(),
  })
  .strict();

export type CreateRideDto = z.infer<typeof CreateRideSchema>;

/**
 * Zod schema for updating a scheduled ride.
 */
export const UpdateRideSchema = z
  .object({
    origin: z
      .string()
      .trim()
      .min(1, 'Origin location cannot be empty')
      .max(128, 'Origin cannot exceed 128 characters')
      .optional(),
    destination: z
      .string()
      .trim()
      .min(1, 'Destination location cannot be empty')
      .max(128, 'Destination cannot exceed 128 characters')
      .optional(),
    pickupDescription: z
      .string()
      .trim()
      .max(255, 'Pickup description cannot exceed 255 characters')
      .optional()
      .nullable(),
    dropoffDescription: z
      .string()
      .trim()
      .max(255, 'Dropoff description cannot exceed 255 characters')
      .optional()
      .nullable(),
    departureTime: z
      .string()
      .datetime({ message: 'Departure time must be a valid ISO-8601 datetime' })
      .optional(),
    availableSeats: z
      .number({ invalid_type_error: 'Available passenger seats must be a number' })
      .int('Available seats must be an integer')
      .min(1, 'Must offer at least 1 passenger seat')
      .max(6, 'Cannot offer more than 6 passenger seats')
      .optional(),
    costPerSeat: z
      .number({ invalid_type_error: 'Cost per seat must be a number' })
      .int('Cost share must be an integer')
      .min(0, 'Cost share cannot be negative')
      .max(1000, 'Cost share cannot exceed ₹1000 per seat')
      .optional()
      .nullable(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateRideDto = z.infer<typeof UpdateRideSchema>;

/**
 * Detailed representation of a ride for the driver managing it.
 */
export const DriverRideResponseSchema = z.object({
  id: z.string().uuid(),
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  audience: AudienceTypeSchema,
  origin: z.string(),
  destination: z.string(),
  pickupDescription: z.string().nullable(),
  dropoffDescription: z.string().nullable(),
  departureTime: z.string().datetime(),
  availableSeats: z.number().int(),
  totalSeats: z.number().int().optional(),
  costPerSeat: z.number().int().nullable(),
  status: RideStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  vehicle: VehicleResponseSchema.optional(),
});

export type DriverRideResponseDto = z.infer<typeof DriverRideResponseSchema>;

/**
 * Privacy-preserving ride summary for eligible peer riders of the matching audience.
 * Strictly excludes vehicle registration number and driver private credentials.
 */
export const PublicRideSummarySchema = z.object({
  id: z.string().uuid(),
  driverId: z.string().uuid(),
  driverName: z.string(),
  audience: AudienceTypeSchema,
  origin: z.string(),
  destination: z.string(),
  departureTime: z.string().datetime(),
  availableSeats: z.number().int(),
  costPerSeat: z.number().int().nullable(),
  status: RideStatusSchema,
  createdAt: z.string().datetime(),
  vehicle: PublicVehicleSummarySchema.optional(),
});

export type PublicRideSummaryDto = z.infer<typeof PublicRideSummarySchema>;

/**
 * Zod schema for searching available rides.
 * Supports origin, destination, date or date range, minimum passenger seats, pagination, and sorting.
 */
export const SearchRidesQuerySchema = z
  .object({
    origin: z
      .string()
      .trim()
      .max(128, 'Origin search filter cannot exceed 128 characters')
      .optional()
      .transform((val) => (val === '' ? undefined : val)),
    destination: z
      .string()
      .trim()
      .max(128, 'Destination search filter cannot exceed 128 characters')
      .optional()
      .transform((val) => (val === '' ? undefined : val)),
    departureDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Departure date must be formatted as YYYY-MM-DD')
      .optional()
      .transform((val) => (val === '' ? undefined : val)),
    departureFrom: z
      .string()
      .trim()
      .datetime({ message: 'departureFrom must be a valid ISO-8601 datetime' })
      .optional()
      .transform((val) => (val === '' ? undefined : val)),
    departureTo: z
      .string()
      .trim()
      .datetime({ message: 'departureTo must be a valid ISO-8601 datetime' })
      .optional()
      .transform((val) => (val === '' ? undefined : val)),
    minSeats: z.coerce
      .number({ invalid_type_error: 'minSeats must be a number' })
      .int('minSeats must be an integer')
      .min(1, 'minSeats must be at least 1')
      .max(6, 'minSeats cannot exceed 6')
      .default(1),
    page: z.coerce
      .number({ invalid_type_error: 'page must be a number' })
      .int('page must be an integer')
      .min(1, 'page must be at least 1')
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: 'limit must be a number' })
      .int('limit must be an integer')
      .min(1, 'limit must be at least 1')
      .max(50, 'limit cannot exceed 50')
      .default(20),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict()
  .refine(
    (data) => {
      if (data.departureFrom && data.departureTo) {
        return new Date(data.departureTo).getTime() >= new Date(data.departureFrom).getTime();
      }
      return true;
    },
    {
      message: 'departureTo cannot be earlier than departureFrom',
      path: ['departureTo'],
    },
  );

export type SearchRidesQueryDto = z.infer<typeof SearchRidesQuerySchema>;

export const SearchRidesPaginationSchema = z.object({
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});

export type SearchRidesPaginationDto = z.infer<typeof SearchRidesPaginationSchema>;

export const SearchRidesResponseSchema = z.object({
  rides: z.array(PublicRideSummarySchema),
  pagination: SearchRidesPaginationSchema,
});

export type SearchRidesResponseDto = z.infer<typeof SearchRidesResponseSchema>;
