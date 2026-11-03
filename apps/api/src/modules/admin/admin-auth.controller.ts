import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { AuthRateLimiterGuard } from '../auth/guards/auth-rate-limiter.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@vit-carpool/db';
import {
  AdminLoginRequestSchema,
  AdminVerifyMfaRequestSchema,
  AcceptAdminInviteSchema,
} from '@vit-carpool/contracts';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimiterGuard)
  @ApiOperation({ summary: 'Initiate dedicated administrative login with 2FA' })
  async login(@Body() body: unknown, @Req() req: Request) {
    const parsed = AdminLoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: parsed.error.errors.map((e) => e.message).join('; '),
      });
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
    const userAgent = req.headers['user-agent'];

    return this.adminAuthService.login(parsed.data.email, ip, userAgent);
  }

  @Public()
  @Post('verify-mfa')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimiterGuard)
  @ApiOperation({ summary: 'Verify admin 2FA challenge and receive elevated session JWT' })
  async verifyMfa(@Body() body: unknown, @Req() req: Request) {
    const parsed = AdminVerifyMfaRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: parsed.error.errors.map((e) => e.message).join('; '),
      });
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
    const userAgent = req.headers['user-agent'];

    return this.adminAuthService.verifyMfa(
      parsed.data.email,
      parsed.data.code,
      ip,
      userAgent,
    );
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an administrator invitation and activate staff access' })
  async acceptInvite(@Body() body: unknown, @Req() req: Request) {
    const parsed = AcceptAdminInviteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: parsed.error.errors.map((e) => e.message).join('; '),
      });
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
    const userAgent = req.headers['user-agent'];

    return this.adminAuthService.acceptInvite(parsed.data, ip, userAgent);
  }

  @Get('me')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get authenticated administrator profile and permissions' })
  async getMe(@CurrentUser() adminUser: User) {
    return this.adminAuthService.getMe(adminUser);
  }
}
