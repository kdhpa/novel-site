import { OpsApiError } from './api-error';

const REPLICATE_API_URL = 'https://api.replicate.com/v1/predictions';
const DEFAULT_MODEL_VERSION =
  '42a996d39a96aedc57b2e0aa8105dea39c9c89d9d266caf6bb4327a1c191b061';

export const CONTEST_BANNER_AI_STYLES = [
  'anime',
  'realistic',
  'fantasy',
  'watercolor',
] as const;

export type ContestBannerAiStyle = (typeof CONTEST_BANNER_AI_STYLES)[number];
export type ReplicateBannerPrediction = {
  id: string;
  status: string;
  imageUrl: string | null;
};

type ReplicatePayload = {
  id?: unknown;
  status?: unknown;
  output?: unknown;
};

const STYLE_PROMPTS: Record<ContestBannerAiStyle, string> = {
  anime: 'high-quality anime illustration, clean line art, vivid colors',
  realistic: 'cinematic semi-realistic illustration, detailed lighting and atmosphere',
  fantasy: 'epic fantasy illustration, magical atmosphere, richly detailed scenery',
  watercolor: 'elegant watercolor illustration, soft texture and harmonious colors',
};

function providerToken() {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) {
    throw new OpsApiError(503, 'AI 이미지 공급자 설정이 필요합니다.');
  }
  return token;
}

function providerModelVersion() {
  const configured = (
    process.env.REPLICATE_ANIME_MODEL_VERSION ||
    process.env.REPLICATE_ANIME_MODEL ||
    DEFAULT_MODEL_VERSION
  ).trim();
  const version = configured.includes(':') ? configured.split(':').pop() : configured;
  return version || DEFAULT_MODEL_VERSION;
}

function providerTimeoutMs() {
  const configured = Number(process.env.REPLICATE_HTTP_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, 60_000)
    : 30_000;
}

function providerGenerationTimeoutSeconds() {
  const configured = Number(process.env.REPLICATE_IMAGE_TIMEOUT_SECONDS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(Math.ceil(configured), 3_600)
    : 120;
}

function positiveIntegerEnv(name: string, fallback: number) {
  const configured = Number(process.env[name]);
  return Number.isInteger(configured) && configured > 0 ? configured : fallback;
}

function extractImageUrl(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const stringUrl = output.find((item) => typeof item === 'string');
    if (typeof stringUrl === 'string') return stringUrl;
    const objectUrl = output.find(
      (item): item is { url: string } =>
        typeof item === 'object' &&
        item !== null &&
        'url' in item &&
        typeof (item as { url?: unknown }).url === 'string',
    );
    return objectUrl?.url || null;
  }
  if (
    typeof output === 'object' &&
    output !== null &&
    'url' in output &&
    typeof (output as { url?: unknown }).url === 'string'
  ) {
    return (output as { url: string }).url;
  }
  return null;
}

async function readProviderPayload(response: Response): Promise<ReplicatePayload> {
  try {
    return await response.json() as ReplicatePayload;
  } catch {
    return {};
  }
}

function normalizePrediction(payload: ReplicatePayload): ReplicateBannerPrediction {
  if (typeof payload.id !== 'string' || !payload.id || payload.id.length > 256) {
    throw new OpsApiError(502, 'AI 이미지 공급자가 올바른 작업 ID를 반환하지 않았습니다.');
  }
  return {
    id: payload.id,
    status: typeof payload.status === 'string' ? payload.status.toLowerCase() : 'starting',
    imageUrl: extractImageUrl(payload.output),
  };
}

async function providerRequest(url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${providerToken()}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(providerTimeoutMs()),
    });
  } catch {
    throw new OpsApiError(502, 'AI 이미지 공급자에 연결하지 못했습니다.');
  }

  const payload = await readProviderPayload(response);
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 503 : 502;
    throw new OpsApiError(status, status === 503
      ? 'AI 이미지 공급자 인증 설정을 확인해 주세요.'
      : 'AI 이미지 공급자가 요청을 처리하지 못했습니다.');
  }
  return normalizePrediction(payload);
}

export function assertContestBannerAiProviderConfigured() {
  providerToken();
}

export function buildContestBannerAiPrompt(prompt: string, style: ContestBannerAiStyle) {
  return [
    'Wide 16:9 promotional banner illustration for a Korean web novel contest.',
    prompt,
    STYLE_PROMPTS[style],
    'Keep every important subject and visual detail inside the central horizontal safe area.',
    'Balanced panoramic composition, polished key art, no letters, no words, no title, no logo, no watermark.',
  ].join(' ');
}

export async function createContestBannerPrediction(
  prompt: string,
  style: ContestBannerAiStyle,
) {
  const fullPrompt = buildContestBannerAiPrompt(prompt, style);
  const prediction = await providerRequest(REPLICATE_API_URL, {
    method: 'POST',
    headers: { 'Cancel-After': `${providerGenerationTimeoutSeconds()}s` },
    body: JSON.stringify({
      version: providerModelVersion(),
      input: {
        prompt: `${fullPrompt}, masterpiece, best quality, highly detailed`,
        negative_prompt:
          'text, letters, words, title, logo, watermark, signature, username, blurry, low quality, cropped subject, deformed, duplicate',
        width: 1024,
        height: 576,
        num_outputs: 1,
        num_inference_steps: positiveIntegerEnv('REPLICATE_IMAGE_STEPS', 20),
        guidance_scale: positiveIntegerEnv('REPLICATE_IMAGE_GUIDANCE_SCALE', 7),
      },
    }),
  });
  return { ...prediction, prompt: fullPrompt };
}

export function getContestBannerPrediction(predictionId: string) {
  return providerRequest(`${REPLICATE_API_URL}/${encodeURIComponent(predictionId)}`);
}
