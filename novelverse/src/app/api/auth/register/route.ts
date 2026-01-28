// User Registration API Route
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import type { RegisterInput, ApiResponse, SafeUser } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: RegisterInput = await request.json();

    // Validate required fields
    if (!body.email || !body.password || !body.nickname) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '이메일, 비밀번호, 닉네임은 필수 입력 항목입니다.' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '올바른 이메일 형식이 아닙니다.' },
        { status: 400 }
      );
    }

    // Validate password length
    if (body.password.length < 8) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '비밀번호는 8자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    // Validate nickname length
    if (body.nickname.length < 2 || body.nickname.length > 20) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '닉네임은 2~20자 사이여야 합니다.' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingEmail = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingEmail) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '이미 사용 중인 이메일입니다.' },
        { status: 409 }
      );
    }

    // Check if nickname already exists
    const existingNickname = await prisma.user.findUnique({
      where: { nickname: body.nickname },
    });

    if (existingNickname) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '이미 사용 중인 닉네임입니다.' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(body.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: body.email,
        password: hashedPassword,
        nickname: body.nickname,
        name: body.name || body.nickname,
        role: 'USER',
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

    return NextResponse.json<ApiResponse<SafeUser>>(
      {
        success: true,
        data: user,
        message: '회원가입이 완료되었습니다.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '회원가입 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
