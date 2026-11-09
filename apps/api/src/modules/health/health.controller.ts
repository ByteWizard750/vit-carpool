import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthService } from './health.service';
import { HealthResponse } from '@vit-carpool/contracts';
import { Public } from '../auth/decorators/public.decorator';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';

@ApiTags('Health')
@Controller(['health', 'api/health'])
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'System health check and database/PostGIS diagnostics',
    description:
      'Returns system status, environment, database connectivity, and PostGIS spatial extension verification. Returns HTTP 503 if database is disconnected.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is operational and database/PostGIS are connected.',
  })
  @ApiResponse({
    status: 503,
    description: 'Service is unhealthy or database is disconnected.',
  })
  async getHealth(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const health = await this.healthService.checkHealth();
    if (!health.database.connected) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return health;
  }

  @Get('protected-test')
  @UseGuards(VerifiedUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test endpoint gated by VerifiedUserGuard for integration testing' })
  testVerifiedAccess() {
    return { status: 'access_granted' };
  }
}
