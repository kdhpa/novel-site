import type { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const publicNovelWhere = { isPublished: true, approvalStatus: 'APPROVED' as const };
  const [novels, chapters] = await Promise.all([
    prisma.novel.findMany({
      where: publicNovelWhere,
      take: 10_000,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, updatedAt: true },
    }),
    prisma.chapter.findMany({
      where: { isPublished: true, novel: publicNovelWhere },
      take: 39_000,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, novelId: true, updatedAt: true, publishedAt: true },
    }),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/novels'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/rankings'), changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/tags'), changeFrequency: 'weekly', priority: 0.7 },
    { url: absoluteUrl('/novels/new-releases'), changeFrequency: 'daily', priority: 0.7 },
    { url: absoluteUrl('/novels/author-picks'), changeFrequency: 'daily', priority: 0.7 },
    { url: absoluteUrl('/contests'), changeFrequency: 'weekly', priority: 0.6 },
  ];

  const publicEntries: MetadataRoute.Sitemap = [
    ...novels.map((novel) => ({
      url: absoluteUrl(`/novels/${novel.id}`),
      lastModified: novel.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...chapters.map((chapter) => ({
      url: absoluteUrl(`/novels/${chapter.novelId}/${chapter.id}`),
      lastModified: chapter.updatedAt || chapter.publishedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];

  return [...staticEntries, ...publicEntries].slice(0, 50_000);
}
