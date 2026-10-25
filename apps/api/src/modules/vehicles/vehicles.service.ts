import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { Prisma, User, Vehicle } from '@vit-carpool/db';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleResponseDto,
} from '@vit-carpool/contracts';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Helper to format vehicle database entity to DTO.
   */
  private toDto(vehicle: Vehicle): VehicleResponseDto {
    return {
      id: vehicle.id,
      userId: vehicle.userId,
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color,
      registrationNumber: vehicle.registrationNumber,
      capacity: vehicle.capacity,
      createdAt: vehicle.createdAt.toISOString(),
      updatedAt: vehicle.updatedAt.toISOString(),
    };
  }

  /**
   * Register a new vehicle for the authenticated, verified user.
   */
  async createVehicle(user: User, dto: CreateVehicleDto): Promise<VehicleResponseDto> {
    const normalizedRegNo = dto.registrationNumber.trim().toUpperCase().replace(/[\s-]/g, '');

    // Check if an active vehicle with this registration number is already registered
    const existing = await this.prisma.vehicle.findFirst({
      where: {
        registrationNumber: normalizedRegNo,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException({
        error: 'VEHICLE_ALREADY_REGISTERED',
        message: 'A vehicle with this registration number is already registered on the platform.',
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const vehicle = await tx.vehicle.create({
          data: {
            userId: user.id,
            make: dto.make.trim(),
            model: dto.model.trim(),
            color: dto.color.trim(),
            registrationNumber: normalizedRegNo,
            capacity: dto.capacity,
          },
        });

        await this.audit.log(
          {
            actorId: user.id,
            actorRole: user.role,
            action: 'VEHICLE_REGISTERED',
            targetType: 'VEHICLE',
            targetId: vehicle.id,
            changes: {
              make: vehicle.make,
              model: vehicle.model,
              color: vehicle.color,
              registrationNumber: vehicle.registrationNumber,
              capacity: vehicle.capacity,
            },
          },
          tx,
        );

        return this.toDto(vehicle);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          error: 'VEHICLE_ALREADY_REGISTERED',
          message: 'A vehicle with this registration number is already registered on the platform.',
        });
      }
      throw error;
    }
  }

  /**
   * List active vehicles owned by the authenticated user.
   */
  async listMyVehicles(user: User): Promise<VehicleResponseDto[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return vehicles.map((v) => this.toDto(v));
  }

  /**
   * Retrieve a specific vehicle owned by the authenticated user.
   * If the vehicle does not exist or belongs to another user, throws 404.
   */
  async getMyVehicleById(user: User, vehicleId: string): Promise<VehicleResponseDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        userId: user.id,
        deletedAt: null,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found or you do not have permission to access it.');
    }

    return this.toDto(vehicle);
  }

  /**
   * Update details of an existing vehicle owned by the authenticated user.
   */
  async updateMyVehicle(
    user: User,
    vehicleId: string,
    dto: UpdateVehicleDto,
  ): Promise<VehicleResponseDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        userId: user.id,
        deletedAt: null,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found or you do not have permission to access it.');
    }

    const dataToUpdate: Record<string, any> = {};

    if (dto.make !== undefined) dataToUpdate.make = dto.make.trim();
    if (dto.model !== undefined) dataToUpdate.model = dto.model.trim();
    if (dto.color !== undefined) dataToUpdate.color = dto.color.trim();
    if (dto.capacity !== undefined) dataToUpdate.capacity = dto.capacity;

    if (dto.registrationNumber !== undefined) {
      const normalizedRegNo = dto.registrationNumber.trim().toUpperCase().replace(/[\s-]/g, '');
      if (normalizedRegNo !== vehicle.registrationNumber) {
        const conflict = await this.prisma.vehicle.findFirst({
          where: {
            registrationNumber: normalizedRegNo,
            deletedAt: null,
            NOT: { id: vehicleId },
          },
        });

        if (conflict) {
          throw new ConflictException({
            error: 'VEHICLE_ALREADY_REGISTERED',
            message: 'A vehicle with this registration number is already registered on the platform.',
          });
        }

        dataToUpdate.registrationNumber = normalizedRegNo;
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.vehicle.update({
          where: { id: vehicleId },
          data: dataToUpdate,
        });

        await this.audit.log(
          {
            actorId: user.id,
            actorRole: user.role,
            action: 'VEHICLE_UPDATED',
            targetType: 'VEHICLE',
            targetId: vehicleId,
            changes: dataToUpdate,
          },
          tx,
        );

        return this.toDto(updated);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          error: 'VEHICLE_ALREADY_REGISTERED',
          message: 'A vehicle with this registration number is already registered on the platform.',
        });
      }
      throw error;
    }
  }

  /**
   * Safely delete a vehicle owned by the authenticated user.
   * Employs soft deletion to preserve relational integrity with historical rides.
   */
  async deleteMyVehicle(user: User, vehicleId: string): Promise<{ success: boolean; message: string }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        userId: user.id,
        deletedAt: null,
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found or you do not have permission to access it.');
    }

    // Milestone 3.2: Prevent vehicle removal if scheduled upcoming rides reference it
    const activeScheduledRides = await this.prisma.ride.count({
      where: {
        vehicleId,
        status: 'SCHEDULED',
        departureTime: { gt: new Date() },
      },
    });

    if (activeScheduledRides > 0) {
      throw new ConflictException({
        error: 'VEHICLE_HAS_SCHEDULED_RIDES',
        message: 'Cannot remove a vehicle that has scheduled upcoming rides. Please complete or cancel the rides first.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { deletedAt: new Date() },
      });

      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'VEHICLE_DELETED',
          targetType: 'VEHICLE',
          targetId: vehicleId,
          changes: {
            deletedAt: new Date().toISOString(),
          },
        },
        tx,
      );
    });

    return {
      success: true,
      message: 'Vehicle successfully removed from your registered vehicles.',
    };
  }
}
