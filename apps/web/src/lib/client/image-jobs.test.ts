import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readRecoverableImageJob,
  writeRecoverableImageJob,
} from './image-jobs';

describe('recoverable image jobs', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('로그인 사용자와 일치하는 복구 레코드만 읽는다', () => {
    const storageKey = 'novelverse.image-job:user-a:context';
    writeRecoverableImageJob(storageKey, 'user-a', {
      ownerUserId: 'user-a',
      clientRequestId: 'client-request-id-0001',
      input: { type: 'portrait', characterId: 'character-1' },
    });

    expect(readRecoverableImageJob(storageKey, 'user-a')).toMatchObject({
      ownerUserId: 'user-a',
      clientRequestId: 'client-request-id-0001',
    });
    expect(readRecoverableImageJob(storageKey, 'user-b')).toBeNull();
    expect(values.has(storageKey)).toBe(false);
  });

  it('레코드 소유자와 현재 사용자가 다르면 저장하지 않는다', () => {
    writeRecoverableImageJob('scoped-key', 'user-a', {
      ownerUserId: 'user-b',
      clientRequestId: 'client-request-id-0002',
      input: { type: 'cover' },
    });

    expect(values.size).toBe(0);
  });
});
