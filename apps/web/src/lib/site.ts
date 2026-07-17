export const SITE_NAME = 'NovelVerse';
export const SITE_TITLE = 'NovelVerse - 웹소설 플랫폼';
export const SITE_DESCRIPTION =
  'AI 이미지 생성과 작가 도구를 갖춘 웹소설 플랫폼입니다. 작품을 발견하고, 읽고, 연재하세요.';
export const DEFAULT_SOCIAL_IMAGE = '/images/home-hero-novelverse.png';

function withProtocol(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function getSiteUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000';

  try {
    const siteUrl = new URL(withProtocol(configuredUrl));
    if (!['http:', 'https:'].includes(siteUrl.protocol) || siteUrl.username || siteUrl.password) {
      throw new Error('invalid public site URL');
    }
    siteUrl.pathname = '/';
    siteUrl.search = '';
    siteUrl.hash = '';
    return siteUrl;
  } catch {
    return new URL('http://localhost:3000');
  }
}

export function absoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}
