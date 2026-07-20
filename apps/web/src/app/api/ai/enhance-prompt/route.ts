import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { enhancePromptWithGemini } from '@/lib/gemini';
import { auth } from '@/lib/auth';
import { handleApiError } from '@/lib/server/api';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import { assertGlobalAiBudget } from '@/lib/server/ai-budget';

const enhancePromptSchema = z
  .object({
    userPrompt: z
      .string()
      .trim()
      .min(1, '프롬프트를 입력해 주세요.')
      .max(2_000, '프롬프트는 2,000자 이하여야 합니다.'),
    context: z
      .object({
        type: z.enum(['cover', 'illustration', 'portrait']),
        genre: z.string().trim().max(40).optional(),
        novelTitle: z.string().trim().max(100).optional(),
        characterName: z.string().trim().max(80).optional(),
      })
      .strict(),
    adultConfirmed: z.boolean(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    await assertRateLimit({
      key: `ai:prompt:hour:${session.user.id}`,
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
    await assertRateLimit({
      key: `ai:prompt:day:${session.user.id}`,
      limit: 100,
      windowMs: 24 * 60 * 60_000,
    });
    await assertRateLimit({
      key: `ai:prompt:ip-day:${getClientIp(request)}`,
      limit: 200,
      windowMs: 24 * 60 * 60_000,
    });
    const { userPrompt, context, adultConfirmed } = enhancePromptSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 16 * 1024)
    );
    if (!adultConfirmed) {
      return NextResponse.json(
        { success: false, error: 'Gemini 기능은 만 18세 이상 확인 후 사용할 수 있습니다.' },
        { status: 400 }
      );
    }
    await assertGlobalAiBudget();

    // Call Gemini API to enhance the prompt
    const result = await enhancePromptWithGemini({
      userPrompt,
      context,
    });

    return NextResponse.json({
      success: true,
      data: {
        enhancedPrompt: result.enhancedPrompt,
        negativePrompt: result.negativePrompt,
        suggestions: result.suggestions,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('GEMINI_PROVIDER_DISABLED')) {
      return NextResponse.json(
        { success: false, error: 'AI 서비스가 운영 설정에서 비활성화되었습니다.' },
        { status: 503 }
      );
    }

    if (error instanceof Error && error.message.includes('GOOGLE_GEMINI_API_KEY')) {
      return NextResponse.json(
        { success: false, error: 'AI 서비스 API 키가 설정되지 않았습니다.' },
        { status: 503 }
      );
    }

    // Check for rate limit error
    if (error instanceof Error && error.message.includes('요청 한도')) {
      return NextResponse.json(
        { success: false, error: '요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 }
      );
    }

    return handleApiError(error, '프롬프트 개선 중 오류가 발생했습니다.');
  }
}
