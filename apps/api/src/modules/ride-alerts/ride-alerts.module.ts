import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RideAlertsService } from './ride-alerts.service';
import { RideAlertsMatcherService } from './ride-alerts-matcher.service';
import { RideAlertsController } from './ride-alerts.controller';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  controllers: [RideAlertsController],
  providers: [RideAlertsService, RideAlertsMatcherService],
  exports: [RideAlertsService, RideAlertsMatcherService],
})
export class RideAlertsModule {}
