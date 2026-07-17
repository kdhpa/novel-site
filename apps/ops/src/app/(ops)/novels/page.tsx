import { prisma } from '@novelverse/db';
import { ApprovalStatusLabels } from '@novelverse/shared';
import VisibilityButton from './VisibilityButton';
import Pagination from '../Pagination';
import { parsePage } from '@/lib/pagination';
import type { Prisma } from '@novelverse/db/client';
import type { ApprovalStatus } from '@novelverse/db/browser';

export const metadata = {
  title: '작품 관리',
};

const PAGE_SIZE = 25;

function publicNovelUrl(novelId: string) {
  const configured = process.env.NEXT_PUBLIC_WEB_URL ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');

  if (!configured) return null;

  try {
    const base = new URL(configured);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
      throw new Error('Invalid public web URL');
    }
    return new URL(`/novels/${encodeURIComponent(novelId)}`, base).toString();
  } catch {
    return process.env.NODE_ENV === 'production'
      ? null
      : `http://localhost:3000/novels/${encodeURIComponent(novelId)}`;
  }
}

export default async function OpsNovelsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim();
  const status = params.status;
  const page = parsePage(params.page);

  const where: Prisma.NovelWhereInput = {
    ...(q && {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { author: { email: { contains: q, mode: 'insensitive' } } },
        { author: { nickname: { contains: q, mode: 'insensitive' } } },
      ],
    }),
    ...(status && ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'].includes(status) && { approvalStatus: status as ApprovalStatus }),
  };

  const [novels, total] = await Promise.all([
    prisma.novel.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        title: true,
        approvalStatus: true,
        isPublished: true,
        updatedAt: true,
        viewCount: true,
        author: { select: { email: true, nickname: true } },
        _count: { select: { chapters: true, likes: true } },
      },
    }),
    prisma.novel.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">작품 관리</h1>
        <p className="mt-1 text-sm text-muted">승인된 작품의 공개 상태를 운영자가 제어합니다.</p>
      </div>

      <form className="mb-5 flex flex-wrap gap-2">
        <input name="q" defaultValue={q || ''} placeholder="제목, 이메일, 닉네임" className="h-10 min-w-64 rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary" />
        <select name="status" defaultValue={params.status || ''} className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary">
          <option value="">전체 상태</option>
          {Object.entries(ApprovalStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover">검색</button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">작품</th>
              <th className="px-4 py-3 font-medium">작가</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">지표</th>
              <th className="px-4 py-3 font-medium">수정일</th>
              <th className="px-4 py-3 font-medium">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {novels.map((novel) => (
              <tr key={novel.id}>
                <td className="px-4 py-3">
                  {publicNovelUrl(novel.id) ? (
                    <a
                      href={publicNovelUrl(novel.id)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground hover:text-blue-300"
                    >
                      {novel.title}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">{novel.title}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  <p className="text-foreground">{novel.author.nickname || '-'}</p>
                  <p>{novel.author.email}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-200">{ApprovalStatusLabels[novel.approvalStatus]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${novel.isPublished ? 'bg-emerald-500/15 text-emerald-200' : 'bg-zinc-500/15 text-zinc-300'}`}>
                      {novel.isPublished ? '공개' : '비공개'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{novel._count.chapters}화 · {novel._count.likes} 좋아요 · {novel.viewCount} 조회</td>
                <td className="px-4 py-3 text-muted">{new Date(novel.updatedAt).toLocaleDateString('ko-KR')}</td>
                <td className="px-4 py-3">
                  <VisibilityButton novelId={novel.id} title={novel.title} isPublished={novel.isPublished} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        pathname="/novels"
        query={{ q: params.q, status: params.status }}
      />
    </div>
  );
}
