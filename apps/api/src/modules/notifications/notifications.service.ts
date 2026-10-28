import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  User,
  Notification,
  NotificationType,
  Audience,
  Prisma,
} from '@vit-carpool/db';
import {
  NotificationResponseDto,
  NotificationsListResponseDto,
} from '@vit-carpool/contracts';

export interface CreateNotificationParams {
  recipientId: string;
  audience: Audience;
  type: NotificationType;
  title: string;
  message: string;
  rideId?: string | null;
  bookingId?: string | null;
  recurringCommuteId?: string | null;
  rideAlertId?: string | null;
  dedupKey?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to format internal Notification to NotificationResponseDto
   */
  private toDto(n: Notification): NotificationResponseDto {
    return {
      id: n.id,
      recipientId: n.recipientId,
      audience: n.audience,
      type: n.type,
      title: n.title,
      message: n.message,
      rideId: n.rideId ?? null,
      bookingId: n.bookingId ?? null,
      recurringCommuteId: n.recurringCommuteId ?? null,
      rideAlertId: n.rideAlertId ?? null,
      isRead: n.isRead,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    };
  }

  /**
   * Create a notification with database-backed deduplication.
   * If a notification with the same [recipientId, dedupKey] already exists,
   * catches P2002 and safely skips duplicate creation.
   */
  async createNotification(
    params: CreateNotificationParams,
    tx?: Prisma.TransactionClient,
  ): Promise<NotificationResponseDto | null> {
    const client = tx || this.prisma;

    try {
      const notification = await client.notification.create({
        data: {
          recipientId: params.recipientId,
          audience: params.audience,
          type: params.type,
          title: params.title.slice(0, 128),
          message: params.message.slice(0, 255),
          rideId: params.rideId || null,
          bookingId: params.bookingId || null,
          recurringCommuteId: params.recurringCommuteId || null,
          rideAlertId: params.rideAlertId || null,
          dedupKey: params.dedupKey ? params.dedupKey.slice(0, 128) : null,
        },
      });

      return this.toDto(notification);
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.debug(
          `[Notifications] Skipped duplicate notification: dedupKey=${params.dedupKey} recipient=${params.recipientId}`,
        );
        return null;
      }
      this.logger.error(`[Notifications] Failed to create notification: ${err}`);
      throw err;
    }
  }

  /**
   * List notifications for the authenticated user, ordered newest first.
   */
  async listNotifications(
    user: User,
    query?: { page?: number; limit?: number; unreadOnly?: boolean },
  ): Promise<NotificationsListResponseDto> {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.min(50, Math.max(1, query?.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      recipientId: user.id,
      audience: user.audience!,
      ...(query?.unreadOnly ? { isRead: false } : {}),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { recipientId: user.id, isRead: false },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      notifications: notifications.map((n) => this.toDto(n)),
      pagination: {
        total,
        unreadCount,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Get unread notification count for the authenticated user.
   */
  async getUnreadCount(user: User): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: {
        recipientId: user.id,
        isRead: false,
      },
    });
    return { count };
  }

  /**
   * Mark a single notification as read, strictly verifying ownership.
   */
  async markAsRead(user: User, notificationId: string): Promise<NotificationResponseDto> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.recipientId !== user.id) {
      throw new NotFoundException('Notification not found.');
    }

    if (notification.isRead) {
      return this.toDto(notification);
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return this.toDto(updated);
  }

  /**
   * Mark all unread notifications for the authenticated user as read.
   */
  async markAllAsRead(user: User): Promise<{ count: number }> {
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientId: user.id,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: now,
      },
    });

    return { count: result.count };
  }

  /**
   * Delete a notification belonging to the authenticated user.
   */
  async deleteNotification(user: User, notificationId: string): Promise<{ success: boolean }> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.recipientId !== user.id) {
      throw new NotFoundException('Notification not found.');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    return { success: true };
  }
}
