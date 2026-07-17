import crypto from 'node:crypto';

export type ImageJobTokenPayload = {
  jobId: string;
  userId: string;
  nonce: string;
  expiresAt: number;
};

export const IMAGE_JOB_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

const MAX_TOKEN_LENGTH = 2_048;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function getSigningSecret() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error('NEXTAUTH_SECRET must be set to sign image job tokens');
  }

  return secret;
}

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payload: string) {
  return toBase64Url(
    crypto.createHmac('sha256', getSigningSecret()).update(payload).digest()
  );
}

export function signImageJobToken(payload: ImageJobTokenPayload) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyImageJobToken(token: string): ImageJobTokenPayload | null {
  if (token.length > MAX_TOKEN_LENGTH) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;

  if (
    !encodedPayload ||
    !signature ||
    !/^[A-Za-z0-9_-]+$/.test(encodedPayload) ||
    !/^[A-Za-z0-9_-]+$/.test(signature)
  ) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as ImageJobTokenPayload;
    const now = Date.now();
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.jobId !== 'string' ||
      payload.jobId.length < 1 ||
      payload.jobId.length > 256 ||
      typeof payload.userId !== 'string' ||
      payload.userId.length < 1 ||
      payload.userId.length > 256 ||
      typeof payload.nonce !== 'string' ||
      payload.nonce.length < 16 ||
      payload.nonce.length > 256 ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= now ||
      payload.expiresAt > now + IMAGE_JOB_TOKEN_TTL_MS + MAX_CLOCK_SKEW_MS
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
