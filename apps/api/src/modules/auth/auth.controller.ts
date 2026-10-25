import {
  Controller,
  Post,
  Req,
  Body,
  Headers,
  UnauthorizedException,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';
import { Public } from './decorators/public.decorator';
import { VerificationService } from '../verification/verification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Audience, VerificationStatus, VerificationMethod, UserRole } from '@vit-carpool/db';
import { signTestJwt } from './jwt-keys.fixture';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly verificationService: VerificationService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('dev-login')
  @ApiOperation({ summary: 'Local development login helper (disabled in production)' })
  async devLogin(
    @Body()
    body: {
      email?: string;
      fullName?: string;
      audience?: Audience;
      status?: VerificationStatus;
    },
  ) {
    const nodeEnv = this.config.get<string>('NODE_ENV');
    const jwtTestMode = this.config.get<boolean>('JWT_TEST_MODE');
    const isAllowed =
      (nodeEnv === 'development' || nodeEnv === 'test') && jwtTestMode === true;

    // Fail closed: development login is strictly permitted only in local development or test with JWT_TEST_MODE=true.
    // In unset, unknown, or production environments, return 404 Not Found.
    if (!isAllowed) {
      throw new NotFoundException('Development login endpoint is not available');
    }

    if (!body?.email || typeof body.email !== 'string' || !body.email.includes('@')) {
      throw new BadRequestException('A valid email address is required');
    }

    const email = body.email.trim().toLowerCase();

    // Strict institutional domain evaluation
    const isStudentEmail = /^[a-zA-Z0-9._%+-]+@vitstudent\.ac\.in$/i.test(email);
    const isFacultyEmail =
      !isStudentEmail && /^[a-zA-Z0-9._%+-]+@vit\.ac\.in$/i.test(email);

    let user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      // Security: dev-login cannot be used to authenticate/impersonate administrative accounts
      if (user.role === UserRole.ADMIN) {
        throw new ForbiddenException(
          'Development login cannot be used to authenticate administrative accounts.',
        );
      }
      // Authoritative database record is preserved; client-supplied audience/status cannot override DB state
    } else {
      // Determine audience strictly from verified institutional email patterns
      let derivedAudience: Audience | null = null;
      let defaultStatus: VerificationStatus = VerificationStatus.PENDING;

      if (isStudentEmail) {
        derivedAudience = Audience.STUDENT;
        defaultStatus = VerificationStatus.VERIFIED;
      } else if (isFacultyEmail) {
        derivedAudience = Audience.FACULTY;
        defaultStatus = VerificationStatus.VERIFIED;
      }

      // Allow testing PENDING, SUSPENDED, or REJECTED states if requested for testing,
      // but non-institutional emails CAN NEVER be VERIFIED or have an audience
      let initialStatus: VerificationStatus = defaultStatus;
      if (derivedAudience === null) {
        // Non-institutional email: must always be PENDING with no audience
        initialStatus = VerificationStatus.PENDING;
      } else if (
        body.status === VerificationStatus.PENDING ||
        body.status === VerificationStatus.SUSPENDED ||
        body.status === VerificationStatus.REJECTED
      ) {
        initialStatus = body.status;
      }

      const isVerified = initialStatus === VerificationStatus.VERIFIED;

      user = await this.prisma.user.create({
        data: {
          authUserId: crypto.randomUUID(),
          email,
          fullName:
            body.fullName?.trim() ||
            (derivedAudience === Audience.FACULTY
              ? 'Prof. Faculty Member'
              : derivedAudience === Audience.STUDENT
              ? 'Student Commuter'
              : email.split('@')[0]),
          audience: isVerified
            ? derivedAudience
            : initialStatus === VerificationStatus.SUSPENDED
            ? derivedAudience
            : null,
          verificationStatus: initialStatus,
          verificationMethod: isVerified ? VerificationMethod.MANUAL_ID_REVIEW : null,
          verifiedAt: isVerified ? new Date() : null,
          role: UserRole.USER, // Never permit ADMIN elevation
        },
      });
    }

    const token = signTestJwt({ sub: user.authUserId, email: user.email });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        audience: user.audience,
        verificationStatus: user.verificationStatus,
        verificationMethod: user.verificationMethod,
        verifiedAt: user.verifiedAt ? user.verifiedAt.toISOString() : null,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    };
  }

  @Public()
  @Post('webhook/user-updated')
  @ApiOperation({ summary: 'Webhook endpoint for Supabase Auth user updates with signature verification' })
  async handleUserUpdatedWebhook(
    @Req() req: Request,
    @Headers('webhook-id') webhookId?: string,
    @Headers('webhook-timestamp') webhookTimestamp?: string,
    @Headers('webhook-signature') webhookSignature?: string,
  ) {
    const webhookSecret = this.config.get<string>('SUPABASE_WEBHOOK_SECRET');

    // Fail closed: Webhooks must be configured with a shared secret
    if (!webhookSecret) {
      this.logger.warn('[Webhook] Request rejected: SUPABASE_WEBHOOK_SECRET is not configured.');
      throw new UnauthorizedException('Webhook verification secret is not configured');
    }

    // Support standard webhook headers and Svix provider aliases
    const id = webhookId || (req.headers['svix-id'] as string | undefined);
    const timestamp = webhookTimestamp || (req.headers['svix-timestamp'] as string | undefined);
    const signature = webhookSignature || (req.headers['svix-signature'] as string | undefined);

    if (!id || !timestamp || !signature) {
      throw new UnauthorizedException('Missing required Standard Webhook verification headers');
    }

    // Enforce 5-minute replay tolerance window
    const timestampSeconds = parseInt(timestamp, 10);
    if (isNaN(timestampSeconds)) {
      throw new UnauthorizedException('Invalid webhook timestamp header');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > 300) {
      this.logger.warn(`[Webhook] Timestamp ${timestampSeconds} outside 5-minute tolerance window.`);
      throw new UnauthorizedException('Webhook timestamp outside acceptable tolerance window');
    }

    // Extract exact raw body buffer transmitted over the network
    const rawBody = (req as any).rawBody
      ? (req as any).rawBody.toString('utf8')
      : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body);

    const signedPayload = `${id}.${timestamp}.${rawBody}`;

    // Decode secret key (Standard Webhooks whsec_ prefix base64 decoded)
    let secretKey: Buffer;
    if (webhookSecret.startsWith('whsec_')) {
      secretKey = Buffer.from(webhookSecret.slice(6), 'base64');
    } else {
      secretKey = Buffer.from(webhookSecret, 'utf-8');
    }

    const expectedSignature = `v1,${crypto
      .createHmac('sha256', secretKey)
      .update(signedPayload)
      .digest('base64')}`;

    // Constant-time comparison across all signatures in the header
    const sigs = signature.split(' ');
    const match = sigs.some((sig) => {
      try {
        const sigBuf = Buffer.from(sig);
        const expectedBuf = Buffer.from(expectedSignature);
        return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
      } catch {
        return false;
      }
    });

    if (!match) {
      this.logger.warn('[Webhook] Invalid webhook signature detected.');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body;
    const user = body?.record || body?.user || body;

    if (!user || !user.id || !user.email) {
      throw new BadRequestException('Webhook payload missing required user id or email');
    }

    const result = await this.verificationService.reconcileEmailChange({
      authUserId: user.id,
      incomingEmail: user.email,
      incomingUpdatedAt: user.updated_at || user.updatedAt,
    });

    return { status: 'success', result };
  }
}
