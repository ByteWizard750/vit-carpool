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
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { RidesService } from './rides.service';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@vit-carpool/db';
import {
  CreateRideSchema,
  UpdateRideSchema,
  CreateCabShareSchema,
  UpdateCabShareFareSchema,
  DriverRideResponseDto,
  PublicRideSummaryDto,
  SearchRidesQuerySchema,
  SearchRidesResponseDto,
  QuickRideTemplatesResponseDto,
  RideRouteResponseDto,
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
  @ApiOperation({ summary: 'Publish a new ride (Verified drivers only, idempotent with Idempotency-Key)' })
  @ApiHeader({ name: 'idempotency-key', required: false, description: 'Optional unique key for publication retry deduplication' })
  async publishRide(
    @CurrentUser() user: User,
    @Body() body: unknown,
    @Headers('idempotency-key') headerKey?: string,
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

    const key = (headerKey && headerKey.trim() !== '') ? headerKey.trim() : (parsed.data.idempotencyKey || undefined);
    return this.ridesService.publishRide(user, parsed.data, key);
  }

  @Post('cab-share')
  @ApiOperation({ summary: 'Publish a new shared cab journey (Verified students/faculty, no vehicle required)' })
  async publishCabShare(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<DriverRideResponseDto> {
    const parsed = CreateCabShareSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.ridesService.publishCabShare(user, parsed.data);
  }

  @Patch(':id/cab-fare')
  @ApiOperation({ summary: 'Update final total cab fare (Organizer only)' })
  async updateCabShareFare(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DriverRideResponseDto> {
    const parsed = UpdateCabShareFareSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.ridesService.updateCabShareFare(user, id, parsed.data);
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

  @Get(':id/route')
  @ApiOperation({ summary: 'Retrieve route geometry and navigation metrics for a ride' })
  async getRideRoute(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<RideRouteResponseDto> {
    return this.ridesService.getRideRoute(user, id);
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

  @Post(':id/start')
  @ApiOperation({ summary: 'Start a scheduled ride and initiate live tracking (Driver only)' })
  async startRide(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<DriverRideResponseDto> {
    return this.ridesService.startMyRide(user, id);
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
