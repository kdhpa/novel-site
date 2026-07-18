import { describe, expect, it } from 'vitest';
import { normalizeTagNames } from './novel-tags';

describe('normalizeTagNames', () => {
  it('NFKC와 대소문자 기준으로 중복 태그를 하나로 합친다', () => {
    expect(normalizeTagNames([' Romance ', 'romance', 'ＲＯＭＡＮＣＥ', '판타지']))
      .toEqual([
        { name: 'Romance', normalizedName: 'romance' },
        { name: '판타지', normalizedName: '판타지' },
      ]);
  });

  it('빈 태그를 제거하고 최초 표기를 보존한다', () => {
    expect(normalizeTagNames(['', '   ', '\u3000', 'SF', 'sf']))
      .toEqual([{ name: 'SF', normalizedName: 'sf' }]);
  });

  it('비ASCII 대소문자는 서로 다른 태그 키로 보존한다', () => {
    expect(normalizeTagNames(['ÄBC', 'äBC']))
      .toEqual([
        { name: 'ÄBC', normalizedName: 'Äbc' },
        { name: 'äBC', normalizedName: 'äbc' },
      ]);
  });
});
