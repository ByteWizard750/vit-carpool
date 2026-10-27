import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RidesService } from './rides.service';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@vit-carpool/db';
import {
  CreateRideSchema,
  UpdateRideSchema,
  DriverRideResponseDto,
  PublicRideSummaryDto,
  SearchRidesQuerySchema,
  SearchRidesResponseDto,
  QuickRideTemplatesResponseDto,
} from '@vit-carpool/contracts';

@ApiTags('rides')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('rides')
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Get()
  @ApiOperation({ summary: 'Search available rides (Verified users only, cohort isolated)' })
  async searchRides(
    @CurrentUser() user: User,
    @Query() query: unknown,
  ): Promise<SearchRidesResponseDto> {
    const parsed = SearchRidesQuerySchema.safeParse(query);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.ridesService.searchRides(user, parsed.data);
  }

  @Post()
  @ApiOperation({ summary: 'Publish a new ride (Verified drivers only)' })
  async publishRide(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<DriverRideResponseDto> {
    const parsed = CreateRideSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.ridesService.publishRide(user, parsed.data);
  }

  @Get('mine')
  @ApiOperation({ summary: 'List all rides published by the authenticated driver' })
  async listMyRides(@CurrentUser() user: User): Promise<DriverRideResponseDto[]> {
    return this.ridesService.listMyRides(user);
  }

  @Get('quick-templates')
  @ApiOperation({ summary: 'Retrieve reusable ride templates for Quick Ride (Authenticated driver only)' })
  async getQuickRideTemplates(
    @CurrentUser() user: User,
  ): Promise<QuickRideTemplatesResponseDto> {
    return this.ridesService.getQuickRideTemplates(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve ride details (Subject to audience isolation)' })
  async getRideById(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<DriverRideResponseDto | PublicRideSummaryDto> {
    return this.ridesService.getRideById(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a scheduled ride owned by the caller' })
  async updateMyRide(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DriverRideResponseDto> {
    const parsed = UpdateRideSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.ridesService.updateMyRide(user, id, parsed.data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a scheduled ride owned by the caller' })
  async cancelRideByDelete(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<DriverRideResponseDto> {
    return this.ridesService.cancelMyRide(user, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a scheduled ride owned by the caller' })
  async cancelRide(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<DriverRideResponseDto> {
    return this.ridesService.cancelMyRide(user, id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark a ride as completed (Driver only)' })
  async completeRide(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<DriverRideResponseDto> {
    return this.ridesService.completeMyRide(user, id);
  }
}
