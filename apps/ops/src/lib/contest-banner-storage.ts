import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import sharp from 'sharp';

export const MAX_CONTEST_BANNER_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_CONTEST_BANNER_REQUEST_BYTES = MAX_CONTEST_BANNER_FILE_BYTES + 256 * 1024;
export const CONTEST_BANNER_WIDTH = 1600;
export const CONTEST_BANNER_HEIGHT = 900;

const MAX_INPUT_DIMENSION = 8192;
const MAX_INPUT_PIXELS = 40_000_000;
const FORMAT_BY_MIME = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

type UploadFile = Pick<File, 'arrayBuffer' | 'size' | 'type'>;

export class ContestBannerUploadError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ContestBannerUploadError';
    this.status = status;
  }
}

export function isAllowedContestBannerMime(mime: string) {
  return FORMAT_BY_MIME.has(mime);
}

export function contestBannerAssetUrlForBytes(bytes: Uint8Array) {
  const digest = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 24);
  return `/assets/contest-banners/${digest}.webp`;
}

function findWorkspaceRoot() {
  const candidates = [
    process.cwd(),
    nodePath.resolve(process.cwd(), '..', '..'),
  ];

  const root = candidates.find((candidate) =>
    existsSync(nodePath.join(candidate, 'package.json')) &&
    existsSync(nodePath.join(candidate, 'apps', 'web', 'public'))
  );
  if (!root) {
    throw new ContestBannerUploadError(500, 'Web 공개 자산 경로를 찾을 수 없습니다.');
  }
  return root;
}

function contestBannerOutputDirectory() {
  return nodePath.resolve(
    findWorkspaceRoot(),
    'apps',
    'web',
    'public',
    'assets',
    'contest-banners',
  );
}

export async function normalizeContestBannerImage(file: UploadFile) {
  if (file.size <= 0) {
    throw new ContestBannerUploadError(400, '비어 있는 이미지 파일은 업로드할 수 없습니다.');
  }
  if (file.size > MAX_CONTEST_BANNER_FILE_BYTES) {
    throw new ContestBannerUploadError(413, '배너 이미지는 4MB 이하여야 합니다.');
  }

  const expectedFormat = FORMAT_BY_MIME.get(file.type);
  if (!expectedFormat) {
    throw new ContestBannerUploadError(400, 'JPEG, PNG, WEBP 이미지만 업로드할 수 있습니다.');
  }

  const input = Buffer.from(await file.arrayBuffer());
  try {
    const metadata = await sharp(input, {
      animated: false,
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();

    if (metadata.format !== expectedFormat) {
      throw new ContestBannerUploadError(400, '파일 확장자와 실제 이미지 형식이 일치하지 않습니다.');
    }
    if (
      !metadata.width || !metadata.height ||
      metadata.width > MAX_INPUT_DIMENSION || metadata.height > MAX_INPUT_DIMENSION ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS
    ) {
      throw new ContestBannerUploadError(400, '이미지 해상도가 허용 범위를 벗어났습니다.');
    }

    const bytes = await sharp(input, {
      animated: false,
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize(CONTEST_BANNER_WIDTH, CONTEST_BANNER_HEIGHT, {
        fit: 'cover',
        position: 'attention',
      })
      .webp({ quality: 88, effort: 4 })
      .toBuffer();

    return {
      bytes,
      originalWidth: metadata.width,
      originalHeight: metadata.height,
    };
  } catch (error) {
    if (error instanceof ContestBannerUploadError) throw error;
    throw new ContestBannerUploadError(400, '손상됐거나 지원하지 않는 이미지 파일입니다.');
  }
}

export async function storeContestBanner(file: UploadFile) {
  const normalized = await normalizeContestBannerImage(file);
  const url = contestBannerAssetUrlForBytes(normalized.bytes);
  const outputDirectory = contestBannerOutputDirectory();
  const filename = nodePath.basename(url);
  const targetPath = nodePath.resolve(outputDirectory, filename);

  if (!targetPath.startsWith(outputDirectory + nodePath.sep)) {
    throw new ContestBannerUploadError(500, '안전한 배너 저장 경로를 만들지 못했습니다.');
  }

  await mkdir(outputDirectory, { recursive: true });
  try {
    await writeFile(targetPath, normalized.bytes, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }

  return {
    url,
    width: CONTEST_BANNER_WIDTH,
    height: CONTEST_BANNER_HEIGHT,
    originalWidth: normalized.originalWidth,
    originalHeight: normalized.originalHeight,
  };
}

export async function readStoredContestBanner(filename: string) {
  if (!/^[a-f0-9]{24}\.webp$/.test(filename)) return null;

  const outputDirectory = contestBannerOutputDirectory();
  const targetPath = nodePath.resolve(outputDirectory, filename);
  if (!targetPath.startsWith(outputDirectory + nodePath.sep)) return null;

  try {
    const fileStat = await stat(targetPath);
    if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > MAX_CONTEST_BANNER_FILE_BYTES) {
      return null;
    }
    return {
      bytes: await readFile(targetPath),
      size: fileStat.size,
      lastModified: fileStat.mtime.toUTCString(),
    };
  } catch {
    return null;
  }
}
