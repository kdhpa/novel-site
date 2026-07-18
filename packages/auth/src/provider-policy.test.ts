import { describe, expect, it } from 'vitest';
import {
  isAllowedOpsAdminAccount,
  isAllowedOpsGoogleProfile,
  isOpsPasswordLoginEnabled,
} from './provider-policy';

describe('Ops provider policy', () => {
  it('운영 Google SSO가 있으면 명시적 비상 플래그 없이는 비밀번호 로그인을 끈다', () => {
    const production = {
      NODE_ENV: 'production',
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
    };
    expect(isOpsPasswordLoginEnabled(production)).toBe(false);
    expect(isOpsPasswordLoginEnabled({ ...production, OPS_ALLOW_PASSWORD_LOGIN: 'true' })).toBe(true);
    expect(isOpsPasswordLoginEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isOpsPasswordLoginEnabled({
      NODE_ENV: 'production',
      OPS_ALLOW_PASSWORD_LOGIN: 'true',
    })).toBe(true);
    expect(isOpsPasswordLoginEnabled({ NODE_ENV: 'development' })).toBe(true);
  });

  it('설정된 Workspace hosted domain과 인증 이메일을 모두 확인한다', () => {
    const env = { OPS_GOOGLE_HOSTED_DOMAIN: 'novel.example' };
    expect(isAllowedOpsGoogleProfile({
      sub: 'google-user',
      email: 'admin@novel.example',
      email_verified: true,
      hd: 'novel.example',
    }, env)).toBe(true);
    expect(isAllowedOpsGoogleProfile({
      sub: 'google-user',
      email: 'admin@gmail.com',
      email_verified: true,
      hd: 'gmail.com',
    }, env)).toBe(false);
  });

  it('기존의 활성 ADMIN 계정만 Ops 로그인 대상으로 허용한다', () => {
    expect(isAllowedOpsAdminAccount({ role: 'ADMIN', suspendedAt: null })).toBe(true);
    expect(isAllowedOpsAdminAccount({ role: 'USER', suspendedAt: null })).toBe(false);
    expect(isAllowedOpsAdminAccount({ role: 'ADMIN', suspendedAt: new Date() })).toBe(false);
    expect(isAllowedOpsAdminAccount(null)).toBe(false);
  });
});
