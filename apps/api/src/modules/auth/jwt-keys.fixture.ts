import * as jwt from 'jsonwebtoken';

/**
 * Deterministic RSA Keypair fixture for local hermetic testing and development.
 * Uses a fixed 2048-bit RSA keypair so dev tokens remain valid across server restarts.
 * Strictly forbidden in production.
 */
const DETERMINISTIC_TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoTxxzzk/DgLNTdS59lBs
lDmXswKvlyNza2G236OB2GQZPAC+4cds/f6KaoFEBSugdcKp5cjHPDMd0VigAeOL
rnfQthfCvlZIQJtoj105N1WHaVZmFFBubKRjXGqfjVYIBBIGp20baW10uPnOZxQm
BuWMLs4qtuueiErQ7TCMFRkjys7efP6q3/cKHVI5Tq5Kxn/i9vUmMvrt6+6wSmSL
tVO3KA4bRyESLQLAa9Pzj1g6V7whfvGx+06nPrD7PJj7Tblqyx+pjcsZF0Wm88e7
Lnpln39TH5O01yuZuKaoOoGjV0yT6DvKMz7VpEHKu1paRN+KpyBd0i704PFFfGF2
lwIDAQAB
-----END PUBLIC KEY-----`;

const DETERMINISTIC_TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
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

export function getTestKeyPair(): { privateKey: string; publicKey: string } {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test keypair fixture is strictly forbidden in production');
  }
  return {
    privateKey: DETERMINISTIC_TEST_PRIVATE_KEY,
    publicKey: DETERMINISTIC_TEST_PUBLIC_KEY,
  };
}

export function signTestJwt(payload: {
  sub: string;
  email: string;
  role?: string;
  aud?: string;
  iss?: string;
  exp?: string | number;
  kid?: string;
  algorithm?: jwt.Algorithm;
}): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test token signing is strictly forbidden in production');
  }

  const { privateKey } = getTestKeyPair();
  const options: jwt.SignOptions = {
    algorithm: payload.algorithm ?? 'RS256',
    subject: payload.sub,
    audience: payload.aud ?? 'authenticated',
    issuer: payload.iss ?? 'https://mock-supabase.local/auth/v1',
    expiresIn: (payload.exp ?? '7d') as any,
  };

  if (payload.kid) {
    options.keyid = payload.kid;
  }

  return jwt.sign(
    {
      email: payload.email,
      role: payload.role ?? 'authenticated',
    },
    privateKey,
    options,
  );
}
