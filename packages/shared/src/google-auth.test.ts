import { describe, expect, it } from 'vitest';
import { isVerifiedGoogleProfile, mapVerifiedGoogleProfile } from './google-auth';

describe('Google OAuth profile policy', () => {
  it('인증된 Google 이메일만 소문자로 정규화한다', () => {
    const result = mapVerifiedGoogleProfile({
      sub: 'google-user',
      email: ' User@Example.COM ',
      email_verified: true,
      name: '사용자',
      picture: 'https://lh3.googleusercontent.com/avatar',
    });

    expect(result).toMatchObject({ id: 'google-user', email: 'user@example.com' });
    expect(result.emailVerified).toBeInstanceOf(Date);
  });

  it('email_verified가 참이 아닌 프로필을 거부한다', () => {
    const profile = { sub: 'google-user', email: 'user@example.com', email_verified: false };
    expect(isVerifiedGoogleProfile(profile)).toBe(false);
    expect(() => mapVerifiedGoogleProfile(profile)).toThrow();
  });
});
