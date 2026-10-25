import { z } from 'zod';

/**
 * Standard location suggestion returned by the autocomplete provider.
 */
export const LocationSuggestionSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, 'Location name is required'),
  address: z.string().trim().min(1, 'Location address is required'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  category: z.string().optional(),
});

export type LocationSuggestionDto = z.infer<typeof LocationSuggestionSchema>;

/**
 * Query schema for location autocomplete requests.
 */
export const LocationAutocompleteQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(2, 'Query must be at least 2 characters')
      .max(100, 'Query cannot exceed 100 characters'),
    limit: z.coerce.number().int().min(1).max(10).default(5),
  })
  .strict();

export type LocationAutocompleteQueryDto = z.infer<typeof LocationAutocompleteQuerySchema>;

/**
 * Autocomplete response container.
 */
export const LocationAutocompleteResponseSchema = z.object({
  suggestions: z.array(LocationSuggestionSchema),
});

export type LocationAutocompleteResponseDto = z.infer<
  typeof LocationAutocompleteResponseSchema
>;
