import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: prismaMocks.queryRaw,
    $executeRaw: prismaMocks.executeRaw,
  },
}));

import { ApiError } from './api';
import { assertRateLimit, getClientIp, resetRateLimit } from './rate-limit';

describe('database rate limiter', () => {
  beforeEach(() => {
    prismaMocks.queryRaw.mockReset();
    prismaMocks.executeRaw.mockReset().mockResolvedValue(0);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a request within the atomic database bucket limit', async () => {
    prismaMocks.queryRaw.mockResolvedValue([{ count: 1, resetAt: new Date(Date.now() + 60_000) }]);

    await expect(assertRateLimit({ key: 'db-pass', limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
    expect(prismaMocks.queryRaw).toHaveBeenCalledOnce();
  });

  it('rejects a database bucket that exceeded its limit', async () => {
    prismaMocks.queryRaw.mockResolvedValue([{ count: 2, resetAt: new Date(Date.now() + 60_000) }]);

    await expect(assertRateLimit({ key: 'db-block', limit: 1, windowMs: 60_000 })).rejects.toMatchObject({
      status: 429,
    } satisfies Partial<ApiError>);
  });

  it('fails over to a bounded in-memory bucket when PostgreSQL is unavailable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMocks.queryRaw.mockRejectedValue(new Error('database unavailable'));

    await expect(assertRateLimit({ key: 'fallback-block', limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
    await expect(assertRateLimit({ key: 'fallback-block', limit: 1, windowMs: 60_000 })).rejects.toMatchObject({
      status: 429,
    } satisfies Partial<ApiError>);

    consoleError.mockRestore();
  });

  it('clears both persistent and fallback state after a successful authentication', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMocks.queryRaw.mockRejectedValue(new Error('database unavailable'));

    await assertRateLimit({ key: 'reset-account', limit: 1, windowMs: 60_000 });
    await resetRateLimit('reset-account');
    await expect(assertRateLimit({ key: 'reset-account', limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
    expect(prismaMocks.executeRaw).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('uses only the header owned by the configured platform', () => {
    vi.stubEnv('TRUSTED_PROXY_PROVIDER', 'cloudflare');
    const request = new Request('https://example.com', {
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.2, 198.51.100.3',
      },
    });

    expect(getClientIp(request)).toBe('203.0.113.10');
  });

  it('ignores spoofable forwarding headers when proxy trust is disabled', () => {
    vi.stubEnv('TRUSTED_PROXY_PROVIDER', 'none');
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '198.51.100.2' },
    });

    expect(getClientIp(request)).toBe('unknown');
  });
});
