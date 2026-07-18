import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IMAGE_JOB_TOKEN_TTL_MS,
  signImageJobToken,
  verifyImageJobToken,
} from './image-job-token';

describe('image job tokens', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'test-secret-with-enough-entropy';
  });

  afterEach(() => {
    delete process.env.NEXTAUTH_SECRET;
    vi.useRealTimers();
  });

  it('짧은 작업 capability를 왕복한다', () => {
    const payload = {
      jobId: 'job-1',
      userId: 'user-1',
      nonce: 'nonce-with-16-chars',
      expiresAt: Date.now() + 60_000,
    };
    const token = signImageJobToken(payload);

    expect(token.length).toBeLessThan(512);
    expect(verifyImageJobToken(token)).toEqual(payload);
    expect(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8')).not.toContain('prompt');
  });

  it('변조 및 만료 토큰을 거부한다', () => {
    const token = signImageJobToken({
      jobId: 'job-1',
      userId: 'user-1',
      nonce: 'nonce-with-16-chars',
      expiresAt: 2,
    });

    expect(verifyImageJobToken(`${token}tampered`)).toBeNull();
    expect(verifyImageJobToken(token)).toBeNull();
  });

  it('허용 TTL보다 지나치게 먼 만료를 거부한다', () => {
    const token = signImageJobToken({
      jobId: 'job-1',
      userId: 'user-1',
      nonce: 'nonce-with-16-chars',
      expiresAt: Date.now() + IMAGE_JOB_TOKEN_TTL_MS + 6 * 60 * 1000,
    });

    expect(verifyImageJobToken(token)).toBeNull();
  });

  it('잘못된 세그먼트와 payload 필드를 거부한다', () => {
    const validToken = signImageJobToken({
      jobId: 'job-1',
      userId: 'user-1',
      nonce: 'nonce-with-16-chars',
      expiresAt: Date.now() + 60_000,
    });
    const invalidPayloadToken = signImageJobToken({
      jobId: '',
      userId: 'user-1',
      nonce: 'short',
      expiresAt: Date.now() + 60_000,
    });

    expect(verifyImageJobToken(`${validToken}.extra`)).toBeNull();
    expect(verifyImageJobToken(invalidPayloadToken)).toBeNull();
  });
});
