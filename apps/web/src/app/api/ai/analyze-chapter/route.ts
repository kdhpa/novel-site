// Chapter content analysis API for auto-illustration
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { analyzeChapterForIllustrations } from '@/lib/illustration-analyzer';
import { analyzeChapterWithAI } from '@/lib/scene-analyzer-ai';
import { handleApiError } from '@/lib/server/api';
import { assertRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { readJsonBodyWithLimit } from '@/lib/server/request-body';
import type { ApiResponse, AnalyzeChapterResponse } from '@/types';
import { logServerError } from '@novelverse/shared';
import { assertGlobalAiBudget } from '@/lib/server/ai-budget';

const analyzeChapterSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, '분석할 콘텐츠가 없습니다.')
      .max(100_000, '분석할 콘텐츠는 100,000자 이하여야 합니다.'),
    novelId: z.string().trim().min(1).max(100).optional(),
    maxCount: z.number().int().min(1).max(5).optional().default(3),
    autoDetect: z.boolean().optional().default(true),
    useAI: z.boolean().optional().default(false),
    adultConfirmed: z.boolean().optional().default(false),
    characters: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(100),
            name: z.string().trim().min(1).max(80),
            appearance: z.string().trim().min(1).max(2_000),
          })
          .strict()
      )
      .max(20)
      .optional(),
  })
  .strict();

// POST /api/ai/analyze-chapter
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    await assertRateLimit({
      key: `analysis:request:${session.user.id}`,
      limit: 120,
      windowMs: 60 * 60 * 1000,
    });

    const body = analyzeChapterSchema.parse(
      await readJsonBodyWithLimit<unknown>(request, 512 * 1024)
    );

    const { maxCount, autoDetect, useAI, adultConfirmed } = body;

    if (useAI && !adultConfirmed) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Gemini 기능은 만 18세 이상 확인 후 사용할 수 있습니다.' },
        { status: 400 }
      );
    }

    if (useAI) {
      await assertGlobalAiBudget();
      await Promise.all([
        assertRateLimit({
          key: `ai:analyze:hour:${session.user.id}`,
          limit: 20,
          windowMs: 60 * 60_000,
        }),
        assertRateLimit({
          key: `ai:analyze:day:${session.user.id}`,
          limit: 50,
          windowMs: 24 * 60 * 60_000,
        }),
        assertRateLimit({
          key: `ai:analyze:ip-day:${getClientIp(request)}`,
          limit: 100,
          windowMs: 24 * 60 * 60_000,
        }),
      ]);
    }

    let result: AnalyzeChapterResponse;

    if (useAI) {
      try {
        const aiResult = await analyzeChapterWithAI(
          body.content,
          maxCount,
          body.characters
        );

        result = aiResult.usedAI
          ? {
              ...aiResult,
              usedAI: true,
              analysisMode: 'gemini',
              fallbackUsed: false,
              notice: 'Gemini AI가 본문을 분석해 삽화 장면을 추천했습니다.',
            }
          : {
              ...aiResult,
              usedAI: false,
              analysisMode: 'rules',
              fallbackUsed: false,
              notice:
                aiResult.totalParagraphs < 3
                  ? '분석 가능한 문단이 3개 미만이라 Gemini를 사용하지 않고 로컬 규칙 결과를 표시했습니다.'
                  : '수동 삽화 표시가 추천 개수를 채워 Gemini를 사용하지 않고 해당 위치를 표시했습니다.',
            };
      } catch (aiError) {
        logServerError('gemini.scene-analysis-fallback', aiError, {
          userId: session.user.id,
        });
        const keywordResult = analyzeChapterForIllustrations(
          body.content,
          maxCount,
          autoDetect
        );
        result = {
          ...keywordResult,
          usedAI: false,
          analysisMode: 'rules',
          fallbackUsed: true,
          notice:
            'Gemini 분석에 실패해 규칙 기반 결과로 대체했습니다. 잠시 후 다시 시도할 수 있습니다.',
        };
      }
    } else {
      const keywordResult = analyzeChapterForIllustrations(
        body.content,
        maxCount,
        autoDetect
      );
      result = {
        ...keywordResult,
        usedAI: false,
        analysisMode: 'rules',
        fallbackUsed: false,
        notice: 'Gemini를 사용하지 않고 로컬 규칙으로 장면을 분석했습니다.',
      };
    }

    return NextResponse.json<ApiResponse<AnalyzeChapterResponse>>({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error, '콘텐츠 분석에 실패했습니다.');
  }
}
