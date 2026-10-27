import { z } from 'zod';

/**
 * Payload schema for submitting a driver rating and optional review.
 * Whole stars only (1 to 5), review max 500 characters.
 */
export const CreateRatingSchema = z
  .object({
    bookingId: z.string().uuid('Invalid booking ID format'),
    rating: z
      .number({ invalid_type_error: 'Rating must be a number between 1 and 5' })
      .int('Rating must be an integer between 1 and 5')
      .min(1, 'Rating must be at least 1 star')
      .max(5, 'Rating cannot exceed 5 stars'),
    review: z
      .string()
      .trim()
      .max(500, 'Review cannot exceed 500 characters')
      .optional()
      .nullable(),
  })
  .strict();

export type CreateRatingDto = z.infer<typeof CreateRatingSchema>;

/**
 * Single driver rating record response.
 */
export const DriverRatingResponseSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  rideId: z.string().uuid(),
  passengerId: z.string().uuid(),
  passengerName: z.string(),
  driverId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  review: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type DriverRatingResponseDto = z.infer<typeof DriverRatingResponseSchema>;

/**
 * Public/Driver rating summary with aggregated average and review count.
 */
export const DriverRatingSummarySchema = z.object({
  driverId: z.string().uuid(),
  averageRating: z.number().nullable(),
  totalReviews: z.number().int(),
  reviews: z.array(DriverRatingResponseSchema),
});

export type DriverRatingSummaryDto = z.infer<typeof DriverRatingSummarySchema>;

/**
 * Rating eligibility status for a passenger booking.
 */
export const RatingEligibilityResponseSchema = z.object({
  eligible: z.boolean(),
  reason: z.string().nullable().optional(),
  existingRating: DriverRatingResponseSchema.nullable().optional(),
});

export type RatingEligibilityResponseDto = z.infer<typeof RatingEligibilityResponseSchema>;
