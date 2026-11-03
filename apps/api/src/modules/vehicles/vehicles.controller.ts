import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { VehiclesService } from './vehicles.service';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@vit-carpool/db';
import {
  CreateVehicleSchema,
  UpdateVehicleSchema,
  VehicleResponseDto,
} from '@vit-carpool/contracts';

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new vehicle (Verified users only)' })
  async createVehicle(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<VehicleResponseDto> {
    const parsed = CreateVehicleSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.vehiclesService.createVehicle(user, parsed.data);
  }

  @Get()
  @ApiOperation({ summary: 'List all vehicles owned by current authenticated user' })
  async listMyVehicles(@CurrentUser() user: User): Promise<VehicleResponseDto[]> {
    return this.vehiclesService.listMyVehicles(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific vehicle owned by current user' })
  async getMyVehicle(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<VehicleResponseDto> {
    return this.vehiclesService.getMyVehicleById(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update details of a vehicle owned by current user' })
  async updateMyVehicle(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<VehicleResponseDto> {
    const parsed = UpdateVehicleSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.vehiclesService.updateMyVehicle(user, id, parsed.data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a vehicle owned by current user' })
  async deleteMyVehicle(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.vehiclesService.deleteMyVehicle(user, id);
  }

  @Post(':id/image')
  @ApiOperation({ summary: 'Upload vehicle photo (JPEG, PNG, WebP up to 5MB)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadVehicleImage(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ imageUrl: string | null; vehicle: VehicleResponseDto }> {
    if (!file) {
      throw new BadRequestException('No image file uploaded');
    }
    const updated = await this.vehiclesService.updateVehicleImage(user, id, file);
    return { imageUrl: updated.imageUrl ?? null, vehicle: updated };
  }

  @Delete(':id/image')
  @ApiOperation({ summary: 'Remove vehicle photo' })
  async deleteVehicleImage(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ success: boolean; vehicle: VehicleResponseDto }> {
    const updated = await this.vehiclesService.deleteVehicleImage(user, id);
    return { success: true, vehicle: updated };
  }
}
