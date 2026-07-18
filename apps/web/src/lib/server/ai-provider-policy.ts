type GeminiPolicyEnvironment = {
  NODE_ENV?: string;
  GOOGLE_GEMINI_API_KEY?: string;
  GEMINI_PRODUCTION_POLICY_ACKNOWLEDGED?: string;
};

export function getGeminiApiKey(
  environment: GeminiPolicyEnvironment = process.env
) {
  const apiKey = environment.GOOGLE_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
  }

  if (
    environment.NODE_ENV === 'production' &&
    environment.GEMINI_PRODUCTION_POLICY_ACKNOWLEDGED !== 'true'
  ) {
    throw new Error(
      'GEMINI_PRODUCTION_POLICY_ACKNOWLEDGED must be true before Gemini is enabled in production'
    );
  }

  return apiKey;
}

export function geminiPolicyHealth(
  environment: GeminiPolicyEnvironment = process.env
): { status: 'up' | 'down'; detail: string } {
  if (!environment.GOOGLE_GEMINI_API_KEY?.trim()) {
    return { status: 'up', detail: 'disabled' };
  }
  if (
    environment.NODE_ENV === 'production' &&
    environment.GEMINI_PRODUCTION_POLICY_ACKNOWLEDGED !== 'true'
  ) {
    return { status: 'down', detail: 'production provider policy is not acknowledged' };
  }
  return { status: 'up', detail: 'enabled' };
}
