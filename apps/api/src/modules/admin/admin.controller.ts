import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { VerificationService } from '../verification/verification.service';
import { VerificationPurgeService } from '../verification/verification-purge.service';
import { UsersService } from '../users/users.service';
import { AdminService } from './admin.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, VerificationRequestStatus, ReportStatus, ReportCategory } from '@vit-carpool/db';
import {
  ReviewVerificationRequestSchema,
  UpdateUserRoleSchema,
  ResolveReportSchema,
  SuspendUserSchema,
} from '@vit-carpool/contracts';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly verificationPurgeService: VerificationPurgeService,
    private readonly usersService: UsersService,
    private readonly adminService: AdminService,
  ) {}

  // ---------------------------------------------------------------------------
  // Verification Queue & Retention Purge
  // ---------------------------------------------------------------------------

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

  @Post('verification-requests/purge-expired')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Purge verification documents older than 30 days post-review (Admin only)' })
  async purgeExpiredDocuments() {
    return this.verificationPurgeService.purgeExpiredDocuments();
  }

  // ---------------------------------------------------------------------------
  // Incident Reports Queue
  // ---------------------------------------------------------------------------

  @Get('reports')
  @ApiOperation({ summary: 'List incident reports with filtering and pagination (Admin only)' })
  @ApiQuery({ name: 'status', enum: ReportStatus, required: false })
  @ApiQuery({ name: 'category', enum: ReportCategory, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async listReports(
    @Query('status') status?: ReportStatus,
    @Query('category') category?: ReportCategory,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listReports({
      status,
      category,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Get detailed incident report context (Admin only)' })
  async getReportById(@Param('id') id: string) {
    return this.adminService.getReportById(id);
  }

  @Post('reports/:id/investigate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark incident report as investigating (Admin only)' })
  async investigateReport(
    @CurrentUser() adminUser: User,
    @Param('id') id: string,
  ) {
    return this.adminService.investigateReport(adminUser, id);
  }

  @Post('reports/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve or dismiss incident report with notes (Admin only)' })
  async resolveReport(
    @CurrentUser() adminUser: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = ResolveReportSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }
    return this.adminService.resolveReport(adminUser, id, parsed.data);
  }

  // ---------------------------------------------------------------------------
  // User Management & Account Suspension
  // ---------------------------------------------------------------------------

  @Get('users')
  @ApiOperation({ summary: 'Search and list users with pagination (Admin only)' })
  @ApiQuery({ name: 'search', type: String, required: false })
  @ApiQuery({ name: 'status', type: String, required: false })
  @ApiQuery({ name: 'role', type: String, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async listUsers(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listUsers({
      search,
      status,
      role,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a user account with mandatory reason (Admin only)' })
  async suspendUser(
    @CurrentUser() adminUser: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = SuspendUserSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }
    return this.adminService.suspendUser(adminUser, id, parsed.data);
  }

  @Post('users/:id/reinstate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reinstate a suspended user account (Admin only)' })
  async reinstateUser(
    @CurrentUser() adminUser: User,
    @Param('id') id: string,
  ) {
    return this.adminService.reinstateUser(adminUser, id);
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
