import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { HealthResponse } from '@vit-carpool/contracts';
import { Public } from '../auth/decorators/public.decorator';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'System health check and database/PostGIS diagnostics',
    description:
      'Returns system status, environment, database connectivity, and PostGIS spatial extension verification.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is operational and database/PostGIS are connected.',
  })
  async getHealth(): Promise<HealthResponse> {
    return this.healthService.checkHealth();
  }

  @Get('protected-test')
  @UseGuards(VerifiedUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test endpoint gated by VerifiedUserGuard for integration testing' })
  testVerifiedAccess() {
    return { status: 'access_granted' };
  }
}
