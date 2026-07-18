import { describe, expect, it } from 'vitest';
import { geminiPolicyHealth, getGeminiApiKey } from './ai-provider-policy';

describe('Gemini production policy', () => {
  it('allows local development with a configured key', () => {
    expect(getGeminiApiKey({
      NODE_ENV: 'development',
      GOOGLE_GEMINI_API_KEY: 'local-key',
    })).toBe('local-key');
  });

  it('fails closed in production until the provider policy is acknowledged', () => {
    const environment = {
      NODE_ENV: 'production',
      GOOGLE_GEMINI_API_KEY: 'production-key',
    };
    expect(() => getGeminiApiKey(environment)).toThrow(
      'GEMINI_PRODUCTION_POLICY_ACKNOWLEDGED'
    );
    expect(geminiPolicyHealth(environment)).toEqual({
      status: 'down',
      detail: 'production provider policy is not acknowledged',
    });
  });

  it('allows an explicitly reviewed production configuration', () => {
    expect(getGeminiApiKey({
      NODE_ENV: 'production',
      GOOGLE_GEMINI_API_KEY: 'production-key',
      GEMINI_PRODUCTION_POLICY_ACKNOWLEDGED: 'true',
    })).toBe('production-key');
  });
});
