import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LocationRateLimiterGuard } from './guards/location-rate-limiter.guard';

@Module({
  controllers: [LocationsController],
  providers: [LocationsService, LocationRateLimiterGuard],
  exports: [LocationsService, LocationRateLimiterGuard],
})
export class LocationsModule {}
