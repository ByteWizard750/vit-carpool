import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_SUSPENDED_KEY } from '../decorators/allow-suspended.decorator';
import { UsersService } from '../../users/users.service';
import { JwksService } from '../jwks.service';

interface DecodedTokenPayload extends jwt.JwtPayload {
  sub: string;
  email?: string;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private readonly jwtSecret: string | null = null;
  private readonly expectedIssuer: string | null = null;

  constructor(
    private readonly reflector: Reflector,
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

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token provided');
    }

    // Inspect token header for algorithm and kid
    const decodedRaw = jwt.decode(token, { complete: true });
    if (!decodedRaw || typeof decodedRaw !== 'object' || !decodedRaw.header) {
      throw new UnauthorizedException('Malformed or undecodable authentication token');
    }

    const header = decodedRaw.header;
    const alg = header.alg;

    // Fail closed against algorithm confusion / none-algorithm attacks
    if (!alg || alg.toLowerCase() === 'none') {
      throw new UnauthorizedException('Insecure or unsupported token algorithm');
    }

    let decoded: DecodedTokenPayload;
    try {
      const isProduction = this.config.get<string>('NODE_ENV') === 'production';
      const customIssuer = this.config.get<string>('JWT_ISSUER');
      const validIssuersList: string[] = [
        ...(this.expectedIssuer ? [this.expectedIssuer] : []),
        ...(customIssuer && customIssuer !== this.expectedIssuer ? [customIssuer] : []),
      ];

      // In non-production environments (test/development), allow mock Supabase issuer for test compatibility
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
      this.logger.warn(`JWT verification rejected: ${message}`);
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    const authUserId = decoded.sub;
    const email = decoded.email;

    if (!authUserId || typeof authUserId !== 'string' || !email || typeof email !== 'string') {
      throw new UnauthorizedException('Token missing required subject (sub) or email claims');
    }

    // Resolve or provision local application user record from database
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

    // Enforce immediate, server-side account suspension across all authenticated routes,
    // except those explicitly decorated with @AllowSuspended() (e.g. GET /users/me).
    const allowSuspended = this.reflector.getAllAndOverride<boolean>(ALLOW_SUSPENDED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowSuspended && (user.isSuspended || user.verificationStatus === 'SUSPENDED')) {
      throw new ForbiddenException({
        error: 'ACCOUNT_SUSPENDED',
        message: user.suspensionReason
          ? `Your account has been suspended: ${user.suspensionReason}`
          : 'Your account has been suspended. Carpooling access is locked.',
      });
    }

    // Authoritative user state is derived strictly from local database record
    request.user = user;
    return true;
  }
}
