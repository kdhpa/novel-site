import Link from 'next/link';
import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import { Tags } from 'lucide-react';
import type { Prisma } from '@novelverse/db/client';
import { DEFAULT_SOCIAL_IMAGE, SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: '키워드',
  description: '태그와 키워드로 취향에 맞는 웹소설을 찾아보세요.',
  alternates: { canonical: '/tags' },
  openGraph: {
    type: 'website',
    url: '/tags',
    locale: 'ko_KR',
    siteName: SITE_NAME,
    title: 'NovelVerse 웹소설 키워드',
    description: '태그와 키워드로 취향에 맞는 웹소설을 찾아보세요.',
    images: [{ url: DEFAULT_SOCIAL_IMAGE, alt: 'NovelVerse 웹소설 키워드' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NovelVerse 웹소설 키워드',
    description: '태그와 키워드로 취향에 맞는 웹소설을 찾아보세요.',
    images: [DEFAULT_SOCIAL_IMAGE],
  },
};

export const dynamic = 'force-dynamic';

const publishedWhere = { isPublished: true, approvalStatus: 'APPROVED' } satisfies Prisma.NovelWhereInput;

async function getTags() {
  return prisma.tag.findMany({
    where: { novels: { some: { novel: publishedWhere } } },
    take: 200,
    orderBy: { novels: { _count: 'desc' } },
    select: { id: true, name: true, _count: { select: { novels: { where: { novel: publishedWhere } } } } },
  });
}

export default async function TagsPage() {
  const tags = await getTags();
  const fallbackTags = ['먼치킨', '회귀', '로맨스판타지', '힐링', '아카데미', '빙의', '생존', '성장', '복수', '현대판타지'];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-4 border-b border-border pb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-accent">
            <Tags className="h-6 w-6" />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-accent">키워드</p>
            <h1 className="text-3xl font-bold text-white">키워드로 작품 찾기</h1>
            <p className="mt-1 text-sm text-zinc-500">장르보다 구체적인 취향을 태그로 탐색합니다.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {tags.length > 0
            ? tags.map((tag) => (
                <Link key={tag.id} href={`/novels?tag=${encodeURIComponent(tag.name)}`} className="rounded-md border border-border bg-background-secondary px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-accent-muted hover:text-white">
                  #{tag.name} <span className="text-zinc-500">{tag._count.novels}</span>
                </Link>
              ))
            : fallbackTags.map((tag) => (
                <Link key={tag} href={`/novels?search=${encodeURIComponent(tag)}`} className="rounded-md border border-border bg-background-secondary px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-accent-muted hover:text-white">
                  #{tag}
                </Link>
              ))}
        </div>
      </div>
    </div>
  );
}
