import { describe, expect, it } from 'vitest';
import {
  accountDeletionSchema,
  accountExportSchema,
  aiImageSchema,
  authEmailSchema,
  chapterSchema,
  emailVerificationSchema,
  passwordResetConfirmSchema,
  registerSchema,
  reviewSchema,
  userProfilePatchSchema,
} from './validation';

describe('API validation schemas', () => {
  it('rejects weak registration input', () => {
    expect(() => registerSchema.parse({ email: 'bad', password: 'short', nickname: 'a' })).toThrow();
  });

  it('normalizes registration email addresses', () => {
    const input = registerSchema.parse({
      email: '  Reader@Example.COM ',
      password: 'safe-password',
      nickname: '독자님',
    });

    expect(input.email).toBe('reader@example.com');
  });

  it('호환 문자 이메일과 닉네임을 NFKC로 정규화한다', () => {
    const input = registerSchema.parse({
      email: 'ＵＳＥＲ＠Ｅｘａｍｐｌｅ．ＣＯＭ',
      password: 'safe-password',
      nickname: ' Ｎｏｖｅｌ작가 ',
    });
    expect(input.email).toBe('user@example.com');
    expect(input.nickname).toBe('Novel작가');
  });

  it('allows only bounded profile fields and safe image URLs', () => {
    expect(userProfilePatchSchema.parse({ name: ' 독자 ', bio: null })).toEqual({ name: '독자', bio: null });
    expect(() => userProfilePatchSchema.parse({ role: 'ADMIN' })).toThrow();
    expect(() => userProfilePatchSchema.parse({ image: 'http://example.com/avatar.png' })).toThrow();
    expect(() => userProfilePatchSchema.parse({ bio: 'x'.repeat(501) })).toThrow();
  });

  it('bounds author-controlled rich text and AI prompts', () => {
    const clientRequestId = 'client-request-id-0001';
    expect(() => chapterSchema.parse({ title: '회차', content: 'x'.repeat(500_001) })).toThrow();
    expect(() => aiImageSchema.parse({
      type: 'cover',
      clientRequestId,
      prompt: 'x'.repeat(2_001),
    })).toThrow();
    expect(() => aiImageSchema.parse({
      type: 'cover',
      clientRequestId,
      unknown: true,
    })).toThrow();
    expect(() => aiImageSchema.parse({
      type: 'cover',
      clientRequestId,
      options: { style: 'anime', unknown: true },
    })).toThrow();
  });

  it('accepts only a valid review rating', () => {
    expect(reviewSchema.parse({ rating: 5, content: '좋아요' }).rating).toBe(5);
    expect(() => reviewSchema.parse({ rating: 6, content: 'bad' })).toThrow();
  });

  it('계정 복구 입력을 소문자 이메일·제한된 토큰·강한 비밀번호로 검증한다', () => {
    expect(authEmailSchema.parse({ email: ' User@Example.COM ' }).email)
      .toBe('user@example.com');
    expect(emailVerificationSchema.parse({
      email: 'user@example.com',
      token: 'a'.repeat(32),
    }).token).toHaveLength(32);
    expect(() => passwordResetConfirmSchema.parse({
      email: 'user@example.com',
      token: 'a'.repeat(32),
      password: 'short',
    })).toThrow();
  });

  it('계정 삭제 확인 이메일을 정규화하고 임의 필드는 거부한다', () => {
    expect(accountDeletionSchema.parse({
      emailConfirmation: ' USER@example.com ',
      token: 'd'.repeat(32),
    })).toEqual({ emailConfirmation: 'user@example.com', token: 'd'.repeat(32) });
    expect(() => accountDeletionSchema.parse({
      emailConfirmation: 'user@example.com',
      token: 'd'.repeat(32),
      role: 'ADMIN',
    })).toThrow();
    expect(accountExportSchema.parse({ token: 'e'.repeat(32) }))
      .toEqual({ token: 'e'.repeat(32) });
  });
});
