import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { VerificationService } from '../verification/verification.service';
import { UsersService } from '../users/users.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, VerificationRequestStatus } from '@vit-carpool/db';
import {
  ReviewVerificationRequestSchema,
  UpdateUserRoleSchema,
} from '@vit-carpool/contracts';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly usersService: UsersService,
  ) {}

  @Get('verification-requests')
  @ApiOperation({ summary: 'List verification requests (Admin only)' })
  @ApiQuery({ name: 'status', enum: VerificationRequestStatus, required: false })
  async listVerificationRequests(
    @Query('status') status?: VerificationRequestStatus,
  ) {
    return this.verificationService.listRequests(status);
  }

  @Post('verification-requests/:id/review')
  @ApiOperation({ summary: 'Review and approve or reject verification request (Admin only)' })
  async reviewVerificationRequest(
    @CurrentUser() adminUser: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = ReviewVerificationRequestSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }
    return this.verificationService.reviewRequest(adminUser, id, parsed.data);
  }

  @Post('users/:id/role')
  @ApiOperation({ summary: 'Update user role (Admin only; cannot self-demote)' })
  async updateUserRole(
    @CurrentUser() adminUser: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateUserRoleSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }
    return this.usersService.updateUserRole(
      adminUser,
      id,
      parsed.data.role,
      parsed.data.reason,
    );
  }
}
