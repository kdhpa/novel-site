import { afterEach, describe, expect, it } from 'vitest';
import { absoluteUrl, getSiteUrl } from './site';

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

describe('공개 사이트 URL', () => {
  it('공개 앱 URL의 경로를 제거하고 절대 URL을 만든다', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://novel.example/base?preview=1';
    expect(getSiteUrl().toString()).toBe('https://novel.example/');
    expect(absoluteUrl('/novels/one')).toBe('https://novel.example/novels/one');
  });

  it('인증 정보가 포함된 URL은 안전한 로컬 기본값으로 대체한다', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://secret@example.com';
    expect(getSiteUrl().origin).toBe('http://localhost:3000');
  });
});
