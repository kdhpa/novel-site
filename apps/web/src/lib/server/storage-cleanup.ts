import { BUCKETS, deleteFile } from '@/lib/supabase';
import prisma from '@/lib/prisma';
import { logServerError } from '@novelverse/shared';

type StorageBucket = keyof typeof BUCKETS;

function configuredOriginHost(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || process.env.NODE_ENV !== 'production'
      ? url.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function decodeSafePath(rawPath: string) {
  try {
    const path = decodeURIComponent(rawPath).replace(/^\/+/, '');
    const segments = path.split('/');
    if (
      segments.length < 2 ||
      path.includes('\\') ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      return null;
    }
    return segments.join('/');
  } catch {
    return null;
  }
}

export function extractManagedStoragePath(bucket: StorageBucket, source: string | null | undefined) {
  if (!source) return null;
  const bucketName = BUCKETS[bucket];
  const localPrefix = `/uploads/${bucketName}/`;

  if (source.startsWith(localPrefix)) {
    return decodeSafePath(source.slice(localPrefix.length).split(/[?#]/, 1)[0]);
  }

  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;

    const supabaseHost = configuredOriginHost(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const appHosts = new Set([
      configuredOriginHost(process.env.NEXT_PUBLIC_APP_URL),
      configuredOriginHost(process.env.NEXTAUTH_URL),
    ].filter((host): host is string => Boolean(host)));
    const supabasePrefix = `/storage/v1/object/public/${bucketName}/`;

    if (supabaseHost === url.hostname.toLowerCase() && url.pathname.startsWith(supabasePrefix)) {
      return decodeSafePath(url.pathname.slice(supabasePrefix.length));
    }
    if (appHosts.has(url.hostname.toLowerCase()) && url.pathname.startsWith(localPrefix)) {
      return decodeSafePath(url.pathname.slice(localPrefix.length));
    }
  } catch {
    return null;
  }

  return null;
}

async function referenceCount(bucket: StorageBucket, source: string) {
  const imageJobCount = await prisma.imageGenerationJob.count({ where: { imageUrl: source } });
  if (imageJobCount > 0) return imageJobCount;

  if (bucket === 'COVERS') {
    const [novels, seasons] = await Promise.all([
      prisma.novel.count({ where: { coverImage: source } }),
      prisma.season.count({ where: { coverImage: source } }),
    ]);
    return novels + seasons;
  }
  if (bucket === 'PORTRAITS') {
    return prisma.character.count({ where: { portraitUrl: source } });
  }
  if (bucket === 'PROFILES') {
    return prisma.user.count({ where: { image: source } });
  }

  return prisma.chapter.count({
    where: {
      OR: [
        { aiImage: source },
        { content: { contains: source } },
      ],
    },
  });
}

export async function cleanupStoredImageIfUnreferenced(input: {
  bucket: StorageBucket;
  source: string | null | undefined;
  ownerFolders?: string[];
  scope: string;
}) {
  const path = extractManagedStoragePath(input.bucket, input.source);
  if (!path || !input.source) return false;

  if (input.ownerFolders?.length) {
    const folder = path.split('/', 1)[0];
    if (!input.ownerFolders.includes(folder)) return false;
  }

  if (await referenceCount(input.bucket, input.source)) return false;

  const result = await deleteFile(input.bucket, path);
  if (!result.success) {
    logServerError(input.scope, result.error || new Error('Storage cleanup failed'), {
      bucket: input.bucket,
    });
  }
  return result.success;
}
