// AI image generation helper using Replicate-hosted anime models.
// Docs: https://replicate.com/docs/topics/predictions/create-a-prediction

import { uploadFile, BUCKETS } from './supabase';
import { logServerError } from '@novelverse/shared';
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
const DEFAULT_REPLICATE_MODEL_VERSION =
  '42a996d39a96aedc57b2e0aa8105dea39c9c89d9d266caf6bb4327a1c191b061';

const SUCCESS_STATUSES = new Set(['succeeded', 'successful']);
const FAILED_STATUSES = new Set(['failed', 'canceled', 'cancelled']);
const DEFAULT_REPLICATE_TIMEOUT_SECONDS = 60 * 60;
const DEFAULT_REPLICATE_POLL_INTERVAL_MS = 3000;
const DEFAULT_REPLICATE_HTTP_TIMEOUT_MS = 30_000;

const DEFAULT_NEGATIVE_PROMPT =
  'low quality, worst quality, blurry, bad anatomy, bad hands, missing fingers, extra fingers, text, watermark, signature, username, logo, cropped, deformed, duplicate';

function logAiProviderFailure(scope: string, error: unknown) {
  logServerError(scope, new Error('AI provider request failed'), {
    errorType: error instanceof Error ? error.name.slice(0, 80) : 'UnknownError',
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
    throw new Error('REPLICATE_API_TOKEN must be set in environment variables');
  }

  return token;
}

function getReplicateModelVersion(): string {
  const configuredModel =
    process.env.REPLICATE_ANIME_MODEL_VERSION ||
    process.env.REPLICATE_ANIME_MODEL ||
    DEFAULT_REPLICATE_MODEL_VERSION;

  const version = configuredModel.includes(':')
    ? configuredModel.split(':').pop()
    : configuredModel;

  return version || DEFAULT_REPLICATE_MODEL_VERSION;
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

function getReplicateErrorMessage(prediction: ReplicatePrediction, status: number): string {
  return (
    prediction.error ||
    prediction.detail ||
    prediction.title ||
    `Replicate API Error: ${status}`
  );
}

async function getPrediction(url: string): Promise<ReplicatePrediction> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getReplicateToken()}`,
    },
    signal: AbortSignal.timeout(getReplicateHttpTimeoutMs()),
  });

  const prediction = (await response.json()) as ReplicatePrediction;

  if (!response.ok) {
    throw new Error(getReplicateErrorMessage(prediction, response.status));
  }

  return prediction;
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
      throw new Error(current.error || 'Replicate image generation failed');
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
    throw new Error(
      `Image generation timed out after ${Math.round(timeoutMs / 1000)} seconds. Last status: ${
        current.status || 'unknown'
      }`
    );
  }

  throw new Error(
    `Image generation stopped before completion. Last status: ${current.status || 'unknown'}`
  );
}

async function createReplicatePrediction(
  prompt: string,
  negativePrompt: string,
  width: number,
  height: number,
  waitForInitialResult: boolean
): Promise<ReplicatePrediction> {
  const response = await fetch(REPLICATE_API_URL, {
    method: 'POST',
    headers: buildReplicateHeaders(waitForInitialResult),
    signal: AbortSignal.timeout(getReplicateHttpTimeoutMs()),
    body: JSON.stringify({
      version: getReplicateModelVersion(),
      input: {
        prompt,
        negative_prompt: negativePrompt,
        width,
        height,
        num_outputs: 1,
        num_inference_steps: Number(process.env.REPLICATE_IMAGE_STEPS || 20),
        guidance_scale: Number(process.env.REPLICATE_IMAGE_GUIDANCE_SCALE || 7),
      },
    }),
  });

  const prediction = (await response.json()) as ReplicatePrediction;

  if (!response.ok) {
    throw new Error(getReplicateErrorMessage(prediction, response.status));
  }

  return prediction;
}

async function createReplicateImage(
  prompt: string,
  negativePrompt: string,
  width: number,
  height: number
): Promise<string> {
  const prediction = await createReplicatePrediction(
    prompt,
    negativePrompt,
    width,
    height,
    true
  );

  const completed = SUCCESS_STATUSES.has(prediction.status || '')
    ? prediction
    : await waitForPrediction(prediction);

  const imageUrl = extractImageUrl(completed.output);

  if (!imageUrl) {
    throw new Error('Replicate generation completed without an image URL');
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
}> {
  const dimensions = normalizeDimensions(request.aspectRatio);
  const prompt = buildAnimePrompt(request.prompt, request.style);
  const negativePrompt = buildNegativePrompt(request.negativePrompt);
  const prediction = await createReplicatePrediction(
    prompt,
    negativePrompt,
    dimensions.width,
    dimensions.height,
    false
  );

  if (!prediction.id) {
    throw new Error('Replicate did not return a prediction id');
  }

  return {
    id: prediction.id,
    status: prediction.status || 'starting',
    prompt: request.prompt,
    imageUrl: extractImageUrl(prediction.output),
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
  const dimensions = normalizeDimensions(request.aspectRatio);
  const prompt = buildAnimePrompt(request.prompt, request.style);
  const negativePrompt = buildNegativePrompt(request.negativePrompt);

  try {
    const imageUrl = await createReplicateImage(
      prompt,
      negativePrompt,
      dimensions.width,
      dimensions.height
    );

    return {
      imageUrl,
      prompt: request.prompt,
    };
  } catch (error) {
    // Provider error bodies can echo request inputs, so only log the bounded
    // error class and never the raw response, prompt, or authorization token.
    logAiProviderFailure('ai-image-generation', error);
    return {
      imageUrl: '',
      prompt: request.prompt,
      error: '이미지 생성에 실패했습니다.',
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
  style: AIImageRequest['style'] = 'anime'
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

  const prompt = `${styleHint}. Character appearance: ${appearance}. Upper body portrait, facing camera, detailed face, clean background`;

  return {
    prompt,
    negativePrompt:
      'text, watermark, signature, blurry, low quality, deformed face, multiple faces, bad anatomy',
    style,
    aspectRatio: '1:1',
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
