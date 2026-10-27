import { z } from 'zod';
import { UserProfileResponseSchema } from './audience.contract';

export const AuthIntentSchema = z.enum(['signup', 'signin']);
export type AuthIntent = z.infer<typeof AuthIntentSchema>;

/**
 * Payload for requesting an email OTP.
 * For signup, fullName is required to register the user under their real name.
 * For signin, only institutional email is required.
 */
export const RequestOtpSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('A valid email address is required').max(255),
    intent: AuthIntentSchema,
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name cannot exceed 100 characters')
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.intent === 'signup' && (!data.fullName || data.fullName.trim().length === 0)) {
        return false;
      }
      return true;
    },
    {
      message: 'Full name is required for registration',
      path: ['fullName'],
    },
  );

export type RequestOtpDto = z.infer<typeof RequestOtpSchema>;

/**
 * Payload for verifying an email OTP.
 */
export const VerifyOtpSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('A valid email address is required').max(255),
    token: z
      .string()
      .trim()
      .min(6, 'Verification code must be at least 6 digits')
      .max(10, 'Verification code cannot exceed 10 characters'),
    intent: AuthIntentSchema,
    fullName: z.string().trim().min(2).max(100).optional(),
  })
  .strict();

export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>;

/**
 * Payload for resending an email OTP.
 */
export const ResendOtpSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('A valid email address is required').max(255),
    intent: AuthIntentSchema,
  })
  .strict();

export type ResendOtpDto = z.infer<typeof ResendOtpSchema>;

/**
 * Successful authentication response containing the verified session JWT and authoritative user profile.
 */
export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserProfileResponseSchema,
  message: z.string().optional(),
});

export type AuthResponseDto = z.infer<typeof AuthResponseSchema>;
