import { describe, expect, it } from 'vitest';
import {
  parseAiProviderSettingInput,
  parseRejectInput,
  parseRoleInput,
  resolveRoleMutationSettings,
  parseSuspensionInput,
  parseVisibilityInput,
  readEmptyJsonBody,
  readJsonBody,
} from './admin-mutation-validation';

describe('관리자 변경 입력 검증', () => {
  it('잘못된 JSON 본문을 거부한다', async () => {
    const result = await readJsonBody(new Request('https://example.test', {
      method: 'POST',
      body: '{"note":',
      headers: { 'Content-Type': 'application/json' },
    }));

    expect(result).toEqual({ success: false, error: '올바른 JSON 요청 본문을 보내 주세요.' });
  });

  it('입력이 없는 작업은 빈 본문과 빈 객체만 허용한다', async () => {
    const empty = await readEmptyJsonBody(new Request('https://example.test', { method: 'POST' }));
    const object = await readEmptyJsonBody(new Request('https://example.test', {
      method: 'POST',
      body: '{}',
    }));
    const malformed = await readEmptyJsonBody(new Request('https://example.test', {
      method: 'POST',
      body: '{',
    }));
    const extra = await readEmptyJsonBody(new Request('https://example.test', {
      method: 'POST',
      body: '{"force":true}',
    }));

    expect(empty.success).toBe(true);
    expect(object.success).toBe(true);
    expect(malformed.success).toBe(false);
    expect(extra.success).toBe(false);
  });

  it('반려 사유의 허용 필드와 길이를 엄격히 검증한다', () => {
    expect(parseRejectInput({ note: '  보완 필요  ' })).toEqual({
      success: true,
      data: { note: '보완 필요' },
    });
    expect(parseRejectInput({ note: '보완 필요', role: 'ADMIN' }).success).toBe(false);
    expect(parseRejectInput({ note: '가'.repeat(1001) }).success).toBe(false);
  });

  it('공개 여부는 boolean만 허용한다', () => {
    expect(parseVisibilityInput({ isPublished: false })).toEqual({
      success: true,
      data: { isPublished: false },
    });
    expect(parseVisibilityInput({ isPublished: 'false' }).success).toBe(false);
    expect(parseVisibilityInput({ isPublished: true, extra: true }).success).toBe(false);
  });

  it('AI 공급자 설정은 enabled boolean만 허용한다', () => {
    expect(parseAiProviderSettingInput({ enabled: true })).toEqual({
      success: true,
      data: { enabled: true },
    });
    expect(parseAiProviderSettingInput({ enabled: 'true' }).success).toBe(false);
    expect(parseAiProviderSettingInput({ enabled: true, apiKey: 'secret' }).success).toBe(false);
  });

  it('역할과 작가 인증 여부를 allowlist로 검증한다', () => {
    expect(parseRoleInput({ role: 'AUTHOR', isVerifiedAuthor: true, canSkipReview: true })).toEqual({
      success: true,
      data: { role: 'AUTHOR', isVerifiedAuthor: true, canSkipReview: true },
    });
    expect(parseRoleInput({ role: 'AUTHOR' })).toEqual({
      success: true,
      data: { role: 'AUTHOR' },
    });
    expect(parseRoleInput({ role: 'OWNER' }).success).toBe(false);
    expect(parseRoleInput({ role: 'USER', isVerifiedAuthor: 1 }).success).toBe(false);
    expect(parseRoleInput({ role: 'AUTHOR', canSkipReview: 1 }).success).toBe(false);
    expect(parseRoleInput({ role: 'USER', unexpected: false }).success).toBe(false);
  });

  it('수정 재심사 면제는 작가에게만 허용하고 누락 시 작가의 현재 값을 보존한다', () => {
    expect(resolveRoleMutationSettings(
      { role: 'AUTHOR', canSkipReview: true },
      { canSkipReview: false },
    )).toEqual({ isVerifiedAuthor: true, canSkipReview: true });
    expect(resolveRoleMutationSettings(
      { role: 'AUTHOR' },
      { canSkipReview: true },
    )).toEqual({ isVerifiedAuthor: true, canSkipReview: true });
    expect(resolveRoleMutationSettings(
      { role: 'USER', isVerifiedAuthor: true, canSkipReview: true },
      { canSkipReview: true },
    )).toEqual({ isVerifiedAuthor: true, canSkipReview: false });
    expect(resolveRoleMutationSettings(
      { role: 'ADMIN', canSkipReview: true },
      { canSkipReview: true },
    )).toEqual({ isVerifiedAuthor: true, canSkipReview: false });
  });

  it('계정 정지는 bounded 사유를 요구하고 해제 시 사유를 지운다', () => {
    expect(parseSuspensionInput({ suspended: true, reason: '  반복적인 괴롭힘  ' })).toEqual({
      success: true,
      data: { suspended: true, reason: '반복적인 괴롭힘' },
    });
    expect(parseSuspensionInput({ suspended: false })).toEqual({
      success: true,
      data: { suspended: false, reason: null },
    });
    expect(parseSuspensionInput({ suspended: true, reason: '' }).success).toBe(false);
    expect(parseSuspensionInput({ suspended: true, reason: '가'.repeat(501) }).success).toBe(false);
    expect(parseSuspensionInput({ suspended: false, role: 'ADMIN' }).success).toBe(false);
  });
});
