import { describe, expect, it } from 'vitest';
import { geminiPolicyHealth, getGeminiApiKey } from './ai-provider-policy';

describe('Gemini runtime policy', () => {
  it('Ops 설정이 활성화되고 키가 있으면 환경과 관계없이 허용한다', async () => {
    await expect(getGeminiApiKey({
      GOOGLE_GEMINI_API_KEY: 'local-key',
    }, async () => true)).resolves.toBe('local-key');
  });

  it('Ops 설정이 비활성화되면 키가 있어도 호출을 차단한다', async () => {
    await expect(getGeminiApiKey({
      GOOGLE_GEMINI_API_KEY: 'production-key',
    }, async () => false)).rejects.toThrow('GEMINI_PROVIDER_DISABLED');
    expect(geminiPolicyHealth(false, {
      GOOGLE_GEMINI_API_KEY: 'production-key',
    })).toEqual({ status: 'up', detail: 'disabled by operations' });
  });

  it('활성 상태에서 API 키가 없으면 구성 오류로 보고한다', async () => {
    await expect(getGeminiApiKey({}, async () => true)).rejects.toThrow(
      'GOOGLE_GEMINI_API_KEY',
    );
    expect(geminiPolicyHealth(true, {})).toEqual({
      status: 'down',
      detail: 'GOOGLE_GEMINI_API_KEY is not configured',
    });
  });
});
