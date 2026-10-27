import { z } from 'zod';
import * as crypto from 'crypto';

export function normalizePem(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.includes('-----BEGIN')) {
    return trimmed.replace(/\\n/g, '\n');
  }
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN')) {
      return decoded.replace(/\\n/g, '\n');
    }
  } catch {
    // fallback
  }
  return trimmed;
}

export function validateRsaKeyPair(privateKeyRaw: string, publicKeyRaw: string): boolean {
  try {
    const privPem = normalizePem(privateKeyRaw);
    const pubPem = normalizePem(publicKeyRaw);
    const priv = crypto.createPrivateKey(privPem);
    const pub = crypto.createPublicKey(pubPem);

    if (priv.asymmetricKeyType !== 'rsa' || pub.asymmetricKeyType !== 'rsa') {
      return false;
    }

    const testData = Buffer.from('vit-carpool-key-validation-challenge');
    const signature = crypto.sign('sha256', testData, priv);
    return crypto.verify('sha256', testData, pub, signature);
  } catch {
    return false;
  }
}

export const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://postgres:postgres@127.0.0.1:5433/vit_carpool_dev?schema=public'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  
  // Institutional Email Classification
  ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((val) => val === 'true'),
  STUDENT_EMAIL_REGEX: z.string().default('^[a-zA-Z0-9._%+-]+@vitstudent\\.ac\\.in$'),
  FACULTY_EMAIL_REGEX: z.string().default('^[a-zA-Z0-9._%+-]+@vit\\.ac\\.in$'),

  // Custom RS256 JWT Authentication Key Pair
  JWT_PRIVATE_KEY: z.string().optional().or(z.literal('')),
  JWT_PUBLIC_KEY: z.string().optional().or(z.literal('')),
  JWT_KEY_ID: z.string().default('vit-carpool-jwt-key-1'),
  JWT_ISSUER: z.string().default('https://api.vitcarpool.app/auth/v1'),
  JWT_AUDIENCE: z.string().default('authenticated'),

  // Keyed HMAC Secret for OTP verification storage
  OTP_HMAC_SECRET: z.string().optional().or(z.literal('')),

  // Authentication IP Rate Limiting Configuration
  AUTH_RATE_LIMIT_TTL: z.coerce.number().int().min(1).default(60),
  AUTH_RATE_LIMIT_LIMIT: z.coerce.number().int().min(1).default(10),
  TRUST_PROXY: z.string().optional().default(''),
  OTP_CLEANUP_INTERVAL_MS: z.coerce.number().int().min(1000).default(30 * 60 * 1000),

  // Supabase Auth Integration
  SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  SUPABASE_ANON_KEY: z.string().optional().or(z.literal('')),
  SUPABASE_JWKS_URL: z.string().url().optional().or(z.literal('')),
  SUPABASE_JWT_SECRET: z.string().optional().or(z.literal('')),
  SUPABASE_JWT_ISSUER: z.string().optional().or(z.literal('')),
  SUPABASE_WEBHOOK_SECRET: z.string().optional().or(z.literal('')),
  
  // Test Mode Flag
  JWT_TEST_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),

  // SMTP Email Delivery Configuration (Gmail / Custom SMTP)
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((val) => val === 'true'),
  SMTP_USER: z.string().optional().or(z.literal('')),
  SMTP_PASS: z.string().optional().or(z.literal('')),
  SMTP_FROM: z.string().default('VIT Carpool <vitcarpool.app@gmail.com>'),

  // Location Autocomplete Configuration
  LOCATION_PROVIDER: z.enum(['mock', 'mapbox']).default('mock'),
  MAPBOX_ACCESS_TOKEN: z.string().optional().or(z.literal('')),
  MAPBOX_SEARCH_BBOX: z.string().default('79.80,12.60,80.35,13.35'),
  MAPBOX_PROXIMITY: z.string().default('80.1534,12.8406'),
  LOCATION_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
  LOCATION_RATE_LIMIT_TTL: z.coerce.number().int().min(1).default(60),
  LOCATION_RATE_LIMIT_LIMIT: z.coerce.number().int().min(1).default(30),
}).refine(
  (data) => !(data.NODE_ENV === 'production' && data.JWT_TEST_MODE === true),
  {
    message: 'JWT_TEST_MODE must not be enabled in production environment',
    path: ['JWT_TEST_MODE'],
  },
).refine(
  (data) => !(data.NODE_ENV === 'production' && data.LOCATION_PROVIDER === 'mock'),
  {
    message: 'LOCATION_PROVIDER cannot be mock in production environment. A valid mapbox provider configuration must be used.',
    path: ['LOCATION_PROVIDER'],
  },
).refine(
  (data) => !(data.LOCATION_PROVIDER === 'mapbox' && (!data.MAPBOX_ACCESS_TOKEN || !data.MAPBOX_ACCESS_TOKEN.trim())),
  {
    message: 'MAPBOX_ACCESS_TOKEN is required when LOCATION_PROVIDER is set to mapbox',
    path: ['MAPBOX_ACCESS_TOKEN'],
  },
).refine(
  (data) => {
    if (data.NODE_ENV !== 'production') return true;
    return Boolean(data.JWT_PRIVATE_KEY && data.JWT_PUBLIC_KEY);
  },
  {
    message: 'In production environment, both JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be configured for custom RS256 token signing and verification',
    path: ['JWT_PRIVATE_KEY'],
  },
).refine(
  (data) => {
    if (!data.JWT_PRIVATE_KEY || !data.JWT_PUBLIC_KEY) return true;
    return validateRsaKeyPair(data.JWT_PRIVATE_KEY, data.JWT_PUBLIC_KEY);
  },
  {
    message: 'JWT_PRIVATE_KEY and JWT_PUBLIC_KEY do not form a valid, matching RSA keypair',
    path: ['JWT_PUBLIC_KEY'],
  },
).refine(
  (data) => {
    if (data.NODE_ENV !== 'production') return true;
    // In production, OTP HMAC secret must be provided
    return Boolean(data.OTP_HMAC_SECRET && data.OTP_HMAC_SECRET.trim().length >= 16);
  },
  {
    message: 'OTP_HMAC_SECRET must be configured with at least 16 characters in production environment',
    path: ['OTP_HMAC_SECRET'],
  },
);

export type EnvConfig = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.format();
    throw new Error(
      `[EnvValidationError] Invalid application configuration:\n${JSON.stringify(errors, null, 2)}`,
    );
  }
  return result.data;
}
