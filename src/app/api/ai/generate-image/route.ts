// AI Image Generation API Route
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateImage, generateNovelCover, generateChapterIllustration } from '@/lib/ai';
import type { ApiResponse, AIImageRequest, AIImageResponse } from '@/types';

interface GenerateImageBody extends AIImageRequest {
  type: 'cover' | 'illustration' | 'custom';
  title?: string;
  genre?: string;
  description?: string;
}

// POST /api/ai/generate-image
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body: GenerateImageBody = await request.json();

    if (!body.type) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '이미지 타입을 지정해주세요.' },
        { status: 400 }
      );
    }

    let result: AIImageResponse & { error?: string };

    switch (body.type) {
      case 'cover':
        if (!body.title) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: '표지 생성을 위해 제목이 필요합니다.' },
            { status: 400 }
          );
        }
        result = await generateNovelCover(
          body.title,
          body.genre || 'OTHER',
          body.description
        );
        break;

      case 'illustration':
        if (!body.prompt) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: '삽화 생성을 위해 프롬프트가 필요합니다.' },
            { status: 400 }
          );
        }
        result = await generateChapterIllustration(
          body.prompt,
          body.genre || 'fantasy',
          body.style
        );
        break;

      case 'custom':
        if (!body.prompt) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: '프롬프트를 입력해주세요.' },
            { status: 400 }
          );
        }
        result = await generateImage({
          prompt: body.prompt,
          negativePrompt: body.negativePrompt,
          style: body.style,
          aspectRatio: body.aspectRatio,
        });
        break;

      default:
        return NextResponse.json<ApiResponse>(
          { success: false, error: '지원하지 않는 이미지 타입입니다.' },
          { status: 400 }
        );
    }

    if (result.error) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<AIImageResponse>>({
      success: true,
      data: {
        imageUrl: result.imageUrl,
        prompt: result.prompt,
      },
    });
  } catch (error) {
    console.error('AI Image generation error:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: '이미지 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
