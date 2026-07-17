import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@novelverse/db/client';
import {
  createContentViewerHash,
  getContentViewClientIp,
  getUtcViewBucket,
  insertUniqueContentViewAndIncrement,
  normalizeIpAddress,
} from './content-view';

function headers(values: Record<string, string> = {}) {
  const normalized = new Map(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return { get: (name: string) => normalized.get(name.toLowerCase()) || null };
}

const hashScope = {
  targetType: 'novel' as const,
  targetId: 'novel-1',
  bucketStart: new Date('2026-07-17T00:00:00.000Z'),
};

function transactionWithInsertResult(inserted: boolean) {
  const queryRaw = vi.fn().mockResolvedValue(inserted ? [{ id: 'view-1' }] : []);
  const novelUpdate = vi.fn().mockResolvedValue({ id: 'novel-1' });
  const chapterUpdate = vi.fn().mockResolvedValue({ id: 'chapter-1' });
  const transaction = {
    $queryRaw: queryRaw,
    novel: { update: novelUpdate },
    chapter: { update: chapterUpdate },
  } as unknown as Prisma.TransactionClient;

  return { transaction, queryRaw, novelUpdate, chapterUpdate };
}

describe('content view identity', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('명시한 일반 프록시 홉을 기준으로 IP를 정규화한다', () => {
    vi.stubEnv('TRUSTED_PROXY_PROVIDER', 'generic');
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(normalizeIpAddress('203.0.113.8:4321')).toBe('203.0.113.8');
    expect(normalizeIpAddress('[2001:db8::1]:443')).toBe('2001:db8::1');
    expect(normalizeIpAddress('::ffff:192.0.2.4')).toBe('192.0.2.4');
    expect(normalizeIpAddress('not-an-ip')).toBeNull();
    expect(getContentViewClientIp(headers({
      'x-forwarded-for': '203.0.113.10, 10.0.0.1',
      'x-real-ip': '192.0.2.1',
    }))).toBe('203.0.113.10');
  });

  it('기본 설정에서는 공격자가 보낸 전달 헤더를 조회 식별자에 쓰지 않는다', () => {
    vi.stubEnv('TRUSTED_PROXY_PROVIDER', 'none');
    expect(getContentViewClientIp(headers({
      'cf-connecting-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.2',
    }))).toBe('unknown');
  });

  it('로그인 사용자는 헤더와 무관한 계정 기반 해시를 사용한다', () => {
    const first = createContentViewerHash({
      ...hashScope,
      userId: 'user-1',
      headers: headers({ 'x-forwarded-for': '203.0.113.1', 'user-agent': 'A' }),
      secret: 'test-secret',
    });
    const second = createContentViewerHash({
      ...hashScope,
      userId: 'user-1',
      headers: headers({ 'x-forwarded-for': '198.51.100.2', 'user-agent': 'B' }),
      secret: 'test-secret',
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('비로그인 사용자는 IP와 User-Agent 조합으로 구분한다', () => {
    const base = createContentViewerHash({
      ...hashScope,
      headers: headers({ 'x-forwarded-for': '203.0.113.1', 'user-agent': 'Browser A' }),
      secret: 'test-secret',
    });
    const differentAgent = createContentViewerHash({
      ...hashScope,
      headers: headers({ 'x-forwarded-for': '203.0.113.1', 'user-agent': 'Browser B' }),
      secret: 'test-secret',
    });

    expect(base).not.toBe(differentAgent);
  });

  it('날짜와 콘텐츠마다 서로 연결할 수 없는 별도 해시를 만든다', () => {
    const shared = {
      userId: 'user-1',
      headers: headers(),
      secret: 'test-secret',
    };
    const first = createContentViewerHash({ ...hashScope, ...shared });
    const otherTarget = createContentViewerHash({
      ...hashScope,
      ...shared,
      targetId: 'novel-2',
    });
    const otherDay = createContentViewerHash({
      ...hashScope,
      ...shared,
      bucketStart: new Date('2026-07-18T00:00:00.000Z'),
    });

    expect(first).not.toBe(otherTarget);
    expect(first).not.toBe(otherDay);
  });

  it('UTC 자정 단위의 일일 버킷을 만든다', () => {
    expect(getUtcViewBucket(new Date('2026-07-17T23:59:59.999Z')).toISOString())
      .toBe('2026-07-17T00:00:00.000Z');
    expect(getUtcViewBucket(new Date('2026-07-18T00:00:00.000Z')).toISOString())
      .toBe('2026-07-18T00:00:00.000Z');
  });
});

describe('unique content view persistence', () => {
  it('ON CONFLICT DO NOTHING으로 중복이면 카운터를 올리지 않는다', async () => {
    const { transaction, queryRaw, novelUpdate, chapterUpdate } = transactionWithInsertResult(false);

    const result = await insertUniqueContentViewAndIncrement(transaction, {
      targetType: 'novel',
      targetId: 'novel-1',
      viewerHash: 'viewer-1',
      bucketStart: new Date('2026-07-17T00:00:00.000Z'),
      viewId: 'view-1',
    });

    expect(result).toBe(false);
    expect(novelUpdate).not.toHaveBeenCalled();
    expect(chapterUpdate).not.toHaveBeenCalled();
    const sql = Array.from(queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO NOTHING');
  });

  it('고유한 작품 조회만 작품 카운터를 올린다', async () => {
    const { transaction, novelUpdate, chapterUpdate } = transactionWithInsertResult(true);

    const result = await insertUniqueContentViewAndIncrement(transaction, {
      targetType: 'novel',
      targetId: 'novel-1',
      viewerHash: 'viewer-1',
      bucketStart: new Date('2026-07-17T00:00:00.000Z'),
      viewId: 'view-1',
    });

    expect(result).toBe(true);
    expect(novelUpdate).toHaveBeenCalledOnce();
    expect(chapterUpdate).not.toHaveBeenCalled();
  });

  it('고유한 회차 조회만 회차 카운터를 올린다', async () => {
    const { transaction, novelUpdate, chapterUpdate } = transactionWithInsertResult(true);

    await insertUniqueContentViewAndIncrement(transaction, {
      targetType: 'chapter',
      targetId: 'chapter-1',
      viewerHash: 'viewer-1',
      bucketStart: new Date('2026-07-17T00:00:00.000Z'),
      viewId: 'view-1',
    });

    expect(chapterUpdate).toHaveBeenCalledOnce();
    expect(novelUpdate).not.toHaveBeenCalled();
  });
});
