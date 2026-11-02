import { Module } from '@nestjs/common';
import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';
import { TrackingAuthService } from './tracking-auth.service';
import { TrackingAccessService } from './tracking-access.service';
import { TrackingController } from './tracking.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { LocationsModule } from '../locations/locations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    LocationsModule,
    NotificationsModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [TrackingController],
  providers: [
    TrackingGateway,
    TrackingService,
    TrackingAuthService,
    TrackingAccessService,
  ],
  exports: [TrackingGateway, TrackingService, TrackingAccessService],
})
export class TrackingModule {}
