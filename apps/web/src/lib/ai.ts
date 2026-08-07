// AI image generation helper using Replicate-hosted anime models.
// Docs: https://replicate.com/docs/topics/predictions/create-a-prediction

import { uploadFile, BUCKETS } from './supabase';
import { logServerError } from '@novelverse/shared';
import { getReplicateImageWebhookConfig } from '@/lib/server/replicate-webhook-config';
import type {
  AIImageRequest,
  AIImageResponse,
  CoverStyle,
  CoverMood,
  CoverGenerationOptions,
} from '@/types';

export type ReplicatePrediction = {
  id?: string;
  status?: string;
  output?: unknown;
  error?: string | null;
  detail?: string;
  title?: string;
  urls?: {
    get?: string;
  };
};

const REPLICATE_API_URL = 'https://api.replicate.com/v1/predictions';
const DEFAULT_REPLICATE_MODEL = 'black-forest-labs/flux-schnell';
const DEFAULT_REPLICATE_MODEL_URL =
  `https://api.replicate.com/v1/models/${DEFAULT_REPLICATE_MODEL}/predictions`;

const SUCCESS_STATUSES = new Set(['succeeded', 'successful']);
const FAILED_STATUSES = new Set(['failed', 'canceled', 'cancelled', 'aborted']);
const DEFAULT_REPLICATE_TIMEOUT_SECONDS = 60 * 60;
const DEFAULT_REPLICATE_POLL_INTERVAL_MS = 3000;
const DEFAULT_REPLICATE_HTTP_TIMEOUT_MS = 30_000;

const DEFAULT_NEGATIVE_PROMPT =
  'low quality, worst quality, blurry, bad anatomy, bad hands, missing fingers, extra fingers, text, watermark, signature, username, logo, cropped, deformed, duplicate';

export type ImageProviderErrorCode =
  | 'configuration'
  | 'authentication'
  | 'billing'
  | 'rate_limited'
  | 'safety_rejected'
  | 'invalid_request'
  | 'timeout'
  | 'canceled'
  | 'generation_failed'
  | 'output_missing'
  | 'invalid_response'
  | 'provider_unavailable';

export type ImageProviderErrorDetails = {
  code: ImageProviderErrorCode;
  userMessage: string;
  retryable: boolean;
  status?: number;
};

const IMAGE_PROVIDER_ERROR_DETAILS: Record<
  ImageProviderErrorCode,
  Omit<ImageProviderErrorDetails, 'code' | 'status'>
> = {
  configuration: {
    userMessage: '이미지 생성 서비스가 아직 설정되지 않았습니다.',
    retryable: false,
  },
  authentication: {
    userMessage: '이미지 생성 서비스를 현재 사용할 수 없습니다. 관리자에게 문의해 주세요.',
    retryable: false,
  },
  billing: {
    userMessage: '이미지 생성 서비스의 사용 한도를 확인하고 있습니다. 잠시 후 다시 시도해 주세요.',
    retryable: true,
  },
  rate_limited: {
    userMessage: '이미지 생성 요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.',
    retryable: true,
  },
  safety_rejected: {
    userMessage: '안전 정책에 따라 이미지를 생성할 수 없습니다. 표현을 바꿔 다시 시도해 주세요.',
    retryable: false,
  },
  invalid_request: {
    userMessage: '이미지 생성 요청을 처리할 수 없습니다. 프롬프트와 옵션을 확인해 주세요.',
    retryable: false,
  },
  timeout: {
    userMessage: '이미지 생성 서비스의 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
    retryable: true,
  },
  canceled: {
    userMessage: '이미지 생성 작업이 취소되었습니다.',
    retryable: true,
  },
  generation_failed: {
    userMessage: '이미지 생성에 실패했습니다. 표현을 바꾸거나 잠시 후 다시 시도해 주세요.',
    retryable: true,
  },
  output_missing: {
    userMessage: '이미지 생성은 완료됐지만 결과 파일을 받지 못했습니다.',
    retryable: true,
  },
  invalid_response: {
    userMessage: '이미지 생성 서비스의 응답을 확인하지 못했습니다.',
    retryable: true,
  },
  provider_unavailable: {
    userMessage: '이미지 생성 서비스에 일시적으로 연결할 수 없습니다.',
    retryable: true,
  },
};

export class ImageProviderError extends Error {
  readonly code: ImageProviderErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(code: ImageProviderErrorCode, status?: number) {
    const details = IMAGE_PROVIDER_ERROR_DETAILS[code];
    super(details.userMessage);
    this.name = 'ImageProviderError';
    this.code = code;
    this.retryable = details.retryable;
    this.status = status;
  }
}

export function getImageProviderErrorDetails(error: unknown): ImageProviderErrorDetails {
  if (error instanceof ImageProviderError) {
    return {
      code: error.code,
      userMessage: error.message,
      retryable: error.retryable,
      status: error.status,
    };
  }

  const fallback = IMAGE_PROVIDER_ERROR_DETAILS.provider_unavailable;
  return {
    code: 'provider_unavailable',
    userMessage: fallback.userMessage,
    retryable: fallback.retryable,
  };
}

function logAiProviderFailure(scope: string, error: unknown) {
  const details = getImageProviderErrorDetails(error);
  logServerError(scope, new Error('AI provider request failed'), {
    errorType: error instanceof Error ? error.name.slice(0, 80) : 'UnknownError',
    providerCode: details.code,
    providerStatus: details.status,
    retryable: details.retryable,
  });
}

// Aspect ratio to dimensions mapping
const ASPECT_RATIOS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 512, height: 512 },
  '16:9': { width: 896, height: 512 },
  '9:16': { width: 512, height: 896 },
  '4:3': { width: 704, height: 512 },
};

// Style prompts for anime-focused generation
const STYLE_PROMPTS: Record<string, string> = {
  anime:
    'anime illustration, high-quality anime style, clean line art, vivid colors, detailed character art',
  realistic: 'detailed semi-realistic illustration, cinematic lighting',
  fantasy: 'anime fantasy illustration, magical atmosphere, detailed background, vivid colors',
  watercolor: 'soft anime illustration, watercolor texture, gentle colors, artistic lighting',
};

function getReplicateToken(): string {
  const token = process.env.REPLICATE_API_TOKEN;

  if (!token) {
    throw new ImageProviderError('configuration');
  }

  return token;
}

type ReplicateBackend =
  | { kind: 'official'; url: string }
  | { kind: 'legacy'; version: string; url: typeof REPLICATE_API_URL };

function getReplicateBackend(): ReplicateBackend {
  const configuredModel = (
    process.env.REPLICATE_ANIME_MODEL_VERSION ||
    process.env.REPLICATE_ANIME_MODEL ||
    ''
  ).trim();

  if (!configuredModel) {
    return {
      kind: 'official',
      url: DEFAULT_REPLICATE_MODEL_URL,
    };
  }

  const version = configuredModel.includes(':')
    ? configuredModel.split(':').pop()
    : configuredModel;

  if (!version) throw new ImageProviderError('configuration');
  return { kind: 'legacy', version, url: REPLICATE_API_URL };
}

function getPositiveNumberEnv(name: string, fallback: number): number {
  const configuredValue = Number(process.env[name]);
  return Number.isFinite(configuredValue) && configuredValue > 0 ? configuredValue : fallback;
}

function getReplicateTimeoutMs(): number {
  const configuredValue = Number(
    process.env.REPLICATE_IMAGE_TIMEOUT_SECONDS ?? DEFAULT_REPLICATE_TIMEOUT_SECONDS
  );

  return Number.isFinite(configuredValue) && configuredValue > 0 ? configuredValue * 1000 : 0;
}

function getReplicatePollIntervalMs(): number {
  return getPositiveNumberEnv(
    'REPLICATE_IMAGE_POLL_INTERVAL_MS',
    DEFAULT_REPLICATE_POLL_INTERVAL_MS
  );
}

function getReplicateHttpTimeoutMs(): number {
  return Math.min(
    getPositiveNumberEnv('REPLICATE_HTTP_TIMEOUT_MS', DEFAULT_REPLICATE_HTTP_TIMEOUT_MS),
    60_000
  );
}

function buildReplicateHeaders(waitForInitialResult: boolean): Record<string, string> {
  const timeoutMs = getReplicateTimeoutMs();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getReplicateToken()}`,
    'Content-Type': 'application/json',
  };

  if (waitForInitialResult) {
    headers.Prefer = 'wait=60';
  }

  if (timeoutMs > 0) {
    headers['Cancel-After'] = `${Math.ceil(timeoutMs / 1000)}s`;
  }

  return headers;
}

function normalizeDimensions(aspectRatio?: AIImageRequest['aspectRatio']) {
  return ASPECT_RATIOS[aspectRatio || '1:1'] || ASPECT_RATIOS['1:1'];
}

function buildAnimePrompt(prompt: string, style?: AIImageRequest['style']): string {
  const stylePrompt = STYLE_PROMPTS[style || 'anime'] || STYLE_PROMPTS.anime;
  return `${prompt}, ${stylePrompt}, masterpiece, best quality, highly detailed`;
}

function buildNegativePrompt(negativePrompt?: string): string {
  return negativePrompt
    ? `${negativePrompt}, ${DEFAULT_NEGATIVE_PROMPT}`
    : DEFAULT_NEGATIVE_PROMPT;
}

function extractImageUrl(output: unknown): string | null {
  if (typeof output === 'string') {
    return output;
  }

  if (Array.isArray(output)) {
    const firstImage = output.find((item) => typeof item === 'string');
    if (typeof firstImage === 'string') return firstImage;

    const firstUrlObject = output.find(
      (item): item is { url: string } =>
        typeof item === 'object' &&
        item !== null &&
        'url' in item &&
        typeof (item as { url?: unknown }).url === 'string'
    );
    return firstUrlObject?.url || null;
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

export function extractPredictionImageUrl(prediction: ReplicatePrediction): string | null {
  return extractImageUrl(prediction.output);
}

function providerErrorText(prediction: ReplicatePrediction) {
  return [prediction.error, prediction.detail, prediction.title]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .slice(0, 2_000);
}

function isSafetyRejection(prediction: ReplicatePrediction) {
  return /\bnsfw\b|safety|unsafe|content\s*policy|moderation|explicit\s*content/i.test(
    providerErrorText(prediction)
  );
}

/**
 * 완료된 Replicate prediction의 실패 사유를 prompt나 provider 원문을
 * 노출하지 않는 사용자용 코드와 메시지로 변환한다.
 */
export function getImagePredictionFailureDetails(
  prediction: Pick<ReplicatePrediction, 'status' | 'error' | 'detail' | 'title'>
): ImageProviderErrorDetails | null {
  const status = (prediction.status || '').toLowerCase();
  let code: ImageProviderErrorCode | null = null;

  if (status === 'canceled' || status === 'cancelled' || status === 'aborted') {
    code = 'canceled';
  } else if (status === 'failed') {
    code = isSafetyRejection(prediction) ? 'safety_rejected' : 'generation_failed';
  }

  return code ? getImageProviderErrorDetails(new ImageProviderError(code)) : null;
}

function providerHttpError(prediction: ReplicatePrediction, status: number) {
  if (isSafetyRejection(prediction)) {
    return new ImageProviderError('safety_rejected', status);
  }
  if (status === 401 || status === 403) {
    return new ImageProviderError('authentication', status);
  }
  if (status === 402) {
    return new ImageProviderError('billing', status);
  }
  if (status === 408 || status === 504) {
    return new ImageProviderError('timeout', status);
  }
  if (status === 409 || status === 425 || status === 429) {
    return new ImageProviderError('rate_limited', status);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ImageProviderError('invalid_request', status);
  }
  return new ImageProviderError('provider_unavailable', status);
}

function providerPredictionError(prediction: ReplicatePrediction) {
  const details = getImagePredictionFailureDetails(prediction);
  return new ImageProviderError(details?.code || 'generation_failed');
}

function isProviderTimeout(error: unknown) {
  return error instanceof Error && (
    error.name === 'AbortError' ||
    error.name === 'TimeoutError'
  );
}

async function fetchReplicate(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof ImageProviderError) throw error;
    throw new ImageProviderError(
      isProviderTimeout(error) ? 'timeout' : 'provider_unavailable'
    );
  }
}

async function readPredictionResponse(response: Response): Promise<ReplicatePrediction> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    if (!response.ok) {
      throw providerHttpError({}, response.status);
    }
    throw new ImageProviderError('invalid_response', response.status);
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ImageProviderError('invalid_response', response.status);
  }

  const prediction = value as ReplicatePrediction;
  if (!response.ok) {
    throw providerHttpError(prediction, response.status);
  }
  return prediction;
}

async function getPrediction(url: string): Promise<ReplicatePrediction> {
  const response = await fetchReplicate(url, {
    headers: {
      Authorization: `Bearer ${getReplicateToken()}`,
    },
    signal: AbortSignal.timeout(getReplicateHttpTimeoutMs()),
  });
  return readPredictionResponse(response);
}

export async function getImagePrediction(predictionId: string): Promise<ReplicatePrediction> {
  return getPrediction(`${REPLICATE_API_URL}/${encodeURIComponent(predictionId)}`);
}

async function waitForPrediction(
  prediction: ReplicatePrediction,
  timeoutMs = getReplicateTimeoutMs(),
  intervalMs = getReplicatePollIntervalMs()
): Promise<ReplicatePrediction> {
  let current = prediction;
  const hasTimeout = timeoutMs > 0;
  const deadline = Date.now() + timeoutMs;

  while (!hasTimeout || Date.now() < deadline) {
    const status = current.status || '';

    if (SUCCESS_STATUSES.has(status)) {
      return current;
    }

    if (FAILED_STATUSES.has(status)) {
      throw providerPredictionError(current);
    }

    if (!current.urls?.get) {
      break;
    }

    const waitMs = hasTimeout
      ? Math.min(intervalMs, Math.max(deadline - Date.now(), 0))
      : intervalMs;
    if (waitMs <= 0) break;

    await new Promise((resolve) => setTimeout(resolve, waitMs));
    current = await getPrediction(current.urls.get);
  }

  if (hasTimeout) {
    throw new ImageProviderError('timeout');
  }

  throw new ImageProviderError('invalid_response');
}

function boundedLegacyInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function boundedLegacyNumber(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

function buildOfficialFluxPrompt(prompt: string, negativePrompt: string) {
  return `${prompt}. Keep the image safe-for-work and non-explicit. Avoid: ${negativePrompt}.`;
}

async function createReplicatePrediction(
  prompt: string,
  negativePrompt: string,
  width: number,
  height: number,
  aspectRatio: NonNullable<AIImageRequest['aspectRatio']>,
  waitForInitialResult: boolean,
  seed?: number
): Promise<ReplicatePrediction> {
  const backend = getReplicateBackend();
  let webhookConfig: ReturnType<typeof getReplicateImageWebhookConfig>;
  try {
    webhookConfig = getReplicateImageWebhookConfig();
  } catch {
    // Public origin mistakes are deployment configuration errors, not
    // transient provider outages. Keep the raw setting out of user responses.
    throw new ImageProviderError('configuration');
  }
  const body = backend.kind === 'official'
    ? {
        ...webhookConfig,
        input: {
          prompt: buildOfficialFluxPrompt(prompt, negativePrompt),
          aspect_ratio: aspectRatio,
          num_outputs: 1,
          num_inference_steps: 4,
          output_format: 'webp',
          output_quality: 90,
          disable_safety_checker: false,
          go_fast: true,
          megapixels: '1',
          ...(seed === undefined ? {} : { seed }),
        },
      }
    : {
        ...webhookConfig,
        version: backend.version,
        input: {
          prompt,
          negative_prompt: negativePrompt,
          width,
          height,
          num_outputs: 1,
          num_inference_steps: boundedLegacyInteger(
            'REPLICATE_IMAGE_STEPS',
            20,
            1,
            500
          ),
          guidance_scale: boundedLegacyNumber(
            'REPLICATE_IMAGE_GUIDANCE_SCALE',
            7,
            1,
            20
          ),
          ...(seed === undefined ? {} : { seed }),
        },
      };
  const response = await fetchReplicate(backend.url, {
    method: 'POST',
    headers: buildReplicateHeaders(waitForInitialResult),
    signal: AbortSignal.timeout(getReplicateHttpTimeoutMs()),
    body: JSON.stringify(body),
  });
  return readPredictionResponse(response);
}

async function createReplicateImage(
  prompt: string,
  negativePrompt: string,
  width: number,
  height: number,
  aspectRatio: NonNullable<AIImageRequest['aspectRatio']>,
  seed?: number
): Promise<string> {
  const prediction = await createReplicatePrediction(
    prompt,
    negativePrompt,
    width,
    height,
    aspectRatio,
    true,
    seed
  );

  const completed = SUCCESS_STATUSES.has(prediction.status || '')
    ? prediction
    : await waitForPrediction(prediction);

  const imageUrl = extractImageUrl(completed.output);

  if (!imageUrl) {
    throw new ImageProviderError('output_missing');
  }

  return imageUrl;
}

export async function createImagePrediction(
  request: AIImageRequest
): Promise<{
  id: string;
  status: string;
  prompt: string;
  imageUrl: string | null;
  failure: ImageProviderErrorDetails | null;
}> {
  const aspectRatio = request.aspectRatio || '1:1';
  const dimensions = normalizeDimensions(request.aspectRatio);
  const prompt = buildAnimePrompt(request.prompt, request.style);
  const negativePrompt = buildNegativePrompt(request.negativePrompt);
  const prediction = await createReplicatePrediction(
    prompt,
    negativePrompt,
    dimensions.width,
    dimensions.height,
    aspectRatio,
    false,
    request.seed
  );

  if (!prediction.id) {
    throw new ImageProviderError('invalid_response');
  }

  return {
    id: prediction.id,
    status: prediction.status || 'starting',
    prompt: request.prompt,
    imageUrl: extractImageUrl(prediction.output),
    failure: getImagePredictionFailureDetails(prediction),
  };
}

async function fetchImageBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(getReplicateHttpTimeoutMs()),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    return response.blob();
  } catch (error) {
    logServerError('ai-image-fetch', error);
    return null;
  }
}

export async function generateImage(
  request: AIImageRequest
): Promise<AIImageResponse & { error?: string }> {
  const aspectRatio = request.aspectRatio || '1:1';
  const dimensions = normalizeDimensions(request.aspectRatio);
  const prompt = buildAnimePrompt(request.prompt, request.style);
  const negativePrompt = buildNegativePrompt(request.negativePrompt);

  try {
    const imageUrl = await createReplicateImage(
      prompt,
      negativePrompt,
      dimensions.width,
      dimensions.height,
      aspectRatio,
      request.seed
    );

    return {
      imageUrl,
      prompt: request.prompt,
    };
  } catch (error) {
    // Provider error bodies can echo request inputs, so only log the bounded
    // error class and never the raw response, prompt, or authorization token.
    logAiProviderFailure('ai-image-generation', error);
    const providerError = getImageProviderErrorDetails(error);
    return {
      imageUrl: '',
      prompt: request.prompt,
      error: providerError.userMessage,
    };
  }
}

// Generate and upload image to storage
export async function generateAndUploadImage(
  request: AIImageRequest,
  bucket: keyof typeof BUCKETS,
  fileName: string
): Promise<{ url: string | null; error: string | null }> {
  const result = await generateImage(request);

  if (result.error || !result.imageUrl) {
    return { url: null, error: result.error || '이미지 생성에 실패했습니다.' };
  }

  const imageBlob = await fetchImageBlob(result.imageUrl);

  if (!imageBlob) {
    return { url: result.imageUrl, error: null };
  }

  const uploadResult = await uploadFile(bucket, fileName, imageBlob, imageBlob.type || 'image/png');

  return uploadResult;
}

// Mood descriptions for cover generation
const MOOD_DESCRIPTIONS: Record<CoverMood, string> = {
  mystical: 'mystical atmosphere, ethereal glow, magical aura',
  dark: 'dark atmosphere, dramatic shadows, moody lighting',
  bright: 'bright and vibrant, warm lighting, cheerful mood',
  romantic: 'romantic atmosphere, soft lighting, gentle mood',
  action: 'dynamic action, intense energy, dramatic composition',
  calm: 'peaceful atmosphere, serene mood, gentle colors',
};

// Generate cover image with optimized prompt
export function buildNovelCoverImageRequest(
  title: string,
  genre: string,
  description?: string,
  options?: Partial<CoverGenerationOptions>,
  firstChapterContent?: string
): AIImageRequest {
  const genreStyles: Record<string, string> = {
    FANTASY: 'anime fantasy novel cover, magical world, dramatic composition',
    ROMANCE: 'anime romance novel cover, emotional scene, soft lighting',
    SF: 'anime sci-fi novel cover, futuristic city, cinematic lighting',
    MARTIAL_ARTS: 'anime martial arts novel cover, dynamic pose, asian fantasy aesthetic',
    MYSTERY: 'anime mystery novel cover, suspenseful atmosphere, dramatic shadows',
    HORROR: 'anime horror novel cover, eerie atmosphere, dark lighting',
    MODERN: 'modern anime novel cover, urban background, contemporary fashion',
    OTHER: 'anime web novel cover, detailed character-focused composition',
  };

  // Use custom prompt if provided
  if (options?.useCustomPrompt && options.customPrompt) {
    return {
      prompt: options.customPrompt,
      negativePrompt: 'text, watermark, signature, blurry, low quality',
      style: options.style || 'anime',
      aspectRatio: '9:16',
    };
  }

  // Build automatic prompt
  const styleHint = genreStyles[genre] || genreStyles.OTHER;
  const moodHint = options?.mood ? MOOD_DESCRIPTIONS[options.mood] : '';

  const promptParts = [`Book cover art for "${title}". ${styleHint}.`];
  if (moodHint) promptParts.push(`${moodHint}.`);
  if (description) promptParts.push(`Story: ${description.slice(0, 200)}`);
  if (firstChapterContent) promptParts.push(`Opening scene: ${firstChapterContent.slice(0, 200)}`);
  promptParts.push(
    'single main character or symbolic focal object, clean composition, no letters, no title text'
  );

  const prompt = promptParts.join(' ');

  return {
    prompt,
    negativePrompt: 'text, title, logo, watermark, signature, blurry, low quality',
    style: (options?.style as CoverStyle) || 'anime',
    aspectRatio: '9:16',
  };
}

export async function generateNovelCover(
  title: string,
  genre: string,
  description?: string,
  options?: Partial<CoverGenerationOptions>,
  firstChapterContent?: string
): Promise<AIImageResponse & { error?: string }> {
  return generateImage(
    buildNovelCoverImageRequest(title, genre, description, options, firstChapterContent)
  );
}

// Generate cover and upload to Supabase storage
export async function generateAndUploadCover(
  title: string,
  genre: string,
  description?: string,
  options?: Partial<CoverGenerationOptions>,
  novelId?: string
): Promise<{ url: string | null; prompt: string; error: string | null }> {
  const result = await generateNovelCover(title, genre, description, options);

  if (result.error || !result.imageUrl) {
    return { url: null, prompt: result.prompt, error: result.error || '표지 생성에 실패했습니다.' };
  }

  // If novelId is provided, upload to Supabase
  if (novelId) {
    const imageBlob = await fetchImageBlob(result.imageUrl);

    if (imageBlob) {
      const fileName = `${novelId}/${Date.now()}.png`;
      const uploadResult = await uploadFile(
        'COVERS',
        fileName,
        imageBlob,
        imageBlob.type || 'image/png'
      );

      if (!uploadResult.error && uploadResult.url) {
        return { url: uploadResult.url, prompt: result.prompt, error: null };
      }
    }

    return { url: result.imageUrl, prompt: result.prompt, error: null };
  }

  return { url: result.imageUrl, prompt: result.prompt, error: null };
}

// Generate chapter illustration
export function buildChapterIllustrationImageRequest(
  sceneDescription: string,
  novelGenre: string,
  style: AIImageRequest['style'] = 'anime'
): AIImageRequest {
  const prompt = `Illustration for a ${novelGenre.toLowerCase()} web novel scene: ${sceneDescription}. Detailed anime artwork, cinematic composition`;

  return {
    prompt,
    negativePrompt: 'text, watermark, signature, blurry, low quality, deformed',
    style,
    aspectRatio: '16:9',
  };
}

export async function generateChapterIllustration(
  sceneDescription: string,
  novelGenre: string,
  style: AIImageRequest['style'] = 'anime'
): Promise<AIImageResponse & { error?: string }> {
  return generateImage(buildChapterIllustrationImageRequest(sceneDescription, novelGenre, style));
}

// Generate chapter illustration with character information
export async function generateChapterIllustrationWithCharacters(
  sceneDescription: string,
  novelGenre: string,
  characters: { name: string; appearance: string }[],
  style: AIImageRequest['style'] = 'anime'
): Promise<AIImageResponse & { error?: string }> {
  const characterDescriptions = characters.map((c) => `${c.name}: ${c.appearance}`).join('. ');

  const prompt = `Illustration for a ${novelGenre.toLowerCase()} web novel scene: ${sceneDescription}. ${characterDescriptions ? `Characters in the scene - ${characterDescriptions}.` : ''} Detailed anime artwork, consistent character design`;

  return generateImage({
    prompt,
    negativePrompt: 'text, watermark, signature, blurry, low quality, deformed, bad anatomy, inconsistent faces',
    style,
    aspectRatio: '16:9',
  });
}

// Build a character portrait request. The same request is used by both the
// legacy synchronous helper and the persistent asynchronous job API.
export function buildCharacterPortraitImageRequest(
  appearance: string,
  genre: string = 'fantasy',
  style: AIImageRequest['style'] = 'anime',
  seed?: number,
  variation?: string
): AIImageRequest {
  const genreStyleHints: Record<string, string> = {
    FANTASY: 'fantasy character portrait, magical atmosphere',
    ROMANCE: 'beautiful character portrait, soft lighting, romantic aesthetic',
    SF: 'sci-fi character portrait, futuristic design',
    MARTIAL_ARTS: 'martial arts character, dynamic pose, asian aesthetic',
    MYSTERY: 'mysterious character portrait, noir style',
    HORROR: 'character portrait, dark atmosphere',
    MODERN: 'modern character portrait, contemporary style',
    OTHER: 'detailed character portrait',
  };

  const styleHint = genreStyleHints[genre.toUpperCase()] || genreStyleHints.OTHER;

  const prompt = [
    `${styleHint}. Character identity DNA: ${appearance}.`,
    'Preserve the exact same facial identity, face shape, eyes, hair, apparent age, and signature features across every image.',
    variation
      ? `Requested variation only: ${variation}. Keep all other identity features unchanged.`
      : '',
    'Upper body portrait, facing camera, detailed face, clean background',
  ].filter(Boolean).join(' ');

  return {
    prompt,
    negativePrompt:
      'text, watermark, signature, blurry, low quality, deformed face, multiple faces, bad anatomy',
    style,
    aspectRatio: '1:1',
    seed,
  };
}

// Generate character portrait
export async function generateCharacterPortrait(
  appearance: string,
  genre: string = 'fantasy',
  style: AIImageRequest['style'] = 'anime'
): Promise<AIImageResponse & { error?: string }> {
  return generateImage(buildCharacterPortraitImageRequest(appearance, genre, style));
}

// Default export
const aiHelpers = {
  generateImage,
  createImagePrediction,
  generateAndUploadImage,
  buildNovelCoverImageRequest,
  generateNovelCover,
  generateAndUploadCover,
  buildChapterIllustrationImageRequest,
  generateChapterIllustration,
  generateChapterIllustrationWithCharacters,
  buildCharacterPortraitImageRequest,
  generateCharacterPortrait,
};

export default aiHelpers;
