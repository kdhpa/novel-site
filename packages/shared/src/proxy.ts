import { isIP } from 'node:net';

export const TRUSTED_PROXY_PROVIDERS = [
  'none',
  'vercel',
  'cloudflare',
  'generic',
] as const;

export type TrustedProxyProvider = (typeof TRUSTED_PROXY_PROVIDERS)[number];

export type ProxyTrustEnvironment = {
  readonly [name: string]: string | undefined;
  TRUSTED_PROXY_PROVIDER?: string;
  TRUSTED_PROXY_HOPS?: string;
};

export type HeaderReader = {
  get(name: string): string | null;
};

export const UNKNOWN_CLIENT_IP = 'unknown';

const MAX_FORWARDED_HEADER_LENGTH = 2_048;
const MAX_TRUSTED_PROXY_HOPS = 32;

function removePort(value: string) {
  const bracketedIpv6 = value.match(/^\[([^\]]+)](?::\d+)?$/);
  if (bracketedIpv6) return bracketedIpv6[1];

  const ipv4WithPort = value.match(/^(.+):(\d+)$/);
  if (ipv4WithPort && isIP(ipv4WithPort[1]) === 4) return ipv4WithPort[1];

  return value;
}

export function normalizeClientIpAddress(value: string | null | undefined) {
  if (!value) return null;

  let candidate = value.trim().replace(/^"|"$/g, '');
  candidate = removePort(candidate);

  if (candidate.toLowerCase().startsWith('::ffff:')) {
    const mappedIpv4 = candidate.slice(7);
    if (isIP(mappedIpv4) === 4) return mappedIpv4;
  }

  return isIP(candidate) ? candidate.toLowerCase() : null;
}

export function getTrustedProxyProvider(
  environment: ProxyTrustEnvironment = process.env,
): TrustedProxyProvider {
  const configured = (environment.TRUSTED_PROXY_PROVIDER || 'none').trim().toLowerCase();
  if ((TRUSTED_PROXY_PROVIDERS as readonly string[]).includes(configured)) {
    return configured as TrustedProxyProvider;
  }

  throw new Error(
    `TRUSTED_PROXY_PROVIDER must be one of: ${TRUSTED_PROXY_PROVIDERS.join(', ')}`,
  );
}

function readBoundedHeader(headers: HeaderReader, name: string) {
  const value = headers.get(name);
  if (!value || value.length > MAX_FORWARDED_HEADER_LENGTH) return null;
  return value;
}

function firstAddressFromPlatformHeader(headers: HeaderReader, name: string) {
  const value = readBoundedHeader(headers, name);
  if (!value) return null;
  return normalizeClientIpAddress(value.split(',')[0]);
}

function getTrustedProxyHops(environment: ProxyTrustEnvironment) {
  const rawValue = environment.TRUSTED_PROXY_HOPS?.trim() || '1';
  if (!/^\d+$/.test(rawValue)) {
    throw new Error('TRUSTED_PROXY_HOPS must be an integer between 1 and 32');
  }

  const hops = Number.parseInt(rawValue, 10);
  if (hops < 1 || hops > MAX_TRUSTED_PROXY_HOPS) {
    throw new Error('TRUSTED_PROXY_HOPS must be an integer between 1 and 32');
  }
  return hops;
}

export function validateProxyTrustConfiguration(
  environment: ProxyTrustEnvironment = process.env,
) {
  const provider = getTrustedProxyProvider(environment);
  if (provider === 'generic') getTrustedProxyHops(environment);
  return provider;
}

function addressFromGenericProxy(
  headers: HeaderReader,
  environment: ProxyTrustEnvironment,
) {
  const value = readBoundedHeader(headers, 'x-forwarded-for');
  if (!value) return null;

  const chain = value.split(',').map((entry) => entry.trim());
  if (chain.length > MAX_TRUSTED_PROXY_HOPS + 1) return null;

  const trustedHops = getTrustedProxyHops(environment);
  const clientIndex = chain.length - trustedHops;
  if (clientIndex < 0) return null;

  return normalizeClientIpAddress(chain[clientIndex]);
}

/**
 * Resolves a client address only from the header owned by the explicitly
 * configured reverse proxy. A standard Web Request does not expose the socket
 * peer address, so direct/untrusted requests intentionally collapse to
 * `unknown` instead of trusting attacker-controlled forwarding headers.
 */
export function getTrustedClientIp(
  headers: HeaderReader,
  environment: ProxyTrustEnvironment = process.env,
) {
  switch (getTrustedProxyProvider(environment)) {
    case 'vercel':
      return firstAddressFromPlatformHeader(headers, 'x-vercel-forwarded-for')
        || UNKNOWN_CLIENT_IP;
    case 'cloudflare':
      return normalizeClientIpAddress(readBoundedHeader(headers, 'cf-connecting-ip'))
        || UNKNOWN_CLIENT_IP;
    case 'generic':
      return addressFromGenericProxy(headers, environment) || UNKNOWN_CLIENT_IP;
    case 'none':
      return UNKNOWN_CLIENT_IP;
  }
}
