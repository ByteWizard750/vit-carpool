import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { User, RideStatus, BookingStatus, Prisma } from '@vit-carpool/db';
import {
  SendMessageDto,
  MessageResponseDto,
  ConversationDetailDto,
  ConversationSummaryDto,
} from '@vit-carpool/contracts';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Helper to determine read-only state for a conversation based on booking and ride status.
   */
  private determineReadOnlyState(
    bookingStatus: BookingStatus,
    rideStatus: RideStatus,
    departureTime: Date,
  ): { isReadOnly: boolean; readOnlyReason?: string } {
    if (bookingStatus === BookingStatus.REJECTED) {
      return {
        isReadOnly: true,
        readOnlyReason: 'This booking request was declined by the driver.',
      };
    }
    if (bookingStatus === BookingStatus.CANCELLED) {
      return {
        isReadOnly: true,
        readOnlyReason: 'This booking was cancelled. Messaging is closed.',
      };
    }
    if (rideStatus === RideStatus.CANCELLED) {
      return {
        isReadOnly: true,
        readOnlyReason: 'The ride was cancelled by the driver. Messaging is closed.',
      };
    }
    if (rideStatus === RideStatus.COMPLETED) {
      return {
        isReadOnly: true,
        readOnlyReason: 'This ride has completed. Conversation is archived in read-only mode.',
      };
    }
    return { isReadOnly: false };
  }

  /**
   * List all conversations for the authenticated user (as passenger or driver).
   */
  async listMyConversations(user: User): Promise<ConversationSummaryDto[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [{ passengerId: user.id }, { driverId: user.id }],
      },
      include: {
        passenger: { select: { id: true, fullName: true, audience: true } },
        driver: { select: { id: true, fullName: true, audience: true } },
        ride: {
          select: {
            id: true,
            origin: true,
            destination: true,
            departureTime: true,
            status: true,
          },
        },
        booking: {
          select: {
            id: true,
            status: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            senderId: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Compute unread counts per conversation in parallel
    const conversationIds = conversations.map((c) => c.id);
    const unreadCounts = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: conversationIds },
        senderId: { not: user.id },
        readAt: null,
      },
      _count: { id: true },
    });

    const unreadMap = new Map<string, number>();
    for (const item of unreadCounts) {
      unreadMap.set(item.conversationId, item._count.id);
    }

    return conversations.map((c) => {
      const isUserPassenger = c.passengerId === user.id;
      const otherUser = isUserPassenger ? c.driver : c.passenger;
      const otherRole = isUserPassenger ? ('DRIVER' as const) : ('PASSENGER' as const);

      const readOnlyState = this.determineReadOnlyState(
        c.booking.status,
        c.ride.status,
        c.ride.departureTime,
      );

      const lastMsg = c.messages.length > 0 ? c.messages[0] : null;

      return {
        id: c.id,
        bookingId: c.bookingId,
        rideId: c.rideId,
        otherParticipant: {
          id: otherUser.id,
          fullName: otherUser.fullName,
          audience: otherUser.audience,
          role: otherRole,
        },
        ride: {
          id: c.ride.id,
          origin: c.ride.origin,
          destination: c.ride.destination,
          departureTime: c.ride.departureTime.toISOString(),
          status: c.ride.status,
        },
        bookingStatus: c.booking.status,
        lastMessage: lastMsg
          ? {
              content: lastMsg.content,
              senderId: lastMsg.senderId,
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null,
        unreadCount: unreadMap.get(c.id) || 0,
        isReadOnly: readOnlyState.isReadOnly,
        updatedAt: c.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Get or create a private conversation for a specific booking.
   * Enforces that the caller is either the booking passenger or ride driver.
   */
  async getOrCreateBookingConversation(
    user: User,
    bookingId: string,
  ): Promise<ConversationDetailDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ride: { select: { id: true, driverId: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    if (booking.passengerId !== user.id && booking.driverId !== user.id) {
      throw new ForbiddenException('You do not have access to this conversation.');
    }

    // Upsert conversation to prevent race conditions
    const conversation = await this.prisma.conversation.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        rideId: booking.rideId,
        passengerId: booking.passengerId,
        driverId: booking.driverId,
      },
      update: {},
      select: { id: true },
    });

    return this.getConversationById(user, conversation.id);
  }

  /**
   * Retrieve conversation details and full message history in chronological order.
   * Auto-marks incoming messages as read for the requesting participant.
   */
  async getConversationById(user: User, conversationId: string): Promise<ConversationDetailDto> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        passenger: { select: { id: true, fullName: true, audience: true } },
        driver: { select: { id: true, fullName: true, audience: true } },
        ride: {
          select: {
            id: true,
            origin: true,
            destination: true,
            departureTime: true,
            status: true,
          },
        },
        booking: {
          select: {
            id: true,
            status: true,
            requestedSeats: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    // Invariant: caller must be passenger or driver
    if (conversation.passengerId !== user.id && conversation.driverId !== user.id) {
      throw new ForbiddenException('You do not have access to this conversation.');
    }

    // Mark any unread incoming messages as read
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: user.id },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    // Fetch messages in chronological order
    const rawMessages = await this.prisma.message.findMany({
      where: { conversationId },
      include: {
        sender: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const isUserPassenger = conversation.passengerId === user.id;
    const otherUser = isUserPassenger ? conversation.driver : conversation.passenger;
    const otherRole = isUserPassenger ? ('DRIVER' as const) : ('PASSENGER' as const);

    const readOnlyState = this.determineReadOnlyState(
      conversation.booking.status,
      conversation.ride.status,
      conversation.ride.departureTime,
    );

    const messages: MessageResponseDto[] = rawMessages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      senderName: m.sender.fullName,
      content: m.content,
      readAt: m.readAt ? m.readAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
      isMine: m.senderId === user.id,
    }));

    return {
      id: conversation.id,
      bookingId: conversation.bookingId,
      rideId: conversation.rideId,
      passengerId: conversation.passengerId,
      driverId: conversation.driverId,
      otherParticipant: {
        id: otherUser.id,
        fullName: otherUser.fullName,
        audience: otherUser.audience,
        role: otherRole,
      },
      ride: {
        id: conversation.ride.id,
        origin: conversation.ride.origin,
        destination: conversation.ride.destination,
        departureTime: conversation.ride.departureTime.toISOString(),
        status: conversation.ride.status,
      },
      booking: {
        id: conversation.booking.id,
        status: conversation.booking.status,
        requestedSeats: conversation.booking.requestedSeats,
      },
      isReadOnly: readOnlyState.isReadOnly,
      readOnlyReason: readOnlyState.readOnlyReason,
      unreadCount: 0, // Just read all incoming messages
      messages,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  /**
   * Send a message in a conversation.
   * Enforces participant authorization and read-only status rules.
   */
  async sendMessage(
    user: User,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        ride: {
          select: {
            id: true,
            status: true,
            departureTime: true,
          },
        },
        booking: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    // Invariant: caller must be passenger or driver
    if (conversation.passengerId !== user.id && conversation.driverId !== user.id) {
      throw new ForbiddenException('You do not have access to this conversation.');
    }

    // Enforce read-only rules
    const readOnlyState = this.determineReadOnlyState(
      conversation.booking.status,
      conversation.ride.status,
      conversation.ride.departureTime,
    );

    if (readOnlyState.isReadOnly) {
      throw new BadRequestException(
        readOnlyState.readOnlyReason || 'Messaging is closed for this ride.',
      );
    }

    // Persist message & update conversation timestamp
    const [createdMessage] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          senderId: user.id,
          content: dto.content,
        },
        include: {
          sender: { select: { fullName: true } },
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'CHAT_MESSAGE_SENT',
      targetType: 'CONVERSATION',
      targetId: conversationId,
      changes: {
        messageId: createdMessage.id,
        contentLength: dto.content.length,
      },
    });

    return {
      id: createdMessage.id,
      conversationId: createdMessage.conversationId,
      senderId: createdMessage.senderId,
      senderName: createdMessage.sender.fullName,
      content: createdMessage.content,
      readAt: null,
      createdAt: createdMessage.createdAt.toISOString(),
      isMine: true,
    };
  }

  /**
   * Mark all unread incoming messages as read in a conversation.
   */
  async markAsRead(user: User, conversationId: string): Promise<{ success: boolean }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { passengerId: true, driverId: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    if (conversation.passengerId !== user.id && conversation.driverId !== user.id) {
      throw new ForbiddenException('You do not have access to this conversation.');
    }

    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: user.id },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Get total count of unread messages across all conversations for the user.
   */
  async getUnreadCount(user: User): Promise<{ unreadCount: number }> {
    const count = await this.prisma.message.count({
      where: {
        senderId: { not: user.id },
        readAt: null,
        conversation: {
          OR: [{ passengerId: user.id }, { driverId: user.id }],
        },
      },
    });

    return { unreadCount: count };
  }
}
