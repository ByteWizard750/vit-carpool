import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

interface ClientRateWindow {
  timestamps: number[];
}

/**
 * IP-based sliding-window rate limiter for sensitive authentication endpoints.
 * Protects OTP request, resend, and verification routes against automated attacks and spam.
 * 
 * Deployment Note:
 * This rate limiter maintains state in process memory. In a multi-instance deployment,
 * rate limits are enforced per backend node unless combined with IP affinity at the
 * load balancer or upstream rate limiting at the reverse proxy (e.g., Nginx, Cloudflare, AWS WAF).
 */
@Injectable()
export class AuthRateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(AuthRateLimiterGuard.name);
  private readonly requestWindows = new Map<string, ClientRateWindow>();
  private readonly ttlMs: number;
  private readonly maxLimit: number;

  constructor(private readonly config: ConfigService) {
    const isTest = this.config.get<string>('NODE_ENV') === 'test';
    const configuredLimit = this.config.get<number>('AUTH_RATE_LIMIT_LIMIT');
    this.maxLimit = isTest ? 100 : (configuredLimit || 10);
    const ttlSeconds = this.config.get<number>('AUTH_RATE_LIMIT_TTL', 60);
    this.ttlMs = ttlSeconds * 1000;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const clientIp = this.extractClientIp(req);
    const now = Date.now();

    // Key by IP and route path family (request vs verify) to allow legitimate verify attempts
    const routeFamily = req.path.includes('verify') ? 'verify' : 'request';
    const clientKey = `${clientIp}:${routeFamily}`;

    let window = this.requestWindows.get(clientKey);
    if (!window) {
      window = { timestamps: [] };
      this.requestWindows.set(clientKey, window);
    }

    // Prune timestamps older than active sliding window
    const windowStart = now - this.ttlMs;
    window.timestamps = window.timestamps.filter((ts) => ts > windowStart);

    // Dynamic limit: verification routes allow up to maxLimit; request/resend allow half to prevent email quota exhaustion
    const effectiveLimit = routeFamily === 'request' ? Math.max(3, Math.floor(this.maxLimit / 2)) : this.maxLimit;

    if (window.timestamps.length >= effectiveLimit) {
      this.logger.warn(
        `[AuthRateLimiter] IP ${clientIp} exceeded rate limit on ${req.path} (${window.timestamps.length}/${effectiveLimit} in ${this.ttlMs / 1000}s)`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Too many authentication attempts from this IP address. Please wait before trying again.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    window.timestamps.push(now);
    return true;
  }

  /**
   * Safely resolve client IP without blindly trusting arbitrary headers.
   * Prioritizes Express req.ip (when trust proxy is configured) then socket remote address.
   */
  private extractClientIp(req: Request): string {
    if (req.ip && req.ip.trim().length > 0) {
      return req.ip.trim();
    }

    const socketAddr = req.socket?.remoteAddress;
    if (socketAddr && socketAddr.trim().length > 0) {
      return socketAddr.trim();
    }

    // Fallback: evaluate x-forwarded-for taking only the first IP if valid
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const rawFirst = (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim();
      if (rawFirst.length > 0) {
        return rawFirst;
      }
    }

    return 'unknown-ip';
  }

  /**
   * Reset rate limit state for test isolation.
   */
  reset(): void {
    this.requestWindows.clear();
  }
}
