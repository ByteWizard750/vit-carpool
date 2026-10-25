import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { VerificationModule } from '../verification/verification.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [VerificationModule, UsersModule],
  controllers: [AdminController],
})
export class AdminModule {}
