// Chapter Detail API Route - Get, Update, Delete
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import type { ApiResponse, ChapterFormInput } from '@/types';

interface RouteParams {
  params: Promise<{ id: string; chapterId: string }>;
}

// GET /api/novels/[id]/chapters/[chapterId] - Get chapter details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, chapterId } = await params;

    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        novelId: id,
      },
      include: {
        novel: {
          select: {
            id: true,
            title: true,
            genre: true,
            authorId: true,
            author: {
              select: {
                id: true,
                nickname: true,
              },
            },
          },
        },
      },
    });

    if (!chapter) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '회차를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // Check access for unpublished chapters
    if (!chapter.isPublished) {
      const session = await auth();
      const isAuthor = session?.user?.id === chapter.novel.authorId;
      const isAdmin = session?.user?.role === 'ADMIN';

      if (!isAuthor && !isAdmin) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: '아직 공개되지 않은 회차입니다.' },
          { status: 403 }
        );
      }
    }

    // Increment view count for published chapters
    if (chapter.isPublished) {
      await prisma.chapter.update({
        where: { id: chapterId },
        data: { viewCount: { increment: 1 } },
      });
    }

    // Get prev/next chapter IDs
    const [prevChapter, nextChapter] = await Promise.all([
      prisma.chapter.findFirst({
        where: {
          novelId: id,
          chapterNumber: { lt: chapter.chapterNumber },
          isPublished: true,
        },
        orderBy: { chapterNumber: 'desc' },
        select: { id: true },
      }),
      prisma.chapter.findFirst({
        where: {
          novelId: id,
          chapterNumber: { gt: chapter.chapterNumber },
          isPublished: true,
        },
        orderBy: { chapterNumber: 'asc' },
        select: { id: true },
      }),
    ]);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: {
        ...chapter,
        prevChapterId: prevChapter?.id || null,
        nextChapterId: nextChapter?.id || null,
      },
    });
  } catch (error) {
    console.error('Chapter GET error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '회차를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// PATCH /api/novels/[id]/chapters/[chapterId] - Update chapter
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { id, chapterId } = await params;

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId: id },
      include: {
        novel: { select: { authorId: true } },
      },
    });

    if (!chapter) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '회차를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (chapter.novel.authorId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '수정 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const body: Partial<ChapterFormInput> = await request.json();

    // Handle publishing
    const isNewlyPublished = body.isPublished && !chapter.isPublished;

    const updatedChapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        ...(body.title && { title: body.title.trim() }),
        ...(body.content && { content: body.content }),
        ...(body.chapterNumber && { chapterNumber: body.chapterNumber }),
        ...(body.aiImage !== undefined && { aiImage: body.aiImage }),
        ...(body.aiImagePrompt !== undefined && { aiImagePrompt: body.aiImagePrompt }),
        ...(body.isPublished !== undefined && { isPublished: body.isPublished }),
        ...(isNewlyPublished && { publishedAt: new Date() }),
      },
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: updatedChapter,
      message: '회차가 수정되었습니다.',
    });
  } catch (error) {
    console.error('Chapter PATCH error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '회차 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE /api/novels/[id]/chapters/[chapterId] - Delete chapter
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { id, chapterId } = await params;

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId: id },
      include: {
        novel: { select: { authorId: true } },
      },
    });

    if (!chapter) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '회차를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (chapter.novel.authorId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '삭제 권한이 없습니다.' },
        { status: 403 }
      );
    }

    await prisma.chapter.delete({
      where: { id: chapterId },
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      message: '회차가 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Chapter DELETE error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '회차 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
