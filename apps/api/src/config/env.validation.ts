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
  STUDENT_EMAIL_REGEX: z.string().default('^[a-zA-Z0-9._%+-]+@vitstudent\\.ac\\.in$'),
  FACULTY_EMAIL_REGEX: z.string().default('^[a-zA-Z0-9._%+-]+@vit\\.ac\\.in$'),
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
