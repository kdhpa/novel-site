// Novels API Route - List and Create
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import type { ApiResponse, NovelFormInput, NovelListItem, PaginatedResponse, Genre, Status } from '@/types';

// GET /api/novels - List novels
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const genre = searchParams.get('genre') as Genre | null;
    const status = searchParams.get('status') as Status | null;
    const search = searchParams.get('search');
    const authorId = searchParams.get('authorId');

    const where: Record<string, unknown> = {
      isPublished: true,
    };

    if (genre) where.genre = genre;
    if (status) where.status = status;
    if (authorId) where.authorId = authorId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [novels, total] = await Promise.all([
      prisma.novel.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          coverImage: true,
          genre: true,
          status: true,
          viewCount: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              nickname: true,
              image: true,
            },
          },
          _count: {
            select: {
              chapters: { where: { isPublished: true } },
              likes: true,
            },
          },
        },
      }),
      prisma.novel.count({ where }),
    ]);

    return NextResponse.json<PaginatedResponse<NovelListItem>>({
      success: true,
      data: {
        items: novels as NovelListItem[],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Novels GET error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '소설 목록을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// POST /api/novels - Create novel
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body: NovelFormInput = await request.json();

    if (!body.title?.trim()) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '제목을 입력해주세요.' },
        { status: 400 }
      );
    }

    // Upgrade user to AUTHOR if not already
    if (session.user.role === 'USER') {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { role: 'AUTHOR' },
      });
    }

    const novel = await prisma.novel.create({
      data: {
        title: body.title.trim(),
        description: body.description?.trim(),
        genre: body.genre || 'OTHER',
        status: body.status || 'ONGOING',
        coverImage: body.coverImage,
        isPublished: body.isPublished || false,
        authorId: session.user.id,
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            image: true,
          },
        },
      },
    });

    // Handle tags if provided
    if (body.tags && body.tags.length > 0) {
      for (const tagName of body.tags) {
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          create: { name: tagName },
          update: {},
        });

        await prisma.tagsOnNovels.create({
          data: {
            novelId: novel.id,
            tagId: tag.id,
          },
        });
      }
    }

    return NextResponse.json<ApiResponse>(
      { success: true, data: novel, message: '작품이 등록되었습니다.' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Novel POST error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '작품 등록에 실패했습니다.' },
      { status: 500 }
    );
  }
}
