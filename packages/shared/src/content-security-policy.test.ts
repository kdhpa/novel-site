import { describe, expect, it } from 'vitest';
import {
  buildNonceContentSecurityPolicy,
  createContentSecurityPolicyNonce,
  getContentSecurityPolicyImageSources,
} from './content-security-policy';

describe('nonce content security policy', () => {
  it('creates unpredictable base64 nonces', () => {
    const first = createContentSecurityPolicyNonce();
    const second = createContentSecurityPolicyNonce();

    expect(first).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(second).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(first).not.toBe(second);
  });

  it('removes unsafe inline scripts in production while retaining inline styles', () => {
    const policy = buildNonceContentSecurityPolicy('dGVzdC1ub25jZQ==', {
      NODE_ENV: 'production',
      NEXT_PUBLIC_IMAGE_HOSTS: 'images.example.com',
    });

    const scriptDirective = policy.split('; ').find((value) => value.startsWith('script-src'));
    expect(scriptDirective).toContain("'nonce-dGVzdC1ub25jZQ=='");
    expect(scriptDirective).toContain("'strict-dynamic'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain('https://images.example.com');
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('allows only development eval and HMR connections outside production', () => {
    const policy = buildNonceContentSecurityPolicy('dGVzdC1ub25jZQ==', {
      NODE_ENV: 'development',
    });

    expect(policy).toContain("script-src 'self' 'nonce-dGVzdC1ub25jZQ==' 'strict-dynamic' 'unsafe-eval'");
    expect(policy).toContain("connect-src 'self' ws:");
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('accepts exact HTTPS image hosts and ignores malformed optional entries', () => {
    expect(getContentSecurityPolicyImageSources({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_IMAGE_HOSTS: "cdn.example.com,*.example.com,bad'host",
    })).toEqual(expect.arrayContaining([
      "'self'",
      'https://project.supabase.co',
      'https://cdn.example.com',
    ]));
    expect(getContentSecurityPolicyImageSources({
      NEXT_PUBLIC_IMAGE_HOSTS: '*.example.com',
    })).not.toContain('https://*.example.com');
  });

  it('rejects a nonce that could inject a directive', () => {
    expect(() => buildNonceContentSecurityPolicy("bad'; script-src *", {}))
      .toThrow(/nonce/);
  });
});
