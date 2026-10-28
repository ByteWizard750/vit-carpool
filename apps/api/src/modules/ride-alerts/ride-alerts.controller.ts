import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@vit-carpool/db';
import { RideAlertsService } from './ride-alerts.service';
import {
  CreateRideAlertSchema,
  UpdateRideAlertSchema,
  RideAlertResponseDto,
} from '@vit-carpool/contracts';

@ApiTags('ride-alerts')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('ride-alerts')
export class RideAlertsController {
  constructor(private readonly rideAlertsService: RideAlertsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new ride alert' })
  async createAlert(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<RideAlertResponseDto> {
    const parseResult = CreateRideAlertSchema.safeParse(body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => i.message).join(', ');
      throw new BadRequestException(issues || 'Invalid ride alert payload');
    }

    return this.rideAlertsService.createAlert(user, parseResult.data);
  }

  @Get()
  @ApiOperation({ summary: 'List all ride alerts for the authenticated user' })
  async listMyAlerts(@CurrentUser() user: User): Promise<RideAlertResponseDto[]> {
    return this.rideAlertsService.listMyAlerts(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an individual ride alert by ID' })
  async getAlertById(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<RideAlertResponseDto> {
    return this.rideAlertsService.getAlertById(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing ride alert preferences' })
  async updateAlert(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<RideAlertResponseDto> {
    const parseResult = UpdateRideAlertSchema.safeParse(body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => i.message).join(', ');
      throw new BadRequestException(issues || 'Invalid update payload');
    }

    return this.rideAlertsService.updateAlert(user, id, parseResult.data);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a ride alert' })
  async pauseAlert(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<RideAlertResponseDto> {
    return this.rideAlertsService.pauseAlert(user, id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused ride alert' })
  async resumeAlert(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<RideAlertResponseDto> {
    return this.rideAlertsService.resumeAlert(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a ride alert' })
  async deleteAlert(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.rideAlertsService.deleteAlert(user, id);
  }
}
