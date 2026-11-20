import { HealthResponse, HealthResponseSchema } from '@vit-carpool/contracts';

const getApiBase = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  // Always use same-origin relative paths on production or whenever accessing remote origin
  if (
    import.meta.env.PROD ||
    !envUrl ||
    (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ||
    envUrl.includes('localhost') ||
    envUrl.includes('127.0.0.1')
  ) {
    return '';
  }
  return envUrl;
};

export async function fetchHealthStatus(): Promise<HealthResponse> {
  const endpoint = `${getApiBase()}/health`;
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
