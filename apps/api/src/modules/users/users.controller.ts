import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AllowSuspended } from '../auth/decorators/allow-suspended.decorator';
import { User } from '@vit-carpool/db';
import {
  UserProfileResponseDto,
  UpdateUserProfileSchema,
} from '@vit-carpool/contracts';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @AllowSuspended()
  @ApiOperation({ summary: 'Get current authenticated user profile and verification status' })
  getProfile(@CurrentUser() user: User): UserProfileResponseDto {
    return this.usersService.mapToUserProfileDto(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update profile details (name, phone, avatarUrl)' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<UserProfileResponseDto> {
    const parsed = UpdateUserProfileSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException(messages.join('; '));
    }
    return this.usersService.updateProfile(user, parsed.data);
  }

  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload profile picture (JPEG, PNG, WebP up to 5MB)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ avatarUrl: string | null; user: UserProfileResponseDto }> {
    if (!file) {
      throw new BadRequestException('No image file uploaded');
    }
    const updated = await this.usersService.updateAvatar(user, file);
    return { avatarUrl: updated.avatarUrl ?? null, user: updated };
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Remove profile picture' })
  async deleteAvatar(
    @CurrentUser() user: User,
  ): Promise<{ success: boolean; user: UserProfileResponseDto }> {
    const updated = await this.usersService.deleteAvatar(user);
    return { success: true, user: updated };
  }
}
