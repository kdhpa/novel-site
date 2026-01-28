// AI Image Generation helper using Stability AI

import { uploadBase64Image, BUCKETS } from './supabase';
import type { AIImageRequest, AIImageResponse } from '@/types';

const STABILITY_API_URL = 'https://api.stability.ai/v1/generation';
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

// Style presets for different image types
const STYLE_PRESETS: Record<string, string> = {
  anime: 'anime',
  realistic: 'photographic',
  fantasy: 'fantasy-art',
  watercolor: 'digital-art',
};

// Aspect ratio to dimensions mapping
const ASPECT_RATIOS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 768 },
  '9:16': { width: 768, height: 1344 },
  '4:3': { width: 1152, height: 896 },
};

export async function generateImage(
  request: AIImageRequest
): Promise<AIImageResponse & { error?: string }> {
  if (!STABILITY_API_KEY) {
    return {
      imageUrl: '',
      prompt: request.prompt,
      error: 'Stability AI API key is not configured',
    };
  }

  const stylePreset = STYLE_PRESETS[request.style || 'fantasy'] || 'fantasy-art';
  const dimensions = ASPECT_RATIOS[request.aspectRatio || '1:1'];

  try {
    const response = await fetch(
      `${STABILITY_API_URL}/stable-diffusion-xl-1024-v1-0/text-to-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${STABILITY_API_KEY}`,
        },
        body: JSON.stringify({
          text_prompts: [
            {
              text: request.prompt,
              weight: 1,
            },
            ...(request.negativePrompt
              ? [
                  {
                    text: request.negativePrompt,
                    weight: -1,
                  },
                ]
              : []),
          ],
          cfg_scale: 7,
          width: dimensions.width,
          height: dimensions.height,
          steps: 30,
          samples: 1,
          style_preset: stylePreset,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.artifacts || data.artifacts.length === 0) {
      throw new Error('No image generated');
    }

    const base64Image = data.artifacts[0].base64;

    return {
      imageUrl: `data:image/png;base64,${base64Image}`,
      prompt: request.prompt,
    };
  } catch (error) {
    console.error('AI Image generation error:', error);
    return {
      imageUrl: '',
      prompt: request.prompt,
      error: error instanceof Error ? error.message : 'Failed to generate image',
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
    return { url: null, error: result.error || 'Failed to generate image' };
  }

  // Extract base64 data from data URL
  const base64Data = result.imageUrl.replace(/^data:image\/\w+;base64,/, '');

  // Upload to Supabase storage
  const uploadResult = await uploadBase64Image(bucket, fileName, base64Data);

  return uploadResult;
}

// Generate cover image with optimized prompt
export async function generateNovelCover(
  title: string,
  genre: string,
  description?: string
): Promise<AIImageResponse & { error?: string }> {
  const genreStyles: Record<string, string> = {
    FANTASY: 'epic fantasy, magical, mystical atmosphere',
    ROMANCE: 'romantic, soft lighting, emotional',
    SF: 'sci-fi, futuristic, cyberpunk, space',
    MARTIAL_ARTS: 'martial arts, action, dynamic pose, asian aesthetic',
    MYSTERY: 'mysterious, dark, noir, suspenseful',
    HORROR: 'horror, dark, creepy, atmospheric',
    MODERN: 'modern, contemporary, realistic',
    OTHER: 'artistic, creative',
  };

  const styleHint = genreStyles[genre] || genreStyles.OTHER;

  const prompt = `Book cover art for "${title}". ${styleHint}. ${description ? `Story: ${description.slice(0, 200)}` : ''} High quality, detailed, professional book cover design.`;

  return generateImage({
    prompt,
    negativePrompt: 'text, watermark, signature, blurry, low quality',
    style: genre === 'ROMANCE' ? 'realistic' : genre === 'SF' ? 'realistic' : 'fantasy',
    aspectRatio: '4:3',
  });
}

// Generate chapter illustration
export async function generateChapterIllustration(
  sceneDescription: string,
  novelGenre: string,
  style: AIImageRequest['style'] = 'anime'
): Promise<AIImageResponse & { error?: string }> {
  const prompt = `Illustration for a ${novelGenre.toLowerCase()} novel scene: ${sceneDescription}. Detailed, high quality, dramatic lighting.`;

  return generateImage({
    prompt,
    negativePrompt: 'text, watermark, signature, blurry, low quality, deformed',
    style,
    aspectRatio: '16:9',
  });
}

// Default export
export default {
  generateImage,
  generateAndUploadImage,
  generateNovelCover,
  generateChapterIllustration,
};
