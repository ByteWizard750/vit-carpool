import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AllowSuspended } from '../auth/decorators/allow-suspended.decorator';
import { User } from '@vit-carpool/db';
import { UserProfileResponseDto } from '@vit-carpool/contracts';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  @Get('me')
  @AllowSuspended()
  @ApiOperation({ summary: 'Get current authenticated user profile and verification status' })
  getProfile(@CurrentUser() user: User): UserProfileResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      audience: user.audience,
      verificationStatus: user.verificationStatus,
      verificationMethod: user.verificationMethod,
      verifiedAt: user.verifiedAt ? user.verifiedAt.toISOString() : null,
      role: user.role,
      isSuspended: user.isSuspended,
      suspensionReason: user.suspensionReason,
      suspendedAt: user.suspendedAt ? user.suspendedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
