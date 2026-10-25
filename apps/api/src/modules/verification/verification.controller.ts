import {
  Controller,
  Post,
  Get,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@vit-carpool/db';
import { CreateVerificationRequestSchema } from '@vit-carpool/contracts';

@ApiTags('verification')
@ApiBearerAuth()
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('request')
  @ApiOperation({ summary: 'Submit campus ID verification request for unverified account' })
  async submitRequest(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ) {
    const result = CreateVerificationRequestSchema.safeParse(body);
    if (!result.success) {
      const messages = result.error.errors.map(
        (err) => err.message || `property ${err.path.join('.')} should not exist`,
      );
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }
    return this.verificationService.submitRequest(user, result.data);
  }

  @Get('my-request')
  @ApiOperation({ summary: 'Get current user verification request status' })
  async getMyRequest(@CurrentUser() user: User) {
    return this.verificationService.getMyRequest(user.id);
  }
}
