import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RecurringCommutesService } from './recurring-commutes.service';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@vit-carpool/db';
import {
  CreateRecurringCommuteSchema,
  UpdateRecurringCommuteSchema,
  RecurringCommuteResponseDto,
} from '@vit-carpool/contracts';

@ApiTags('recurring-commutes')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('recurring-commutes')
export class RecurringCommutesController {
  constructor(private readonly commutesService: RecurringCommutesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new recurring commute schedule (Verified drivers only)' })
  async createCommute(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<RecurringCommuteResponseDto> {
    const parsed = CreateRecurringCommuteSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.commutesService.createCommute(user, parsed.data);
  }

  @Get()
  @ApiOperation({ summary: 'List all recurring commute schedules owned by authenticated driver' })
  async listCommutes(@CurrentUser() user: User): Promise<RecurringCommuteResponseDto[]> {
    return this.commutesService.listCommutes(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific recurring commute schedule' })
  async getCommuteById(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<RecurringCommuteResponseDto> {
    return this.commutesService.getCommuteById(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update future preferences of a recurring commute schedule' })
  async updateCommute(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<RecurringCommuteResponseDto> {
    const parsed = UpdateRecurringCommuteSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.commutesService.updateCommute(user, id, parsed.data);
  }

  @Patch(':id/pause')
  @ApiOperation({ summary: 'Pause an active recurring commute schedule' })
  async pauseCommute(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<RecurringCommuteResponseDto> {
    return this.commutesService.pauseCommute(user, id);
  }

  @Patch(':id/resume')
  @ApiOperation({ summary: 'Resume a paused recurring commute schedule' })
  async resumeCommute(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<RecurringCommuteResponseDto> {
    return this.commutesService.resumeCommute(user, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a recurring commute schedule' })
  async cancelCommute(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<RecurringCommuteResponseDto> {
    return this.commutesService.cancelCommute(user, id);
  }
}
