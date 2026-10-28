import { Module } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { EmailClassifierService } from './email-classifier.service';
import { VerificationPurgeService } from './verification-purge.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [VerificationController],
  providers: [
    VerificationService,
    VerificationPurgeService,
    EmailClassifierService,
    PrismaService,
  ],
  exports: [VerificationService, VerificationPurgeService, EmailClassifierService],
})
export class VerificationModule {}

