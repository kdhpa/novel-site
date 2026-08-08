import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { cache } from 'react';
import prisma from '@/lib/prisma';
import Reader from '@/components/novel/Reader';
import { auth } from '@/lib/auth';
import type { Metadata } from 'next';
import type { Prisma } from '@novelverse/db/client';
import JsonLd from '@/components/seo/JsonLd';
import { absoluteUrl, DEFAULT_SOCIAL_IMAGE, SITE_NAME } from '@/lib/site';
import { isCurrentAdmin } from '@/lib/server/authz';
import { recordUniqueContentView } from '@/lib/server/content-view';
import { sanitizeHtmlContent } from '@/lib/server/sanitize';
import { logServerError } from '@novelverse/shared';

interface PageProps {
  params: Promise<{ id: string; chapterId: string }>;
}

function chapterDescription(content: string, fallback: string) {
  const excerpt = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|lt|gt|#39);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return excerpt ? excerpt.slice(0, 160) : fallback;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, chapterId } = await params;
  const chapter = await getPublicChapter(id, chapterId);

  if (!chapter) {
    return { title: '회차를 찾을 수 없습니다' };
  }
  const title = `${chapter.chapterNumber}화 ${chapter.title} - ${chapter.novel.title}`;
  const description = chapterDescription(chapter.content, `${chapter.novel.title} ${chapter.chapterNumber}화`);
  const path = `/novels/${id}/${chapterId}`;
  const images = chapter.aiImage || chapter.novel.coverImage || DEFAULT_SOCIAL_IMAGE;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      url: path,
      locale: 'ko_KR',
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: images, alt: `${chapter.novel.title} ${chapter.chapterNumber}화` }],
      publishedTime: (chapter.publishedAt || chapter.createdAt).toISOString(),
      modifiedTime: chapter.updatedAt.toISOString(),
      authors: [chapter.novel.author.nickname || '익명 작가'],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [images],
    },
  };
}

async function queryChapterCore(novelId: string, chapterId: string, novelWhere: Prisma.NovelWhereInput) {
  const chapter = await prisma.chapter.findFirst({
    where: {
      id: chapterId,
      novelId,
      isPublished: true,
      novel: novelWhere,
    },
    select: {
      id: true,
      title: true,
      content: true,
      chapterNumber: true,
      aiImage: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      novel: {
        select: {
          title: true,
          description: true,
          coverImage: true,
          authorId: true,
          author: { select: { id: true, nickname: true } },
          isPublished: true,
          approvalStatus: true,
        },
      },
    },
  });

  if (!chapter) return null;

  const [previousChapter, nextChapter] = await Promise.all([
    prisma.chapter.findFirst({
      where: { novelId, isPublished: true, chapterNumber: { lt: chapter.chapterNumber } },
      orderBy: { chapterNumber: 'desc' },
      select: { id: true },
    }),
    prisma.chapter.findFirst({
      where: { novelId, isPublished: true, chapterNumber: { gt: chapter.chapterNumber } },
      orderBy: { chapterNumber: 'asc' },
      select: { id: true },
    }),
  ]);

  return {
    ...chapter,
    prevChapterId: previousChapter?.id,
    nextChapterId: nextChapter?.id,
  };
}

const getPublicChapter = cache(
  async (novelId: string, chapterId: string) => queryChapterCore(
    novelId,
    chapterId,
    { isPublished: true, approvalStatus: 'APPROVED' },
  ),
);

function getPreviewChapter(novelId: string, chapterId: string, user: { id: string; isAdmin: boolean }) {
  return queryChapterCore(
    novelId,
    chapterId,
    user.isAdmin ? { isPublished: true } : { isPublished: true, authorId: user.id },
  );
}

export default async function ChapterReaderPage({ params }: PageProps) {
  const { id, chapterId } = await params;
  const [publicChapter, session] = await Promise.all([getPublicChapter(id, chapterId), auth()]);
  const isAdmin = session?.user ? await isCurrentAdmin(session.user.id) : false;
  const chapter = publicChapter || (session?.user
    ? await getPreviewChapter(id, chapterId, { id: session.user.id, isAdmin })
    : null);
  if (!chapter) notFound();

  const isPublic = Boolean(publicChapter);
  const chapterUrl = absoluteUrl(`/novels/${id}/${chapterId}`);
  const novelUrl = absoluteUrl(`/novels/${id}`);
  const description = chapterDescription(chapter.content, `${chapter.novel.title} ${chapter.chapterNumber}화`);
  const articleJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${chapter.chapterNumber}화 ${chapter.title}`,
    description,
    url: chapterUrl,
    mainEntityOfPage: chapterUrl,
    inLanguage: 'ko',
    datePublished: (chapter.publishedAt || chapter.createdAt).toISOString(),
    dateModified: chapter.updatedAt.toISOString(),
    author: {
      '@type': 'Person',
      name: chapter.novel.author.nickname || '익명 작가',
      url: absoluteUrl(`/authors/${chapter.novel.author.id}`),
    },
    isPartOf: {
      '@type': 'Book',
      name: chapter.novel.title,
      url: novelUrl,
    },
    ...(chapter.aiImage || chapter.novel.coverImage
      ? { image: chapter.aiImage || chapter.novel.coverImage }
      : {}),
  };
  const breadcrumbJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: '웹소설', item: absoluteUrl('/novels') },
      { '@type': 'ListItem', position: 3, name: chapter.novel.title, item: novelUrl },
      { '@type': 'ListItem', position: 4, name: `${chapter.chapterNumber}화 ${chapter.title}`, item: chapterUrl },
    ],
  };

  const isAuthor = session?.user?.id === chapter.novel.authorId;
  if (chapter.novel.isPublished && chapter.novel.approvalStatus === 'APPROVED' && !isAuthor && !isAdmin) {
    const requestHeaders = await headers();
    after(async () => {
      try {
        await recordUniqueContentView({
          targetType: 'chapter',
          targetId: chapterId,
          userId: session?.user?.id,
          headers: requestHeaders,
        });
      } catch (error) {
        logServerError('content-view.chapter', error, { chapterId });
      }
    });
  }

  return (
    <>
      {isPublic && (
        <>
          <JsonLd data={articleJsonLd} />
          <JsonLd data={breadcrumbJsonLd} />
        </>
      )}
      <Reader
        novelId={id}
        chapter={{
          id: chapter.id,
          title: chapter.title,
          content: sanitizeHtmlContent(chapter.content),
          chapterNumber: chapter.chapterNumber,
          aiImage: chapter.aiImage,
        }}
        prevChapterId={chapter.prevChapterId}
        nextChapterId={chapter.nextChapterId}
        commentsEnabled={isPublic}
      />
    </>
  );
}
