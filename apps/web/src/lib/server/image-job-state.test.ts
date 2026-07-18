import { describe, expect, it } from 'vitest';
import {
  finalizationLeaseClaimWhere,
  getImageJobStorageTarget,
  imageFinalizationRetryPolicy,
  imageJobTokenMatchesRecord,
  isSupportedImageJobType,
  normalizeImageJobStatus,
  parsePortraitJobMetadata,
} from './image-job-state';

describe('image job state', () => {
  it('제공자 상태를 공개 상태로 정규화한다', () => {
    expect(normalizeImageJobStatus('successful')).toBe('succeeded');
    expect(normalizeImageJobStatus('cancelled')).toBe('canceled');
    expect(normalizeImageJobStatus('unknown')).toBe('processing');
  });

  it('Web 전용 이미지 작업 타입만 허용한다', () => {
    expect(isSupportedImageJobType('cover')).toBe(true);
    expect(isSupportedImageJobType('custom')).toBe(true);
    expect(isSupportedImageJobType('contest-banner')).toBe(false);
  });

  it('DB 레코드와 모든 권한 필드가 같은 토큰만 허용한다', () => {
    const tokenExpiresAt = new Date('2026-07-17T12:00:00.000Z');
    const job = {
      id: 'prediction-1',
      userId: 'user-1',
      novelId: 'novel-1',
      type: 'portrait',
      prompt: 'portrait prompt',
      tokenNonce: 'nonce-with-16-chars',
      tokenExpiresAt,
    };
    const payload = {
      jobId: job.id,
      userId: job.userId,
      nonce: job.tokenNonce,
      expiresAt: tokenExpiresAt.getTime(),
    };

    expect(imageJobTokenMatchesRecord(payload, job)).toBe(true);
    expect(imageJobTokenMatchesRecord({ ...payload, userId: 'other' }, job)).toBe(false);
    expect(imageJobTokenMatchesRecord({ ...payload, nonce: 'another-valid-nonce' }, job)).toBe(false);
  });

  it('토큰 비교는 작품·프롬프트를 capability에 넣지 않고 DB nonce를 사용한다', () => {
    const tokenExpiresAt = new Date('2026-07-17T12:00:00.000Z');
    const base = {
      jobId: 'job-1',
      userId: 'user-1',
      nonce: 'nonce-with-16-chars',
      expiresAt: tokenExpiresAt.getTime(),
    };

    expect(imageJobTokenMatchesRecord(
      base,
      {
        id: base.jobId,
        userId: base.userId,
        novelId: 'novel-after-create',
        type: 'cover',
        prompt: 'DB-only prompt',
        tokenNonce: base.nonce,
        tokenExpiresAt,
      }
    )).toBe(true);
  });

  it('초상화 메타데이터와 영구 저장 경로를 검증한다', () => {
    const metadata = {
      version: 1,
      characterId: 'character-1',
      genre: 'FANTASY',
      style: 'anime',
    };

    expect(parsePortraitJobMetadata(metadata)).toEqual(metadata);
    expect(getImageJobStorageTarget({
      userId: 'user-1',
      novelId: 'novel-1',
      type: 'portrait',
      metadata,
    })).toEqual({
      bucket: 'PORTRAITS',
      folder: 'novel-1-character-1',
    });
    expect(parsePortraitJobMetadata({ ...metadata, characterId: '' })).toBeNull();
  });

  it('lease claim은 미완료·미만료·lease 부재 또는 만료 작업으로 제한된다', () => {
    const now = new Date('2026-07-17T10:00:00.000Z');
    expect(finalizationLeaseClaimWhere('job-1', 'user-1', now)).toEqual({
      id: 'job-1',
      userId: 'user-1',
      imageUrl: null,
      tokenExpiresAt: { gt: now },
      status: { in: ['starting', 'processing'] },
      finalizationAttempts: { lt: 5 },
      AND: [
        {
          OR: [
            { nextFinalizationAt: null },
            { nextFinalizationAt: { lte: now } },
          ],
        },
        {
          OR: [
            { finalizationLeaseUntil: null },
            { finalizationLeaseUntil: { lt: now } },
          ],
        },
      ],
    });
  });

  it('영구 저장 실패는 지수 백오프 후 5회에서 종료한다', () => {
    expect(imageFinalizationRetryPolicy(1)).toEqual({
      exhausted: false,
      retryAfterMs: 15_000,
    });
    expect(imageFinalizationRetryPolicy(4)).toEqual({
      exhausted: false,
      retryAfterMs: 120_000,
    });
    expect(imageFinalizationRetryPolicy(5)).toEqual({
      exhausted: true,
      retryAfterMs: null,
    });
  });
});
