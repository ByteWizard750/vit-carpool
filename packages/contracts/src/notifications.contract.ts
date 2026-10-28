import { z } from 'zod';
import { AudienceTypeSchema } from './audience.contract';

export const NotificationTypeSchema = z.enum([
  'RIDE_MATCH',
  'BOOKING_REQUESTED',
  'BOOKING_APPROVED',
  'BOOKING_REJECTED',
  'BOOKING_CANCELLED',
  'RIDE_CANCELLED',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationResponseSchema = z.object({
  id: z.string().uuid(),
  recipientId: z.string().uuid(),
  audience: AudienceTypeSchema,
  type: NotificationTypeSchema,
  title: z.string(),
  message: z.string(),
  rideId: z.string().uuid().nullable().optional(),
  bookingId: z.string().uuid().nullable().optional(),
  recurringCommuteId: z.string().uuid().nullable().optional(),
  rideAlertId: z.string().uuid().nullable().optional(),
  isRead: z.boolean(),
  readAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type NotificationResponseDto = z.infer<typeof NotificationResponseSchema>;

export const NotificationsListResponseSchema = z.object({
  notifications: z.array(NotificationResponseSchema),
  pagination: z.object({
    total: z.number(),
    unreadCount: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  }),
});

export type NotificationsListResponseDto = z.infer<typeof NotificationsListResponseSchema>;
