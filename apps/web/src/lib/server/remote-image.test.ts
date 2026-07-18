import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare/cloudflare-context', () => ({
  getCloudflareContext: mocks.getCloudflareContext,
}));

import {
  isAllowedRemoteImageHostname,
  isPublicIpAddress,
  normalizeUploadedImage,
  RemoteImageError,
} from './remote-image';
import sharp from 'sharp';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('remote image network policy', () => {
  it('allows only exact hosts and proper wildcard subdomains', () => {
    const rules = ['images.example.com', '*.cdn.example.com'];

    expect(isAllowedRemoteImageHostname('images.example.com', rules)).toBe(true);
    expect(isAllowedRemoteImageHostname('a.cdn.example.com', rules)).toBe(true);
    expect(isAllowedRemoteImageHostname('cdn.example.com', rules)).toBe(false);
    expect(isAllowedRemoteImageHostname('images.example.com.attacker.test', rules)).toBe(false);
  });

  it('rejects private and special IPv4 addresses', () => {
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('10.0.0.1')).toBe(false);
    expect(isPublicIpAddress('100.64.0.1')).toBe(false);
    expect(isPublicIpAddress('127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('169.254.169.254')).toBe(false);
    expect(isPublicIpAddress('172.16.0.1')).toBe(false);
    expect(isPublicIpAddress('192.168.0.1')).toBe(false);
  });

  it('allows global IPv6 while rejecting local and documentation ranges', () => {
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
    expect(isPublicIpAddress('::1')).toBe(false);
    expect(isPublicIpAddress('fe80::1')).toBe(false);
    expect(isPublicIpAddress('fc00::1')).toBe(false);
    expect(isPublicIpAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('2001:db8::1')).toBe(false);
  });

  it('업로드 이미지의 실제 형식을 확인하고 WebP로 정규화한다', async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#2f9d8f' },
    }).png().toBuffer();

    const result = await normalizeUploadedImage(png, 'image/png');
    expect(result.contentType).toBe('image/webp');
    expect(result.extension).toBe('webp');
    expect((await sharp(result.bytes).metadata()).format).toBe('webp');
  });

  it('MIME과 파일 시그니처가 다르면 업로드를 거부한다', async () => {
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#000000' },
    }).png().toBuffer();

    await expect(normalizeUploadedImage(png, 'image/jpeg')).rejects.toBeInstanceOf(RemoteImageError);
  });

  it('Workers에서는 한 isolate의 이미지 변환 동시 실행을 2건으로 제한한다', async () => {
    vi.stubEnv('CLOUDFLARE_WORKERS', 'true');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const webp = new Uint8Array(Buffer.from('RIFF0000WEBP', 'ascii'));
    const pendingReleases: Array<() => void> = [];
    let outputCalls = 0;
    let activeOutputs = 0;
    let maximumActiveOutputs = 0;

    const images = {
      info: vi.fn(async () => ({
        format: 'image/png',
        fileSize: png.byteLength,
        width: 1,
        height: 1,
      })),
      input: vi.fn(() => ({
        output: vi.fn(async () => {
          outputCalls += 1;
          activeOutputs += 1;
          maximumActiveOutputs = Math.max(maximumActiveOutputs, activeOutputs);
          await new Promise<void>((resolve) => pendingReleases.push(resolve));
          activeOutputs -= 1;
          return {
            response: () => new Response(webp, {
              headers: { 'content-type': 'image/webp' },
            }),
          };
        }),
      })),
    };
    mocks.getCloudflareContext.mockResolvedValue({ env: { IMAGES: images } });

    const tasks = [1, 2, 3].map(() => normalizeUploadedImage(png, 'image/png'));
    await vi.waitFor(() => expect(outputCalls).toBe(2));

    pendingReleases.shift()?.();
    await vi.waitFor(() => expect(outputCalls).toBe(3));
    for (const release of pendingReleases.splice(0)) release();

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(3);
    expect(maximumActiveOutputs).toBe(2);
    expect(images.info).toHaveBeenCalledTimes(3);
  });
});
