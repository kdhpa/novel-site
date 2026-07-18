import { normalizeIdentityEmail } from './identity';

export type GoogleOAuthProfile = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
};

export function isVerifiedGoogleProfile(profile: unknown): profile is GoogleOAuthProfile & {
  sub: string;
  email: string;
  email_verified: true;
} {
  if (!profile || typeof profile !== 'object') return false;
  const candidate = profile as GoogleOAuthProfile;
  return candidate.email_verified === true
    && typeof candidate.sub === 'string'
    && candidate.sub.length > 0
    && typeof candidate.email === 'string'
    && candidate.email.trim().length > 3
    && candidate.email.length <= 255
    && candidate.email.includes('@');
}

export function mapVerifiedGoogleProfile(profile: unknown) {
  if (!isVerifiedGoogleProfile(profile)) {
    throw new Error('Google 계정의 이메일 인증 상태를 확인할 수 없습니다.');
  }

  return {
    id: profile.sub,
    email: normalizeIdentityEmail(profile.email),
    emailVerified: new Date(),
    name: typeof profile.name === 'string' ? profile.name : null,
    image: typeof profile.picture === 'string' ? profile.picture : null,
    nickname: null,
    role: 'USER' as const,
    isVerifiedAuthor: false,
  };
}
