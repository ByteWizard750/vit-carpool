import { z } from 'zod';
import { AudienceTypeSchema } from './audience.contract';

export const RideAlertStatusSchema = z.enum(['ACTIVE', 'PAUSED']);
export type RideAlertStatus = z.infer<typeof RideAlertStatusSchema>;

export const CreateRideAlertSchema = z
  .object({
    origin: z.string().trim().min(2, 'Origin location name must be at least 2 characters').max(128),
    originAddress: z.string().trim().max(255).optional().nullable(),
    originLatitude: z.number().min(-90).max(90).optional().nullable(),
    originLongitude: z.number().min(-180).max(180).optional().nullable(),
    originPlaceId: z.string().trim().max(128).optional().nullable(),
    destination: z.string().trim().min(2, 'Destination location name must be at least 2 characters').max(128),
    destinationAddress: z.string().trim().max(255).optional().nullable(),
    destinationLatitude: z.number().min(-90).max(90).optional().nullable(),
    destinationLongitude: z.number().min(-180).max(180).optional().nullable(),
    destinationPlaceId: z.string().trim().max(128).optional().nullable(),
    radiusKm: z.number().min(0.5, 'Radius must be at least 0.5 km').max(50, 'Radius cannot exceed 50 km').default(3.0),
    earliestDepartureTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Earliest departure time must be in HH:mm 24-hour format')
      .optional()
      .nullable(),
    latestDepartureTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Latest departure time must be in HH:mm 24-hour format')
      .optional()
      .nullable(),
    minSeats: z.number().int().min(1, 'Minimum seats must be at least 1').max(6, 'Minimum seats cannot exceed 6').default(1),
  })
  .refine(
    (data) => {
      if (data.earliestDepartureTime && data.latestDepartureTime) {
        return data.earliestDepartureTime <= data.latestDepartureTime;
      }
      return true;
    },
    {
      message: 'Latest departure time cannot be earlier than earliest departure time',
      path: ['latestDepartureTime'],
    },
  );

export type CreateRideAlertDto = z.infer<typeof CreateRideAlertSchema>;

export const UpdateRideAlertSchema = z
  .object({
    origin: z.string().trim().min(2).max(128).optional(),
    originAddress: z.string().trim().max(255).optional().nullable(),
    originLatitude: z.number().min(-90).max(90).optional().nullable(),
    originLongitude: z.number().min(-180).max(180).optional().nullable(),
    originPlaceId: z.string().trim().max(128).optional().nullable(),
    destination: z.string().trim().min(2).max(128).optional(),
    destinationAddress: z.string().trim().max(255).optional().nullable(),
    destinationLatitude: z.number().min(-90).max(90).optional().nullable(),
    destinationLongitude: z.number().min(-180).max(180).optional().nullable(),
    destinationPlaceId: z.string().trim().max(128).optional().nullable(),
    radiusKm: z.number().min(0.5).max(50).optional(),
    earliestDepartureTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .optional()
      .nullable(),
    latestDepartureTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .optional()
      .nullable(),
    minSeats: z.number().int().min(1).max(6).optional(),
    status: RideAlertStatusSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.earliestDepartureTime && data.latestDepartureTime) {
        return data.earliestDepartureTime <= data.latestDepartureTime;
      }
      return true;
    },
    {
      message: 'Latest departure time cannot be earlier than earliest departure time',
      path: ['latestDepartureTime'],
    },
  );

export type UpdateRideAlertDto = z.infer<typeof UpdateRideAlertSchema>;

export const RideAlertResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
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
  radiusKm: z.number(),
  earliestDepartureTime: z.string().nullable().optional(),
  latestDepartureTime: z.string().nullable().optional(),
  minSeats: z.number(),
  status: RideAlertStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RideAlertResponseDto = z.infer<typeof RideAlertResponseSchema>;
