// Illustration types for auto-generation feature

// Status of an illustration
export type IllustrationStatus = 'pending' | 'generating' | 'complete' | 'failed';

// Position where an illustration should be inserted
export interface IllustrationPosition {
  paragraphIndex: number;
  contextText: string;
  suggestedPrompt: string;
  optimizedPrompt?: string; // AI-generated optimized English prompt for image generation
  isManualMarker: boolean;
  confidence: number; // 0-1, how confident the analyzer is about this position
}

// Illustration data from database
export interface ChapterIllustration {
  id: string;
  chapterId: string;
  position: number;
  imageUrl: string;
  prompt: string;
  contextText?: string | null;
  status: IllustrationStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Generated illustration ready for preview
export interface GeneratedIllustration {
  position: number;
  imageUrl: string;
  prompt: string;
  contextText: string;
  status: IllustrationStatus;
}

// Settings for illustration generation
export interface IllustrationSettings {
  maxCount: number; // Maximum illustrations per chapter (3-5)
  style: 'anime' | 'realistic' | 'fantasy' | 'watercolor';
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3';
  autoDetect: boolean; // Whether to use AI scene detection
}

// Default settings
export const DEFAULT_ILLUSTRATION_SETTINGS: IllustrationSettings = {
  maxCount: 3,
  style: 'anime',
  aspectRatio: '16:9',
  autoDetect: true,
};

// API request for analyzing chapter content
export interface AnalyzeChapterRequest {
  content: string;
  novelId: string;
  maxCount: number;
  autoDetect: boolean;
  useAI?: boolean; // Use Gemini AI for scene analysis (optional, default: false)
  adultConfirmed?: boolean; // Explicit confirmation required before sending content to Gemini
  characters?: IllustrationCharacter[]; // Characters for AI analysis
}

// API response for chapter analysis
export interface AnalyzeChapterResponse {
  positions: IllustrationPosition[];
  totalParagraphs: number;
  usedAI: boolean;
  analysisMode: 'gemini' | 'rules';
  fallbackUsed: boolean;
  notice: string;
}

// Character info for illustration generation
export interface IllustrationCharacter {
  id: string;
  name: string;
  appearance: string;
}

// API request for generating inline illustrations
export interface GenerateInlineIllustrationsRequest {
  positions: IllustrationPosition[];
  novelId: string;
  chapterId?: string;
  style: IllustrationSettings['style'];
  aspectRatio: IllustrationSettings['aspectRatio'];
  characters?: IllustrationCharacter[]; // Characters to include in illustrations
}

// API response for generated illustrations
export interface GenerateInlineIllustrationsResponse {
  illustrations: GeneratedIllustration[];
  failedPositions: number[];
}

// Manual markers that users can place in content
export const ILLUSTRATION_MARKERS = ['[삽화]', '[illustration]', '[img]', '[그림]', '[?쏀솕]', '[洹몃┝]'];
