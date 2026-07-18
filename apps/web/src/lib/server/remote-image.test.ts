import { describe, expect, it } from 'vitest';
import {
  isAllowedRemoteImageHostname,
  isPublicIpAddress,
  normalizeUploadedImage,
  RemoteImageError,
} from './remote-image';
import sharp from 'sharp';

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
});
