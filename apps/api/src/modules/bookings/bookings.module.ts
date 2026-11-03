import { Module, forwardRef } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BoardingOtpService } from './boarding-otp.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [AuditModule, NotificationsModule, forwardRef(() => TrackingModule)],
  controllers: [BookingsController],
  providers: [BookingsService, BoardingOtpService],
  exports: [BookingsService, BoardingOtpService],
})
export class BookingsModule {}
