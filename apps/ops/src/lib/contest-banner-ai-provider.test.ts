import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpsApiError } from './api-error';
import {
  assertContestBannerAiProviderConfigured,
  buildContestBannerAiPrompt,
  createContestBannerPrediction,
} from './contest-banner-ai-provider';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Ops contest banner Replicate provider', () => {
  it('토큰이 없으면 공급자 호출 전에 503으로 거부한다', () => {
    vi.stubEnv('REPLICATE_API_TOKEN', '');
    expect(() => assertContestBannerAiProviderConfigured())
      .toThrow(expect.objectContaining<Partial<OpsApiError>>({ status: 503 }));
  });

  it('배너 전용 안전 영역과 텍스트 금지 지시를 고정한다', () => {
    const prompt = buildContestBannerAiPrompt('밤하늘 아래 펼쳐진 마법 도시', 'fantasy');
    expect(prompt).toContain('Wide 16:9');
    expect(prompt).toContain('central horizontal safe area');
    expect(prompt).toContain('no letters');
    expect(prompt).toContain('밤하늘 아래 펼쳐진 마법 도시');
  });

  it('1024x576 비동기 prediction 요청을 생성한다', async () => {
    vi.stubEnv('REPLICATE_API_TOKEN', 'replicate-test-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      id: 'prediction-a',
      status: 'starting',
      output: null,
    }));

    const result = await createContestBannerPrediction('미래 도시 공모전', 'anime');
    expect(result.id).toBe('prediction-a');
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body));
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Cancel-After')).toBe('120s');
    expect(body.input).toMatchObject({ width: 1024, height: 576, num_outputs: 1 });
    expect(body.input.prompt).toContain('미래 도시 공모전');
  });
});
