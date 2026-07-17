import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ApiError } from './api';
import type { Session } from 'next-auth';

type SessionUser = NonNullable<Session['user']>;

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();

  if (!session?.user) {
    throw new ApiError(401, '로그인이 필요합니다.');
  }

  return session.user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (currentUser?.role !== 'ADMIN') {
    throw new ApiError(403, '관리자 권한이 필요합니다.');
  }

  return { ...user, role: currentUser.role };
}

export async function isCurrentAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return user?.role === 'ADMIN';
}

export async function assertOwnerOrAdmin(
  user: Pick<SessionUser, 'id'>,
  ownerId: string,
  message = '접근 권한이 없습니다.'
) {
  if (user.id === ownerId) return;

  if (!(await isCurrentAdmin(user.id))) {
    throw new ApiError(403, message);
  }
}

export async function requireNovelOwnerOrAdmin(
  novelId: string,
  authenticatedUser?: SessionUser
) {
  const user = authenticatedUser ?? await requireUser();
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { id: true, authorId: true },
  });

  if (!novel) {
    throw new ApiError(404, '작품을 찾을 수 없습니다.');
  }

  await assertOwnerOrAdmin(user, novel.authorId);
  return { user, novel };
}

export async function requireChapterOwnerOrAdmin(novelId: string, chapterId: string) {
  const user = await requireUser();
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, novelId },
    select: {
      id: true,
      novel: { select: { authorId: true } },
    },
  });

  if (!chapter) {
    throw new ApiError(404, '회차를 찾을 수 없습니다.');
  }

  await assertOwnerOrAdmin(user, chapter.novel.authorId);
  return { user, chapter };
}
