import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@vit-carpool/db';
import {
  SendMessageSchema,
  MessageResponseDto,
  ConversationDetailDto,
  ConversationSummaryDto,
  UnreadCountResponseDto,
} from '@vit-carpool/contracts';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List all private ride conversations for the authenticated user' })
  async listMyConversations(@CurrentUser() user: User): Promise<ConversationSummaryDto[]> {
    return this.chatService.listMyConversations(user);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread message count across all conversations' })
  async getUnreadCount(@CurrentUser() user: User): Promise<UnreadCountResponseDto> {
    return this.chatService.getUnreadCount(user);
  }

  @Get('conversations/booking/:bookingId')
  @ApiOperation({ summary: 'Get or create a conversation for a specific booking' })
  async getOrCreateBookingConversation(
    @CurrentUser() user: User,
    @Param('bookingId') bookingId: string,
  ): Promise<ConversationDetailDto> {
    return this.chatService.getOrCreateBookingConversation(user, bookingId);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Retrieve conversation details and messages' })
  async getConversationById(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<ConversationDetailDto> {
    return this.chatService.getConversationById(user, id);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message in a private ride conversation' })
  async sendMessage(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MessageResponseDto> {
    const parsed = SendMessageSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.chatService.sendMessage(user, id, parsed.data);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Mark all messages in a conversation as read' })
  async markAsRead(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.chatService.markAsRead(user, id);
  }
}
