import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { VerifiedUserGuard } from './guards/verified-user.guard';
import { AdminGuard } from './guards/admin.guard';
import { AudienceGuard } from './guards/audience.guard';
import { AuthRateLimiterGuard } from './guards/auth-rate-limiter.guard';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { VerificationModule } from '../verification/verification.module';

import { JwksService } from './jwks.service';

import { AuthService } from './auth.service';
import { EmailService } from './email.service';

@Global()
@Module({
  imports: [UsersModule, VerificationModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailService,
    JwksService,
    AuthRateLimiterGuard,
    SupabaseAuthGuard,
    VerifiedUserGuard,
    AdminGuard,
    AudienceGuard,
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
  ],
  exports: [
    AuthService,
    EmailService,
    JwksService,
    AuthRateLimiterGuard,
    SupabaseAuthGuard,
    VerifiedUserGuard,
    AdminGuard,
    AudienceGuard,
  ],
})
export class AuthModule {}

