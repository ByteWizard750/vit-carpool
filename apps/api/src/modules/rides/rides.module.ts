import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { AuditModule } from '../audit/audit.module';
import { RatingsModule } from '../ratings/ratings.module';
import { RideAlertsModule } from '../ride-alerts/ride-alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditModule, RatingsModule, RideAlertsModule, NotificationsModule],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}
