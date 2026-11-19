import { z } from 'zod';

export const APP_SOCKET_EVENTS = {
  // Booking lifecycle events
  BOOKING_CREATED: 'booking:created',
  BOOKING_UPDATED: 'booking:updated',
  BOOKING_CANCELLED: 'booking:cancelled',

  // Ride lifecycle events
  RIDE_CREATED: 'ride:created',
  RIDE_UPDATED: 'ride:updated',
  RIDE_SEATS_CHANGED: 'ride:seats_changed',
  RIDE_CANCELLED: 'ride:cancelled',
  RIDE_COMPLETED: 'ride:completed',

  // Communication & Notification events
  CHAT_MESSAGE: 'chat:message',
  CHAT_UNREAD: 'chat:unread',
  NOTIFICATION_NEW: 'notification:new',

  // User profile
  USER_UPDATED: 'user:updated',
} as const;

export type AppSocketEventName = (typeof APP_SOCKET_EVENTS)[keyof typeof APP_SOCKET_EVENTS];

export const BookingSocketPayloadSchema = z.object({
  bookingId: z.string().uuid(),
  rideId: z.string().uuid(),
  passengerId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  status: z.string(),
  seatsBooked: z.number().int().positive().optional(),
  cancelledBy: z.string().uuid().optional(),
  timestamp: z.string().datetime().optional(),
});
export type BookingSocketPayload = z.infer<typeof BookingSocketPayloadSchema>;

export const RideSeatsSocketPayloadSchema = z.object({
  rideId: z.string().uuid(),
  availableSeats: z.number().int().min(0),
  totalSeats: z.number().int().positive().optional(),
  status: z.string().optional(),
});
export type RideSeatsSocketPayload = z.infer<typeof RideSeatsSocketPayloadSchema>;
