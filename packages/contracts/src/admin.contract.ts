import { z } from 'zod';

// -----------------------------------------------------------------------------
// Milestone 14: Administrative Operations & RBAC Contracts
// -----------------------------------------------------------------------------

export enum AdminPermission {
  USER_READ = 'USER_READ',
  USER_MODERATE = 'USER_MODERATE',
  USER_SUSPEND = 'USER_SUSPEND',
  RIDE_READ = 'RIDE_READ',
  RIDE_MODERATE = 'RIDE_MODERATE',
  BOOKING_READ = 'BOOKING_READ',
  REPORT_READ = 'REPORT_READ',
  REPORT_RESOLVE = 'REPORT_RESOLVE',
  ANALYTICS_READ = 'ANALYTICS_READ',
  AUDIT_READ = 'AUDIT_READ',
  ADMIN_INVITE = 'ADMIN_INVITE',
  ADMIN_MANAGE = 'ADMIN_MANAGE',
  SYSTEM_HEALTH_READ = 'SYSTEM_HEALTH_READ',
  SECURITY_SETTINGS_MANAGE = 'SECURITY_SETTINGS_MANAGE',
}

export const ROLE_PERMISSIONS: Record<string, AdminPermission[]> = {
  MODERATOR: [
    AdminPermission.USER_READ,
    AdminPermission.USER_MODERATE,
    AdminPermission.RIDE_READ,
    AdminPermission.BOOKING_READ,
    AdminPermission.REPORT_READ,
    AdminPermission.REPORT_RESOLVE,
    AdminPermission.SYSTEM_HEALTH_READ,
  ],
  ADMIN: [
    AdminPermission.USER_READ,
    AdminPermission.USER_MODERATE,
    AdminPermission.USER_SUSPEND,
    AdminPermission.RIDE_READ,
    AdminPermission.RIDE_MODERATE,
    AdminPermission.BOOKING_READ,
    AdminPermission.REPORT_READ,
    AdminPermission.REPORT_RESOLVE,
    AdminPermission.ANALYTICS_READ,
    AdminPermission.AUDIT_READ,
    AdminPermission.SYSTEM_HEALTH_READ,
  ],
  SUPER_ADMIN: [
    AdminPermission.USER_READ,
    AdminPermission.USER_MODERATE,
    AdminPermission.USER_SUSPEND,
    AdminPermission.RIDE_READ,
    AdminPermission.RIDE_MODERATE,
    AdminPermission.BOOKING_READ,
    AdminPermission.REPORT_READ,
    AdminPermission.REPORT_RESOLVE,
    AdminPermission.ANALYTICS_READ,
    AdminPermission.AUDIT_READ,
    AdminPermission.ADMIN_INVITE,
    AdminPermission.ADMIN_MANAGE,
    AdminPermission.SYSTEM_HEALTH_READ,
    AdminPermission.SECURITY_SETTINGS_MANAGE,
  ],
  USER: [],
};

export function hasAdminPermission(role: string, permission: AdminPermission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return Boolean(permissions && permissions.includes(permission));
}

// -----------------------------------------------------------------------------
// Admin Auth & MFA Schemas
// -----------------------------------------------------------------------------

export const AdminLoginRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('A valid email address is required').max(255),
  })
  .strict();
export type AdminLoginRequestDto = z.infer<typeof AdminLoginRequestSchema>;

export const AdminVerifyMfaRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    code: z.string().trim().min(6).max(10),
  })
  .strict();
export type AdminVerifyMfaRequestDto = z.infer<typeof AdminVerifyMfaRequestSchema>;

export const AdminSessionResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string(),
    role: z.enum(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']),
    permissions: z.array(z.nativeEnum(AdminPermission)),
  }),
});
export type AdminSessionResponseDto = z.infer<typeof AdminSessionResponseSchema>;

// -----------------------------------------------------------------------------
// Admin Invitation & Management Schemas
// -----------------------------------------------------------------------------

export const InviteAdminSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Valid email address is required').max(255),
    role: z.enum(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export type InviteAdminDto = z.infer<typeof InviteAdminSchema>;

export const AcceptAdminInviteSchema = z
  .object({
    token: z.string().trim().min(16),
    fullName: z.string().trim().min(2).max(100),
  })
  .strict();
export type AcceptAdminInviteDto = z.infer<typeof AcceptAdminInviteSchema>;

export const AdminUserItemSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum(['MODERATOR', 'ADMIN', 'SUPER_ADMIN', 'USER']),
  isSuspended: z.boolean(),
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime().nullable().optional(),
});
export type AdminUserItemDto = z.infer<typeof AdminUserItemSchema>;

export const AdminInvitationItemSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']),
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable().optional(),
  revokedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  inviter: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string(),
  }),
});
export type AdminInvitationItemDto = z.infer<typeof AdminInvitationItemSchema>;

// -----------------------------------------------------------------------------
// Operations: Ride & Booking Oversight
// -----------------------------------------------------------------------------

export const AdminCancelRideSchema = z
  .object({
    reason: z
      .string()
      .min(5, 'Reason must be at least 5 characters')
      .max(500, 'Reason cannot exceed 500 characters'),
  })
  .strict();
export type AdminCancelRideDto = z.infer<typeof AdminCancelRideSchema>;

export const AdminRideSummarySchema = z.object({
  id: z.string().uuid(),
  origin: z.string(),
  destination: z.string(),
  departureTime: z.string().datetime(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'CANCELLED', 'COMPLETED']),
  audience: z.enum(['STUDENT', 'FACULTY']),
  availableSeats: z.number(),
  totalSeats: z.number(),
  driver: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string(),
    audience: z.string().nullable().optional(),
  }),
  vehicle: z
    .object({
      make: z.string(),
      model: z.string(),
      registrationNumber: z.string(),
    })
    .nullable(),
  bookingsCount: z.number(),
  reportsCount: z.number(),
  createdAt: z.string().datetime(),
});
export type AdminRideSummaryDto = z.infer<typeof AdminRideSummarySchema>;

export const AdminBookingSummarySchema = z.object({
  id: z.string().uuid(),
  rideId: z.string().uuid(),
  passengerId: z.string().uuid(),
  passenger: z.object({
    fullName: z.string(),
    email: z.string(),
    audience: z.string().nullable().optional(),
  }),
  driver: z.object({
    fullName: z.string(),
    email: z.string(),
  }),
  ride: z.object({
    origin: z.string(),
    destination: z.string(),
    departureTime: z.string().datetime(),
    status: z.string(),
  }),
  requestedSeats: z.number(),
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED']),
  boardingStatus: z.enum(['WAITING', 'BOARDING', 'BOARDED', 'MISSED']),
  createdAt: z.string().datetime(),
});
export type AdminBookingSummaryDto = z.infer<typeof AdminBookingSummarySchema>;

// -----------------------------------------------------------------------------
// Moderation Notes
// -----------------------------------------------------------------------------

export const CreateModerationNoteSchema = z
  .object({
    targetUserId: z.string().uuid().optional(),
    targetRideId: z.string().uuid().optional(),
    targetReportId: z.string().uuid().optional(),
    content: z
      .string()
      .trim()
      .min(3, 'Note must be at least 3 characters')
      .max(2000, 'Note cannot exceed 2000 characters'),
  })
  .strict();
export type CreateModerationNoteDto = z.infer<typeof CreateModerationNoteSchema>;

export const ModerationNoteSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  author: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    role: z.string(),
  }),
  createdAt: z.string().datetime(),
});
export type ModerationNoteDto = z.infer<typeof ModerationNoteSchema>;

// -----------------------------------------------------------------------------
// Overview, Analytics & Health
// -----------------------------------------------------------------------------

export const AdminOverviewStatsSchema = z.object({
  totalUsers: z.number(),
  studentUsers: z.number(),
  facultyUsers: z.number(),
  suspendedUsers: z.number(),
  totalRides: z.number(),
  activeRides: z.number(),
  completedRides: z.number(),
  cancelledRides: z.number(),
  totalBookings: z.number(),
  confirmedBookings: z.number(),
  pendingVerifications: z.number(),
  openReports: z.number(),
});
export type AdminOverviewStatsDto = z.infer<typeof AdminOverviewStatsSchema>;

export const AdminAnalyticsSchema = z.object({
  userGrowth: z.array(z.object({ date: z.string(), count: z.number() })),
  rideActivity: z.array(z.object({ date: z.string(), published: z.number(), completed: z.number() })),
  bookingConversionRate: z.number(),
  cohortDistribution: z.object({
    students: z.number(),
    faculty: z.number(),
  }),
  reportDistribution: z.record(z.number()),
});
export type AdminAnalyticsDto = z.infer<typeof AdminAnalyticsSchema>;

export const SystemHealthComponentSchema = z.object({
  status: z.enum(['HEALTHY', 'DEGRADED', 'UNHEALTHY']),
  latencyMs: z.number().optional(),
  message: z.string().optional(),
  lastChecked: z.string().datetime(),
});

export const AdminSystemHealthSchema = z.object({
  overallStatus: z.enum(['HEALTHY', 'DEGRADED', 'UNHEALTHY']),
  components: z.object({
    database: SystemHealthComponentSchema,
    emailService: SystemHealthComponentSchema,
    webSockets: SystemHealthComponentSchema,
    storage: SystemHealthComponentSchema,
  }),
  uptimeSeconds: z.number(),
  version: z.string(),
});
export type AdminSystemHealthDto = z.infer<typeof AdminSystemHealthSchema>;
