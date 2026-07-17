import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAccountDeletionUrl,
  buildAccountExportUrl,
  buildEmailVerificationUrl,
  isAuthEmailConfigured,
  isCredentialsRegistrationEnabled,
  sendEmailVerification,
} from './auth-email';

describe('auth email', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'NovelVerse <auth@example.com>');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://novel.example');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('운영에서는 Resend 키와 발신자가 모두 있어야 credentials 가입을 연다', () => {
    expect(isAuthEmailConfigured()).toBe(true);
    expect(isCredentialsRegistrationEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isCredentialsRegistrationEnabled({
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_key',
      EMAIL_FROM: 'auth@example.com',
    })).toBe(true);
  });

  it('raw token을 URL에만 넣고 Resend HTTP API에는 인증 헤더와 idempotency key를 보낸다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendEmailVerification('user@example.com', 'raw-secret-token');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer re_test');
    expect(new Headers(init.headers).get('idempotency-key')).not.toContain('raw-secret-token');
    expect(String(init.body)).toContain(encodeURIComponent('raw-secret-token'));
  });

  it('검증 링크의 이메일과 토큰을 URLSearchParams로 안전하게 인코딩한다', () => {
    const result = new URL(buildEmailVerificationUrl('user+tag@example.com', 'a/b?c'));
    expect(result.origin).toBe('https://novel.example');
    expect(result.searchParams.get('email')).toBe('user+tag@example.com');
    expect(result.searchParams.get('token')).toBe('a/b?c');
  });

  it('계정 삭제 확인 링크는 설정 화면에 토큰만 안전하게 전달한다', () => {
    const result = new URL(buildAccountDeletionUrl('delete_token-123'));
    expect(result.pathname).toBe('/settings');
    expect(result.searchParams.get('deleteToken')).toBe('delete_token-123');
    expect(result.searchParams.has('email')).toBe(false);
  });

  it('데이터 내보내기 확인 링크도 설정 화면에 이메일 없이 토큰만 전달한다', () => {
    const result = new URL(buildAccountExportUrl('export_token-123'));
    expect(result.pathname).toBe('/settings');
    expect(result.searchParams.get('exportToken')).toBe('export_token-123');
    expect(result.searchParams.has('email')).toBe(false);
  });
});
