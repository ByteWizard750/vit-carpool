import { z } from 'zod';
import { AudienceTypeSchema } from './audience.contract';
import { VehicleResponseSchema, PublicVehicleSummarySchema } from './vehicle.contract';

export const RideStatusSchema = z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED']);
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
    originAddress: z.string().trim().max(255).optional().nullable(),
    originLatitude: z.number().min(-90).max(90).optional().nullable(),
    originLongitude: z.number().min(-180).max(180).optional().nullable(),
    originPlaceId: z.string().trim().max(128).optional().nullable(),
    destinationAddress: z.string().trim().max(255).optional().nullable(),
    destinationLatitude: z.number().min(-90).max(90).optional().nullable(),
    destinationLongitude: z.number().min(-180).max(180).optional().nullable(),
    destinationPlaceId: z.string().trim().max(128).optional().nullable(),
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
    idempotencyKey: z.string().max(128).optional().nullable(),
  })
  .strict()
  .refine(
    (data) => {
      const hasOriginLat = data.originLatitude !== undefined && data.originLatitude !== null;
      const hasOriginLon = data.originLongitude !== undefined && data.originLongitude !== null;
      if (hasOriginLat !== hasOriginLon) return false;
      const hasDestLat = data.destinationLatitude !== undefined && data.destinationLatitude !== null;
      const hasDestLon = data.destinationLongitude !== undefined && data.destinationLongitude !== null;
      if (hasDestLat !== hasDestLon) return false;
      return true;
    },
    {
      message: 'Both latitude and longitude must be provided together for coordinates.',
    },
  );

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
    originAddress: z.string().trim().max(255).optional().nullable(),
    originLatitude: z.number().min(-90).max(90).optional().nullable(),
    originLongitude: z.number().min(-180).max(180).optional().nullable(),
    originPlaceId: z.string().trim().max(128).optional().nullable(),
    destinationAddress: z.string().trim().max(255).optional().nullable(),
    destinationLatitude: z.number().min(-90).max(90).optional().nullable(),
    destinationLongitude: z.number().min(-180).max(180).optional().nullable(),
    destinationPlaceId: z.string().trim().max(128).optional().nullable(),
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
  })
  .refine(
    (data) => {
      const hasOriginLat = data.originLatitude !== undefined && data.originLatitude !== null;
      const hasOriginLon = data.originLongitude !== undefined && data.originLongitude !== null;
      if (
        (data.originLatitude !== undefined || data.originLongitude !== undefined) &&
        hasOriginLat !== hasOriginLon
      ) {
        return false;
      }
      const hasDestLat = data.destinationLatitude !== undefined && data.destinationLatitude !== null;
      const hasDestLon = data.destinationLongitude !== undefined && data.destinationLongitude !== null;
      if (
        (data.destinationLatitude !== undefined || data.destinationLongitude !== undefined) &&
        hasDestLat !== hasDestLon
      ) {
        return false;
      }
      return true;
    },
    {
      message: 'Both latitude and longitude must be provided together for coordinates.',
    },
  );

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
  originAddress: z.string().nullable().optional(),
  originLatitude: z.number().nullable().optional(),
  originLongitude: z.number().nullable().optional(),
  originPlaceId: z.string().nullable().optional(),
  destination: z.string(),
  destinationAddress: z.string().nullable().optional(),
  destinationLatitude: z.number().nullable().optional(),
  destinationLongitude: z.number().nullable().optional(),
  destinationPlaceId: z.string().nullable().optional(),
  pickupDescription: z.string().nullable(),
  dropoffDescription: z.string().nullable(),
  departureTime: z.string().datetime(),
  availableSeats: z.number().int(),
  totalSeats: z.number().int().optional(),
  costPerSeat: z.number().int().nullable(),
  status: RideStatusSchema,
  confirmedBookingsCount: z.number().int().optional(),
  confirmedSeatsCount: z.number().int().optional(),
  pendingBookingsCount: z.number().int().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  vehicle: VehicleResponseSchema.optional(),
  driverRating: z
    .object({
      average: z.number().nullable(),
      count: z.number().int(),
    })
    .nullable()
    .optional(),
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
  originAddress: z.string().nullable().optional(),
  originLatitude: z.number().nullable().optional(),
  originLongitude: z.number().nullable().optional(),
  originPlaceId: z.string().nullable().optional(),
  destination: z.string(),
  destinationAddress: z.string().nullable().optional(),
  destinationLatitude: z.number().nullable().optional(),
  destinationLongitude: z.number().nullable().optional(),
  destinationPlaceId: z.string().nullable().optional(),
  departureTime: z.string().datetime(),
  availableSeats: z.number().int(),
  costPerSeat: z.number().int().nullable(),
  status: RideStatusSchema,
  createdAt: z.string().datetime(),
  vehicle: PublicVehicleSummarySchema.optional(),
  driverRating: z
    .object({
      average: z.number().nullable(),
      count: z.number().int(),
    })
    .nullable()
    .optional(),
});

export type PublicRideSummaryDto = z.infer<typeof PublicRideSummarySchema>;

/**
 * Zod schema for searching available rides.
 * Supports origin, destination, geographic proximity (originLat/originLon/destLat/destLon),
 * date or date range, minimum passenger seats, pagination, and sorting.
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
    originLat: z.coerce.number().min(-90).max(90).optional(),
    originLon: z.coerce.number().min(-180).max(180).optional(),
    originRadiusKm: z.coerce.number().min(0.5).max(50).optional(),
    destLat: z.coerce.number().min(-90).max(90).optional(),
    destLon: z.coerce.number().min(-180).max(180).optional(),
    destRadiusKm: z.coerce.number().min(0.5).max(50).optional(),
    radiusKm: z.coerce
      .number({ invalid_type_error: 'radiusKm must be a number' })
      .min(0.5, 'radiusKm must be at least 0.5 km')
      .max(50, 'radiusKm cannot exceed 50 km')
      .optional(),
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
    maxCost: z.coerce
      .number({ invalid_type_error: 'maxCost must be a number' })
      .int('maxCost must be an integer')
      .min(0, 'maxCost cannot be negative')
      .max(5000, 'maxCost cannot exceed 5000')
      .optional(),
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
    sortBy: z.enum(['departureTime', 'cost', 'seats']).default('departureTime'),
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
  )
  .refine(
    (data) => {
      const hasOriginLat = data.originLat !== undefined;
      const hasOriginLon = data.originLon !== undefined;
      if (hasOriginLat !== hasOriginLon) return false;
      const hasDestLat = data.destLat !== undefined;
      const hasDestLon = data.destLon !== undefined;
      if (hasDestLat !== hasDestLon) return false;
      return true;
    },
    {
      message: 'Both latitude and longitude must be provided together for spatial search.',
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

/**
 * Reusable ride template representation for Quick Ride posting.
 * Excludes private pickup/dropoff instructions and passenger details.
 */
export const ReusableRideTemplateSchema = z.object({
  id: z.string().uuid(),
  vehicleId: z.string().uuid(),
  vehicle: z
    .object({
      id: z.string().uuid(),
      make: z.string(),
      model: z.string(),
      color: z.string(),
      capacity: z.number().int(),
      isDeleted: z.boolean(),
    })
    .nullable()
    .optional(),
  origin: z.string(),
  originAddress: z.string().nullable().optional(),
  originLatitude: z.number().nullable().optional(),
  originLongitude: z.number().nullable().optional(),
  originPlaceId: z.string().nullable().optional(),
  destination: z.string(),
  destinationAddress: z.string().nullable().optional(),
  destinationLatitude: z.number().nullable().optional(),
  destinationLongitude: z.number().nullable().optional(),
  destinationPlaceId: z.string().nullable().optional(),
  availableSeats: z.number().int(),
  costPerSeat: z.number().int().nullable(),
  departureTime: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type ReusableRideTemplateDto = z.infer<typeof ReusableRideTemplateSchema>;

export const QuickRideTemplatesResponseSchema = z.object({
  recentRide: ReusableRideTemplateSchema.nullable(),
  routes: z.array(ReusableRideTemplateSchema),
  hasActiveVehicle: z.boolean(),
});

export type QuickRideTemplatesResponseDto = z.infer<typeof QuickRideTemplatesResponseSchema>;
