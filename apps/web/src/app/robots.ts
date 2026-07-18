import type { MetadataRoute } from 'next';
import { absoluteUrl, getSiteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/dashboard',
        '/library',
        '/login',
        '/register',
        '/novels/new',
        '/novels/*/edit',
        '/novels/*/chapters',
        '/novels/*/characters',
      ],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: getSiteUrl().origin,
  };
}
