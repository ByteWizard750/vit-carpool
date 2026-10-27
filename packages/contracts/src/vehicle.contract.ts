import { z } from 'zod';

export const RegistrationNumberRegex = /^[A-Z0-9]{4,20}$/;

export const CreateVehicleSchema = z
  .object({
    make: z
      .string()
      .trim()
      .min(1, 'Vehicle make is required')
      .max(64, 'Vehicle make cannot exceed 64 characters'),
    model: z
      .string()
      .trim()
      .min(1, 'Vehicle model is required')
      .max(64, 'Vehicle model cannot exceed 64 characters'),
    color: z
      .string()
      .trim()
      .min(1, 'Vehicle color is required')
      .max(32, 'Vehicle color cannot exceed 32 characters'),
    registrationNumber: z
      .string()
      .trim()
      .transform((val) => val.toUpperCase().replace(/[\s-]/g, ''))
      .pipe(
        z
          .string()
          .regex(
            RegistrationNumberRegex,
            'Registration number must be 4 to 20 alphanumeric characters (e.g. TN01AB1234)',
          ),
      ),
    capacity: z
      .number({ invalid_type_error: 'Seat capacity must be a number' })
      .int('Seat capacity must be an integer')
      .min(2, 'Total vehicle seating capacity must be at least 2 seats (1 driver + at least 1 passenger)')
      .max(7, 'Total vehicle seating capacity cannot exceed 7 seats (cars only)'),
  })
  .strict();

export type CreateVehicleDto = z.infer<typeof CreateVehicleSchema>;

export const UpdateVehicleSchema = z
  .object({
    make: z
      .string()
      .trim()
      .min(1, 'Vehicle make cannot be empty')
      .max(64, 'Vehicle make cannot exceed 64 characters')
      .optional(),
    model: z
      .string()
      .trim()
      .min(1, 'Vehicle model cannot be empty')
      .max(64, 'Vehicle model cannot exceed 64 characters')
      .optional(),
    color: z
      .string()
      .trim()
      .min(1, 'Vehicle color cannot be empty')
      .max(32, 'Vehicle color cannot exceed 32 characters')
      .optional(),
    registrationNumber: z
      .string()
      .trim()
      .transform((val) => val.toUpperCase().replace(/[\s-]/g, ''))
      .pipe(
        z
          .string()
          .regex(
            RegistrationNumberRegex,
            'Registration number must be 4 to 20 alphanumeric characters (e.g. TN01AB1234)',
          ),
      )
      .optional(),
    capacity: z
      .number({ invalid_type_error: 'Seat capacity must be a number' })
      .int('Seat capacity must be an integer')
      .min(2, 'Total vehicle seating capacity must be at least 2 seats (1 driver + at least 1 passenger)')
      .max(7, 'Total vehicle seating capacity cannot exceed 7 seats (cars only)')
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateVehicleDto = z.infer<typeof UpdateVehicleSchema>;

export const VehicleResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  make: z.string(),
  model: z.string(),
  color: z.string(),
  registrationNumber: z.string(),
  capacity: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type VehicleResponseDto = z.infer<typeof VehicleResponseSchema>;

// Publicly visible vehicle details (registration number stripped for ride search)
export const PublicVehicleSummarySchema = z.object({
  id: z.string().uuid(),
  make: z.string(),
  model: z.string(),
  color: z.string(),
  capacity: z.number().int(),
});

export type PublicVehicleSummaryDto = z.infer<typeof PublicVehicleSummarySchema>;
