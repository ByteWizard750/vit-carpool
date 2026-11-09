import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Enable CORS for the mobile web frontend
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.enableCors({
    origin: corsOrigin.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Standardize REST API namespace under /api, excluding health checks and upload file serving
  app.setGlobalPrefix('api', {
    exclude: ['health', 'uploads/(.*)'],
  });

  // Dual routing compatibility middleware:
  // Transparently rewrites non-prefixed REST requests to /api/
  // Ensures existing scripts, external tools, and legacy clients resolve cleanly without disruption
  app.use((req: any, res: any, next: any) => {
    if (
      !req.path.startsWith('/api') &&
      !req.path.startsWith('/health') &&
      !req.path.startsWith('/uploads') &&
      !req.path.startsWith('/socket.io') &&
      !req.path.startsWith('/tracking')
    ) {
      req.url = '/api' + req.url;
    }
    next();
  });

  // Configure Express trust proxy safely:
  // Distinguishes boolean, numeric hop count, and explicitly configured subnets/names.
  // Passing a string number (e.g. "2") without parsing caused proxy-addr to fail compilation,
  // defaulting client IPs to 127.0.0.1 and locking all users out via rate limiting.
  const trustProxyEnv = process.env.TRUST_PROXY?.trim();
  const expressApp = app.getHttpAdapter().getInstance();
  if (trustProxyEnv) {
    if (trustProxyEnv === 'false' || trustProxyEnv === '0') {
      expressApp.set('trust proxy', false);
      logger.log('[Bootstrap] Express trust proxy disabled (false)');
    } else if (trustProxyEnv === 'true') {
      expressApp.set('trust proxy', true);
      logger.log('[Bootstrap] Express trust proxy enabled (trust all)');
    } else if (!isNaN(Number(trustProxyEnv)) && Number.isInteger(Number(trustProxyEnv)) && Number(trustProxyEnv) >= 0) {
      const hops = Number(trustProxyEnv);
      expressApp.set('trust proxy', hops);
      logger.log(`[Bootstrap] Express trust proxy configured: ${hops} hop(s)`);
    } else {
      const subnets = trustProxyEnv.split(',').map((s) => s.trim()).filter(Boolean);
      const setting = subnets.length === 1 ? subnets[0] : subnets;
      expressApp.set('trust proxy', setting);
      logger.log(`[Bootstrap] Express trust proxy configured for subnets/names: ${trustProxyEnv}`);
    }
  } else {
    expressApp.set('trust proxy', false);
  }

  // Enable global validation pipe with strict sanitization
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // OpenAPI (Swagger) Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('VIT Chennai Carpooling Platform API')
    .setDescription(
      'Authoritative backend REST API for the VIT Chennai exclusive community carpooling platform.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`VIT Carpool API server running on: http://localhost:${port}`);
  logger.log(`OpenAPI documentation available on: http://localhost:${port}/api/docs`);
  logger.log(`Health check endpoint: http://localhost:${port}/health`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap failure:', err);
  process.exit(1);
});
