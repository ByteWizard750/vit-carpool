import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { RecurringCommutesController } from './recurring-commutes.controller';
import { RecurringCommutesService } from './recurring-commutes.service';
import { RecurringCommuteSchedulerService } from './recurring-commutes.scheduler.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [RecurringCommutesController],
  providers: [RecurringCommutesService, RecurringCommuteSchedulerService],
  exports: [RecurringCommutesService, RecurringCommuteSchedulerService],
})
export class RecurringCommutesModule {}
