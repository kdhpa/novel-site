// Novel Detail API Route - Get, Update, Delete
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import type { ApiResponse, NovelFormInput } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/novels/[id] - Get novel details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const novel = await prisma.novel.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            image: true,
            bio: true,
          },
        },
        chapters: {
          where: { isPublished: true },
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
        },
        tags: {
          include: {
            tag: true,
          },
        },
        _count: {
          select: {
            chapters: { where: { isPublished: true } },
            bookmarks: true,
            likes: true,
            comments: true,
          },
        },
      },
    });

    if (!novel) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '작품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // Increment view count
    await prisma.novel.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: novel,
    });
  } catch (error) {
    console.error('Novel GET error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '작품을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// PATCH /api/novels/[id] - Update novel
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
        { success: false, error: '수정 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const body: Partial<NovelFormInput> = await request.json();

    const updatedNovel = await prisma.novel.update({
      where: { id },
      data: {
        ...(body.title && { title: body.title.trim() }),
        ...(body.description !== undefined && { description: body.description?.trim() }),
        ...(body.genre && { genre: body.genre }),
        ...(body.status && { status: body.status }),
        ...(body.coverImage !== undefined && { coverImage: body.coverImage }),
        ...(body.isPublished !== undefined && { isPublished: body.isPublished }),
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

    // Update tags if provided
    if (body.tags) {
      // Remove existing tags
      await prisma.tagsOnNovels.deleteMany({
        where: { novelId: id },
      });

      // Add new tags
      for (const tagName of body.tags) {
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          create: { name: tagName },
          update: {},
        });

        await prisma.tagsOnNovels.create({
          data: {
            novelId: id,
            tagId: tag.id,
          },
        });
      }
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: updatedNovel,
      message: '작품이 수정되었습니다.',
    });
  } catch (error) {
    console.error('Novel PATCH error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '작품 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE /api/novels/[id] - Delete novel
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
        { success: false, error: '삭제 권한이 없습니다.' },
        { status: 403 }
      );
    }

    await prisma.novel.delete({
      where: { id },
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      message: '작품이 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Novel DELETE error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '작품 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
