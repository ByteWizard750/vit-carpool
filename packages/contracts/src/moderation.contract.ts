import { z } from 'zod';

// -----------------------------------------------------------------------------
// Milestone 13: Trust, Safety, User Blocking & Moderation Contracts
// -----------------------------------------------------------------------------

export const BlockReasonSchema = z.string().max(255).optional();

export const CreateBlockSchema = z
  .object({
    reason: BlockReasonSchema,
  })
  .strict();
export type CreateBlockDto = z.infer<typeof CreateBlockSchema>;

export const BlockedUserSummarySchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  audience: z.string().nullable().optional(),
});
export type BlockedUserSummaryDto = z.infer<typeof BlockedUserSummarySchema>;

export const BlockResponseSchema = z.object({
  id: z.string().uuid(),
  blockerId: z.string().uuid(),
  blockedId: z.string().uuid(),
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
  blockedUser: BlockedUserSummarySchema.optional(),
});
export type BlockResponseDto = z.infer<typeof BlockResponseSchema>;

export const BlockStatusResponseSchema = z.object({
  isBlockedByMe: z.boolean(),
  isBlockedByThem: z.boolean(),
  isBlockedMutual: z.boolean(),
});
export type BlockStatusResponseDto = z.infer<typeof BlockStatusResponseSchema>;

// -----------------------------------------------------------------------------
// Reporting Schemas
// -----------------------------------------------------------------------------

export const ReportCategorySchema = z.enum([
  'SAFETY_CONCERN',
  'HARASSMENT',
  'NO_SHOW',
  'FRAUD',
  'FARE_DISPUTE',
  'SPAM',
  'INAPPROPRIATE_BEHAVIOR',
  'OTHER',
]);
export type ReportCategory = z.infer<typeof ReportCategorySchema>;

export const ReportStatusSchema = z.enum([
  'PENDING',
  'INVESTIGATING',
  'RESOLVED',
  'DISMISSED',
]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const CreateReportSchema = z
  .object({
    reportedUserId: z.string().uuid().optional(),
    rideId: z.string().uuid().optional(),
    bookingId: z.string().uuid().optional(),
    messageId: z.string().uuid().optional(),
    category: ReportCategorySchema,
    description: z
      .string()
      .min(10, 'Description must be at least 10 characters')
      .max(1000, 'Description cannot exceed 1000 characters'),
  })
  .strict();
export type CreateReportDto = z.infer<typeof CreateReportSchema>;

export const ResolveReportSchema = z
  .object({
    status: z.enum(['RESOLVED', 'DISMISSED']),
    resolutionNotes: z
      .string()
      .min(5, 'Resolution notes must be at least 5 characters')
      .max(1000, 'Resolution notes cannot exceed 1000 characters'),
  })
  .strict();
export type ResolveReportDto = z.infer<typeof ResolveReportSchema>;

export const ReportResponseSchema = z.object({
  id: z.string().uuid(),
  reporterId: z.string().uuid(),
  reportedUserId: z.string().uuid().nullable().optional(),
  rideId: z.string().uuid().nullable().optional(),
  bookingId: z.string().uuid().nullable().optional(),
  messageId: z.string().uuid().nullable().optional(),
  category: ReportCategorySchema,
  description: z.string(),
  status: ReportStatusSchema,
  resolutionNotes: z.string().nullable().optional(),
  reviewedBy: z.string().uuid().nullable().optional(),
  reviewedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reporter: z
    .object({
      id: z.string().uuid(),
      fullName: z.string(),
      email: z.string().email(),
      audience: z.string().nullable().optional(),
    })
    .optional(),
  reportedUser: z
    .object({
      id: z.string().uuid(),
      fullName: z.string(),
      email: z.string().email(),
      audience: z.string().nullable().optional(),
      isSuspended: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  ride: z
    .object({
      id: z.string().uuid(),
      origin: z.string(),
      destination: z.string(),
      departureTime: z.string().datetime(),
    })
    .nullable()
    .optional(),
  booking: z
    .object({
      id: z.string().uuid(),
      status: z.string(),
      requestedSeats: z.number(),
    })
    .nullable()
    .optional(),
  message: z
    .object({
      id: z.string().uuid(),
      content: z.string(),
      createdAt: z.string().datetime(),
    })
    .nullable()
    .optional(),
});
export type ReportResponseDto = z.infer<typeof ReportResponseSchema>;

// -----------------------------------------------------------------------------
// Admin Moderation & User Suspension Schemas
// -----------------------------------------------------------------------------

export const SuspendUserSchema = z
  .object({
    reason: z
      .string()
      .min(5, 'Suspension reason must be at least 5 characters')
      .max(500, 'Suspension reason cannot exceed 500 characters'),
  })
  .strict();
export type SuspendUserDto = z.infer<typeof SuspendUserSchema>;

export const AdminUserSummarySchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  phoneNumber: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  role: z.string(),
  verificationStatus: z.string(),
  verificationMethod: z.string().nullable().optional(),
  isSuspended: z.boolean(),
  suspensionReason: z.string().nullable().optional(),
  suspendedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  reportsCount: z.number().optional(),
});
export type AdminUserSummaryDto = z.infer<typeof AdminUserSummarySchema>;
