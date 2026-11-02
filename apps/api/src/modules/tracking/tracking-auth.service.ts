import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { User } from '@vit-carpool/db';
import { UsersService } from '../users/users.service';
import { JwksService } from '../auth/jwks.service';

interface DecodedTokenPayload extends jwt.JwtPayload {
  sub: string;
  email?: string;
}

@Injectable()
export class TrackingAuthService {
  private readonly logger = new Logger(TrackingAuthService.name);
  private readonly jwtSecret: string | null = null;
  private readonly expectedIssuer: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly jwksService: JwksService,
  ) {
    this.jwtSecret = this.config.get<string>('SUPABASE_JWT_SECRET') ?? null;
    const customIssuer = this.config.get<string>('JWT_ISSUER');
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    const configuredIssuer = this.config.get<string>('SUPABASE_JWT_ISSUER');

    if (configuredIssuer) {
      this.expectedIssuer = configuredIssuer;
    } else if (customIssuer) {
      this.expectedIssuer = customIssuer;
    } else if (supabaseUrl) {
      this.expectedIssuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
    }
  }

  /**
   * Validate raw JWT from WebSocket connection and retrieve authenticated user.
   */
  async authenticateToken(tokenStr: string): Promise<User> {
    if (!tokenStr || typeof tokenStr !== 'string') {
      throw new UnauthorizedException('Authentication token required');
    }

    const token = tokenStr.startsWith('Bearer ') ? tokenStr.substring(7).trim() : tokenStr.trim();
    if (!token) {
      throw new UnauthorizedException('Empty token provided');
    }

    const decodedRaw = jwt.decode(token, { complete: true });
    if (!decodedRaw || typeof decodedRaw !== 'object' || !decodedRaw.header) {
      throw new UnauthorizedException('Malformed token provided');
    }

    const header = decodedRaw.header;
    const alg = header.alg;
    if (!alg || alg.toLowerCase() === 'none') {
      throw new UnauthorizedException('Insecure token algorithm');
    }

    let decoded: DecodedTokenPayload;
    try {
      const isProduction = this.config.get<string>('NODE_ENV') === 'production';
      const customIssuer = this.config.get<string>('JWT_ISSUER');
      const validIssuersList: string[] = [
        ...(this.expectedIssuer ? [this.expectedIssuer] : []),
        ...(customIssuer && customIssuer !== this.expectedIssuer ? [customIssuer] : []),
      ];

      if (!isProduction) {
        validIssuersList.push('https://mock-supabase.local/auth/v1');
      }

      if (validIssuersList.length === 0) {
        throw new UnauthorizedException('Authentication issuer is not configured');
      }

      const validIssuers = validIssuersList as [string, ...string[]];

      if (alg === 'RS256') {
        const signingKey = await this.jwksService.getSigningKey(header.kid);
        const verifyOptions: jwt.VerifyOptions = {
          algorithms: ['RS256'],
          audience: 'authenticated',
          issuer: validIssuers,
        };
        decoded = jwt.verify(token, signingKey, verifyOptions) as DecodedTokenPayload;
      } else if (alg === 'HS256' && this.jwtSecret) {
        const verifyOptions: jwt.VerifyOptions = {
          algorithms: ['HS256'],
          audience: 'authenticated',
          issuer: validIssuers,
        };
        decoded = jwt.verify(token, this.jwtSecret, verifyOptions) as DecodedTokenPayload;
      } else {
        throw new UnauthorizedException(`Unsupported signing algorithm: ${alg}`);
      }
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Invalid or expired token';
      this.logger.warn(`WebSocket JWT verification rejected: ${message}`);
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    const authUserId = decoded.sub;
    const email = decoded.email;

    if (!authUserId || typeof authUserId !== 'string' || !email || typeof email !== 'string') {
      throw new UnauthorizedException('Token missing required subject or email claims');
    }

    const rawMetadata = (decoded as Record<string, unknown>).user_metadata as
      | Record<string, unknown>
      | undefined;
    const fullNameClaim =
      (rawMetadata?.full_name as string) ||
      (rawMetadata?.name as string) ||
      ((decoded as Record<string, unknown>).name as string) ||
      undefined;

    const user = await this.usersService.findOrCreateUser({
      authUserId,
      email,
      fullName: fullNameClaim,
    });

    if (user.isSuspended) {
      throw new ForbiddenException({
        error: 'ACCOUNT_SUSPENDED',
        message: user.suspensionReason || 'Your account has been suspended.',
      });
    }

    return user;
  }
}

