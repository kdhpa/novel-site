import { prisma } from '@novelverse/db';
import { RoleLabels } from '@novelverse/shared';
import UserRoleForm from './UserRoleForm';
import Pagination from '../Pagination';
import { parsePage } from '@/lib/pagination';
import type { Prisma } from '@novelverse/db/client';
import type { Role } from '@novelverse/db/browser';

export const metadata = {
  title: '계정 관리',
};

const PAGE_SIZE = 25;

export default async function OpsUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; page?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim();
  const role = params.role;
  const page = parsePage(params.page);

  const where: Prisma.UserWhereInput = {
    ...(q && {
      OR: [
        { email: { contains: q, mode: 'insensitive' } },
        { nickname: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
    }),
    ...(role && ['USER', 'AUTHOR', 'ADMIN'].includes(role) && { role: role as Role }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        email: true,
        nickname: true,
        name: true,
        role: true,
        isVerifiedAuthor: true,
        canSkipReview: true,
        suspendedAt: true,
        suspensionReason: true,
        createdAt: true,
        _count: { select: { novels: true, reviews: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">계정 관리</h1>
        <p className="mt-1 text-sm text-muted">사용자 역할과 인증 작가 상태를 변경합니다.</p>
      </div>

      <form className="mb-5 flex flex-wrap gap-2">
        <input name="q" defaultValue={q || ''} placeholder="이메일, 닉네임, 이름" className="h-10 min-w-64 rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary" />
        <select name="role" defaultValue={params.role || ''} className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary">
          <option value="">전체 역할</option>
          {Object.entries(RoleLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover">검색</button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">계정</th>
              <th className="px-4 py-3 font-medium">역할</th>
              <th className="px-4 py-3 font-medium">활동</th>
              <th className="px-4 py-3 font-medium">가입일</th>
              <th className="px-4 py-3 font-medium">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{user.nickname || user.name || '-'}</p>
                  <p className="text-muted">{user.email}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-200">{RoleLabels[user.role]}</span>
                    {user.isVerifiedAuthor && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">인증 작가</span>}
                    {user.canSkipReview && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-200">수정 재심사 면제</span>}
                    {user.suspendedAt && <span title={user.suspensionReason || undefined} className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-200">정지됨</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{user._count.novels} 작품 · {user._count.reviews} 리뷰</td>
                <td className="px-4 py-3 text-muted">{new Date(user.createdAt).toLocaleDateString('ko-KR')}</td>
                <td className="px-4 py-3">
                  <UserRoleForm
                    userId={user.id}
                    role={user.role}
                    isVerifiedAuthor={user.isVerifiedAuthor}
                    canSkipReview={user.canSkipReview}
                    suspendedAt={user.suspendedAt?.toISOString() || null}
                    suspensionReason={user.suspensionReason}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        pathname="/users"
        query={{ q: params.q, role: params.role }}
      />
    </div>
  );
}
