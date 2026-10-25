import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ClientRateRecord {
  timestamps: number[];
}

/**
 * Sliding-window rate limiter guard specifically for location autocomplete search.
 * Protects upstream geocoding providers and local search endpoints from query abuse.
 */
@Injectable()
export class LocationRateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(LocationRateLimiterGuard.name);
  private readonly requestRecords = new Map<string, ClientRateRecord>();
  private readonly ttlMs: number;
  private readonly maxLimit: number;

  constructor(private readonly config: ConfigService) {
    const ttlSeconds = this.config.get<number>('LOCATION_RATE_LIMIT_TTL', 60);
    this.ttlMs = ttlSeconds * 1000;
    this.maxLimit = this.config.get<number>('LOCATION_RATE_LIMIT_LIMIT', 30);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const now = Date.now();

    // Key by user ID if authenticated, otherwise fall back to client IP
    const clientId =
      req.user?.id ||
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown-client';

    let record = this.requestRecords.get(clientId);
    if (!record) {
      record = { timestamps: [] };
      this.requestRecords.set(clientId, record);
    }

    // Filter out timestamps outside the active sliding window
    const windowStart = now - this.ttlMs;
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= this.maxLimit) {
      this.logger.warn(`Location rate limit exceeded for client: ${clientId} (${record.timestamps.length}/${this.maxLimit})`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Location autocomplete rate limit exceeded. Please wait before searching again.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.timestamps.push(now);
    return true;
  }

  /**
   * Resets internal rate limit state (useful for deterministic tests).
   */
  reset(): void {
    this.requestRecords.clear();
  }
}
