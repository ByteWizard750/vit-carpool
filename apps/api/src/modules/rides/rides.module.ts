import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { AuditModule } from '../audit/audit.module';
import { RatingsModule } from '../ratings/ratings.module';

@Module({
  imports: [AuditModule, RatingsModule],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}
