import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';
import { TrackingAuthService } from '../tracking/tracking-auth.service';

@Module({
  providers: [EventsGateway, EventsService, TrackingAuthService],
  exports: [EventsGateway, EventsService],
})
export class EventsModule {}
