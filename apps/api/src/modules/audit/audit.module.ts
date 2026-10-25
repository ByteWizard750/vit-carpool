import { Module, Global } from '@nestjs/common';
import { AuditLogService } from './audit.service';
import { PrismaService } from '../../prisma/prisma.service';

@Global()
@Module({
  providers: [AuditLogService, PrismaService],
  exports: [AuditLogService],
})
export class AuditModule {}
