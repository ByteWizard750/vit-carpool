import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

/**
 * Deterministic RSA Keypair fixture for local hermetic testing.
 * Uses native Node crypto and standard jsonwebtoken.
 */
let testPrivateKey: string | null = null;
let testPublicKey: string | null = null;

export function getTestKeyPair(): { privateKey: string; publicKey: string } {
  if (!testPrivateKey || !testPublicKey) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
    testPrivateKey = privateKey;
    testPublicKey = publicKey;
  }
  return { privateKey: testPrivateKey, publicKey: testPublicKey };
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
  const { privateKey } = getTestKeyPair();
  const options: jwt.SignOptions = {
    algorithm: payload.algorithm ?? 'RS256',
    subject: payload.sub,
    audience: payload.aud ?? 'authenticated',
    issuer: payload.iss ?? 'https://mock-supabase.local/auth/v1',
    expiresIn: (payload.exp ?? '1h') as any,
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

