import { z } from 'zod';

export const AudienceTypeSchema = z.enum(['STUDENT', 'FACULTY']);
export type AudienceType = z.infer<typeof AudienceTypeSchema>;

export const VerificationStatusSchema = z.enum([
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const VerificationMethodSchema = z.enum([
  'AUTOMATIC_EMAIL',
  'MANUAL_ID_REVIEW',
  'ADMIN_OVERRIDE',
]);
export type VerificationMethod = z.infer<typeof VerificationMethodSchema>;

export const UserRoleSchema = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const VerificationRequestStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
]);
export type VerificationRequestStatus = z.infer<
  typeof VerificationRequestStatusSchema
>;

// -----------------------------------------------------------------------------
// DTOs & Request/Response Schemas
// -----------------------------------------------------------------------------

// Client payload for submitting manual verification request
// NOTE: Document uploads are deferred; client cannot supply arbitrary document URLs.
export const CreateVerificationRequestSchema = z
  .object({
    requestedAudience: AudienceTypeSchema,
    institutionalEmail: z.string().email().transform((val) => val.trim().toLowerCase()),
  })
  .strict();
export type CreateVerificationRequestDto = z.infer<
  typeof CreateVerificationRequestSchema
>;

// Admin review payload
export const ReviewVerificationRequestSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    reviewNotes: z.string().max(1000).optional(),
  })
  .strict();
export type ReviewVerificationRequestDto = z.infer<
  typeof ReviewVerificationRequestSchema
>;

// Admin user role modification payload (requires explicit reason for audit)
export const UpdateUserRoleSchema = z
  .object({
    role: UserRoleSchema,
    reason: z.string().min(5).max(500),
  })
  .strict();
export type UpdateUserRoleDto = z.infer<typeof UpdateUserRoleSchema>;


// Authenticated user profile response
export const UserProfileResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  phoneNumber: z.string().nullable(),
  audience: AudienceTypeSchema.nullable(),
  verificationStatus: VerificationStatusSchema,
  verificationMethod: VerificationMethodSchema.nullable(),
  verifiedAt: z.string().datetime().nullable(),
  role: UserRoleSchema,
  isSuspended: z.boolean().optional(),
  suspensionReason: z.string().nullable().optional(),
  suspendedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UserProfileResponseDto = z.infer<typeof UserProfileResponseSchema>;
