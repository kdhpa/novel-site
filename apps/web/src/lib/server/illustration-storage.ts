export type IllustrationStorageOwner = {
  novelId: string;
  chapterId: string;
};

const SRC_ATTRIBUTE_PATTERN = /\bsrc\s*=\s*(["'])(.*?)\1/gi;
const ILLUSTRATION_BUCKET_SEGMENT = '/chapter-illustrations/';

function decodeStoragePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * 저장소 URL에서 안전한 객체 경로만 추출한다. 쿼리/해시는 객체 키가 아니며,
 * 역슬래시·빈 세그먼트·상위 경로 이동은 로컬/Supabase 양쪽에서 모두 거부한다.
 */
export function extractIllustrationStoragePath(url: string): string | null {
  const markerIndex = url.indexOf(ILLUSTRATION_BUCKET_SEGMENT);
  if (markerIndex < 0) return null;

  const rawPath = url
    .slice(markerIndex + ILLUSTRATION_BUCKET_SEGMENT.length)
    .split(/[?#]/, 1)[0];
  const decodedPath = decodeStoragePath(rawPath);

  if (!decodedPath || decodedPath.includes('\\')) return null;

  const segments = decodedPath.split('/');
  if (
    segments.length < 2 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }

  return segments.join('/');
}

export function isOwnedIllustrationStoragePath(
  path: string,
  owner: IllustrationStorageOwner
) {
  const ownerFolder = path.split('/', 1)[0];
  return ownerFolder === owner.novelId || ownerFolder === owner.chapterId;
}

function extractOwnedPaths(html: string, owner: IllustrationStorageOwner) {
  const paths = new Set<string>();

  for (const match of html.matchAll(SRC_ATTRIBUTE_PATTERN)) {
    const path = extractIllustrationStoragePath(match[2]);
    if (path && isOwnedIllustrationStoragePath(path, owner)) {
      paths.add(path);
    }
  }

  return paths;
}

/**
 * 이전 본문에 실제로 포함되어 있었고 현재 작품/회차 폴더가 소유한 파일 중,
 * 새 본문에서 제거된 경로만 반환한다.
 */
export function findDeletedOwnedIllustrationPaths(
  previousHtml: string,
  nextHtml: string,
  owner: IllustrationStorageOwner
) {
  const previousPaths = extractOwnedPaths(previousHtml, owner);
  const nextPaths = extractOwnedPaths(nextHtml, owner);

  return [...previousPaths].filter((path) => !nextPaths.has(path));
}
