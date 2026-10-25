import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { getTestKeyPair } from './jwt-keys.fixture';

interface JwkKey {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

interface JwksResponse {
  keys: JwkKey[];
}

interface CachedKey {
  keyPem: string;
  cachedAt: number;
}

@Injectable()
export class JwksService {
  private readonly logger = new Logger(JwksService.name);
  private readonly cache = new Map<string, CachedKey>();
  private readonly cacheTtlMs = 10 * 60 * 1000; // 10 minutes
  private readonly jwksUrl: string | null = null;
  private readonly isTestMode: boolean;

  constructor(private readonly config: ConfigService) {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    const jwtTestMode = this.config.get<boolean>('JWT_TEST_MODE', false);
    const configuredJwksUrl = this.config.get<string>('SUPABASE_JWKS_URL');
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');

    this.jwksUrl = configuredJwksUrl || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json` : null);
    this.isTestMode = (nodeEnv === 'test' || jwtTestMode) && !configuredJwksUrl;
  }

  /**
   * Resolve a signing key (PEM format) for the provided key identifier (kid).
   * Supports key rotation by attempting a remote JWKS refresh if the kid is not in cache.
   */
  async getSigningKey(kid?: string): Promise<string> {
    // In local test/fixture mode, return test keypair PEM
    if (this.isTestMode) {
      const { publicKey } = getTestKeyPair();
      return publicKey;
    }

    if (!this.jwksUrl) {
      this.logger.error('Authentication rejected: Neither SUPABASE_JWKS_URL nor SUPABASE_URL is configured in non-test environment.');
      throw new UnauthorizedException('Authentication key store is not configured');
    }


    if (!kid) {
      throw new UnauthorizedException('Token header missing key identifier (kid)');
    }

    // Check cache
    const cached = this.cache.get(kid);
    const now = Date.now();
    if (cached && now - cached.cachedAt < this.cacheTtlMs) {
      return cached.keyPem;
    }

    // Refresh keys from JWKS endpoint (handles initial load and key rotation)
    await this.refreshJwks();

    const refreshed = this.cache.get(kid);
    if (!refreshed) {
      this.logger.warn(`Key identifier kid="${kid}" not found in JWKS from ${this.jwksUrl}`);
      throw new UnauthorizedException('Invalid or unknown signing key identifier');
    }

    return refreshed.keyPem;
  }

  /**
   * Fetch and parse public keys from configured JWKS endpoint using native Node crypto.
   */
  async refreshJwks(): Promise<void> {
    if (!this.jwksUrl) {
      throw new UnauthorizedException('JWKS URL is not configured');
    }

    try {
      const response = await fetch(this.jwksUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000), // 5-second network timeout
      });

      if (!response.ok) {
        throw new Error(`JWKS HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as JwksResponse;
      if (!data.keys || !Array.isArray(data.keys)) {
        throw new Error('Malformed JWKS response: missing keys array');
      }

      const now = Date.now();
      for (const jwk of data.keys) {
        if (jwk.kty === 'RSA' && jwk.kid) {
          try {
            const keyObject = crypto.createPublicKey({
              key: jwk as any,
              format: 'jwk',
            });
            const keyPem = keyObject.export({ type: 'spki', format: 'pem' }).toString();
            this.cache.set(jwk.kid, { keyPem, cachedAt: now });
          } catch (keyErr) {
            this.logger.warn(`Failed to convert JWK key ${jwk.kid} to PEM: ${keyErr}`);
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to retrieve JWKS from ${this.jwksUrl}: ${message}`);
      throw new UnauthorizedException('Authentication key store temporarily unavailable');
    }
  }

  /**
   * Clear cache for testing or maintenance.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
