import { z } from 'zod';
import { AudienceTypeSchema } from './audience.contract';
import { RideStatusSchema } from './ride.contract';
import { BookingStatusSchema } from './booking.contract';

/**
 * Payload schema for sending a private message within a ride conversation.
 * Rejects empty messages and enforces max length 1000 characters.
 */
export const SendMessageSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, 'Message content cannot be empty')
      .max(1000, 'Message cannot exceed 1000 characters'),
  })
  .strict();

export type SendMessageDto = z.infer<typeof SendMessageSchema>;

/**
 * Single message response representation.
 */
export const MessageResponseSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderName: z.string(),
  content: z.string(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  isMine: z.boolean().optional(),
});

export type MessageResponseDto = z.infer<typeof MessageResponseSchema>;

/**
 * Participant details for chat conversation.
 */
export const ConversationParticipantSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  audience: AudienceTypeSchema.nullable().optional(),
  role: z.enum(['DRIVER', 'PASSENGER']),
});

export type ConversationParticipantDto = z.infer<typeof ConversationParticipantSchema>;

/**
 * Detailed conversation view including message history and contextual ride/booking state.
 */
export const ConversationDetailSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  rideId: z.string().uuid(),
  passengerId: z.string().uuid(),
  driverId: z.string().uuid(),
  otherParticipant: ConversationParticipantSchema,
  ride: z.object({
    id: z.string().uuid(),
    origin: z.string(),
    destination: z.string(),
    departureTime: z.string().datetime(),
    status: RideStatusSchema,
  }),
  booking: z.object({
    id: z.string().uuid(),
    status: BookingStatusSchema,
    requestedSeats: z.number().int(),
  }),
  isReadOnly: z.boolean(),
  readOnlyReason: z.string().nullable().optional(),
  unreadCount: z.number().int(),
  messages: z.array(MessageResponseSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ConversationDetailDto = z.infer<typeof ConversationDetailSchema>;

/**
 * Conversation item for the conversation list view.
 */
export const ConversationSummarySchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  rideId: z.string().uuid(),
  otherParticipant: ConversationParticipantSchema,
  ride: z.object({
    id: z.string().uuid(),
    origin: z.string(),
    destination: z.string(),
    departureTime: z.string().datetime(),
    status: RideStatusSchema,
  }),
  bookingStatus: BookingStatusSchema,
  lastMessage: z
    .object({
      content: z.string(),
      senderId: z.string().uuid(),
      createdAt: z.string().datetime(),
    })
    .nullable()
    .optional(),
  unreadCount: z.number().int(),
  isReadOnly: z.boolean(),
  updatedAt: z.string().datetime(),
});

export type ConversationSummaryDto = z.infer<typeof ConversationSummarySchema>;

/**
 * Unread message count across all conversations.
 */
export const UnreadCountResponseSchema = z.object({
  unreadCount: z.number().int(),
});

export type UnreadCountResponseDto = z.infer<typeof UnreadCountResponseSchema>;
