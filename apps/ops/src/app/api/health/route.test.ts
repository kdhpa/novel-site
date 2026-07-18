import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const releaseSha = '1234567890abcdef1234567890abcdef12345678';

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  logServerError: vi.fn(),
}));

vi.mock('@novelverse/db', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
  },
}));

vi.mock('@novelverse/shared', () => ({
  logServerError: mocks.logServerError,
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RELEASE_SHA', releaseSha);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ops health route', () => {
  it('returns ok when the database query succeeds', async () => {
    mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({ status: 'ok', release: releaseSha });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });

  it('returns an opaque unhealthy response and logs database failures', async () => {
    const databaseError = new Error('secret database connection detail');
    mocks.queryRaw.mockRejectedValue(databaseError);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(body).toEqual({ status: 'unhealthy', release: releaseSha });
    expect(JSON.stringify(body)).not.toContain(databaseError.message);
    expect(mocks.logServerError).toHaveBeenCalledWith('ops-health.database', databaseError);
  });
});
