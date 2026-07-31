import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  analyzeWithAI: vi.fn(),
  analyzeWithRules: vi.fn(),
  assertRateLimit: vi.fn(),
  assertGlobalAiBudget: vi.fn(),
  logServerError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/scene-analyzer-ai', () => ({
  analyzeChapterWithAI: mocks.analyzeWithAI,
}));
vi.mock('@/lib/illustration-analyzer', () => ({
  analyzeChapterForIllustrations: mocks.analyzeWithRules,
}));
vi.mock('@/lib/server/rate-limit', () => ({
  assertRateLimit: mocks.assertRateLimit,
  getClientIp: () => '203.0.113.10',
}));
vi.mock('@/lib/server/ai-budget', () => ({
  assertGlobalAiBudget: mocks.assertGlobalAiBudget,
}));
vi.mock('@novelverse/shared', () => ({
  logServerError: mocks.logServerError,
}));

import { POST } from './route';

const content = [
  '<p>첫 번째 문단에는 성의 정문과 새벽 안개가 길게 펼쳐졌다.</p>',
  '<p>두 번째 문단에서 주인공은 갑자기 빛나는 검을 뽑아 들었다.</p>',
  '<p>세 번째 문단에는 거대한 용이 불길 사이에서 모습을 드러냈다.</p>',
].join('');

function request(body: object) {
  return new NextRequest('https://novelverse.test/api/ai/analyze-chapter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    content,
    novelId: 'novel-a',
    maxCount: 3,
    autoDetect: true,
    useAI: true,
    adultConfirmed: true,
    ...overrides,
  };
}

describe('chapter analysis route', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: 'author-a' } });
    mocks.assertRateLimit.mockResolvedValue(undefined);
    mocks.assertGlobalAiBudget.mockResolvedValue(undefined);
    mocks.analyzeWithRules.mockReturnValue({
      positions: [],
      totalParagraphs: 3,
    });
  });

  it('성인 확인 없이 Gemini 분석을 요청하면 공급자 호출 전에 거부한다', async () => {
    const response = await POST(request(baseBody({ adultConfirmed: false })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Gemini 기능은 만 18세 이상 확인 후 사용할 수 있습니다.',
    });
    expect(mocks.assertGlobalAiBudget).not.toHaveBeenCalled();
    expect(mocks.analyzeWithAI).not.toHaveBeenCalled();
  });

  it('Gemini 성공 여부와 분석 방식을 응답에 명시한다', async () => {
    mocks.analyzeWithAI.mockResolvedValue({
      positions: [
        {
          paragraphIndex: 2,
          contextText: '용이 불길 사이에서 모습을 드러냈다.',
          suggestedPrompt: '용의 등장',
          optimizedPrompt: 'huge dragon emerging from flames, cinematic',
          isManualMarker: false,
          confidence: 0.95,
        },
      ],
      totalParagraphs: 3,
      usedAI: true,
    });

    const response = await POST(request(baseBody({
      characters: [{ id: 'character-a', name: '아린', appearance: '은발과 푸른 눈' }],
    })));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.analyzeWithAI).toHaveBeenCalledWith(
      content,
      3,
      [{ id: 'character-a', name: '아린', appearance: '은발과 푸른 눈' }]
    );
    expect(payload.data).toMatchObject({
      usedAI: true,
      analysisMode: 'gemini',
      fallbackUsed: false,
      notice: expect.stringContaining('Gemini AI'),
    });
  });

  it('Gemini 실패 시 규칙 기반 결과를 반환하되 폴백 사실을 숨기지 않는다', async () => {
    const providerError = new Error('provider unavailable');
    mocks.analyzeWithAI.mockRejectedValue(providerError);
    mocks.analyzeWithRules.mockReturnValue({
      positions: [
        {
          paragraphIndex: 1,
          contextText: '주인공은 빛나는 검을 뽑았다.',
          suggestedPrompt: 'Illustration of a glowing sword',
          isManualMarker: false,
          confidence: 0.7,
        },
      ],
      totalParagraphs: 3,
    });

    const response = await POST(request(baseBody()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      usedAI: false,
      analysisMode: 'rules',
      fallbackUsed: true,
      notice: expect.stringMatching(/Gemini 분석에 실패.*규칙 기반/),
    });
    expect(mocks.analyzeWithRules).toHaveBeenCalledWith(content, 3, true);
    expect(mocks.logServerError).toHaveBeenCalledWith(
      'gemini.scene-analysis-fallback',
      providerError,
      { userId: 'author-a' }
    );
  });

  it('Gemini를 요청하지 않은 분석도 AI 미사용 상태를 명시한다', async () => {
    const response = await POST(request(baseBody({
      useAI: false,
      adultConfirmed: false,
    })));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      positions: [],
      totalParagraphs: 3,
      usedAI: false,
      analysisMode: 'rules',
      fallbackUsed: false,
      notice: 'Gemini를 사용하지 않고 로컬 규칙으로 장면을 분석했습니다.',
    });
    expect(mocks.assertGlobalAiBudget).not.toHaveBeenCalled();
    expect(mocks.analyzeWithAI).not.toHaveBeenCalled();
  });

  it('Gemini가 필요 없는 짧은 본문도 AI 미사용 이유를 알려준다', async () => {
    mocks.analyzeWithAI.mockResolvedValue({
      positions: [],
      totalParagraphs: 2,
      usedAI: false,
    });

    const response = await POST(request(baseBody()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      usedAI: false,
      analysisMode: 'rules',
      fallbackUsed: false,
      notice: expect.stringContaining('문단이 3개 미만'),
    });
    expect(mocks.analyzeWithRules).not.toHaveBeenCalled();
  });
});
