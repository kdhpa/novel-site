import { describe, expect, it, vi } from 'vitest';
import type { ImageGenerationJob } from '@novelverse/db';

vi.mock('@novelverse/db', () => ({ prisma: {} }));
vi.mock('@novelverse/auth', () => ({ consumeSecurityRateLimit: vi.fn() }));
vi.mock('@novelverse/shared', () => ({ logServerError: vi.fn() }));

import {
  contestBannerAiJobSnapshot,
  isAmbiguousContestBannerProviderCreation,
  parseContestBannerAiJobInput,
} from './contest-banner-ai-jobs';

function job(overrides: Partial<ImageGenerationJob> = {}) {
  return {
    id: 'job-a',
    providerPredictionId: 'prediction-a',
    clientRequestId: 'request-a',
    tokenNonce: 'nonce-that-is-long-enough',
    userId: 'admin-a',
    novelId: null,
    type: 'contest-banner',
    prompt: 'prompt',
    status: 'processing',
    imageUrl: null,
    providerImageUrl: null,
    storageProvider: 'none',
    error: null,
    metadata: null,
    tokenExpiresAt: new Date(Date.now() + 60_000),
    finalizationLeaseUntil: null,
    finalizationLeaseToken: null,
    finalizationAttempts: 0,
    nextFinalizationAt: null,
    lastFinalizationError: null,
    targetBoundAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } satisfies ImageGenerationJob;
}

describe('Ops contest banner AI jobs', () => {
  it('허용된 세 필드와 스타일만 받는다', () => {
    expect(parseContestBannerAiJobInput({
      prompt: ' 마법 도시 ',
      style: 'fantasy',
      clientRequestId: 'request_1234',
    })).toEqual({
      prompt: '마법 도시',
      style: 'fantasy',
      clientRequestId: 'request_1234',
    });

    expect(() => parseContestBannerAiJobInput({
      prompt: 'banner',
      style: 'unknown',
      clientRequestId: 'request_1234',
    })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => parseContestBannerAiJobInput({
      prompt: 'banner',
      style: 'anime',
      clientRequestId: 'request_1234',
      providerUrl: 'https://attacker.test/image',
    })).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('활성 저장 lease는 외부 상태 finalizing으로만 노출한다', () => {
    const snapshot = contestBannerAiJobSnapshot(job({
      providerImageUrl: 'https://output.replicate.delivery/image.webp',
      finalizationLeaseToken: 'lease-a',
      finalizationLeaseUntil: new Date(Date.now() + 30_000),
    }));
    expect(snapshot).toMatchObject({
      status: 'finalizing',
      imageUrl: null,
      error: null,
    });
  });

  it('성공 전에는 provider URL을 imageUrl로 노출하지 않는다', () => {
    expect(contestBannerAiJobSnapshot(job({
      providerImageUrl: 'https://output.replicate.delivery/image.webp',
    })).imageUrl).toBeNull();
    expect(contestBannerAiJobSnapshot(job({
      status: 'succeeded',
      imageUrl: '/assets/contest-banners/1234567890abcdef12345678.webp',
    })).imageUrl).toMatch(/^\/assets\/contest-banners\//);
  });

  it('공급자 생성 결과가 불명한 작업은 자동 재호출 대상으로 보지 않도록 구분한다', () => {
    const now = new Date('2026-07-19T00:00:00.000Z');

    expect(isAmbiguousContestBannerProviderCreation(job({
      providerPredictionId: null,
      status: 'starting',
      finalizationLeaseUntil: new Date(now.getTime() - 1),
    }), now)).toBe(true);
    expect(isAmbiguousContestBannerProviderCreation(job({
      providerPredictionId: null,
      status: 'starting',
      finalizationLeaseUntil: new Date(now.getTime() + 1),
    }), now)).toBe(false);
    expect(isAmbiguousContestBannerProviderCreation(job({
      providerPredictionId: 'prediction-a',
      status: 'starting',
      finalizationLeaseUntil: null,
    }), now)).toBe(false);
  });
});
