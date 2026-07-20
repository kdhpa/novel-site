import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOpsAdmin: vi.fn(),
  acquireAdminRoleReadLock: vi.fn(),
  rootSettingFindUnique: vi.fn(),
  transactionSettingFindUnique: vi.fn(),
  settingUpsert: vi.fn(),
  currentAdminFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

const transactionClient = {
  $queryRaw: mocks.queryRaw,
  user: { findFirst: mocks.currentAdminFindFirst },
  aiProviderSetting: {
    findUnique: mocks.transactionSettingFindUnique,
    upsert: mocks.settingUpsert,
  },
  adminAuditLog: { create: mocks.auditCreate },
};

vi.mock('../../../../../lib/api', () => {
  class OpsApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    OpsApiError,
    requireOpsAdmin: mocks.requireOpsAdmin,
    ok: (data: unknown, init?: ResponseInit) => Response.json(
      { success: true, data },
      init,
    ),
    handleOpsApiError: (error: unknown, fallback: string) => error instanceof OpsApiError
      ? Response.json({ success: false, error: error.message }, { status: error.status })
      : Response.json({ success: false, error: fallback }, { status: 500 }),
  };
});

vi.mock('@novelverse/db', () => ({
  GEMINI_AI_PROVIDER: 'gemini',
  acquireAdminRoleReadLock: mocks.acquireAdminRoleReadLock,
  prisma: {
    aiProviderSetting: { findUnique: mocks.rootSettingFindUnique },
    $transaction: mocks.transaction,
  },
}));

import { GET, PATCH } from './route';

function patchRequest(body: unknown) {
  return new Request('https://ops.novelverse.test/api/ops/settings/ai', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOpsAdmin.mockResolvedValue({ id: 'admin-a', role: 'ADMIN' });
  mocks.acquireAdminRoleReadLock.mockResolvedValue(undefined);
  mocks.queryRaw.mockResolvedValue([]);
  mocks.currentAdminFindFirst.mockResolvedValue({ id: 'admin-a' });
  mocks.auditCreate.mockResolvedValue({ id: 'audit-a' });
  mocks.transaction.mockImplementation(
    (callback: (client: typeof transactionClient) => unknown) => callback(transactionClient),
  );
});

describe('Ops AI 설정 API', () => {
  it('GET은 활성 상태만 반환하고 API 키를 노출하지 않는다', async () => {
    mocks.rootSettingFindUnique.mockResolvedValue({
      enabled: true,
      updatedAt: new Date('2026-07-19T00:00:00.000Z'),
    });

    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      success: true,
      data: {
        provider: 'gemini',
        enabled: true,
        updatedAt: '2026-07-19T00:00:00.000Z',
      },
    });
    expect(text).not.toMatch(/api.?key|secret/i);
  });

  it('비활성화 설정과 감사 로그를 같은 트랜잭션에 기록한다', async () => {
    mocks.transactionSettingFindUnique.mockResolvedValue({
      enabled: true,
      updatedAt: new Date('2026-07-19T00:00:00.000Z'),
    });
    mocks.settingUpsert.mockResolvedValue({
      enabled: false,
      updatedAt: new Date('2026-07-19T01:00:00.000Z'),
    });

    const response = await PATCH(patchRequest({ enabled: false }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ enabled: false, changed: true });
    expect(mocks.acquireAdminRoleReadLock).toHaveBeenCalledWith(transactionClient);
    expect(mocks.settingUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { provider: 'gemini' },
      update: { enabled: false },
    }));
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        adminId: 'admin-a',
        action: 'ai.provider.disable',
        targetId: 'gemini',
        metadata: { previousEnabled: true, nextEnabled: false },
      }),
    }));
  });

  it('이미 같은 값이면 쓰기와 감사 로그를 생략한다', async () => {
    mocks.transactionSettingFindUnique.mockResolvedValue({
      enabled: true,
      updatedAt: new Date('2026-07-19T00:00:00.000Z'),
    });

    const response = await PATCH(patchRequest({ enabled: true }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ enabled: true, changed: false });
    expect(mocks.settingUpsert).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('추가 필드나 boolean이 아닌 값은 거부한다', async () => {
    const extraField = await PATCH(patchRequest({ enabled: true, apiKey: 'secret' }));
    const wrongType = await PATCH(patchRequest({ enabled: 'true' }));

    expect(extraField.status).toBe(400);
    expect(wrongType.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('트랜잭션 안에서 관리자 권한이 사라지면 변경을 차단한다', async () => {
    mocks.currentAdminFindFirst.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ enabled: false }));

    expect(response.status).toBe(403);
    expect(mocks.settingUpsert).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
