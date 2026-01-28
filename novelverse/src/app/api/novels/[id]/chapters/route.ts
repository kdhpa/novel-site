// Chapters API Route - List and Create
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import type { ApiResponse, ChapterFormInput, ChapterListItem } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/novels/[id]/chapters - List chapters
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await auth();

    const novel = await prisma.novel.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!novel) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '작품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const isAuthor = session?.user?.id === novel.authorId;
    const isAdmin = session?.user?.role === 'ADMIN';

    const chapters = await prisma.chapter.findMany({
      where: {
        novelId: id,
        // Show all chapters to author/admin, only published to others
        ...(!(isAuthor || isAdmin) && { isPublished: true }),
      },
      orderBy: { chapterNumber: 'asc' },
      select: {
        id: true,
        chapterNumber: true,
        title: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        viewCount: true,
      },
    });

    return NextResponse.json<ApiResponse<ChapterListItem[]>>({
      success: true,
      data: chapters,
    });
  } catch (error) {
    console.error('Chapters GET error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '회차 목록을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// POST /api/novels/[id]/chapters - Create chapter
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const novel = await prisma.novel.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!novel) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '작품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (novel.authorId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '작성 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const body: ChapterFormInput = await request.json();

    if (!body.title?.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '제목을 입력해주세요.' },
        { status: 400 }
      );
    }

    if (!body.content?.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '내용을 입력해주세요.' },
        { status: 400 }
      );
    }

    // Get next chapter number if not provided
    let chapterNumber = body.chapterNumber;
    if (!chapterNumber) {
      const lastChapter = await prisma.chapter.findFirst({
        where: { novelId: id },
        orderBy: { chapterNumber: 'desc' },
        select: { chapterNumber: true },
      });
      chapterNumber = (lastChapter?.chapterNumber || 0) + 1;
    }

    // Check for duplicate chapter number
    const existingChapter = await prisma.chapter.findFirst({
      where: { novelId: id, chapterNumber },
    });

    if (existingChapter) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `${chapterNumber}화는 이미 존재합니다.` },
        { status: 400 }
      );
    }

    const chapter = await prisma.chapter.create({
      data: {
        novelId: id,
        chapterNumber,
        title: body.title.trim(),
        content: body.content,
        aiImage: body.aiImage,
        aiImagePrompt: body.aiImagePrompt,
        isPublished: body.isPublished || false,
        publishedAt: body.isPublished ? new Date() : null,
      },
    });

    return NextResponse.json<ApiResponse>(
      { success: true, data: chapter, message: '회차가 등록되었습니다.' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Chapter POST error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '회차 등록에 실패했습니다.' },
      { status: 500 }
    );
  }
}
