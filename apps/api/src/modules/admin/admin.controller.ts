import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminPermissionsGuard } from '../auth/guards/admin-permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { VerificationService } from '../verification/verification.service';
import { VerificationPurgeService } from '../verification/verification-purge.service';
import { UsersService } from '../users/users.service';
import { AdminService } from './admin.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  User,
  VerificationRequestStatus,
  ReportStatus,
  ReportCategory,
  RideStatus,
  BookingStatus,
  Audience,
} from '@vit-carpool/db';
import {
  AdminPermission,
  ReviewVerificationRequestSchema,
  UpdateUserRoleSchema,
  ResolveReportSchema,
  SuspendUserSchema,
  AdminCancelRideSchema,
  InviteAdminSchema,
  CreateModerationNoteSchema,
} from '@vit-carpool/contracts';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminPermissionsGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly verificationPurgeService: VerificationPurgeService,
    private readonly usersService: UsersService,
    private readonly adminService: AdminService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. Overview & Operational KPIs
  // ---------------------------------------------------------------------------

  @Get('overview')
  @RequirePermissions(AdminPermission.USER_READ)
  @ApiOperation({ summary: 'Get operational KPIs and dashboard overview metrics' })
  async getOverview() {
    return this.adminService.getOverviewStats();
  }

  // ---------------------------------------------------------------------------
  // 2. Verification Queue & Retention Purge
  // ---------------------------------------------------------------------------

  @Get('verification-requests')
  @RequirePermissions(AdminPermission.USER_READ)
  @ApiOperation({ summary: 'List verification requests (Staff only)' })
  @ApiQuery({ name: 'status', enum: VerificationRequestStatus, required: false })
  async listVerificationRequests(
    @Query('status') status?: VerificationRequestStatus,
  ) {
    return this.verificationService.listRequests(status);
  }

  @Post('verification-requests/:id/review')
  @RequirePermissions(AdminPermission.USER_MODERATE)
  @ApiOperation({ summary: 'Review and approve or reject verification request (Staff only)' })
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
  @RequirePermissions(AdminPermission.USER_MODERATE)
  @ApiOperation({ summary: 'Purge verification documents older than 30 days post-review' })
  async purgeExpiredDocuments() {
    return this.verificationPurgeService.purgeExpiredDocuments();
  }

  // ---------------------------------------------------------------------------
  // 3. Incident Reports Queue
  // ---------------------------------------------------------------------------

  @Get('reports')
  @RequirePermissions(AdminPermission.REPORT_READ)
  @ApiOperation({ summary: 'List incident reports with filtering and pagination' })
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
  @RequirePermissions(AdminPermission.REPORT_READ)
  @ApiOperation({ summary: 'Get detailed incident report context' })
  async getReportById(@Param('id') id: string) {
    return this.adminService.getReportById(id);
  }

  @Post('reports/:id/investigate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AdminPermission.REPORT_RESOLVE)
  @ApiOperation({ summary: 'Mark incident report as investigating' })
  async investigateReport(
    @CurrentUser() adminUser: User,
    @Param('id') id: string,
  ) {
    return this.adminService.investigateReport(adminUser, id);
  }

  @Post('reports/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AdminPermission.REPORT_RESOLVE)
  @ApiOperation({ summary: 'Resolve or dismiss incident report with notes' })
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
  // 4. User Management & Account Suspension
  // ---------------------------------------------------------------------------

  @Get('users')
  @RequirePermissions(AdminPermission.USER_READ)
  @ApiOperation({ summary: 'Search and list users with pagination' })
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
  @RequirePermissions(AdminPermission.USER_SUSPEND)
  @ApiOperation({ summary: 'Suspend a user account with mandatory reason' })
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
  @RequirePermissions(AdminPermission.USER_SUSPEND)
  @ApiOperation({ summary: 'Reinstate a suspended user account' })
  async reinstateUser(
    @CurrentUser() adminUser: User,
    @Param('id') id: string,
  ) {
    return this.adminService.reinstateUser(adminUser, id);
  }

  @Post('users/:id/role')
  @RequirePermissions(AdminPermission.ADMIN_MANAGE)
  @ApiOperation({ summary: 'Update user role (SUPER_ADMIN only; cannot self-demote)' })
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
      parsed.data.role as any,
      parsed.data.reason,
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Ride Oversight & Administrative Cancellation
  // ---------------------------------------------------------------------------

  @Get('rides')
  @RequirePermissions(AdminPermission.RIDE_READ)
  @ApiOperation({ summary: 'Search and filter platform rides with booking/driver details' })
  @ApiQuery({ name: 'search', type: String, required: false })
  @ApiQuery({ name: 'status', enum: RideStatus, required: false })
  @ApiQuery({ name: 'audience', enum: Audience, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async listRides(
    @Query('search') search?: string,
    @Query('status') status?: RideStatus,
    @Query('audience') audience?: Audience,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listRides({
      search,
      status,
      audience,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('rides/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AdminPermission.RIDE_MODERATE)
  @ApiOperation({ summary: 'Administratively cancel a ride with reason and notify participants' })
  async cancelRide(
    @CurrentUser() adminUser: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = AdminCancelRideSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: parsed.error.errors.map((e) => e.message).join('; '),
      });
    }
    return this.adminService.cancelRide(adminUser, id, parsed.data.reason);
  }

  // ---------------------------------------------------------------------------
  // 6. Booking Oversight
  // ---------------------------------------------------------------------------

  @Get('bookings')
  @RequirePermissions(AdminPermission.BOOKING_READ)
  @ApiOperation({ summary: 'View and filter all ride bookings across the platform' })
  @ApiQuery({ name: 'status', enum: BookingStatus, required: false })
  @ApiQuery({ name: 'search', type: String, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async listBookings(
    @Query('status') status?: BookingStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listBookings({
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // 7. Audit Logs
  // ---------------------------------------------------------------------------

  @Get('audit-logs')
  @RequirePermissions(AdminPermission.AUDIT_READ)
  @ApiOperation({ summary: 'Retrieve durable audit logs with filtering' })
  @ApiQuery({ name: 'action', type: String, required: false })
  @ApiQuery({ name: 'targetType', type: String, required: false })
  @ApiQuery({ name: 'search', type: String, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async listAuditLogs(
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listAuditLogs({
      action,
      targetType,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // 8. Analytics
  // ---------------------------------------------------------------------------

  @Get('analytics')
  @RequirePermissions(AdminPermission.ANALYTICS_READ)
  @ApiOperation({ summary: 'Get operational analytics and conversion rates' })
  async getAnalytics() {
    return this.adminService.getAnalytics();
  }

  // ---------------------------------------------------------------------------
  // 9. System Health
  // ---------------------------------------------------------------------------

  @Get('health')
  @RequirePermissions(AdminPermission.SYSTEM_HEALTH_READ)
  @ApiOperation({ summary: 'Get live system diagnostics for all platform components' })
  async getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  // ---------------------------------------------------------------------------
  // 10. Administrator Team Management (SUPER_ADMIN)
  // ---------------------------------------------------------------------------

  @Get('administrators')
  @RequirePermissions(AdminPermission.ADMIN_MANAGE)
  @ApiOperation({ summary: 'List active staff administrators and pending invitations' })
  async listAdministrators() {
    return this.adminService.listAdministrators();
  }

  @Post('administrators/invite')
  @RequirePermissions(AdminPermission.ADMIN_INVITE)
  @ApiOperation({ summary: 'Invite a new administrator with role assignment' })
  async inviteAdministrator(
    @CurrentUser() adminUser: User,
    @Body() body: unknown,
  ) {
    const parsed = InviteAdminSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: parsed.error.errors.map((e) => e.message).join('; '),
      });
    }
    return this.adminService.inviteAdministrator(adminUser, parsed.data);
  }

  @Post('administrators/:id/revoke')
  @RequirePermissions(AdminPermission.ADMIN_MANAGE)
  @ApiOperation({ summary: 'Revoke administrator privileges and revert to user' })
  async revokeAdministrator(
    @CurrentUser() adminUser: User,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A valid reason (min 5 chars) is required to revoke administrative access.');
    }
    return this.adminService.revokeAdministrator(adminUser, id, reason);
  }

  @Delete('administrators/:id')
  @RequirePermissions(AdminPermission.ADMIN_MANAGE)
  @ApiOperation({ summary: 'Revoke administrator privileges via DELETE' })
  async revokeAdministratorDelete(
    @CurrentUser() adminUser: User,
    @Param('id') id: string,
    @Query('reason') reasonQuery?: string,
    @Body('reason') reasonBody?: string,
  ) {
    const reason = reasonQuery || reasonBody;
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A valid reason (min 5 chars) is required to revoke administrative access.');
    }
    return this.adminService.revokeAdministrator(adminUser, id, reason);
  }

  // ---------------------------------------------------------------------------
  // 11. Internal Moderation Notes
  // ---------------------------------------------------------------------------

  @Post('notes')
  @RequirePermissions(AdminPermission.USER_MODERATE)
  @ApiOperation({ summary: 'Create internal moderation note on user, ride, or report' })
  async createModerationNote(
    @CurrentUser() adminUser: User,
    @Body() body: unknown,
  ) {
    const parsed = CreateModerationNoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: parsed.error.errors.map((e) => e.message).join('; '),
      });
    }
    return this.adminService.createModerationNote(adminUser, parsed.data);
  }

  @Get('notes')
  @RequirePermissions(AdminPermission.USER_READ)
  @ApiOperation({ summary: 'List internal moderation notes' })
  @ApiQuery({ name: 'targetUserId', required: false })
  @ApiQuery({ name: 'targetRideId', required: false })
  @ApiQuery({ name: 'targetReportId', required: false })
  async listModerationNotes(
    @Query('targetUserId') targetUserId?: string,
    @Query('targetRideId') targetRideId?: string,
    @Query('targetReportId') targetReportId?: string,
  ) {
    return this.adminService.listModerationNotes({
      targetUserId,
      targetRideId,
      targetReportId,
    });
  }
}
