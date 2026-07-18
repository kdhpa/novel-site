import type { NextConfig } from 'next';

const storageImageHosts = new Set<string>();
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    storageImageHosts.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname);
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL.');
  }
}
for (const value of (process.env.NEXT_PUBLIC_IMAGE_HOSTS || '').split(',')) {
  const host = value.trim().toLowerCase();
  if (host && !/[/:]/.test(host)) storageImageHosts.add(host);
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(process.env.NODE_ENV !== 'production'
    ? { allowedDevOrigins: ['127.0.0.1'] }
    : {}),
  transpilePackages: ['@novelverse/db', '@novelverse/auth', '@novelverse/shared'],
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-pg',
    'pg',
  ],
  images: {
    formats: ['image/webp'],
    minimumCacheTTL: 3600,
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      ...[...storageImageHosts].map((hostname) => ({
        protocol: 'https' as const,
        hostname,
      })),
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
