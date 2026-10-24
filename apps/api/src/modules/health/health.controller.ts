import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { HealthResponse } from '@vit-carpool/contracts';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

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
}
