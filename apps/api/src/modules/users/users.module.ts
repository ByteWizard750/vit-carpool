import { Module, Global } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { EmailClassifierService } from '../verification/email-classifier.service';
import { UploadsModule } from '../uploads/uploads.module';

@Global()
@Module({
  imports: [UploadsModule],
  controllers: [UsersController],
  providers: [UsersService, EmailClassifierService],
  exports: [UsersService, EmailClassifierService],
})
export class UsersModule {}
