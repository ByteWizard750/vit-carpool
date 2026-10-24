import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthResponse } from '@vit-carpool/contracts';

interface DbQueryResult {
  current_database: string;
  postgis_full_version?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async checkHealth(): Promise<HealthResponse> {
    const startTime = Date.now();
    let dbConnected = false;
    let postgisInstalled = false;
    let postgisVersion = 'Not Installed';
    let databaseName = 'Unknown';
    let latencyMs = 0;

    try {
      const results = await this.prisma.$queryRaw<DbQueryResult[]>`
        SELECT current_database(), PostGIS_Full_Version();
      `;

      latencyMs = Date.now() - startTime;
      dbConnected = true;

      if (results && results.length > 0) {
        databaseName = results[0].current_database;
        const rawPostgis = results[0].postgis_full_version;
        if (rawPostgis) {
          postgisInstalled = true;
          // Extract primary version snippet e.g. "POSTGIS="3.6.4 ...""
          const match = rawPostgis.match(/POSTGIS="([^"]+)"/);
          postgisVersion = match ? match[1] : rawPostgis.substring(0, 30);
        }
      }
    } catch (err: unknown) {
      latencyMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Database health check failed: ${errorMessage}`);
      return {
        status: 'down',
        service: 'vit-carpool-api',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: {
          connected: false,
          databaseName: 'Disconnected',
          postgisInstalled: false,
          latencyMs,
        },
      };
    }

    return {
      status: postgisInstalled ? 'ok' : 'degraded',
      service: 'vit-carpool-api',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: dbConnected,
        databaseName,
        postgisInstalled,
        postgisVersion,
        latencyMs,
      },
    };
  }
}
