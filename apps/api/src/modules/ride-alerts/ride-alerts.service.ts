import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import {
  User,
  RideAlert,
  RideAlertStatus,
  Prisma,
} from '@vit-carpool/db';
import {
  CreateRideAlertDto,
  UpdateRideAlertDto,
  RideAlertResponseDto,
} from '@vit-carpool/contracts';

@Injectable()
export class RideAlertsService {
  private readonly logger = new Logger(RideAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Helper to format internal RideAlert entity to safe RideAlertResponseDto
   */
  private toDto(alert: RideAlert): RideAlertResponseDto {
    return {
      id: alert.id,
      userId: alert.userId,
      audience: alert.audience,
      origin: alert.origin,
      originAddress: alert.originAddress,
      originLatitude: alert.originLatitude,
      originLongitude: alert.originLongitude,
      originPlaceId: alert.originPlaceId,
      destination: alert.destination,
      destinationAddress: alert.destinationAddress,
      destinationLatitude: alert.destinationLatitude,
      destinationLongitude: alert.destinationLongitude,
      destinationPlaceId: alert.destinationPlaceId,
      radiusKm: alert.radiusKm,
      earliestDepartureTime: alert.earliestDepartureTime,
      latestDepartureTime: alert.latestDepartureTime,
      minSeats: alert.minSeats,
      status: alert.status,
      createdAt: alert.createdAt.toISOString(),
      updatedAt: alert.updatedAt.toISOString(),
    };
  }

  /**
   * Create a new ride alert for the authenticated user.
   */
  async createAlert(user: User, dto: CreateRideAlertDto): Promise<RideAlertResponseDto> {
    if (!user.audience) {
      throw new BadRequestException('User audience is not set.');
    }

    const alert = await this.prisma.rideAlert.create({
      data: {
        userId: user.id,
        audience: user.audience,
        origin: dto.origin.trim(),
        originAddress: dto.originAddress?.trim() || null,
        originLatitude: dto.originLatitude ?? null,
        originLongitude: dto.originLongitude ?? null,
        originPlaceId: dto.originPlaceId?.trim() || null,
        destination: dto.destination.trim(),
        destinationAddress: dto.destinationAddress?.trim() || null,
        destinationLatitude: dto.destinationLatitude ?? null,
        destinationLongitude: dto.destinationLongitude ?? null,
        destinationPlaceId: dto.destinationPlaceId?.trim() || null,
        radiusKm: dto.radiusKm ?? 3.0,
        earliestDepartureTime: dto.earliestDepartureTime?.trim() || null,
        latestDepartureTime: dto.latestDepartureTime?.trim() || null,
        minSeats: dto.minSeats ?? 1,
        status: RideAlertStatus.ACTIVE,
      },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'RIDE_ALERT_CREATED',
      targetType: 'RIDE_ALERT',
      targetId: alert.id,
      changes: {
        origin: alert.origin,
        destination: alert.destination,
        radiusKm: alert.radiusKm,
      },
    });

    return this.toDto(alert);
  }

  /**
   * List all ride alerts belonging to the authenticated user.
   */
  async listMyAlerts(user: User): Promise<RideAlertResponseDto[]> {
    const alerts = await this.prisma.rideAlert.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return alerts.map((a) => this.toDto(a));
  }

  /**
   * Get an individual ride alert by ID.
   */
  async getAlertById(user: User, id: string): Promise<RideAlertResponseDto> {
    const alert = await this.prisma.rideAlert.findUnique({
      where: { id },
    });

    if (!alert || alert.userId !== user.id) {
      throw new NotFoundException('Ride alert not found.');
    }

    return this.toDto(alert);
  }

  /**
   * Update preferences for an existing ride alert.
   */
  async updateAlert(
    user: User,
    id: string,
    dto: UpdateRideAlertDto,
  ): Promise<RideAlertResponseDto> {
    const existing = await this.prisma.rideAlert.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== user.id) {
      throw new NotFoundException('Ride alert not found.');
    }

    const updated = await this.prisma.rideAlert.update({
      where: { id },
      data: {
        origin: dto.origin !== undefined ? dto.origin.trim() : existing.origin,
        originAddress: dto.originAddress !== undefined ? dto.originAddress?.trim() || null : existing.originAddress,
        originLatitude: dto.originLatitude !== undefined ? dto.originLatitude : existing.originLatitude,
        originLongitude: dto.originLongitude !== undefined ? dto.originLongitude : existing.originLongitude,
        originPlaceId: dto.originPlaceId !== undefined ? dto.originPlaceId?.trim() || null : existing.originPlaceId,
        destination: dto.destination !== undefined ? dto.destination.trim() : existing.destination,
        destinationAddress: dto.destinationAddress !== undefined ? dto.destinationAddress?.trim() || null : existing.destinationAddress,
        destinationLatitude: dto.destinationLatitude !== undefined ? dto.destinationLatitude : existing.destinationLatitude,
        destinationLongitude: dto.destinationLongitude !== undefined ? dto.destinationLongitude : existing.destinationLongitude,
        destinationPlaceId: dto.destinationPlaceId !== undefined ? dto.destinationPlaceId?.trim() || null : existing.destinationPlaceId,
        radiusKm: dto.radiusKm !== undefined ? dto.radiusKm : existing.radiusKm,
        earliestDepartureTime: dto.earliestDepartureTime !== undefined ? dto.earliestDepartureTime?.trim() || null : existing.earliestDepartureTime,
        latestDepartureTime: dto.latestDepartureTime !== undefined ? dto.latestDepartureTime?.trim() || null : existing.latestDepartureTime,
        minSeats: dto.minSeats !== undefined ? dto.minSeats : existing.minSeats,
        status: dto.status !== undefined ? dto.status : existing.status,
      },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'RIDE_ALERT_UPDATED',
      targetType: 'RIDE_ALERT',
      targetId: alertId(id),
      changes: dto as unknown as Prisma.InputJsonValue,
    });

    return this.toDto(updated);
  }

  /**
   * Pause a ride alert.
   */
  async pauseAlert(user: User, id: string): Promise<RideAlertResponseDto> {
    const existing = await this.prisma.rideAlert.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== user.id) {
      throw new NotFoundException('Ride alert not found.');
    }

    const updated = await this.prisma.rideAlert.update({
      where: { id },
      data: { status: RideAlertStatus.PAUSED },
    });

    return this.toDto(updated);
  }

  /**
   * Resume a paused ride alert.
   */
  async resumeAlert(user: User, id: string): Promise<RideAlertResponseDto> {
    const existing = await this.prisma.rideAlert.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== user.id) {
      throw new NotFoundException('Ride alert not found.');
    }

    const updated = await this.prisma.rideAlert.update({
      where: { id },
      data: { status: RideAlertStatus.ACTIVE },
    });

    return this.toDto(updated);
  }

  /**
   * Delete a ride alert.
   */
  async deleteAlert(user: User, id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.rideAlert.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== user.id) {
      throw new NotFoundException('Ride alert not found.');
    }

    await this.prisma.rideAlert.delete({
      where: { id },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'RIDE_ALERT_DELETED',
      targetType: 'RIDE_ALERT',
      targetId: id,
    });

    return { success: true };
  }
}

function alertId(id: string): string {
  return id;
}
