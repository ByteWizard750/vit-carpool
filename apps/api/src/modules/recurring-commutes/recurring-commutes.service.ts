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
  RecurringCommute,
  RecurringCommuteStatus,
  RideStatus,
  Prisma,
} from '@vit-carpool/db';
import {
  CreateRecurringCommuteDto,
  UpdateRecurringCommuteDto,
  RecurringCommuteResponseDto,
  getApplicableOccurrenceDates,
  getKolkataTodayString,
} from '@vit-carpool/contracts';

@Injectable()
export class RecurringCommutesService {
  private readonly logger = new Logger(RecurringCommutesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Helper to format a database RecurringCommute into a safe client response DTO.
   */
  private toDto(
    commute: RecurringCommute & {
      driver?: { fullName: string | null };
      vehicle?: { id: string; make: string; model: string; color: string; capacity: number } | null;
      _count?: { rides: number };
    },
    nextOccurrence?: string | null,
  ): RecurringCommuteResponseDto {
    const startDateStr = commute.startDate instanceof Date
      ? commute.startDate.toISOString().slice(0, 10)
      : String(commute.startDate).slice(0, 10);

    const endDateStr = commute.endDate instanceof Date
      ? commute.endDate.toISOString().slice(0, 10)
      : String(commute.endDate).slice(0, 10);

    return {
      id: commute.id,
      driverId: commute.driverId,
      driverName: commute.driver?.fullName || 'Verified Member',
      audience: commute.audience,
      origin: commute.origin,
      originAddress: commute.originAddress ?? undefined,
      originLatitude: commute.originLatitude ?? undefined,
      originLongitude: commute.originLongitude ?? undefined,
      originPlaceId: commute.originPlaceId ?? undefined,
      destination: commute.destination,
      destinationAddress: commute.destinationAddress ?? undefined,
      destinationLatitude: commute.destinationLatitude ?? undefined,
      destinationLongitude: commute.destinationLongitude ?? undefined,
      destinationPlaceId: commute.destinationPlaceId ?? undefined,
      pickupDescription: commute.pickupDescription ?? undefined,
      dropoffDescription: commute.dropoffDescription ?? undefined,
      weekdays: commute.weekdays,
      departureTime: commute.departureTime,
      startDate: startDateStr,
      endDate: endDateStr,
      availableSeats: commute.availableSeats,
      costPerSeat: commute.costPerSeat ?? null,
      status: commute.status,
      vehicle: commute.vehicle
        ? {
            id: commute.vehicle.id,
            make: commute.vehicle.make,
            model: commute.vehicle.model,
            color: commute.vehicle.color,
            capacity: commute.vehicle.capacity,
          }
        : undefined,
      generatedRidesCount: commute._count?.rides ?? 0,
      nextOccurrence: nextOccurrence ?? null,
      createdAt: commute.createdAt.toISOString(),
      updatedAt: commute.updatedAt.toISOString(),
    };
  }

  /**
   * Computes the next upcoming departure datetime string in ISO format for a schedule.
   */
  private computeNextOccurrence(
    startDateStr: string,
    endDateStr: string,
    weekdays: number[],
    departureTime: string,
    now: Date = new Date(),
  ): string | null {
    const dates = getApplicableOccurrenceDates(startDateStr, endDateStr, weekdays, 14, now);
    for (const dateStr of dates) {
      const dep = new Date(`${dateStr}T${departureTime}:00+05:30`);
      if (dep.getTime() > now.getTime() + 10 * 60 * 1000) {
        return dep.toISOString();
      }
    }
    return null;
  }

  /**
   * Create a new recurring commute schedule for the authenticated driver.
   * Immediately materializes rides within the initial 14-day rolling horizon.
   */
  async createCommute(
    user: User,
    dto: CreateRecurringCommuteDto,
  ): Promise<RecurringCommuteResponseDto> {
    if (!user.audience) {
      throw new BadRequestException('Driver must have an assigned institutional audience.');
    }

    // 1. Verify vehicle ownership and capacity
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: dto.vehicleId,
        userId: user.id,
        deletedAt: null,
      },
    });

    if (!vehicle) {
      throw new BadRequestException(
        'Selected vehicle not found, does not belong to you, or has been deactivated.',
      );
    }

    const maxPassengerSeats = vehicle.capacity - 1;
    if (dto.availableSeats > maxPassengerSeats) {
      throw new BadRequestException(
        `Vehicle capacity is ${vehicle.capacity} seats (including driver). You cannot offer more than ${maxPassengerSeats} passenger seats.`,
      );
    }

    // 2. Validate dates against Asia/Kolkata calendar
    const todayStr = getKolkataTodayString();
    if (dto.endDate < todayStr) {
      throw new BadRequestException('Schedule end date cannot be in the past.');
    }
    if (dto.startDate > dto.endDate) {
      throw new BadRequestException('Schedule end date must be on or after start date.');
    }

    // 3. Persist schedule in database
    const startDateTime = new Date(`${dto.startDate}T00:00:00.000Z`);
    const endDateTime = new Date(`${dto.endDate}T00:00:00.000Z`);

    const commute = await this.prisma.recurringCommute.create({
      data: {
        driverId: user.id,
        audience: user.audience,
        vehicleId: vehicle.id,
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
        pickupDescription: dto.pickupDescription?.trim() || null,
        dropoffDescription: dto.dropoffDescription?.trim() || null,
        weekdays: dto.weekdays,
        departureTime: dto.departureTime.trim(),
        startDate: startDateTime,
        endDate: endDateTime,
        availableSeats: dto.availableSeats,
        costPerSeat: dto.costPerSeat ?? null,
        status: RecurringCommuteStatus.ACTIVE,
      },
      include: {
        driver: { select: { fullName: true } },
        vehicle: {
          select: { id: true, make: true, model: true, color: true, capacity: true },
        },
      },
    });

    // 4. Audit log creation
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'RECURRING_COMMUTE_CREATED',
      targetType: 'RECURRING_COMMUTE',
      targetId: commute.id,
      changes: {
        origin: commute.origin,
        destination: commute.destination,
        weekdays: commute.weekdays,
        departureTime: commute.departureTime,
        startDate: dto.startDate,
        endDate: dto.endDate,
        availableSeats: commute.availableSeats,
        vehicleId: commute.vehicleId,
      },
    });

    // 5. Immediately generate rides within the 14-day rolling window
    await this.generateRidesForSchedule(commute, 14);

    // 6. Fetch ride count and compute next occurrence
    const ridesCount = await this.prisma.ride.count({
      where: { recurringCommuteId: commute.id },
    });

    const nextOcc = this.computeNextOccurrence(
      dto.startDate,
      dto.endDate,
      commute.weekdays,
      commute.departureTime,
    );

    return this.toDto({ ...commute, _count: { rides: ridesCount } }, nextOcc);
  }

  /**
   * List all recurring commutes owned by the authenticated driver.
   */
  async listCommutes(user: User): Promise<RecurringCommuteResponseDto[]> {
    const commutes = await this.prisma.recurringCommute.findMany({
      where: { driverId: user.id },
      include: {
        driver: { select: { fullName: true } },
        vehicle: {
          select: { id: true, make: true, model: true, color: true, capacity: true },
        },
        _count: { select: { rides: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return commutes.map((c) => {
      const startStr = c.startDate instanceof Date
        ? c.startDate.toISOString().slice(0, 10)
        : String(c.startDate).slice(0, 10);
      const endStr = c.endDate instanceof Date
        ? c.endDate.toISOString().slice(0, 10)
        : String(c.endDate).slice(0, 10);

      const nextOcc = c.status === RecurringCommuteStatus.ACTIVE
        ? this.computeNextOccurrence(startStr, endStr, c.weekdays, c.departureTime)
        : null;

      return this.toDto(c, nextOcc);
    });
  }

  /**
   * Retrieve details of a specific recurring commute owned by the user.
   */
  async getCommuteById(user: User, id: string): Promise<RecurringCommuteResponseDto> {
    const commute = await this.prisma.recurringCommute.findUnique({
      where: { id },
      include: {
        driver: { select: { fullName: true } },
        vehicle: {
          select: { id: true, make: true, model: true, color: true, capacity: true },
        },
        _count: { select: { rides: true } },
      },
    });

    if (!commute || commute.driverId !== user.id) {
      throw new NotFoundException('Recurring commute not found.');
    }

    const startStr = commute.startDate instanceof Date
      ? commute.startDate.toISOString().slice(0, 10)
      : String(commute.startDate).slice(0, 10);
    const endStr = commute.endDate instanceof Date
      ? commute.endDate.toISOString().slice(0, 10)
      : String(commute.endDate).slice(0, 10);

    const nextOcc = commute.status === RecurringCommuteStatus.ACTIVE
      ? this.computeNextOccurrence(startStr, endStr, commute.weekdays, commute.departureTime)
      : null;

    return this.toDto(commute, nextOcc);
  }

  /**
   * Update preferences for an existing recurring commute.
   * Modifies future un-generated occurrences. Does not overwrite already generated rides.
   */
  async updateCommute(
    user: User,
    id: string,
    dto: UpdateRecurringCommuteDto,
  ): Promise<RecurringCommuteResponseDto> {
    const commute = await this.prisma.recurringCommute.findUnique({
      where: { id },
      include: {
        vehicle: true,
      },
    });

    if (!commute || commute.driverId !== user.id) {
      throw new NotFoundException('Recurring commute not found.');
    }

    if (commute.status === RecurringCommuteStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled recurring commute.');
    }

    // Validate vehicle if changed
    let vehicleIdToUse = commute.vehicleId;
    let vehicleCapacity = commute.vehicle.capacity;
    if (dto.vehicleId && dto.vehicleId !== commute.vehicleId) {
      const newVehicle = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, userId: user.id, deletedAt: null },
      });
      if (!newVehicle) {
        throw new BadRequestException('Selected vehicle not found or deactivated.');
      }
      vehicleIdToUse = newVehicle.id;
      vehicleCapacity = newVehicle.capacity;
    }

    // Validate capacity
    const seatsToOffer = dto.availableSeats ?? commute.availableSeats;
    const maxPassengerSeats = vehicleCapacity - 1;
    if (seatsToOffer > maxPassengerSeats) {
      throw new BadRequestException(
        `Vehicle capacity is ${vehicleCapacity} seats. You cannot offer more than ${maxPassengerSeats} passenger seats.`,
      );
    }

    // Validate endDate if changed
    let endDateTimeToUse = commute.endDate;
    if (dto.endDate) {
      const todayStr = getKolkataTodayString();
      if (dto.endDate < todayStr) {
        throw new BadRequestException('End date cannot be in the past.');
      }
      const startStr = commute.startDate.toISOString().slice(0, 10);
      if (dto.endDate < startStr) {
        throw new BadRequestException('End date cannot be earlier than start date.');
      }
      endDateTimeToUse = new Date(`${dto.endDate}T00:00:00.000Z`);
    }

    const updated = await this.prisma.recurringCommute.update({
      where: { id: commute.id },
      data: {
        vehicleId: vehicleIdToUse,
        availableSeats: seatsToOffer,
        costPerSeat: dto.costPerSeat !== undefined ? dto.costPerSeat : commute.costPerSeat,
        weekdays: dto.weekdays ?? commute.weekdays,
        departureTime: dto.departureTime?.trim() || commute.departureTime,
        endDate: endDateTimeToUse,
        pickupDescription: dto.pickupDescription !== undefined ? dto.pickupDescription?.trim() || null : commute.pickupDescription,
        dropoffDescription: dto.dropoffDescription !== undefined ? dto.dropoffDescription?.trim() || null : commute.dropoffDescription,
      },
      include: {
        driver: { select: { fullName: true } },
        vehicle: {
          select: { id: true, make: true, model: true, color: true, capacity: true },
        },
        _count: { select: { rides: true } },
      },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'RECURRING_COMMUTE_UPDATED',
      targetType: 'RECURRING_COMMUTE',
      targetId: updated.id,
      changes: dto as Record<string, unknown>,
    });

    // If active, materialize any newly eligible dates in horizon
    if (updated.status === RecurringCommuteStatus.ACTIVE) {
      await this.generateRidesForSchedule(updated, 14);
    }

    const startStr = updated.startDate.toISOString().slice(0, 10);
    const endStr = updated.endDate.toISOString().slice(0, 10);
    const nextOcc = updated.status === RecurringCommuteStatus.ACTIVE
      ? this.computeNextOccurrence(startStr, endStr, updated.weekdays, updated.departureTime)
      : null;

    return this.toDto(updated, nextOcc);
  }

  /**
   * Pause an active recurring commute schedule.
   * Prevents future automatic ride generation while preserving existing rides.
   */
  async pauseCommute(user: User, id: string): Promise<RecurringCommuteResponseDto> {
    const commute = await this.prisma.recurringCommute.findUnique({
      where: { id },
      include: {
        driver: { select: { fullName: true } },
        vehicle: {
          select: { id: true, make: true, model: true, color: true, capacity: true },
        },
        _count: { select: { rides: true } },
      },
    });

    if (!commute || commute.driverId !== user.id) {
      throw new NotFoundException('Recurring commute not found.');
    }

    if (commute.status !== RecurringCommuteStatus.ACTIVE) {
      throw new BadRequestException(
        `Only active recurring commutes can be paused (current status: ${commute.status}).`,
      );
    }

    const updated = await this.prisma.recurringCommute.update({
      where: { id },
      data: { status: RecurringCommuteStatus.PAUSED },
      include: {
        driver: { select: { fullName: true } },
        vehicle: {
          select: { id: true, make: true, model: true, color: true, capacity: true },
        },
        _count: { select: { rides: true } },
      },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'RECURRING_COMMUTE_PAUSED',
      targetType: 'RECURRING_COMMUTE',
      targetId: id,
    });

    return this.toDto(updated, null);
  }

  /**
   * Resume a paused recurring commute schedule.
   * Immediately resumes ride generation for future dates without creating past backlogs.
   */
  async resumeCommute(user: User, id: string): Promise<RecurringCommuteResponseDto> {
    const commute = await this.prisma.recurringCommute.findUnique({
      where: { id },
      include: {
        driver: { select: { fullName: true } },
        vehicle: {
          select: { id: true, make: true, model: true, color: true, capacity: true },
        },
        _count: { select: { rides: true } },
      },
    });

    if (!commute || commute.driverId !== user.id) {
      throw new NotFoundException('Recurring commute not found.');
    }

    if (commute.status !== RecurringCommuteStatus.PAUSED) {
      throw new BadRequestException(
        `Only paused recurring commutes can be resumed (current status: ${commute.status}).`,
      );
    }

    const todayStr = getKolkataTodayString();
    const endStr = commute.endDate.toISOString().slice(0, 10);
    if (endStr < todayStr) {
      throw new BadRequestException(
        'Cannot resume an expired schedule. The schedule end date has already passed.',
      );
    }

    const updated = await this.prisma.recurringCommute.update({
      where: { id },
      data: { status: RecurringCommuteStatus.ACTIVE },
      include: {
        driver: { select: { fullName: true } },
        vehicle: {
          select: { id: true, make: true, model: true, color: true, capacity: true },
        },
        _count: { select: { rides: true } },
      },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'RECURRING_COMMUTE_RESUMED',
      targetType: 'RECURRING_COMMUTE',
      targetId: id,
    });

    // Materialize remaining future rides
    await this.generateRidesForSchedule(updated, 14);

    const startStr = updated.startDate.toISOString().slice(0, 10);
    const nextOcc = this.computeNextOccurrence(startStr, endStr, updated.weekdays, updated.departureTime);

    return this.toDto(updated, nextOcc);
  }

  /**
   * Cancel a recurring commute schedule.
   * Stops all future ride generation. Does not delete already generated rides or their bookings.
   */
  async cancelCommute(user: User, id: string): Promise<RecurringCommuteResponseDto> {
    const commute = await this.prisma.recurringCommute.findUnique({
      where: { id },
      include: {
        driver: { select: { fullName: true } },
        vehicle: {
          select: { id: true, make: true, model: true, color: true, capacity: true },
        },
        _count: { select: { rides: true } },
      },
    });

    if (!commute || commute.driverId !== user.id) {
      throw new NotFoundException('Recurring commute not found.');
    }

    if (commute.status === RecurringCommuteStatus.CANCELLED) {
      throw new BadRequestException('Schedule is already cancelled.');
    }

    const updated = await this.prisma.recurringCommute.update({
      where: { id },
      data: { status: RecurringCommuteStatus.CANCELLED },
      include: {
        driver: { select: { fullName: true } },
        vehicle: {
          select: { id: true, make: true, model: true, color: true, capacity: true },
        },
        _count: { select: { rides: true } },
      },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'RECURRING_COMMUTE_CANCELLED',
      targetType: 'RECURRING_COMMUTE',
      targetId: id,
    });

    return this.toDto(updated, null);
  }

  /**
   * Materialize individual rides for a single schedule within the configured future window.
   * Concurrency-safe, idempotent, and resilient against race conditions.
   */
  async generateRidesForSchedule(
    commute: RecurringCommute,
    horizonDays = 14,
    now: Date = new Date(),
  ): Promise<{ created: number; skipped: number }> {
    if (commute.status !== RecurringCommuteStatus.ACTIVE) {
      return { created: 0, skipped: 0 };
    }

    const startDateStr = commute.startDate instanceof Date
      ? commute.startDate.toISOString().slice(0, 10)
      : String(commute.startDate).slice(0, 10);

    const endDateStr = commute.endDate instanceof Date
      ? commute.endDate.toISOString().slice(0, 10)
      : String(commute.endDate).slice(0, 10);

    const applicableDates = getApplicableOccurrenceDates(
      startDateStr,
      endDateStr,
      commute.weekdays,
      horizonDays,
      now,
    );

    let created = 0;
    let skipped = 0;

    for (const dateStr of applicableDates) {
      // 1. Departure time in Asia/Kolkata
      const departureTime = new Date(`${dateStr}T${commute.departureTime}:00+05:30`);

      // 2. Reject if departure time is not at least 10 minutes in the future
      if (departureTime.getTime() <= now.getTime() + 10 * 60 * 1000) {
        skipped++;
        continue;
      }

      // 3. PostgreSQL Date representation for the scheduled occurrence
      const scheduledOccurrence = new Date(`${dateStr}T00:00:00.000Z`);

      // 4. Check if a ride already exists for this schedule occurrence
      // (Even if cancelled, we intentionally do NOT recreate an occurrence that the driver cancelled)
      const existing = await this.prisma.ride.findFirst({
        where: {
          recurringCommuteId: commute.id,
          scheduledOccurrence,
        },
        select: { id: true, status: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // 5. Attempt creation with database-backed unique occurrence protection
      try {
        const ride = await this.prisma.ride.create({
          data: {
            driverId: commute.driverId,
            vehicleId: commute.vehicleId,
            audience: commute.audience,
            origin: commute.origin,
            originAddress: commute.originAddress,
            originLatitude: commute.originLatitude,
            originLongitude: commute.originLongitude,
            originPlaceId: commute.originPlaceId,
            destination: commute.destination,
            destinationAddress: commute.destinationAddress,
            destinationLatitude: commute.destinationLatitude,
            destinationLongitude: commute.destinationLongitude,
            destinationPlaceId: commute.destinationPlaceId,
            pickupDescription: commute.pickupDescription,
            dropoffDescription: commute.dropoffDescription,
            departureTime,
            availableSeats: commute.availableSeats,
            totalSeats: commute.availableSeats,
            costPerSeat: commute.costPerSeat,
            status: RideStatus.SCHEDULED,
            recurringCommuteId: commute.id,
            scheduledOccurrence,
          },
        });

        await this.audit.log({
          actorId: commute.driverId,
          action: 'RIDE_GENERATED_FROM_COMMUTE',
          targetType: 'RIDE',
          targetId: ride.id,
          changes: {
            recurringCommuteId: commute.id,
            scheduledOccurrence: dateStr,
            origin: commute.origin,
            destination: commute.destination,
            departureTime: departureTime.toISOString(),
          },
        });

        created++;
      } catch (err: unknown) {
        // Concurrency safety: handle unique constraint collision (P2002) from another concurrent worker
        if (
          (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') ||
          (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002')
        ) {
          this.logger.debug(
            `[RecurringCommute] Occurrence ${dateStr} for schedule ${commute.id} was generated by a concurrent process.`,
          );
          skipped++;
        } else {
          this.logger.error(
            `[RecurringCommute] Error generating ride for schedule ${commute.id} on date ${dateStr}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          // Do not fail entire schedule if one occurrence encounters an error
        }
      }
    }

    return { created, skipped };
  }

  /**
   * Scans all active recurring commutes and materializes upcoming occurrences.
   * Called periodically by the scheduler and exposed for manual/testing invocation.
   */
  async generateAllActiveCommutes(
    horizonDays = 14,
    now: Date = new Date(),
  ): Promise<{ totalSchedules: number; totalCreated: number; totalSkipped: number }> {
    const activeCommutes = await this.prisma.recurringCommute.findMany({
      where: { status: RecurringCommuteStatus.ACTIVE },
    });

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const commute of activeCommutes) {
      try {
        const { created, skipped } = await this.generateRidesForSchedule(commute, horizonDays, now);
        totalCreated += created;
        totalSkipped += skipped;
      } catch (err: unknown) {
        this.logger.error(
          `[RecurringCommute] Unexpected error processing schedule ${commute.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return {
      totalSchedules: activeCommutes.length,
      totalCreated,
      totalSkipped,
    };
  }
}
