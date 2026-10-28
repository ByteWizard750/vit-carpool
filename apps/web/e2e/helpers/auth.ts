import { Page } from '@playwright/test';
import * as crypto from 'crypto';

export const DETERMINISTIC_TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQChPHHPOT8OAs1N
1Ln2UGyUOZezAq+XI3NrYbbfo4HYZBk8AL7hx2z9/opqgUQFK6B1wqnlyMc8Mx3R
WKAB44uud9C2F8K+VkhAm2iPXTk3VYdpVmYUUG5spGNcap+NVggEEganbRtpbXS4
+c5nFCYG5Ywuziq2656IStDtMIwVGSPKzt58/qrf9wodUjlOrkrGf+L29SYy+u3r
7rBKZIu1U7coDhtHIRItAsBr0/OPWDpXvCF+8bH7Tqc+sPs8mPtNuWrLH6mNyxkX
Rabzx7suemWff1Mfk7TXK5m4pqg6gaNXTJPoO8ozPtWkQcq7WlpE34qnIF3SLvTg
8UV8YXaXAgMBAAECggEAIFYGfyg8eJtgQE069GbBt+JrBZgyze1qruz8Z5KbrmG4
29tMbOx5c+ESMnT1RtIujp95Ql/HcU/RGZScFnTjpRxba8GNKW4VdHuWdzYbjPjm
vN36f/V3h+taEAVENWy9E8/nrLlJh5XPlG9pESwtyjFMMXDgiSns8+mJSCB1358G
yvVlYecktKgrAuP1JgigLKNhPw1da+ieohmzSR+ToIr/lIn59Qz0KG3fg8L+4NDw
IJFGGkrrhexgrUWsSlYR6OtcYvmK+5ip8oHC8kA5+2x8OerodyoIQy0NR3+oohYr
JcKBNsi7620/+xLs+iQ5rQEe21A8d01S/HupjB+6YQKBgQDd6lsYsZ28FL1OOzud
M1seTfgsZT1FUVq0ZkgVYkI38oS4Hava/oiFezzPxqu/Abm2YDJbSs5SSmb115Lk
01zFWIukVKGB7Esk1iSv+gCIXtQf+Ga4Hr/HMU5YbOFcD2QV4843IBCoYmIQZZny
TdbrKOU0MrdkiJYJqVxxecuQ4QKBgQC6ADJSfiGSLGP6F7DDHrVnSYLHJU4vco5E
C5b6Do5GeaFAW2OJZCD5bcR/8mJmmBUEPBIuJJ1EMS89rOrZ7JLK16zW2LLhdg2G
KlOWUb531fX1558vrBAJZiXbi6hQDyFikEI1D+KLwnIkzclV7bMKRVKLHOgMS+3Q
le0yNN7edwKBgQC7uBkjRGxXw3t3h+efzOeRNQdwFpvD3VPLMpJbdGjrhrz6Oi87
6wB1WZBReo+h3cXJHoq6awco2UNLRvY9lwXs8j/93JFapBXUrUkPi32T3hO2j5vk
uC4mQ/EwH7pq86IIWlIAk6FDryWhFTEqpOnetxNcGmLEKj4xIhDO9OZcQQKBgF5n
YSMrb4CQVUIHKikueeXtkpnfHlrIqtpwg3VxU9cDPsu6Vr/R+UZ/5v8Fl9n4kJow
nw2aedO1nwOPszdecnbPlqMJI2l5kI2rB/fAj4qlJwxjPhFlJFKQ7OAMdyYDN++d
xmzGHjbPPz3c0LZzSa8J1kZTKperJg37OoOEACYrAoGAF1mP1daxzKN5T2tDoJJ5
HpXxxmW59etg2H/OzA0TuhNkl5wx/CMQLoCsovX9I5rpnsT/3VMlPBoJ+kRl7wWY
midyC+qOv1G0xNQ0TfDGwMopqwtYUpH5Bwa3P8maZ8zPWLnLJilYy3wXMPJ9n+Vu
Zo8tPVZmOVZROicrR9bBQOc=
-----END PRIVATE KEY-----`;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  audience?: 'STUDENT' | 'FACULTY' | null;
  verificationStatus: string;
  role: 'USER' | 'ADMIN';
}

/**
 * Sign a deterministic RS256 token matching the local test mode validation.
 */
export function signRS256Token(sub: string, email: string, role = 'authenticated'): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    email,
    role,
    iat: now,
    exp: now + 7 * 86400,
    aud: 'authenticated',
    iss: 'https://mock-supabase.local/auth/v1',
    sub,
  };

  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${h}.${p}`);
  const sig = signer.sign(DETERMINISTIC_TEST_PRIVATE_KEY, 'base64url');
  return `${h}.${p}.${sig}`;
}

/**
 * Inject auth token and user state into browser context.
 */
export async function injectAuthSession(page: Page, token: string, user: AuthUser) {
  await page.addInitScript(
    ({ t, u }) => {
      window.localStorage.setItem('vit_auth_token', t);
      window.localStorage.setItem('vit_auth_user', JSON.stringify(u));
    },
    { t: token, u: user }
  );

  // If already at an open page, also update in-memory storage directly
  try {
    await page.evaluate(
      ({ t, u }) => {
        window.localStorage.setItem('vit_auth_token', t);
        window.localStorage.setItem('vit_auth_user', JSON.stringify(u));
      },
      { t: token, u: user }
    );
  } catch {
    // Page might not be loaded yet; addInitScript handles it on first load
  }
}

/**
 * Log in via devLogin endpoint and inject session into page.
 */
export async function loginAsDevUser(
  page: Page,
  options: {
    email: string;
    fullName?: string;
    audience?: 'STUDENT' | 'FACULTY';
    status?: 'VERIFIED' | 'PENDING' | 'SUSPENDED';
  }
): Promise<{ token: string; user: AuthUser }> {
  const apiBase = 'http://localhost:3000';
  const res = await page.request.post(`${apiBase}/auth/dev-login`, {
    data: {
      email: options.email,
      fullName: options.fullName,
      audience: options.audience,
      status: options.status,
    },
  });

  if (!res.ok()) {
    throw new Error(`Failed to dev-login ${options.email}: ${res.status()} ${await res.text()}`);
  }

  const { token, user } = await res.json();
  await injectAuthSession(page, token, user);
  return { token, user };
}

/**
 * Log in as student driver (Arjun).
 */
export async function loginAsStudentDriver(page: Page) {
  return loginAsDevUser(page, {
    email: 'arjun.driver@vitstudent.ac.in',
    fullName: 'Arjun Driver',
    audience: 'STUDENT',
  });
}

/**
 * Log in as student passenger (Priya).
 */
export async function loginAsStudentPassenger(page: Page) {
  return loginAsDevUser(page, {
    email: 'priya.passenger@vitstudent.ac.in',
    fullName: 'Priya Passenger',
    audience: 'STUDENT',
  });
}

/**
 * Log in as faculty member (Prof. Raman).
 */
export async function loginAsFacultyMember(page: Page) {
  return loginAsDevUser(page, {
    email: 'prof.raman@vit.ac.in',
    fullName: 'Prof. Raman',
    audience: 'FACULTY',
  });
}

/**
 * Authenticate as Campus Administrator.
 */
export async function loginAsAdmin(page: Page): Promise<{ token: string; user: AuthUser }> {
  const adminEmail = 'admin.safety@vitstudent.ac.in';
  const adminAuthUserId = 'ccc3627d-8f8a-47a1-a757-55ea32c00f92';
  const adminId = '34aeec7c-33e1-49ad-97d5-d8541bbe315d';

  const user: AuthUser = {
    id: adminId,
    email: adminEmail,
    fullName: 'Campus Admin Safety Officer',
    audience: 'STUDENT',
    verificationStatus: 'VERIFIED',
    role: 'ADMIN',
  };

  const token = signRS256Token(adminAuthUserId, adminEmail);
  await injectAuthSession(page, token, user);
  return { token, user };
}
