import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createImagePrediction,
  getImagePredictionFailureDetails,
  getImageProviderErrorDetails,
  ImageProviderError,
} from './ai';

const FLUX_PREDICTIONS_URL =
  'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions';
const LEGACY_PREDICTIONS_URL = 'https://api.replicate.com/v1/predictions';
const LEGACY_VERSION = '42a996d39a96aedc57b2e0aa8105dea39c9c89d9d266caf6bb4327a1c191b061';

function predictionResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Replicate image provider adapter', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('REPLICATE_API_TOKEN', 'replicate-test-token');
    vi.stubEnv('REPLICATE_ANIME_MODEL_VERSION', '');
    vi.stubEnv('REPLICATE_ANIME_MODEL', '');
    vi.stubEnv('REPLICATE_IMAGE_STEPS', '20');
    vi.stubEnv('REPLICATE_IMAGE_GUIDANCE_SCALE', '7');
    vi.stubEnv('REPLICATE_WEBHOOK_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('기본 백엔드는 공식 warm FLUX Schnell endpoint와 스키마를 사용한다', async () => {
    fetchMock.mockResolvedValue(predictionResponse({
      id: 'flux-prediction-1',
      status: 'starting',
      output: null,
    }));

    const result = await createImagePrediction({
      prompt: 'A moonlit fantasy library',
      negativePrompt: 'letters',
      style: 'fantasy',
      aspectRatio: '9:16',
    });

    expect(result.id).toBe('flux-prediction-1');
    expect(result.failure).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(FLUX_PREDICTIONS_URL);
    expect(init?.method).toBe('POST');

    const body = JSON.parse(String(init?.body)) as {
      version?: string;
      input: Record<string, unknown>;
    };
    expect(body.version).toBeUndefined();
    expect(body.input).toMatchObject({
      aspect_ratio: '9:16',
      num_outputs: 1,
      num_inference_steps: 4,
      output_format: 'webp',
      output_quality: 90,
      disable_safety_checker: false,
      go_fast: true,
      megapixels: '1',
    });
    expect(body.input.prompt).toContain('A moonlit fantasy library');
    expect(body.input.prompt).toContain('safe-for-work and non-explicit');
    expect(body.input.prompt).toContain('letters');
    expect(body.input).not.toHaveProperty('negative_prompt');
    expect(body.input).not.toHaveProperty('width');
    expect(body.input).not.toHaveProperty('height');
    expect(body.input).not.toHaveProperty('guidance_scale');
  });

  it('명시한 legacy community version은 기존 endpoint와 입력 스키마를 유지한다', async () => {
    vi.stubEnv(
      'REPLICATE_ANIME_MODEL_VERSION',
      `cjwbw/anything-v4.0:${LEGACY_VERSION}`
    );
    fetchMock.mockResolvedValue(predictionResponse({
      id: 'legacy-prediction-1',
      status: 'starting',
    }));

    await createImagePrediction({
      prompt: 'Fantasy character portrait',
      negativePrompt: 'letters',
      style: 'anime',
      aspectRatio: '9:16',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(LEGACY_PREDICTIONS_URL);
    const body = JSON.parse(String(init?.body)) as {
      version: string;
      input: Record<string, unknown>;
    };
    expect(body.version).toBe(LEGACY_VERSION);
    expect(body.input).toMatchObject({
      width: 512,
      height: 896,
      num_outputs: 1,
      num_inference_steps: 20,
      guidance_scale: 7,
    });
    expect(body.input.negative_prompt).toContain('letters');
    expect(body.input).not.toHaveProperty('aspect_ratio');
    expect(body.input).not.toHaveProperty('disable_safety_checker');
  });

  it('legacy model selector도 community version 요청으로 취급한다', async () => {
    vi.stubEnv('REPLICATE_ANIME_MODEL', LEGACY_VERSION);
    fetchMock.mockResolvedValue(predictionResponse({
      id: 'legacy-prediction-2',
      status: 'starting',
    }));

    await createImagePrediction({ prompt: 'Anime landscape' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(LEGACY_PREDICTIONS_URL);
    expect(JSON.parse(String(init?.body))).toMatchObject({ version: LEGACY_VERSION });
  });

  it('공급자의 NSFW 응답은 원문을 노출하지 않고 안전 정책 오류로 분류한다', async () => {
    fetchMock.mockResolvedValue(predictionResponse({
      detail: 'NSFW content detected while processing private-prompt-text',
    }, 422));

    let caught: unknown;
    try {
      await createImagePrediction({ prompt: 'private-prompt-text' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ImageProviderError);
    expect(caught).toMatchObject({
      code: 'safety_rejected',
      status: 422,
      retryable: false,
    });
    const details = getImageProviderErrorDetails(caught);
    expect(details.userMessage).toContain('안전 정책');
    expect(details.userMessage).not.toContain('private-prompt-text');
    expect((caught as Error).message).not.toContain('NSFW');
  });

  it('완료 prediction의 실패·취소 사유를 GET route용 안전 메시지로 변환한다', () => {
    const safety = getImagePredictionFailureDetails({
      status: 'failed',
      error: 'NSFW content detected while processing private-prompt-text',
    });
    const canceled = getImagePredictionFailureDetails({ status: 'aborted' });

    expect(safety).toMatchObject({
      code: 'safety_rejected',
      retryable: false,
    });
    expect(safety?.userMessage).toContain('안전 정책');
    expect(safety?.userMessage).not.toContain('private-prompt-text');
    expect(canceled).toMatchObject({
      code: 'canceled',
      retryable: true,
    });
    expect(getImagePredictionFailureDetails({ status: 'succeeded' })).toBeNull();
  });

  it('초기 prediction이 이미 실패했으면 안전한 failure metadata를 함께 반환한다', async () => {
    fetchMock.mockResolvedValue(predictionResponse({
      id: 'flux-prediction-failed',
      status: 'failed',
      error: 'NSFW content detected while processing private-prompt-text',
    }));

    const result = await createImagePrediction({ prompt: 'private-prompt-text' });

    expect(result.status).toBe('failed');
    expect(result.failure).toMatchObject({
      code: 'safety_rejected',
      retryable: false,
    });
    expect(result.failure?.userMessage).toContain('안전 정책');
    expect(result.failure?.userMessage).not.toContain('private-prompt-text');
    expect(JSON.stringify(result.failure)).not.toContain('NSFW');
  });

  it('공급자 과부하 응답은 재시도 가능한 제한 오류로 분류한다', async () => {
    fetchMock.mockResolvedValue(predictionResponse({ detail: 'Too many requests' }, 429));

    await expect(createImagePrediction({ prompt: 'A calm forest' })).rejects.toMatchObject({
      code: 'rate_limited',
      status: 429,
      retryable: true,
    });
  });

  it('운영 웹훅 공개 주소 누락은 재시도 불가능한 설정 오류로 분류한다', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await expect(createImagePrediction({ prompt: 'A calm forest' })).rejects.toMatchObject({
      code: 'configuration',
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
