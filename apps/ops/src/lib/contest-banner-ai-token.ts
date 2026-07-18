import crypto from 'node:crypto';

export const CONTEST_BANNER_AI_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
export const CONTEST_BANNER_AI_TOKEN_PURPOSE = 'ops-contest-banner' as const;

const SIGNING_CONTEXT = 'novelverse:ops-contest-banner-ai-job:v1';
const MAX_TOKEN_LENGTH = 2_048;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type ContestBannerAiTokenPayload = {
  purpose: typeof CONTEST_BANNER_AI_TOKEN_PURPOSE;
  jobId: string;
  userId: string;
  nonce: string;
  expiresAt: number;
};

function signingSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET must be set to sign Ops banner AI job tokens');
  return secret;
}

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signatureFor(encodedPayload: string) {
  return toBase64Url(
    crypto
      .createHmac('sha256', signingSecret())
      .update(SIGNING_CONTEXT)
      .update('\0')
      .update(encodedPayload)
      .digest(),
  );
}

export function signContestBannerAiToken(
  payload: Omit<ContestBannerAiTokenPayload, 'purpose'>,
) {
  const encodedPayload = toBase64Url(JSON.stringify({
    purpose: CONTEST_BANNER_AI_TOKEN_PURPOSE,
    ...payload,
  } satisfies ContestBannerAiTokenPayload));
  return `${encodedPayload}.${signatureFor(encodedPayload)}`;
}

export function verifyContestBannerAiToken(token: string) {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
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

  const expected = Buffer.from(signatureFor(encodedPayload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as Partial<ContestBannerAiTokenPayload>;
    const now = Date.now();
    if (
      payload.purpose !== CONTEST_BANNER_AI_TOKEN_PURPOSE ||
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
      payload.expiresAt! <= now ||
      payload.expiresAt! > now + CONTEST_BANNER_AI_TOKEN_TTL_MS + MAX_CLOCK_SKEW_MS
    ) {
      return null;
    }
    return payload as ContestBannerAiTokenPayload;
  } catch {
    return null;
  }
}
