import { isGeminiAiEnabled } from '@novelverse/db';

type GeminiPolicyEnvironment = {
  GOOGLE_GEMINI_API_KEY?: string;
};

type ReplicatePolicyEnvironment = {
  REPLICATE_API_TOKEN?: string;
};

type GeminiEnabledReader = () => Promise<boolean>;

export async function getGeminiApiKey(
  environment: GeminiPolicyEnvironment = {
    GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
  },
  readEnabled: GeminiEnabledReader = isGeminiAiEnabled,
) {
  if (!(await readEnabled())) {
    throw new Error('GEMINI_PROVIDER_DISABLED');
  }

  const apiKey = environment.GOOGLE_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
  }
  return apiKey;
}

export function geminiPolicyHealth(
  enabled: boolean,
  environment: GeminiPolicyEnvironment = {
    GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
  },
): { status: 'up' | 'down'; detail: string } {
  if (!enabled) {
    return { status: 'up', detail: 'disabled by operations' };
  }
  if (!environment.GOOGLE_GEMINI_API_KEY?.trim()) {
    return { status: 'down', detail: 'GOOGLE_GEMINI_API_KEY is not configured' };
  }
  return { status: 'up', detail: 'enabled' };
}

export function replicatePolicyHealth(
  environment: ReplicatePolicyEnvironment = {
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
  },
): { status: 'up' | 'down'; detail: string } {
  if (!environment.REPLICATE_API_TOKEN?.trim()) {
    return { status: 'down', detail: 'REPLICATE_API_TOKEN is not configured' };
  }
  return { status: 'up', detail: 'configured' };
}
