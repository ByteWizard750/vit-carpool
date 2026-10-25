import { z } from 'zod';

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
  
  // Institutional Email Classification (Disabled by default until confirmed)
  ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
  STUDENT_EMAIL_REGEX: z.string().default('^[a-zA-Z0-9._%+-]+@vitstudent\\.ac\\.in$'),
  FACULTY_EMAIL_REGEX: z.string().default('^[a-zA-Z0-9._%+-]+@vit\\.ac\\.in$'),

  // Supabase Auth Integration
  SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  SUPABASE_JWKS_URL: z.string().url().optional().or(z.literal('')),
  SUPABASE_JWT_SECRET: z.string().optional().or(z.literal('')),
  SUPABASE_JWT_ISSUER: z.string().optional().or(z.literal('')),
  SUPABASE_WEBHOOK_SECRET: z.string().optional().or(z.literal('')),
  
  // Test Mode Flag
  JWT_TEST_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
});

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
