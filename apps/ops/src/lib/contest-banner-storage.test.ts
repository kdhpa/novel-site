import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  CONTEST_BANNER_HEIGHT,
  CONTEST_BANNER_WIDTH,
  ContestBannerUploadError,
  contestBannerAssetUrlForBytes,
  isAllowedContestBannerMime,
  normalizeContestBannerImage,
} from './contest-banner-storage';

function uploadFile(bytes: Buffer, type: string) {
  return {
    size: bytes.byteLength,
    type,
    arrayBuffer: async () => {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return copy.buffer;
    },
  };
}

describe('contest banner storage', () => {
  it('허용한 정적 이미지 형식만 받는다', () => {
    expect(isAllowedContestBannerMime('image/jpeg')).toBe(true);
    expect(isAllowedContestBannerMime('image/png')).toBe(true);
    expect(isAllowedContestBannerMime('image/webp')).toBe(true);
    expect(isAllowedContestBannerMime('image/gif')).toBe(false);
    expect(isAllowedContestBannerMime('image/svg+xml')).toBe(false);
  });

  it('같은 정규화 결과에 같은 안전한 공개 URL을 만든다', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const first = contestBannerAssetUrlForBytes(bytes);
    expect(first).toBe(contestBannerAssetUrlForBytes(bytes));
    expect(first).toMatch(/^\/assets\/contest-banners\/[a-f0-9]{24}\.webp$/);
  });

  it('정상 PNG를 1600x900 WebP 배너로 재인코딩한다', async () => {
    const source = await sharp({
      create: { width: 320, height: 240, channels: 3, background: '#312e81' },
    }).png().toBuffer();

    const normalized = await normalizeContestBannerImage(uploadFile(source, 'image/png'));
    const metadata = await sharp(normalized.bytes).metadata();

    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(CONTEST_BANNER_WIDTH);
    expect(metadata.height).toBe(CONTEST_BANNER_HEIGHT);
  });

  it('선언 MIME과 실제 파일 형식이 다르면 거절한다', async () => {
    const source = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#111827' },
    }).png().toBuffer();

    await expect(normalizeContestBannerImage(uploadFile(source, 'image/jpeg')))
      .rejects.toEqual(expect.objectContaining<Partial<ContestBannerUploadError>>({ status: 400 }));
  });
});
