import { Module } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { EmailClassifierService } from './email-classifier.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [VerificationController],
  providers: [VerificationService, EmailClassifierService, PrismaService],
  exports: [VerificationService, EmailClassifierService],
})
export class VerificationModule {}
