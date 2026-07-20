/**
 * AI-powered scene analyzer using Google Gemini
 * Analyzes chapter content to find optimal illustration positions
 * and generates optimized English prompts for image generation
 */

import { parseHtmlToParagraphs, findManualMarkers } from './illustration-analyzer';
import type { IllustrationPosition, IllustrationCharacter } from '@/types/illustration';
import { logServerError } from '@novelverse/shared';
import { fetchGemini } from '@/lib/server/gemini-fetch';
import { getGeminiApiKey } from '@/lib/server/ai-provider-policy';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SCENE_ANALYSIS_PROMPT = `You are an expert at analyzing fiction to find the most visually impactful scenes for illustration.

TASK: Analyze the provided novel chapter and identify the best scenes for illustrations.

RULES:
1. Find scenes with strong VISUAL elements (action, dramatic moments, character reveals, scenic descriptions)
2. Return paragraph indices (0-based) where illustrations should be placed
3. Generate English image prompts optimized for AI art generation
4. Include character appearances in prompts if character info is provided
5. Ensure selected scenes are well-spaced throughout the chapter
6. Score each scene from 0.5 to 1.0 based on visual importance
7. Maximum illustrations: as specified in the request

PROMPT GUIDELINES:
- Use comma-separated descriptive tags
- Include: composition, lighting, mood, style hints
- Add quality tags: masterpiece, highly detailed, cinematic
- Keep each prompt under 200 words
- Focus on visual elements, not abstract concepts

RESPONSE FORMAT (JSON only):
{
  "scenes": [
    {
      "paragraphIndex": 0,
      "confidence": 0.95,
      "reason": "brief explanation",
      "optimizedPrompt": "English image generation prompt"
    }
  ]
}`;

interface AISceneResult {
  paragraphIndex: number;
  confidence: number;
  reason: string;
  optimizedPrompt: string;
}

interface AIAnalysisResponse {
  scenes: AISceneResult[];
}

/**
 * Build character context for AI analysis
 */
function buildCharacterContext(characters: IllustrationCharacter[]): string {
  if (!characters || characters.length === 0) return '';

  const descriptions = characters.map(c =>
    `- ${c.name}: ${c.appearance}`
  ).join('\n');

  return `\n\nCHARACTERS IN THIS STORY (include their appearances in prompts when they appear in scenes):
${descriptions}`;
}

/**
 * Analyze chapter content using Gemini AI to find optimal illustration positions
 */
export async function analyzeChapterWithAI(
  htmlContent: string,
  maxCount: number = 3,
  characters?: IllustrationCharacter[]
): Promise<{ positions: IllustrationPosition[]; totalParagraphs: number; usedAI: boolean }> {
  const apiKey = await getGeminiApiKey();

  const paragraphs = parseHtmlToParagraphs(htmlContent);

  if (paragraphs.length < 3) {
    return { positions: [], totalParagraphs: paragraphs.length, usedAI: false };
  }

  // First, find manual markers (these always take priority)
  const manualPositions = findManualMarkers(paragraphs);
  const remainingSlots = Math.max(0, maxCount - manualPositions.length);

  if (remainingSlots === 0) {
    return {
      positions: manualPositions,
      totalParagraphs: paragraphs.length,
      usedAI: false
    };
  }

  // Prepare content for AI analysis (numbered paragraphs for reference)
  const numberedContent = paragraphs
    .map((p, i) => `[${i}] ${p}`)
    .join('\n\n');

  // Truncate if too long (Gemini has token limits)
  const maxChars = 30000;
  const truncatedContent = numberedContent.length > maxChars
    ? numberedContent.slice(0, maxChars) + '\n\n[... content truncated ...]'
    : numberedContent;

  const characterContext = buildCharacterContext(characters || []);
  const existingIndices = manualPositions.map(p => p.paragraphIndex);

  const userMessage = `Analyze this chapter and find ${remainingSlots} best scenes for illustrations.
Total paragraphs: ${paragraphs.length}
Existing illustration positions to avoid: ${existingIndices.length > 0 ? existingIndices.join(', ') : 'none'}
${characterContext}

CHAPTER CONTENT:
${truncatedContent}

Return JSON only with ${remainingSlots} scenes.`;

  try {
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
                text: SCENE_ANALYSIS_PROMPT + '\n\n' + userMessage,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      logServerError('gemini.scene-analysis', new Error('Gemini request failed'), {
        status: response.status,
      });
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      throw new Error('No response from Gemini API');
    }

    // Parse AI response
    const aiResult: AIAnalysisResponse = JSON.parse(textContent);

    if (!aiResult.scenes || !Array.isArray(aiResult.scenes)) {
      throw new Error('Invalid AI response format');
    }

    // Convert AI results to IllustrationPosition format
    const aiPositions: IllustrationPosition[] = aiResult.scenes
      .filter(scene => {
        // Validate paragraph index
        if (scene.paragraphIndex < 0 || scene.paragraphIndex >= paragraphs.length) {
          return false;
        }
        // Check not conflicting with manual markers
        if (existingIndices.includes(scene.paragraphIndex)) {
          return false;
        }
        return true;
      })
      .slice(0, remainingSlots)
      .map(scene => {
        // Get context from surrounding paragraphs
        const contextStart = Math.max(0, scene.paragraphIndex - 2);
        const contextEnd = Math.min(paragraphs.length, scene.paragraphIndex + 3);
        const contextText = paragraphs.slice(contextStart, contextEnd).join(' ').slice(0, 500);

        return {
          paragraphIndex: scene.paragraphIndex,
          contextText,
          suggestedPrompt: scene.reason || contextText.slice(0, 200),
          optimizedPrompt: scene.optimizedPrompt,
          isManualMarker: false,
          confidence: Math.min(Math.max(scene.confidence || 0.7, 0.5), 1.0),
        };
      });

    // Combine manual and AI positions, sorted by paragraph index
    const allPositions = [...manualPositions, ...aiPositions];
    allPositions.sort((a, b) => a.paragraphIndex - b.paragraphIndex);

    return {
      positions: allPositions,
      totalParagraphs: paragraphs.length,
      usedAI: true,
    };
  } catch (error) {
    logServerError('gemini.scene-analysis', error);
    // Re-throw to let the caller handle fallback
    throw error;
  }
}

/**
 * Enhance a single prompt using Gemini AI
 */
export async function enhanceScenePrompt(
  contextText: string,
  characters?: IllustrationCharacter[]
): Promise<string> {
  const apiKey = await getGeminiApiKey();

  const characterContext = buildCharacterContext(characters || []);

  const prompt = `Convert this Korean scene description into an optimized English image generation prompt.

SCENE:
${contextText.slice(0, 500)}
${characterContext}

RULES:
- Output ONLY the English prompt, nothing else
- Use comma-separated descriptive tags
- Include: composition, lighting, mood, art style
- Add quality tags: masterpiece, highly detailed, cinematic
- Keep under 150 words
- Include character appearances if mentioned in scene`;

  try {
    const response = await fetchGemini(GEMINI_API_URL, apiKey, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 512,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const enhancedPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!enhancedPrompt) {
      throw new Error('No response from Gemini API');
    }

    return enhancedPrompt.trim();
  } catch (error) {
    logServerError('gemini.scene-prompt', error);
    // Return a basic English prompt as fallback
    return `Illustration of a dramatic scene, detailed, high quality, cinematic lighting, masterpiece`;
  }
}
