import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@vit-carpool/db';
import { NotificationsService } from './notifications.service';
import { WebPushService } from './web-push.service';
import {
  NotificationResponseDto,
  NotificationsListResponseDto,
} from '@vit-carpool/contracts';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly webPushService: WebPushService,
  ) {}

  @Get('push-public-key')
  @ApiOperation({ summary: 'Retrieve VAPID public key for browser push subscription' })
  getPushPublicKey(): { publicKey: string | null } {
    return { publicKey: this.webPushService.getPublicKey() };
  }

  @Post('subscribe-push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register browser Web Push subscription for authenticated user' })
  async subscribePush(
    @CurrentUser() user: User,
    @Body() body: { endpoint: string; keys?: { p256dh: string; auth: string } },
  ): Promise<{ success: boolean }> {
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      throw new BadRequestException('Invalid subscription payload: endpoint, p256dh, and auth are required');
    }
    await this.webPushService.registerSubscription(user.id, {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    return { success: true };
  }

  @Post('unsubscribe-push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove browser Web Push subscription for authenticated user' })
  async unsubscribePush(
    @CurrentUser() user: User,
    @Body() body: { endpoint: string },
  ): Promise<{ success: boolean }> {
    if (!body?.endpoint) {
      throw new BadRequestException('Endpoint is required');
    }
    await this.webPushService.unsubscribe(user.id, body.endpoint);
    return { success: true };
  }

  @Get()
  @ApiOperation({ summary: 'List notifications for current user with pagination' })
  async listNotifications(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ): Promise<NotificationsListResponseDto> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const isUnreadOnly = unreadOnly === 'true' || unreadOnly === '1';

    return this.notificationsService.listNotifications(user, {
      page: isNaN(pageNum) ? 1 : pageNum,
      limit: isNaN(limitNum) ? 20 : limitNum,
      unreadOnly: isUnreadOnly,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for current user' })
  async getUnreadCount(@CurrentUser() user: User): Promise<{ count: number }> {
    return this.notificationsService.getUnreadCount(user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark an individual notification as read' })
  async markAsRead(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markAsRead(user, id);
  }

  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all unread notifications as read' })
  async markAllAsRead(@CurrentUser() user: User): Promise<{ count: number }> {
    return this.notificationsService.markAllAsRead(user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  async deleteNotification(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.notificationsService.deleteNotification(user, id);
  }
}
