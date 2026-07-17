import { describe, expect, it } from 'vitest';
import {
  buildOAuthNicknameCandidates,
  foldAsciiCase,
  normalizeIdentityEmail,
  normalizeNicknameDisplay,
  normalizeNicknameKey,
  normalizeTagKey,
} from './identity';

describe('account identity normalization', () => {
  it('호환 문자 이메일을 NFKC와 ASCII 소문자로 정규화한다', () => {
    expect(normalizeIdentityEmail(' ＵＳＥＲ＠Ｅｘａｍｐｌｅ．ＣＯＭ '))
      .toBe('user@example.com');
    expect(normalizeIdentityEmail('\u3000İD＠ＥＸＡＭＰＬＥ．ＣＯＭ\u00a0'))
      .toBe('İd@example.com');
  });

  it('닉네임 표시는 NFKC로 보존하고 고유 키는 소문자로 만든다', () => {
    expect(normalizeNicknameDisplay(' Ｎｏｖｅｌ작가 ')).toBe('Novel작가');
    expect(normalizeNicknameKey(' Ｎｏｖｅｌ작가 ')).toBe('novel작가');
    expect(normalizeNicknameKey(' İDOL ')).toBe('İdol');
  });

  it('비ASCII 대소문자는 보존하고 ASCII만 locale 독립적으로 접는다', () => {
    expect(foldAsciiCase('ABC-İ-Ä')).toBe('abc-İ-Ä');
    expect(normalizeTagKey('　ＲＯＭＡＮＣＥ　')).toBe('romance');
    expect(normalizeTagKey('ÄBC')).toBe('Äbc');
    expect(normalizeTagKey('äBC')).toBe('äbc');
  });

  it('OAuth 닉네임을 2~20자로 만들고 충돌용 사용자 ID suffix 후보를 제공한다', () => {
    const candidates = buildOAuthNicknameCandidates({
      name: ' Ｎｏｖｅｌ   Writer With A Very Long Name ',
      email: 'writer@example.com',
      userId: 'cm1234567890abcdef',
    });
    expect(candidates[0]).toBe('Novel Writer With A');
    expect(candidates).toHaveLength(3);
    expect(candidates.every((candidate) => candidate.length >= 2 && candidate.length <= 20)).toBe(true);
    expect(candidates[1]).toContain('7890abcdef');
  });
});
