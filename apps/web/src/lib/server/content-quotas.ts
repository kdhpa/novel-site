import { ApiError } from './api';

function configuredLimit(name: string, fallback: number, ceiling: number) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? Math.min(ceiling, Math.max(1, value)) : fallback;
}

export const contentQuotas = {
  novelsPerUser: () => configuredLimit('MAX_NOVELS_PER_USER', 50, 1_000),
  chaptersPerNovel: () => configuredLimit('MAX_CHAPTERS_PER_NOVEL', 1_000, 10_000),
  charactersPerNovel: () => configuredLimit('MAX_CHARACTERS_PER_NOVEL', 100, 1_000),
};

export function assertBelowQuota(current: number, limit: number, label: string) {
  if (current >= limit) {
    throw new ApiError(409, `${label} 최대 ${limit.toLocaleString('ko-KR')}개까지 만들 수 있습니다.`);
  }
}
