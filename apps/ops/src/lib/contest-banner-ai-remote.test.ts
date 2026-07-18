import { describe, expect, it } from 'vitest';
import {
  isAllowedContestBannerAiImageHost,
  isPublicContestBannerAiAddress,
} from './contest-banner-ai-remote';

describe('Ops contest banner AI remote image guard', () => {
  it('Replicate 결과 호스트와 그 하위 도메인만 허용한다', () => {
    expect(isAllowedContestBannerAiImageHost('replicate.delivery')).toBe(true);
    expect(isAllowedContestBannerAiImageHost('abc.replicate.delivery')).toBe(true);
    expect(isAllowedContestBannerAiImageHost('replicate.delivery.example.com')).toBe(false);
    expect(isAllowedContestBannerAiImageHost('localhost')).toBe(false);
  });

  it('공개 IP만 허용한다', () => {
    expect(isPublicContestBannerAiAddress('8.8.8.8')).toBe(true);
    expect(isPublicContestBannerAiAddress('2606:4700:4700::1111')).toBe(true);
    expect(isPublicContestBannerAiAddress('127.0.0.1')).toBe(false);
    expect(isPublicContestBannerAiAddress('10.0.0.1')).toBe(false);
    expect(isPublicContestBannerAiAddress('169.254.169.254')).toBe(false);
    expect(isPublicContestBannerAiAddress('::1')).toBe(false);
    expect(isPublicContestBannerAiAddress('2001:db8::1')).toBe(false);
  });
});
