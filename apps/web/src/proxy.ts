// Authentication proxy for NovelVerse.
import NextAuth from 'next-auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  buildNonceContentSecurityPolicy,
  createContentSecurityPolicyNonce,
} from '@novelverse/shared/content-security-policy';
import { authConfig } from '@/lib/auth.config';
import { getProxyAuthRedirectTarget } from '@/lib/server/proxy-auth';

const { auth } = NextAuth(authConfig);

function createNonceResponse(request: NextRequest) {
  const nonce = createContentSecurityPolicyNonce();
  const contentSecurityPolicy = buildNonceContentSecurityPolicy(nonce);
  const requestWithAuth = request as NextRequest & {
    auth?: { user?: { role?: string } } | null;
  };
  const redirectTarget = getProxyAuthRedirectTarget({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    isLoggedIn: Boolean(requestWithAuth.auth?.user),
    role: requestWithAuth.auth?.user?.role,
  });

  if (redirectTarget) {
    const redirectResponse = NextResponse.redirect(new URL(redirectTarget, request.url));
    redirectResponse.headers.set('Content-Security-Policy', contentSecurityPolicy);
    return redirectResponse;
  }

  const requestHeaders = new Headers(request.headers);

  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  return response;
}

export const proxy = auth((request) => createNonceResponse(request));

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff|woff2|ttf|eot|txt|xml)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
