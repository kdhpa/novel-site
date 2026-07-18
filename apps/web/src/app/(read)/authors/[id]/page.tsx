import prisma from '@/lib/prisma';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { BookOpen, Eye, UserRound } from 'lucide-react';
import NovelCard from '@/components/novel/NovelCard';
import type { NovelListItem } from '@/types';
import type { Metadata } from 'next';
import { isOptimizableImageSource } from '@/lib/image-hosts';
import ServerPagination from '@/components/ui/ServerPagination';

interface AuthorPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 24;

const getAuthor = cache(async (id: string) => {
  return prisma.user.findUnique({ where: { id }, select: { id: true, nickname: true, image: true, bio: true, createdAt: true } });
});

async function getAuthorPageData(authorId: string, page: number) {
    const where = { authorId, isPublished: true, approvalStatus: 'APPROVED' as const };
    const [novels, aggregate] = await Promise.all([
      prisma.novel.findMany({
        where,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        orderBy: [{ viewCount: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          description: true,
          coverImage: true,
          genres: true,
          status: true,
          viewCount: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, nickname: true, image: true } },
          _count: { select: { chapters: { where: { isPublished: true } }, likes: true } },
        },
      }),
      prisma.novel.aggregate({ where, _sum: { viewCount: true }, _count: { _all: true } }),
    ]);

    return {
      novels: novels as NovelListItem[],
      totalViewCount: aggregate._sum.viewCount || 0,
      novelCount: aggregate._count._all,
    };
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { id } = await params;
  const author = await getAuthor(id);
  if (!author) return { title: '작가를 찾을 수 없습니다' };
  return { title: `${author.nickname || '익명 작가'} - 작가 프로필`, description: author.bio || `${author.nickname || '익명 작가'}의 작품을 만나보세요.` };
}

function formatViewCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}만`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}천`;
  return count.toLocaleString();
}

export default async function AuthorPage({ params, searchParams }: AuthorPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const page = parsePage(query.page);
  const [author, pageData] = await Promise.all([getAuthor(id), getAuthorPageData(id, page)]);
  if (!author) notFound();

  const { novels, totalViewCount, novelCount } = pageData;
  const totalPages = Math.max(1, Math.ceil(novelCount / PAGE_SIZE));
  const joinDate = new Date(author.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mb-8 rounded-md border border-border bg-background-secondary p-6 md:p-8">
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-md bg-background-tertiary ring-1 ring-border md:h-40 md:w-40">
              {author.image ? <Image src={author.image} alt={author.nickname || '작가'} fill priority sizes="(min-width: 768px) 160px, 128px" unoptimized={!isOptimizableImageSource(author.image)} className="object-cover" /> : <UserRound className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-zinc-600" />}
            </div>
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl font-bold text-white">{author.nickname || '익명 작가'}</h1>
              {author.bio && <p className="mt-3 max-w-2xl text-zinc-400">{author.bio}</p>}
              <p className="mt-3 text-sm text-zinc-500">{joinDate}부터 활동</p>
              <div className="mt-5 flex justify-center gap-6 md:justify-start">
                <div className="rounded-md border border-border bg-background p-4 text-center">
                  <Eye className="mx-auto mb-1 h-4 w-4 text-zinc-500" />
                  <div className="font-bold text-white">{formatViewCount(totalViewCount)}</div>
                  <div className="text-xs text-zinc-500">총 조회</div>
                </div>
                <div className="rounded-md border border-border bg-background p-4 text-center">
                  <BookOpen className="mx-auto mb-1 h-4 w-4 text-zinc-500" />
                  <div className="font-bold text-white">{novelCount}</div>
                  <div className="text-xs text-zinc-500">작품</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-6 text-xl font-bold text-white">작품</h2>
          {novels.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {novels.map((novel) => <NovelCard key={novel.id} novel={novel} />)}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-background-secondary py-16 text-center text-zinc-500">아직 공개된 작품이 없습니다.</div>
          )}
          <ServerPagination pathname={`/authors/${id}`} page={page} totalPages={totalPages} />
        </section>
      </div>
    </div>
  );
}
