import { OpsApiError } from '@/lib/api';
import { isAllowedStoredImageSource } from '@novelverse/shared';

const ALLOWED_SEASON_KEYS = new Set([
  'title',
  'slug',
  'description',
  'coverImage',
  'startsAt',
  'endsAt',
  'isActive',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSlug(value: unknown) {
  return asText(value)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseDate(value: unknown, label: string) {
  const date = new Date(asText(value));
  if (Number.isNaN(date.getTime())) throw new OpsApiError(400, `${label}을 확인해 주세요.`);
  return date;
}

export function parseSeasonPayload(value: unknown) {
  if (!isRecord(value) || Object.keys(value).some((key) => !ALLOWED_SEASON_KEYS.has(key))) {
    throw new OpsApiError(400, '시즌 입력값을 확인해 주세요.');
  }

  const body = value;
  const title = asText(body.title);
  const slug = normalizeSlug(body.slug);
  const description = asText(body.description) || null;
  const coverImage = asText(body.coverImage) || null;
  const startsAt = parseDate(body.startsAt, '접수 시작일');
  const endsAt = parseDate(body.endsAt, '접수 종료일');

  if (!title) throw new OpsApiError(400, '제목을 입력해 주세요.');
  if (title.length > 120) throw new OpsApiError(400, '제목은 120자 이하여야 합니다.');
  if (!slug) throw new OpsApiError(400, '영문/숫자/하이픈으로 된 슬러그를 입력해 주세요.');
  if (slug.length > 80) throw new OpsApiError(400, '슬러그는 80자 이하여야 합니다.');
  if (description && description.length > 5000) {
    throw new OpsApiError(400, '설명은 5,000자 이하여야 합니다.');
  }
  if (coverImage && coverImage.length > 2048) {
    throw new OpsApiError(400, '커버 이미지 URL은 2,048자 이하여야 합니다.');
  }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    throw new OpsApiError(400, '활성화 여부는 true 또는 false여야 합니다.');
  }
  if (coverImage) {
    if (!isAllowedStoredImageSource(coverImage)) {
      throw new OpsApiError(400, '커버 이미지는 설정된 영구 저장소 URL이어야 합니다.');
    }
  }
  if (startsAt >= endsAt) throw new OpsApiError(400, '접수 종료일은 시작일보다 뒤여야 합니다.');

  return {
    title,
    slug,
    description,
    coverImage,
    startsAt,
    endsAt,
    isActive: body.isActive !== false,
  };
}
