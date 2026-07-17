import { describe, expect, it } from 'vitest';
import {
  isCredentialAuthenticationAllowed,
  isSessionInvalidatedByPasswordChange,
} from './auth-session';

describe('passwordChangedAt JWT invalidation', () => {
  it('비밀번호 변경 전 발급 토큰과 발급 시각이 없는 기존 토큰을 무효화한다', () => {
    const changedAt = new Date('2026-07-17T12:00:00.000Z');
    expect(isSessionInvalidatedByPasswordChange(changedAt.getTime() - 1, changedAt)).toBe(true);
    expect(isSessionInvalidatedByPasswordChange(undefined, changedAt)).toBe(true);
  });

  it('비밀번호 변경 후 발급 토큰과 변경 이력이 없는 계정은 유지한다', () => {
    const changedAt = new Date('2026-07-17T12:00:00.000Z');
    expect(isSessionInvalidatedByPasswordChange(changedAt.getTime(), changedAt)).toBe(false);
    expect(isSessionInvalidatedByPasswordChange(0, null)).toBe(false);
  });
});

describe('credentials verification gate', () => {
  it('비밀번호가 맞아도 이메일 미인증 계정은 거부한다', () => {
    expect(isCredentialAuthenticationAllowed({
      userExists: true,
      hasPassword: true,
      emailVerified: false,
      accountActive: true,
      passwordWithinLimit: true,
      passwordValid: true,
    })).toBe(false);
  });

  it('인증된 계정의 유효한 bounded 비밀번호만 허용한다', () => {
    expect(isCredentialAuthenticationAllowed({
      userExists: true,
      hasPassword: true,
      emailVerified: true,
      accountActive: true,
      passwordWithinLimit: true,
      passwordValid: true,
    })).toBe(true);
  });

  it('정지된 계정은 인증 상태와 비밀번호가 유효해도 거부한다', () => {
    expect(isCredentialAuthenticationAllowed({
      userExists: true,
      hasPassword: true,
      emailVerified: true,
      accountActive: false,
      passwordWithinLimit: true,
      passwordValid: true,
    })).toBe(false);
  });
});
