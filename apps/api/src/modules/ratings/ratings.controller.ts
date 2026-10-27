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
import { RatingsService } from './ratings.service';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@vit-carpool/db';
import {
  CreateRatingSchema,
  DriverRatingResponseDto,
  DriverRatingSummaryDto,
  RatingEligibilityResponseDto,
} from '@vit-carpool/contracts';

@ApiTags('ratings')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a rating and optional review for a completed ride' })
  async createRating(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<DriverRatingResponseDto> {
    const parsed = CreateRatingSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.ratingsService.createRating(user, parsed.data);
  }

  @Get('eligibility/:bookingId')
  @ApiOperation({ summary: 'Check if a booking is eligible for rating by the passenger' })
  async checkEligibility(
    @CurrentUser() user: User,
    @Param('bookingId') bookingId: string,
  ): Promise<RatingEligibilityResponseDto> {
    return this.ratingsService.checkEligibility(user, bookingId);
  }

  @Get('driver/:driverId')
  @ApiOperation({ summary: 'Get aggregated ratings and reviews for a driver' })
  async getDriverRatingSummary(
    @CurrentUser() user: User,
    @Param('driverId') driverId: string,
  ): Promise<DriverRatingSummaryDto> {
    return this.ratingsService.getDriverRatingSummary(user, driverId);
  }
}
