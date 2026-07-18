import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthClientIp, normalizeAuthEmail } from './security';

function headers(values: Record<string, string>) {
  return new Headers(values);
}

describe('운영자 인증 보안 유틸리티', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('이메일을 공백 제거 및 소문자로 정규화한다', () => {
    expect(normalizeAuthEmail('  Admin@NovelVerse.TEST ')).toBe('admin@novelverse.test');
    expect(normalizeAuthEmail('ＡＤＭＩＮ＠ＮＯＶＥＬ．ＴＥＳＴ')).toBe('admin@novel.test');
    expect(normalizeAuthEmail(null)).toBe('');
  });

  it('Cloudflare 설정에서는 CF-Connecting-IP만 신뢰한다', () => {
    vi.stubEnv('TRUSTED_PROXY_PROVIDER', 'cloudflare');
    const request = {
      headers: headers({
        'cf-connecting-ip': '203.0.113.7',
        'x-forwarded-for': '198.51.100.2, 10.0.0.2',
      }),
    };
    expect(getAuthClientIp(request)).toBe('203.0.113.7');
  });

  it('일반 프록시는 설정한 신뢰 홉을 오른쪽부터 계산한다', () => {
    vi.stubEnv('TRUSTED_PROXY_PROVIDER', 'generic');
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    const request = {
      headers: headers({ 'x-forwarded-for': '198.51.100.2, 10.0.0.2' }),
    };
    expect(getAuthClientIp(request)).toBe('198.51.100.2');
  });

  it('기본 설정에서는 전달 헤더를 신뢰하지 않는다', () => {
    vi.stubEnv('TRUSTED_PROXY_PROVIDER', 'none');
    const request = {
      headers: headers({ 'x-forwarded-for': '198.51.100.2' }),
    };
    expect(getAuthClientIp(request)).toBe('unknown');
  });
});
