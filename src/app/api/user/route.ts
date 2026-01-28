// User API Route - Get and Update current user
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import type { ApiResponse, SafeUser } from '@/types';

// GET /api/user - Get current user
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        image: true,
        bio: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            novels: true,
            bookmarks: true,
            likes: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('User GET error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '사용자 정보를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// PATCH /api/user - Update current user
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate nickname if provided
    if (body.nickname) {
      if (body.nickname.length < 2 || body.nickname.length > 20) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: '닉네임은 2~20자 사이여야 합니다.' },
          { status: 400 }
        );
      }

      const existingNickname = await prisma.user.findFirst({
        where: {
          nickname: body.nickname,
          NOT: { id: session.user.id },
        },
      });

      if (existingNickname) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: '이미 사용 중인 닉네임입니다.' },
          { status: 409 }
        );
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.nickname && { nickname: body.nickname }),
        ...(body.image !== undefined && { image: body.image }),
        ...(body.bio !== undefined && { bio: body.bio }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        image: true,
        bio: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json<ApiResponse<SafeUser>>({
      success: true,
      data: updatedUser,
      message: '프로필이 업데이트되었습니다.',
    });
  } catch (error) {
    console.error('User PATCH error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '프로필 업데이트에 실패했습니다.' },
      { status: 500 }
    );
  }
}
