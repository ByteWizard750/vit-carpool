import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ModerationService } from './moderation.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@vit-carpool/db';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import {
  CreateBlockSchema,
  CreateReportSchema,
  BlockResponseDto,
  BlockStatusResponseDto,
  ReportResponseDto,
} from '@vit-carpool/contracts';

@ApiTags('moderation')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post('blocks/:userId')
  @ApiOperation({ summary: 'Block a user' })
  async blockUser(
    @CurrentUser() user: User,
    @Param('userId') targetUserId: string,
    @Body() body: unknown,
  ): Promise<BlockResponseDto> {
    const parseResult = CreateBlockSchema.safeParse(body || {});
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join(', ');
      throw new BadRequestException(errorMsg || 'Invalid block payload');
    }
    return this.moderationService.blockUser(user, targetUserId, parseResult.data);
  }

  @Delete('blocks/:userId')
  @ApiOperation({ summary: 'Unblock a user' })
  async unblockUser(
    @CurrentUser() user: User,
    @Param('userId') targetUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.moderationService.unblockUser(user, targetUserId);
  }

  @Get('blocks')
  @ApiOperation({ summary: 'List users blocked by the authenticated user' })
  async listBlockedUsers(@CurrentUser() user: User): Promise<BlockResponseDto[]> {
    return this.moderationService.listBlockedUsers(user);
  }

  @Get('blocks/status/:userId')
  @ApiOperation({ summary: 'Check mutual block status between caller and target user' })
  async getBlockStatus(
    @CurrentUser() user: User,
    @Param('userId') targetUserId: string,
  ): Promise<BlockStatusResponseDto> {
    return this.moderationService.getBlockStatus(user, targetUserId);
  }

  @Post('reports')
  @ApiOperation({ summary: 'Submit a structured safety or incident report' })
  async submitReport(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<ReportResponseDto> {
    const parseResult = CreateReportSchema.safeParse(body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join(', ');
      throw new BadRequestException(errorMsg || 'Invalid report payload');
    }
    return this.moderationService.submitReport(user, parseResult.data);
  }
}
