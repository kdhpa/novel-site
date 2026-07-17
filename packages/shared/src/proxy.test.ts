import { describe, expect, it } from 'vitest';
import {
  getTrustedClientIp,
  getTrustedProxyProvider,
  normalizeClientIpAddress,
  validateProxyTrustConfiguration,
} from './proxy';

function headers(values: Record<string, string> = {}) {
  return new Headers(values);
}

describe('trusted proxy client IP policy', () => {
  it('defaults to none and ignores every attacker-supplied forwarding header', () => {
    expect(getTrustedProxyProvider({})).toBe('none');
    expect(getTrustedClientIp(headers({
      'cf-connecting-ip': '203.0.113.7',
      'x-vercel-forwarded-for': '198.51.100.2',
      'x-forwarded-for': '192.0.2.3',
      'x-real-ip': '192.0.2.4',
      forwarded: 'for=192.0.2.5',
    }), {})).toBe('unknown');
  });

  it('vercel trusts only the Vercel-owned header', () => {
    expect(getTrustedClientIp(headers({
      'x-vercel-forwarded-for': '203.0.113.7',
      'cf-connecting-ip': '198.51.100.2',
      'x-forwarded-for': '192.0.2.3',
    }), { TRUSTED_PROXY_PROVIDER: 'vercel' })).toBe('203.0.113.7');

    expect(getTrustedClientIp(headers({
      'x-forwarded-for': '192.0.2.3',
    }), { TRUSTED_PROXY_PROVIDER: 'vercel' })).toBe('unknown');
  });

  it('cloudflare trusts only a single valid CF-Connecting-IP value', () => {
    const environment = { TRUSTED_PROXY_PROVIDER: 'cloudflare' };
    expect(getTrustedClientIp(headers({
      'cf-connecting-ip': '2001:db8::1',
      'x-vercel-forwarded-for': '198.51.100.2',
    }), environment)).toBe('2001:db8::1');
    expect(getTrustedClientIp(headers({
      'cf-connecting-ip': '203.0.113.7, 198.51.100.2',
    }), environment)).toBe('unknown');
  });

  it('generic proxy selects from the right by the configured trusted hop count', () => {
    const suppliedChain = headers({
      'x-forwarded-for': '192.0.2.200, 203.0.113.7, 10.0.0.2',
    });

    expect(getTrustedClientIp(suppliedChain, {
      TRUSTED_PROXY_PROVIDER: 'generic',
      TRUSTED_PROXY_HOPS: '2',
    })).toBe('203.0.113.7');
    expect(getTrustedClientIp(suppliedChain, {
      TRUSTED_PROXY_PROVIDER: 'generic',
      TRUSTED_PROXY_HOPS: '1',
    })).toBe('10.0.0.2');
  });

  it('generic mode ignores unrelated forwarding headers', () => {
    expect(getTrustedClientIp(headers({
      forwarded: 'for=203.0.113.7',
      'x-real-ip': '198.51.100.2',
    }), { TRUSTED_PROXY_PROVIDER: 'generic' })).toBe('unknown');
  });

  it('fails closed on invalid proxy configuration', () => {
    expect(() => getTrustedProxyProvider({ TRUSTED_PROXY_PROVIDER: 'auto' }))
      .toThrow(/TRUSTED_PROXY_PROVIDER/);
    expect(() => getTrustedClientIp(headers({
      'x-forwarded-for': '203.0.113.7',
    }), {
      TRUSTED_PROXY_PROVIDER: 'generic',
      TRUSTED_PROXY_HOPS: '0',
    })).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(() => validateProxyTrustConfiguration({
      TRUSTED_PROXY_PROVIDER: 'generic',
      TRUSTED_PROXY_HOPS: '33',
    })).toThrow(/TRUSTED_PROXY_HOPS/);
  });

  it('normalizes supported IP forms and rejects non-address input', () => {
    expect(normalizeClientIpAddress('203.0.113.8:4321')).toBe('203.0.113.8');
    expect(normalizeClientIpAddress('[2001:db8::1]:443')).toBe('2001:db8::1');
    expect(normalizeClientIpAddress('::ffff:192.0.2.4')).toBe('192.0.2.4');
    expect(normalizeClientIpAddress('not-an-ip')).toBeNull();
  });
});
