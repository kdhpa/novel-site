import { describe, expect, it, vi } from 'vitest';
import { GEMINI_AI_PROVIDER, isGeminiAiEnabled } from './ai-provider-settings';

describe('AI provider settings', () => {
  it('저장된 설정이 없으면 Gemini를 기본 활성화한다', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    await expect(isGeminiAiEnabled({
      aiProviderSetting: { findUnique },
    } as never)).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { provider: GEMINI_AI_PROVIDER },
      select: { enabled: true },
    });
  });

  it('Ops에서 저장한 비활성 상태를 따른다', async () => {
    const findUnique = vi.fn().mockResolvedValue({ enabled: false });
    await expect(isGeminiAiEnabled({
      aiProviderSetting: { findUnique },
    } as never)).resolves.toBe(false);
  });
});
