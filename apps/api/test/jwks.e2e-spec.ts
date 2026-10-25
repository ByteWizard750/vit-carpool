import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { JwksService } from '../src/modules/auth/jwks.service';

describe('JwksService Security Boundaries & Edge Cases (unit)', () => {
  function createConfigService(env: Record<string, any>): ConfigService {
    return {
      get: (key: string, defaultVal?: any) => (key in env ? env[key] : defaultVal),
    } as unknown as ConfigService;
  }

  it('fails closed in non-test environment when no JWKS URL or secret is configured', async () => {
    const config = createConfigService({
      NODE_ENV: 'production',
      JWT_TEST_MODE: false,
      SUPABASE_JWKS_URL: undefined,
      SUPABASE_URL: undefined,
    });

    const jwksService = new JwksService(config);
    await expect(jwksService.getSigningKey('any-kid')).rejects.toThrow(
      new UnauthorizedException('Authentication key store is not configured'),
    );
  });

  it('rejects token when kid is missing in non-test mode with JWKS configured', async () => {
    const config = createConfigService({
      NODE_ENV: 'production',
      JWT_TEST_MODE: false,
      SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    });

    const jwksService = new JwksService(config);
    await expect(jwksService.getSigningKey(undefined)).rejects.toThrow(
      new UnauthorizedException('Token header missing key identifier (kid)'),
    );
  });

  it('handles JWKS endpoint HTTP failure (e.g. 500) gracefully with 401 Unauthorized', async () => {
    const config = createConfigService({
      NODE_ENV: 'production',
      JWT_TEST_MODE: false,
      SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    });

    const jwksService = new JwksService(config);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    try {
      await expect(jwksService.getSigningKey('test-kid')).rejects.toThrow(
        new UnauthorizedException('Authentication key store temporarily unavailable'),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles malformed JWKS payload (missing keys array) gracefully with 401 Unauthorized', async () => {
    const config = createConfigService({
      NODE_ENV: 'production',
      JWT_TEST_MODE: false,
      SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    });

    const jwksService = new JwksService(config);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invalid_structure: [] }),
    });

    try {
      await expect(jwksService.getSigningKey('test-kid')).rejects.toThrow(
        new UnauthorizedException('Authentication key store temporarily unavailable'),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects unknown kid when not found in valid JWKS response', async () => {
    const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = keyPair.publicKey.export({ format: 'jwk' });
    jwk.kid = 'known-kid-1';

    const config = createConfigService({
      NODE_ENV: 'production',
      JWT_TEST_MODE: false,
      SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    });

    const jwksService = new JwksService(config);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [jwk] }),
    });

    try {
      await expect(jwksService.getSigningKey('unknown-attacker-kid')).rejects.toThrow(
        new UnauthorizedException('Invalid or unknown signing key identifier'),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('supports key rotation: fetches new kid on demand and returns valid PEM', async () => {
    const keyPair1 = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk1 = keyPair1.publicKey.export({ format: 'jwk' });
    jwk1.kid = 'rotation-kid-1';

    const keyPair2 = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk2 = keyPair2.publicKey.export({ format: 'jwk' });
    jwk2.kid = 'rotation-kid-2';

    let availableKeys = [jwk1];

    const config = createConfigService({
      NODE_ENV: 'production',
      JWT_TEST_MODE: false,
      SUPABASE_JWKS_URL: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    });

    const jwksService = new JwksService(config);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ keys: availableKeys }),
    }));

    try {
      // Step 1: Resolves key 1
      const pem1 = await jwksService.getSigningKey('rotation-kid-1');
      expect(pem1).toContain('BEGIN PUBLIC KEY');

      // Key 2 is not yet rotated
      await expect(jwksService.getSigningKey('rotation-kid-2')).rejects.toThrow(
        new UnauthorizedException('Invalid or unknown signing key identifier'),
      );

      // Step 2: Key rotation happens on provider, jwk2 is published
      availableKeys = [jwk1, jwk2];

      // Key 2 is fetched on demand without server restart
      const pem2 = await jwksService.getSigningKey('rotation-kid-2');
      expect(pem2).toContain('BEGIN PUBLIC KEY');
      expect(pem2).not.toEqual(pem1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
