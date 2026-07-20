/**
 * Google Gemini API client for prompt enhancement
 */

import { logServerError } from '@novelverse/shared';
import { fetchGemini } from '@/lib/server/gemini-fetch';
import { getGeminiApiKey } from '@/lib/server/ai-provider-policy';

export interface EnhancePromptRequest {
  userPrompt: string;
  context: {
    type: 'cover' | 'illustration' | 'portrait';
    genre?: string;
    novelTitle?: string;
    characterName?: string;
  };
}

export interface EnhancePromptResponse {
  enhancedPrompt: string;
  negativePrompt?: string;
  suggestions?: string[];
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are an image prompt engineer. Transform user input into English image generation prompts.

Rules:
- Output ONLY in English
- Use comma-separated descriptive tags
- Add quality tags: masterpiece, highly detailed, 8k
- Keep prompts concise (under 200 words)

Return JSON:
{"enhancedPrompt": "english prompt here", "negativePrompt": "blurry, low quality, watermark"}`;

function getContextPrompt(context: EnhancePromptRequest['context']): string {
  const parts: string[] = [];

  if (context.type === 'cover') {
    parts.push('This prompt is for a novel COVER IMAGE.');
    parts.push('Focus on: dramatic composition, eye-catching visuals, book cover aesthetics.');
  } else if (context.type === 'illustration') {
    parts.push('This prompt is for a chapter ILLUSTRATION.');
    parts.push('Focus on: scene depiction, narrative mood, artistic quality.');
  } else if (context.type === 'portrait') {
    parts.push('This prompt is for a CHARACTER PORTRAIT.');
    parts.push('Focus on: facial features, expression, character personality, upper body composition.');
    if (context.characterName) {
      parts.push(`Character name: ${context.characterName}`);
    }
  }

  if (context.genre) {
    parts.push(`Genre: ${context.genre}`);
  }

  if (context.novelTitle) {
    parts.push(`Novel title: ${context.novelTitle}`);
  }

  return parts.join('\n');
}

export async function enhancePromptWithGemini(
  request: EnhancePromptRequest
): Promise<EnhancePromptResponse> {
  const apiKey = await getGeminiApiKey();

  const contextInfo = getContextPrompt(request.context);

  const userMessage = `Type: ${request.context.type}${request.context.genre ? `, Genre: ${request.context.genre}` : ''}

Input: "${request.userPrompt}"

Context: ${contextInfo}

Convert to English image prompt. JSON only.`;

  const response = await fetchGemini(GEMINI_API_URL, apiKey, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: SYSTEM_PROMPT + '\n\n' + userMessage,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    logServerError('gemini.prompt-enhancement', new Error('Gemini request failed'), {
      status: response.status,
    });

    if (response.status === 429) {
      throw new Error('API 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.');
    }

    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();

  // Extract the text content from Gemini's response
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('No response from Gemini API');
  }

  // Parse the JSON response
  try {
    const result = JSON.parse(textContent);
    return {
      enhancedPrompt: result.enhancedPrompt || result.enhanced_prompt || textContent,
      negativePrompt: result.negativePrompt || result.negative_prompt,
      suggestions: result.suggestions,
    };
  } catch {
    // If JSON parsing fails, use the text as the enhanced prompt
    return {
      enhancedPrompt: textContent.trim(),
    };
  }
}
