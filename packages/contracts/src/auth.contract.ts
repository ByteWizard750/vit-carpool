import { z } from 'zod';
import { UserProfileResponseSchema } from './audience.contract';

export const CURRENT_TERMS_VERSION = '2026-11-v1.0';
export const CURRENT_PRIVACY_VERSION = '2026-11-v1.0';

/**
 * Designated global administrator email address permitted as a single institutional exception.
 * All other non-institutional email addresses remain strictly prohibited.
 */
export const GLOBAL_ADMIN_RESERVED_EMAIL = 'vitcarpool.app@gmail.com';

export const AuthIntentSchema = z.enum(['signup', 'signin']);
export type AuthIntent = z.infer<typeof AuthIntentSchema>;

/**
 * Payload for requesting an email OTP.
 * For signup, fullName and explicit Terms & Conditions acceptance are required.
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
    termsAccepted: z.boolean().optional(),
    termsVersion: z.string().optional(),
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
  )
  .refine(
    (data) => {
      if (data.intent === 'signup' && data.termsAccepted !== true) {
        return false;
      }
      return true;
    },
    {
      message: 'You must review and accept the Terms & Conditions and acknowledge the Privacy Policy to register.',
      path: ['termsAccepted'],
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
    termsAccepted: z.boolean().optional(),
    termsVersion: z.string().optional(),
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
 * Payload for accepting updated Terms & Conditions (existing users).
 */
export const AcceptTermsSchema = z
  .object({
    termsVersion: z.string().trim().min(1, 'Terms version is required'),
  })
  .strict();

export type AcceptTermsDto = z.infer<typeof AcceptTermsSchema>;

/**
 * Terms and Privacy consent status response.
 */
export const ConsentStatusResponseSchema = z.object({
  hasAcceptedLatest: z.boolean(),
  currentTermsVersion: z.string(),
  currentPrivacyVersion: z.string(),
  latestAcceptedVersion: z.string().nullable(),
  acceptedAt: z.string().datetime().nullable(),
});

export type ConsentStatusResponseDto = z.infer<typeof ConsentStatusResponseSchema>;

/**
 * Successful authentication response containing the verified session JWT and authoritative user profile.
 */
export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserProfileResponseSchema,
  message: z.string().optional(),
});

export type AuthResponseDto = z.infer<typeof AuthResponseSchema>;
