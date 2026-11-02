import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { TrackingGateway } from './tracking.gateway';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, BoardingStatus } from '@vit-carpool/db';
import {
  DriverLocationUpdateSchema,
  DriverLocationUpdateDto,
  UpdateBoardingStatusSchema,
  UpdateBoardingStatusDto,
  TrackingSessionStateDto,
} from '@vit-carpool/contracts';

@ApiTags('tracking')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('rides/:id')
export class TrackingController {
  constructor(
    private readonly trackingService: TrackingService,
    private readonly trackingGateway: TrackingGateway,
  ) {}

  @Get('tracking')
  @ApiOperation({ summary: 'Retrieve live tracking state (Driver or confirmed passenger only)' })
  async getTrackingState(
    @CurrentUser() user: User,
    @Param('id') rideId: string,
  ): Promise<TrackingSessionStateDto> {
    return this.trackingService.getTrackingState(user, rideId);
  }

  @Post('location-update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record driver GPS location (Driver only REST bridge)' })
  async recordLocation(
    @CurrentUser() user: User,
    @Param('id') rideId: string,
    @Body() body: unknown,
  ): Promise<{ success: boolean; recordedAt: string; passengerETAs: any }> {
    const parsed = DriverLocationUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    const result = await this.trackingService.recordDriverLocation(user, rideId, parsed.data);

    // Broadcast over WebSocket room
    this.trackingGateway.broadcastLocation(
      rideId,
      result.snapshot,
      result.passengerETAs,
      result.approachingPassengerIds,
      result.stoppedNearPassengerIds,
      result.missedPickupPassengerIds,
    );

    return {
      success: true,
      recordedAt: result.snapshot.recordedAt.toISOString(),
      passengerETAs: result.passengerETAs,
    };
  }

  @Post('boarding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update passenger boarding status (Passenger or Driver)' })
  async updateBoarding(
    @CurrentUser() user: User,
    @Param('id') rideId: string,
    @Body() body: unknown,
  ): Promise<{ success: boolean; bookingId: string; boardingStatus: BoardingStatus; boardedAt: string | null }> {
    const parsed = UpdateBoardingStatusSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    const updated = await this.trackingService.updateBoardingStatus(
      user,
      parsed.data.bookingId,
      parsed.data.boardingStatus,
    );

    // Broadcast over WebSocket room
    this.trackingGateway.broadcastBoarding(
      rideId,
      parsed.data.bookingId,
      updated.passengerId,
      updated.boardingStatus,
      updated.boardedAt ? updated.boardedAt.toISOString() : null,
    );

    return {
      success: true,
      bookingId: updated.id,
      boardingStatus: updated.boardingStatus,
      boardedAt: updated.boardedAt ? updated.boardedAt.toISOString() : null,
    };
  }
}

