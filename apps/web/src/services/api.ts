import { HealthResponse, HealthResponseSchema } from '@vit-carpool/contracts';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function fetchHealthStatus(): Promise<HealthResponse> {
  const endpoint = `${API_BASE}/health`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  const parsed = HealthResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.warn('Unexpected health response structure:', parsed.error);
    return data as HealthResponse;
  }
  return parsed.data;
}
