import { describe, expect, it } from 'vitest';
import { getProxyAuthRedirectTarget } from './proxy-auth';

describe('web proxy authentication boundary', () => {
  it.each([
    '/library',
    '/dashboard',
    '/novels/new',
    '/novels/novel-1/edit',
    '/novels/novel-1/chapters/new',
    '/novels/novel-1/characters',
    '/settings',
    '/admin/reviews',
  ])('redirects anonymous protected requests: %s', (pathname) => {
    expect(getProxyAuthRedirectTarget({
      pathname,
      search: '?page=2',
      isLoggedIn: false,
    })).toBe(`/login?callbackUrl=${encodeURIComponent(`${pathname}?page=2`)}`);
  });

  it('keeps public content available without a session', () => {
    expect(getProxyAuthRedirectTarget({
      pathname: '/novels/novel-1',
      search: '',
      isLoggedIn: false,
    })).toBeNull();
  });

  it.each(['/login', '/register'])('redirects logged-in users away from %s', (pathname) => {
    expect(getProxyAuthRedirectTarget({
      pathname,
      search: '',
      isLoggedIn: true,
    })).toBe('/');
  });

  it('redirects a non-admin session away from admin routes', () => {
    expect(getProxyAuthRedirectTarget({
      pathname: '/admin/reviews',
      search: '',
      isLoggedIn: true,
      role: 'USER',
    })).toBe('/');
    expect(getProxyAuthRedirectTarget({
      pathname: '/admin/reviews',
      search: '',
      isLoggedIn: true,
      role: 'ADMIN',
    })).toBeNull();
  });
});
