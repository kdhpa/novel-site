import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTEST_BANNER_AI_TOKEN_PURPOSE,
  CONTEST_BANNER_AI_TOKEN_TTL_MS,
  signContestBannerAiToken,
  verifyContestBannerAiToken,
} from './contest-banner-ai-token';

const now = new Date('2026-07-19T00:00:00.000Z');
const testSecret = 'test-secret-that-is-at-least-thirty-two-characters';

function signLegacyWebImageJobToken(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', testSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('AUTH_SECRET', testSecret);
  vi.stubEnv('NEXTAUTH_SECRET', testSecret);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Ops contest banner AI job token', () => {
  it('별도 purpose가 포함된 토큰을 서명하고 검증한다', () => {
    const token = signContestBannerAiToken({
      jobId: 'job-a',
      userId: 'admin-a',
      nonce: 'nonce-that-is-long-enough',
      expiresAt: now.getTime() + CONTEST_BANNER_AI_TOKEN_TTL_MS,
    });

    expect(verifyContestBannerAiToken(token)).toMatchObject({
      purpose: CONTEST_BANNER_AI_TOKEN_PURPOSE,
      jobId: 'job-a',
      userId: 'admin-a',
    });
  });

  it('Web 이미지 작업 토큰의 교차 사용을 거부한다', () => {
    const webToken = signLegacyWebImageJobToken({
      jobId: 'job-a',
      userId: 'admin-a',
      nonce: 'nonce-that-is-long-enough',
      expiresAt: now.getTime() + CONTEST_BANNER_AI_TOKEN_TTL_MS,
    });

    expect(verifyContestBannerAiToken(webToken)).toBeNull();
  });

  it('만료되거나 변조된 토큰을 거부한다', () => {
    const token = signContestBannerAiToken({
      jobId: 'job-a',
      userId: 'admin-a',
      nonce: 'nonce-that-is-long-enough',
      expiresAt: now.getTime() + 1_000,
    });
    expect(verifyContestBannerAiToken(`${token}x`)).toBeNull();

    vi.advanceTimersByTime(1_001);
    expect(verifyContestBannerAiToken(token)).toBeNull();
  });
});
