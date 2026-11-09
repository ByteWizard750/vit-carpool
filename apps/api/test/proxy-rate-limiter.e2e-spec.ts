import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ExecutionContext, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthRateLimiterGuard } from '../src/modules/auth/guards/auth-rate-limiter.guard';
import { LocationRateLimiterGuard } from '../src/modules/locations/guards/location-rate-limiter.guard';
import * as express from 'express';

describe('Express Trust Proxy & Rate Limiter Security Suite', () => {
  describe('Express Trust Proxy Configuration & IP Resolution', () => {
    it('correctly resolves client IP when TRUST_PROXY is a numeric integer hop count (e.g. 2)', () => {
      const app = express();
      // Configure with integer hop count
      app.set('trust proxy', 2);

      const req: any = {
        app,
        headers: {
          'x-forwarded-for': '203.0.113.195, 172.68.0.1', // Client IP, Cloudflare proxy IP
        },
        connection: { remoteAddress: '172.18.0.3' }, // Caddy reverse proxy IP
      };
      Object.setPrototypeOf(req, express.request);

      expect(req.ip).toBe('203.0.113.195');
    });

    it('correctly resolves client IP when TRUST_PROXY is configured with subnets (e.g. loopback, 172.16.0.0/12)', () => {
      const app = express();
      app.set('trust proxy', ['loopback', '172.16.0.0/12']);

      const req: any = {
        app,
        headers: {
          'x-forwarded-for': '198.51.100.42',
        },
        connection: { remoteAddress: '172.18.0.4' }, // Inside 172.16.0.0/12
      };
      Object.setPrototypeOf(req, express.request);

      expect(req.ip).toBe('198.51.100.42');
    });

    it('ignores forged X-Forwarded-For headers when trust proxy is disabled (false)', () => {
      const app = express();
      app.set('trust proxy', false);

      const req: any = {
        app,
        headers: {
          'x-forwarded-for': '1.2.3.4, 5.6.7.8', // Spoofed header
        },
        connection: { remoteAddress: '198.51.100.99' }, // Direct attacker socket
      };
      Object.setPrototypeOf(req, express.request);

      expect(req.ip).toBe('198.51.100.99');
    });
  });

  describe('AuthRateLimiterGuard Behavior', () => {
    let guard: AuthRateLimiterGuard;

    beforeEach(() => {
      const mockConfig = {
        get: (key: string, defaultVal?: any) => {
          if (key === 'AUTH_RATE_LIMIT_LIMIT') return 3;
          if (key === 'AUTH_RATE_LIMIT_TTL') return 60;
          if (key === 'NODE_ENV') return 'production';
          return defaultVal;
        },
      } as unknown as ConfigService;

      guard = new AuthRateLimiterGuard(mockConfig);
    });

    function createMockContext(ip: string, path: string): ExecutionContext {
      const mockReq = {
        ip,
        path,
        headers: {},
        socket: { remoteAddress: ip },
      };
      return {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
      } as unknown as ExecutionContext;
    }

    it('allows requests within the configured threshold for an IP', () => {
      const ctx = createMockContext('203.0.113.10', '/api/auth/verify-otp');
      expect(guard.canActivate(ctx)).toBe(true);
      expect(guard.canActivate(ctx)).toBe(true);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws 429 Too Many Requests when a single IP exceeds the threshold', () => {
      const ctx = createMockContext('203.0.113.20', '/api/auth/verify-otp');
      expect(guard.canActivate(ctx)).toBe(true);
      expect(guard.canActivate(ctx)).toBe(true);
      expect(guard.canActivate(ctx)).toBe(true);

      expect(() => guard.canActivate(ctx)).toThrow();
      try {
        guard.canActivate(ctx);
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.message).toContain('Too many authentication attempts');
      }
    });

    it('tracks different client IPs independently so one user cannot lock out another', () => {
      const userA = createMockContext('203.0.113.100', '/api/auth/verify-otp');
      const userB = createMockContext('203.0.113.200', '/api/auth/verify-otp');

      // User A exhausts limit
      guard.canActivate(userA);
      guard.canActivate(userA);
      guard.canActivate(userA);
      expect(() => guard.canActivate(userA)).toThrow();

      // User B must still be permitted
      expect(guard.canActivate(userB)).toBe(true);
    });
  });

  describe('LocationRateLimiterGuard Behavior', () => {
    let guard: LocationRateLimiterGuard;

    beforeEach(() => {
      const mockConfig = {
        get: (key: string, defaultVal?: any) => {
          if (key === 'LOCATION_RATE_LIMIT_LIMIT') return 2;
          if (key === 'LOCATION_RATE_LIMIT_TTL') return 60;
          return defaultVal;
        },
      } as unknown as ConfigService;

      guard = new LocationRateLimiterGuard(mockConfig);
    });

    it('throttles based on req.ip safely without trusting raw forged headers', () => {
      const mockReq = {
        ip: '203.0.113.55',
        headers: { 'x-forwarded-for': 'spoofed.header.ip' },
        socket: { remoteAddress: '203.0.113.55' },
      };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => mockReq }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(ctx)).toBe(true);
      expect(guard.canActivate(ctx)).toBe(true);
      expect(() => guard.canActivate(ctx)).toThrow();
    });
  });
});

