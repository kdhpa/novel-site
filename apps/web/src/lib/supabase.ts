// Supabase client for file storage

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { link, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServerKey = supabaseSecretKey || supabaseServiceRoleKey;
const supabaseS3Endpoint = process.env.SUPABASE_S3_ENDPOINT;
const supabaseS3Region = process.env.SUPABASE_S3_REGION;
const supabaseS3AccessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID;
const supabaseS3SecretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;
const isProduction = process.env.NODE_ENV === 'production';
const supabaseKey = supabaseServerKey || (!isProduction ? supabaseAnonKey : undefined);
export const hasPersistentLocalStorage = Boolean(
  process.env.LOCAL_UPLOAD_ROOT && !process.env.VERCEL
);
const allowsEphemeralStorage = process.env.ALLOW_EPHEMERAL_STORAGE === 'true';
const requiresPersistentStorage =
  process.env.REQUIRE_PERSISTENT_STORAGE === 'true' ||
  (isProduction && !allowsEphemeralStorage);
const usesPersistentLocalOnly = isProduction && !supabaseServerKey && hasPersistentLocalStorage;

let supabaseInstance: SupabaseClient | null = null;
let supabaseS3Instance: S3Client | null = null;
let supabaseS3PublicBaseUrl: string | null = null;

const s3ConfigurationValues = [
  supabaseS3Endpoint,
  supabaseS3Region,
  supabaseS3AccessKeyId,
  supabaseS3SecretAccessKey,
];
const configuredS3ValueCount = s3ConfigurationValues.filter(
  (value) => Boolean(value?.trim())
).length;
const hasAnySupabaseS3Configuration = configuredS3ValueCount > 0;
const hasCompleteSupabaseS3Configuration =
  configuredS3ValueCount === s3ConfigurationValues.length;

function parseStorageUrl(value: string | undefined, requireS3Path = false) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['http:', 'https:'].includes(url.protocol) ||
      (isProduction && Boolean(url.port)) ||
      (isProduction && url.protocol !== 'https:') ||
      (requireS3Path && normalizedPath !== '/storage/v1/s3')
    ) {
      return null;
    }
    url.pathname = normalizedPath;
    return url;
  } catch {
    return null;
  }
}

function resolveSupabaseS3PublicBaseUrl(endpoint: URL) {
  const projectUrl = parseStorageUrl(supabaseUrl);
  if (!projectUrl) return null;

  const endpointHostname = endpoint.hostname.replace(/\.$/, '');
  const projectHostname = projectUrl.hostname.replace(/\.$/, '');
  const endpointMatch = endpointHostname.match(
    /^([a-z0-9-]+)\.storage\.supabase\.co$/i
  );
  const projectMatch = projectHostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (endpointMatch && projectMatch && endpointMatch[1] !== projectMatch[1]) {
    return null;
  }
  return `${projectUrl.origin}/storage/v1/object/public`;
}

let supabaseConfigurationError: string | null = null;
const requestsSupabaseClient = Boolean(
  supabaseKey || (supabaseUrl && !hasAnySupabaseS3Configuration)
);
if (!usesPersistentLocalOnly && requestsSupabaseClient) {
  if (isProduction && supabaseUrl && !supabaseServerKey) {
    supabaseConfigurationError =
      'SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required for server-side uploads in production.';
  } else if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
    supabaseConfigurationError = 'Supabase storage configuration is incomplete.';
  } else if (supabaseUrl && supabaseKey) {
    try {
      supabaseInstance = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    } catch {
      supabaseConfigurationError = 'Supabase storage configuration is invalid.';
    }
  }
}

let supabaseS3ConfigurationError: string | null = null;
if (hasAnySupabaseS3Configuration) {
  if (!hasCompleteSupabaseS3Configuration) {
    supabaseS3ConfigurationError = 'Supabase S3 storage configuration is incomplete.';
  } else {
    const endpoint = parseStorageUrl(supabaseS3Endpoint, true);
    if (!endpoint) {
      supabaseS3ConfigurationError = 'Supabase S3 endpoint is invalid.';
    } else {
      try {
        supabaseS3PublicBaseUrl = resolveSupabaseS3PublicBaseUrl(endpoint);
        if (!supabaseS3PublicBaseUrl) {
          throw new Error('Supabase S3 public URL is invalid.');
        }
        supabaseS3Instance = new S3Client({
          endpoint: endpoint.toString(),
          region: supabaseS3Region!.trim(),
          forcePathStyle: true,
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
          credentials: {
            accessKeyId: supabaseS3AccessKeyId!.trim(),
            secretAccessKey: supabaseS3SecretAccessKey!.trim(),
          },
        });
      } catch {
        supabaseS3Instance = null;
        supabaseS3PublicBaseUrl = null;
        supabaseS3ConfigurationError = 'Supabase S3 storage configuration is invalid.';
      }
    }
  }
}

export const supabase = supabaseInstance;
export const supabaseS3 = supabaseS3Instance;
export const hasSupabaseConfig = Boolean(supabase);
export const hasSupabaseS3Config = Boolean(supabaseS3 && supabaseS3PublicBaseUrl);
export const hasDurableImageStorage =
  hasSupabaseS3Config || hasSupabaseConfig || hasPersistentLocalStorage;
export const imageStorageConfigurationError = hasDurableImageStorage
  ? null
  : supabaseS3ConfigurationError ||
    supabaseConfigurationError ||
    (requiresPersistentStorage ? 'Persistent image storage is not configured.' : null);
const canUseLocalFallback =
  !imageStorageConfigurationError &&
  (!requiresPersistentStorage || hasPersistentLocalStorage);

if (!hasDurableImageStorage && !imageStorageConfigurationError) {
  const globalState = globalThis as typeof globalThis & { __novelverseStorageWarningShown?: boolean };
  if (process.env.NODE_ENV !== 'production' && !globalState.__novelverseStorageWarningShown) {
    console.warn('Supabase is not configured; image uploads will use the development-only local filesystem.');
    globalState.__novelverseStorageWarningShown = true;
  }
}

// Storage bucket names
export const BUCKETS = {
  COVERS: 'novel-covers',
  ILLUSTRATIONS: 'chapter-illustrations',
  PROFILES: 'user-profiles',
  PORTRAITS: 'character-portraits',
} as const;

export type StorageProvider = 'supabase' | 'supabase-s3' | 'local';

function storageUnavailableResult() {
  return {
    url: null,
    error: '영구 이미지 저장소가 설정되지 않았습니다.',
    storageProvider: 'supabase' as const,
  };
}

function isStorageConflict(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  const status = Number(candidate.status);
  const statusCode = String(candidate.statusCode || '');
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return status === 409 || statusCode === '409' || /duplicate|already exists/i.test(message);
}

function normalizeUploadPath(uploadPath: string): string {
  return uploadPath
    .split(/[\\/]+/)
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
}

function getSupabaseS3PublicUrl(bucketName: string, uploadPath: string) {
  if (!supabaseS3PublicBaseUrl) return null;
  const safePath = normalizeUploadPath(uploadPath);
  if (!safePath) return null;
  const encodedPath = safePath.split('/').map(encodeURIComponent).join('/');
  return `${supabaseS3PublicBaseUrl}/${encodeURIComponent(bucketName)}/${encodedPath}`;
}

function isS3NotFound(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const status = Number(candidate.$metadata?.httpStatusCode);
  const code = String(candidate.name || candidate.Code || '');
  return status === 404 || code === 'NotFound' || code === 'NoSuchKey';
}

async function uploadSupabaseS3File(
  bucketName: string,
  uploadPath: string,
  file: File | Blob,
  contentType: string | undefined,
  cacheControl: string
): Promise<{ url: string | null; error: string | null; storageProvider: StorageProvider }> {
  if (!supabaseS3) return storageUnavailableResult();
  const safePath = normalizeUploadPath(uploadPath);
  const publicUrl = getSupabaseS3PublicUrl(bucketName, safePath);
  if (!safePath || !publicUrl) {
    return {
      url: null,
      error: '올바르지 않은 업로드 경로입니다.',
      storageProvider: 'supabase-s3',
    };
  }

  try {
    const body = Buffer.from(await file.arrayBuffer());
    await supabaseS3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: safePath,
      Body: body,
      ContentLength: body.byteLength,
      ...(contentType && { ContentType: contentType }),
      CacheControl: cacheControl,
    }));
    return { url: publicUrl, error: null, storageProvider: 'supabase-s3' };
  } catch {
    return {
      url: null,
      error: '파일을 영구 저장소에 올리지 못했습니다.',
      storageProvider: 'supabase-s3',
    };
  }
}

async function findSupabaseS3File(bucketName: string, uploadPath: string) {
  if (!supabaseS3) return null;
  const safePath = normalizeUploadPath(uploadPath);
  const publicUrl = getSupabaseS3PublicUrl(bucketName, safePath);
  if (!safePath || !publicUrl) return null;

  try {
    await supabaseS3.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: safePath,
    }));
    return { url: publicUrl, storageProvider: 'supabase-s3' as const };
  } catch (error) {
    if (isS3NotFound(error)) return null;
    throw error;
  }
}

function getLocalUploadRoot() {
  return process.env.LOCAL_UPLOAD_ROOT || nodePath.join(
    /* turbopackIgnore: true */ process.cwd(),
    'public',
    'uploads'
  );
}

function resolveLocalUploadPath(bucketName: string, uploadPath: string) {
  const safeUploadPath = normalizeUploadPath(uploadPath);
  if (!safeUploadPath) return null;

  const root = nodePath.resolve(/* turbopackIgnore: true */ getLocalUploadRoot());
  const targetPath = nodePath.resolve(
    /* turbopackIgnore: true */ root,
    bucketName,
    ...safeUploadPath.split('/')
  );
  if (!targetPath.startsWith(root + nodePath.sep)) return null;

  return { safeUploadPath, targetPath };
}

const localImageContentTypes: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export async function readLocalStoredImage(pathSegments: string[]) {
  if (
    pathSegments.length < 2 ||
    pathSegments.some(
      (segment) => !segment || segment === '.' || segment === '..' || /[\\/]/.test(segment)
    )
  ) {
    return null;
  }

  const [bucketName, ...uploadSegments] = pathSegments;
  if (!(Object.values(BUCKETS) as string[]).includes(bucketName)) return null;

  const localPath = resolveLocalUploadPath(bucketName, uploadSegments.join('/'));
  if (!localPath) return null;
  const extension = nodePath.extname(localPath.targetPath).toLowerCase();
  const contentType = localImageContentTypes[extension];
  if (!contentType) return null;

  try {
    const fileStat = await stat(/* turbopackIgnore: true */ localPath.targetPath);
    if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > 10 * 1024 * 1024) return null;
    const bytes = await readFile(/* turbopackIgnore: true */ localPath.targetPath);
    return {
      bytes,
      contentType,
      size: fileStat.size,
      lastModified: fileStat.mtime.toUTCString(),
    };
  } catch {
    return null;
  }
}

async function uploadLocalFile(
  bucketName: string,
  uploadPath: string,
  file: File | Blob
): Promise<{ url: string | null; error: string | null; storageProvider: StorageProvider }> {
  try {
    const safeUploadPath = normalizeUploadPath(uploadPath);
    if (!safeUploadPath) {
      return { url: null, error: '올바르지 않은 업로드 경로입니다.', storageProvider: 'local' };
    }

    const root = nodePath.resolve(/* turbopackIgnore: true */ getLocalUploadRoot());
    const targetPath = nodePath.resolve(
      /* turbopackIgnore: true */ root,
      bucketName,
      ...safeUploadPath.split('/')
    );

    if (!targetPath.startsWith(root + nodePath.sep)) {
      return { url: null, error: '올바르지 않은 업로드 경로입니다.', storageProvider: 'local' };
    }

    await mkdir(/* turbopackIgnore: true */ nodePath.dirname(targetPath), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(/* turbopackIgnore: true */ targetPath, buffer);

    return {
      url: `/uploads/${bucketName}/${safeUploadPath}`,
      error: null,
      storageProvider: 'local',
    };
  } catch {
    return { url: null, error: '파일을 로컬 저장소에 올리지 못했습니다.', storageProvider: 'local' };
  }
}

// Helper function to upload a file
export async function uploadFile(
  bucket: keyof typeof BUCKETS,
  path: string,
  file: File | Blob,
  contentType?: string
): Promise<{ url: string | null; error: string | null; storageProvider?: StorageProvider }> {
  const bucketName = BUCKETS[bucket];

  if (supabaseS3) {
    const s3Result = await uploadSupabaseS3File(
      bucketName,
      path,
      file,
      contentType,
      'max-age=3600'
    );
    if (!s3Result.error || (!supabase && !canUseLocalFallback)) return s3Result;
  }

  if (!supabase) {
    if (!canUseLocalFallback) return storageUnavailableResult();
    return uploadLocalFile(bucketName, path, file);
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(path, file, {
        ...(contentType && { contentType }),
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      if (!canUseLocalFallback) {
        return { url: null, error: '파일을 영구 저장소에 올리지 못했습니다.', storageProvider: 'supabase' };
      }
      const fallback = await uploadLocalFile(bucketName, path, file);
      if (fallback.url) return fallback;
      return { url: null, error: '파일을 저장소에 올리지 못했습니다.', storageProvider: 'supabase' };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    return { url: urlData.publicUrl, error: null, storageProvider: 'supabase' };
  } catch {
    if (!canUseLocalFallback) {
      return { url: null, error: '파일을 영구 저장소에 올리지 못했습니다.', storageProvider: 'supabase' };
    }
    const fallback = await uploadLocalFile(bucketName, path, file);
    if (fallback.url) return fallback;
    return { url: null, error: '파일을 저장소에 올리지 못했습니다.', storageProvider: 'supabase' };
  }
}

export async function findStoredFile(
  bucket: keyof typeof BUCKETS,
  path: string
): Promise<{ url: string; storageProvider: StorageProvider } | null> {
  const bucketName = BUCKETS[bucket];
  const safePath = normalizeUploadPath(path);
  if (!safePath) return null;
  if (!supabaseS3 && !supabase && !canUseLocalFallback) return null;

  if (supabaseS3) {
    try {
      const stored = await findSupabaseS3File(bucketName, safePath);
      if (stored) return stored;
    } catch {
      // The Supabase JS or local fallback may still contain the object.
    }
  }

  if (supabase) {
    try {
      const segments = safePath.split('/');
      const fileName = segments.pop();
      const folder = segments.join('/');
      if (fileName) {
        const { data, error } = await supabase.storage
          .from(bucketName)
          .list(folder, { limit: 100, search: fileName });

        if (!error && data?.some((entry) => entry.name === fileName)) {
          const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(safePath);
          return { url: urlData.publicUrl, storageProvider: 'supabase' };
        }
      }
    } catch {
      // A local fallback may still contain the deterministic object.
    }
  }

  if (!canUseLocalFallback) return null;
  const localPath = resolveLocalUploadPath(bucketName, safePath);
  if (!localPath) return null;

  try {
    const fileStat = await stat(/* turbopackIgnore: true */ localPath.targetPath);
    if (!fileStat.isFile() || fileStat.size <= 0) return null;
    return {
      url: `/uploads/${bucketName}/${localPath.safeUploadPath}`,
      storageProvider: 'local',
    };
  } catch {
    return null;
  }
}

async function uploadLocalFileOnce(
  bucketName: string,
  uploadPath: string,
  file: File | Blob
): Promise<{ url: string | null; error: string | null; storageProvider: StorageProvider }> {
  const localPath = resolveLocalUploadPath(bucketName, uploadPath);
  if (!localPath) {
    return { url: null, error: '올바르지 않은 업로드 경로입니다.', storageProvider: 'local' };
  }

  try {
    await mkdir(
      /* turbopackIgnore: true */ nodePath.dirname(localPath.targetPath),
      { recursive: true }
    );
    const buffer = Buffer.from(await file.arrayBuffer());
    const temporaryPath = `${localPath.targetPath}.${process.pid}.${crypto.randomUUID()}.tmp`;

    try {
      await writeFile(/* turbopackIgnore: true */ temporaryPath, buffer, { flag: 'wx' });
      await link(
        /* turbopackIgnore: true */ temporaryPath,
        /* turbopackIgnore: true */ localPath.targetPath
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        return { url: null, error: '파일을 로컬 저장소에 올리지 못했습니다.', storageProvider: 'local' };
      }
    } finally {
      await rm(/* turbopackIgnore: true */ temporaryPath, { force: true })
        .catch(() => undefined);
    }

    const storedFile = await stat(/* turbopackIgnore: true */ localPath.targetPath)
      .catch(() => null);
    if (!storedFile?.isFile() || storedFile.size <= 0) {
      return { url: null, error: '파일을 로컬 저장소에 올리지 못했습니다.', storageProvider: 'local' };
    }
  } catch {
    return { url: null, error: '파일을 로컬 저장소에 올리지 못했습니다.', storageProvider: 'local' };
  }

  return {
    url: `/uploads/${bucketName}/${localPath.safeUploadPath}`,
    error: null,
    storageProvider: 'local',
  };
}

// Store a deterministic object once. Existing objects win concurrent races.
export async function uploadFileOnce(
  bucket: keyof typeof BUCKETS,
  path: string,
  file: File | Blob,
  contentType?: string
): Promise<{ url: string | null; error: string | null; storageProvider: StorageProvider }> {
  const safePath = normalizeUploadPath(path);
  if (!safePath) {
    return { url: null, error: '올바르지 않은 업로드 경로입니다.', storageProvider: 'local' };
  }

  const existing = await findStoredFile(bucket, safePath);
  if (existing) return { ...existing, error: null };

  const bucketName = BUCKETS[bucket];
  if (supabaseS3) {
    // Supabase's S3 compatibility table does not guarantee conditional PutObject.
    // The key and bytes are deterministic, so concurrent finalizers may safely overwrite
    // the same object after the existence check.
    const s3Result = await uploadSupabaseS3File(
      bucketName,
      safePath,
      file,
      contentType,
      'public, max-age=31536000, immutable'
    );
    if (!s3Result.error || (!supabase && !canUseLocalFallback)) return s3Result;
  }

  if (!supabase) {
    if (!canUseLocalFallback) return storageUnavailableResult();
    return uploadLocalFileOnce(bucketName, safePath, file);
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(safePath, file, {
        ...(contentType && { contentType }),
        cacheControl: '31536000',
        upsert: false,
      });

    if (!error) {
      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(data.path);
      return { url: urlData.publicUrl, error: null, storageProvider: 'supabase' };
    }

    if (isStorageConflict(error)) {
      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(safePath);
      return { url: urlData.publicUrl, error: null, storageProvider: 'supabase' };
    }

    // Another instance may have won the create-if-absent race.
    for (const delayMs of [50, 100, 200, 400]) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const racedExisting = await findStoredFile(bucket, safePath);
      if (racedExisting) return { ...racedExisting, error: null };
    }

    if (!canUseLocalFallback) {
      return { url: null, error: '파일을 저장소에 올리지 못했습니다.', storageProvider: 'supabase' };
    }
    return uploadLocalFileOnce(bucketName, safePath, file);
  } catch {
    for (const delayMs of [50, 100, 200, 400]) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const racedExisting = await findStoredFile(bucket, safePath);
      if (racedExisting) return { ...racedExisting, error: null };
    }

    if (!canUseLocalFallback) {
      return { url: null, error: '파일을 저장소에 올리지 못했습니다.', storageProvider: 'supabase' };
    }
    return uploadLocalFileOnce(bucketName, safePath, file);
  }
}

// Helper function to delete a file
export async function deleteFile(
  bucket: keyof typeof BUCKETS,
  path: string
): Promise<{ success: boolean; error: string | null }> {
  const bucketName = BUCKETS[bucket];

  try {
    if (supabaseS3) {
      const safePath = normalizeUploadPath(path);
      if (!safePath) {
        return { success: false, error: '올바르지 않은 파일 경로입니다.' };
      }
      try {
        await supabaseS3.send(new DeleteObjectCommand({
          Bucket: bucketName,
          Key: safePath,
        }));
        return { success: true, error: null };
      } catch {
        if (!supabase && !canUseLocalFallback) {
          return { success: false, error: '파일을 삭제하지 못했습니다.' };
        }
      }
    }

    if (!supabase) {
      if (!canUseLocalFallback) {
        return { success: false, error: '영구 이미지 저장소가 설정되지 않았습니다.' };
      }
      const safePath = normalizeUploadPath(path);
      const root = nodePath.resolve(/* turbopackIgnore: true */ getLocalUploadRoot());
      const targetPath = nodePath.resolve(
        /* turbopackIgnore: true */ root,
        bucketName,
        ...safePath.split('/')
      );

      if (!targetPath.startsWith(root + nodePath.sep)) {
        return { success: false, error: '올바르지 않은 파일 경로입니다.' };
      }

      await rm(/* turbopackIgnore: true */ targetPath, { force: true });
      return { success: true, error: null };
    }

    const { error } = await supabase.storage
      .from(bucketName)
      .remove([path]);

    if (error) {
      return { success: false, error: '파일을 삭제하지 못했습니다.' };
    }

    return { success: true, error: null };
  } catch {
    return { success: false, error: '파일을 삭제하지 못했습니다.' };
  }
}

// Delete several files with a single storage request when Supabase is active.
export async function deleteFiles(
  bucket: keyof typeof BUCKETS,
  paths: string[]
): Promise<{ success: boolean; error: string | null }> {
  if (paths.length === 0) return { success: true, error: null };

  const bucketName = BUCKETS[bucket];

  if (supabaseS3) {
    const safePaths = paths.map(normalizeUploadPath);
    if (safePaths.some((path) => !path)) {
      return { success: false, error: '올바르지 않은 파일 경로입니다.' };
    }

    try {
      for (let index = 0; index < safePaths.length; index += 1_000) {
        const chunk = safePaths.slice(index, index + 1_000);
        const result = await supabaseS3.send(new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: chunk.map((path) => ({ Key: path })),
            Quiet: true,
          },
        }));
        if (result.Errors?.length) {
          return { success: false, error: '일부 파일을 삭제하지 못했습니다.' };
        }
      }
      return { success: true, error: null };
    } catch {
      if (!supabase && !canUseLocalFallback) {
        return { success: false, error: '파일을 삭제하지 못했습니다.' };
      }
    }
  }

  if (!supabase) {
    const results = await Promise.all(paths.map((path) => deleteFile(bucket, path)));
    const failed = results.find((result) => !result.success);
    return failed || { success: true, error: null };
  }

  try {
    const { error } = await supabase.storage.from(bucketName).remove(paths);
    return error
      ? { success: false, error: '파일을 삭제하지 못했습니다.' }
      : { success: true, error: null };
  } catch {
    return { success: false, error: '파일을 삭제하지 못했습니다.' };
  }
}

// Helper function to get file URL
export function getFileUrl(bucket: keyof typeof BUCKETS, path: string): string {
  const bucketName = BUCKETS[bucket];
  if (supabaseS3) {
    return getSupabaseS3PublicUrl(bucketName, path) || '';
  }
  if (!supabase) {
    return `/uploads/${bucketName}/${normalizeUploadPath(path)}`;
  }
  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
  return data.publicUrl;
}

// Upload base64 image (for AI generated images)
export async function uploadBase64Image(
  bucket: keyof typeof BUCKETS,
  path: string,
  base64Data: string,
  contentType: string = 'image/png'
): Promise<{ url: string | null; error: string | null; storageProvider?: StorageProvider }> {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: contentType });

    return uploadFile(bucket, path, blob, contentType);
  } catch {
    return { url: null, error: '이미지 데이터를 처리하지 못했습니다.' };
  }
}

export default supabase;
