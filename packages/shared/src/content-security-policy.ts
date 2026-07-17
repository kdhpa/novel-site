import { randomBytes } from 'node:crypto';

type CspEnvironment = {
  readonly [name: string]: string | undefined;
  NODE_ENV?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_IMAGE_HOSTS?: string;
};

const BUILT_IN_IMAGE_SOURCES = [
  "'self'",
  'data:',
  'blob:',
  'https://lh3.googleusercontent.com',
  'https://avatars.githubusercontent.com',
] as const;

function addHttpsHostname(sources: Set<string>, hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized || normalized.length > 253 || !/^[a-z0-9.-]+$/.test(normalized)) return;

  try {
    const parsed = new URL(`https://${normalized}`);
    if (parsed.hostname === normalized) sources.add(`https://${normalized}`);
  } catch {
    // Invalid optional host entries are ignored instead of weakening CSP.
  }
}

export function getContentSecurityPolicyImageSources(
  environment: CspEnvironment = process.env,
) {
  const sources = new Set<string>(BUILT_IN_IMAGE_SOURCES);

  if (environment.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const storageUrl = new URL(environment.NEXT_PUBLIC_SUPABASE_URL);
      addHttpsHostname(sources, storageUrl.hostname);
    } catch {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL.');
    }
  }

  for (const candidate of (environment.NEXT_PUBLIC_IMAGE_HOSTS || '').split(',')) {
    addHttpsHostname(sources, candidate);
  }

  return [...sources];
}

export function createContentSecurityPolicyNonce() {
  return randomBytes(18).toString('base64');
}

export function buildNonceContentSecurityPolicy(
  nonce: string,
  environment: CspEnvironment = process.env,
) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(nonce)) {
    throw new Error('CSP nonce must be a valid base64 value.');
  }

  const isDevelopment = environment.NODE_ENV === 'development';
  const isProduction = environment.NODE_ENV === 'production';
  const imageSources = getContentSecurityPolicyImageSources(environment);

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(' ')}`,
    "font-src 'self' data:",
    `connect-src 'self'${isDevelopment ? ' ws:' : ''}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
