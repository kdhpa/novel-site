import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  logServerError: vi.fn(),
  isGeminiAiEnabled: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: { $queryRaw: mocks.queryRaw },
}));
vi.mock('@novelverse/shared', () => ({
  logServerError: mocks.logServerError,
}));
vi.mock('@novelverse/shared/proxy', () => ({
  validateProxyTrustConfiguration: vi.fn(() => 'vercel'),
}));
vi.mock('@/lib/supabase', () => ({
  hasPersistentLocalStorage: false,
  hasSupabaseConfig: true,
  hasSupabaseS3Config: false,
}));
vi.mock('@/lib/server/ai-provider-policy', () => ({
  geminiPolicyHealth: vi.fn(() => ({ status: 'up', detail: 'disabled' })),
  replicatePolicyHealth: vi.fn(() => ({ status: 'up', detail: 'configured' })),
}));
vi.mock('@novelverse/db', () => ({
  isGeminiAiEnabled: mocks.isGeminiAiEnabled,
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('BACKUP_RETENTION_DAYS', '30');
  vi.stubEnv('NEXT_PUBLIC_PRIVACY_CONTACT', 'privacy@novelverse.test');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'google-client-id');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-client-secret');
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('EMAIL_FROM', '');
  mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  mocks.isGeminiAiEnabled.mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/health', () => {
  it('선택적 이메일 발송이 없어도 나머지 운영 점검이 정상이면 200을 반환한다', async () => {
    const response = await GET(new NextRequest('https://novelverse.test/api/health'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.checks.authEmail).toEqual({
      status: 'up',
      detail: 'optional transactional email disabled',
    });
  });

  it('Google이 유일한 신규 가입 경로인데 OAuth 설정이 없으면 503을 반환한다', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');

    const response = await GET(new NextRequest('https://novelverse.test/api/health'));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.status).toBe('unhealthy');
    expect(payload.checks.googleAuth.status).toBe('down');
  });

  it('선택적 이메일 환경변수 중 하나만 설정되면 불완전한 구성으로 거부한다', async () => {
    vi.stubEnv('RESEND_API_KEY', 'configured-key');
    vi.stubEnv('EMAIL_FROM', '');

    const response = await GET(new NextRequest('https://novelverse.test/api/health'));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.status).toBe('unhealthy');
    expect(payload.checks.authEmail.status).toBe('down');
  });
});
