import { z } from 'zod';

export const HealthStatusSchema = z.enum(['ok', 'degraded', 'down']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const DatabaseHealthSchema = z.object({
  connected: z.boolean(),
  databaseName: z.string(),
  postgisInstalled: z.boolean(),
  postgisVersion: z.string().optional(),
  latencyMs: z.number().optional(),
});
export type DatabaseHealth = z.infer<typeof DatabaseHealthSchema>;

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  service: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  database: DatabaseHealthSchema,
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
