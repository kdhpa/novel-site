// Supabase client for file storage

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { link, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isProduction = process.env.NODE_ENV === 'production';
const supabaseKey = supabaseServiceRoleKey || (!isProduction ? supabaseAnonKey : undefined);
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);
export const hasPersistentLocalStorage = Boolean(
  process.env.LOCAL_UPLOAD_ROOT && !process.env.VERCEL
);
const allowsEphemeralStorage = process.env.ALLOW_EPHEMERAL_STORAGE === 'true';
const requiresPersistentStorage =
  process.env.REQUIRE_PERSISTENT_STORAGE === 'true' ||
  (isProduction && !allowsEphemeralStorage);
const canUseLocalFallback = !requiresPersistentStorage || hasPersistentLocalStorage;
const usesPersistentLocalOnly = isProduction && !supabaseServiceRoleKey && hasPersistentLocalStorage;

let supabaseInstance: SupabaseClient | null = null;

if (isProduction && supabaseUrl && !supabaseServiceRoleKey && !usesPersistentLocalOnly) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is required for server-side uploads in production. Do not grant anonymous storage write access.'
  );
}

if (!usesPersistentLocalOnly && Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
  throw new Error(
    'Supabase storage configuration is incomplete. Set the URL and a service-role or anon key together.'
  );
}

if (supabaseUrl && supabaseKey) {
  supabaseInstance = createClient(supabaseUrl, supabaseKey);
} else if (requiresPersistentStorage && !hasPersistentLocalStorage) {
  throw new Error(
    'Persistent image storage is required in production. Configure Supabase or explicitly use a persistent LOCAL_UPLOAD_ROOT.'
  );
} else {
  const globalState = globalThis as typeof globalThis & { __novelverseStorageWarningShown?: boolean };
  if (process.env.NODE_ENV !== 'production' && !globalState.__novelverseStorageWarningShown) {
    console.warn('Supabase is not configured; image uploads will use the development-only local filesystem.');
    globalState.__novelverseStorageWarningShown = true;
  }
}

export const supabase = supabaseInstance;

// Storage bucket names
export const BUCKETS = {
  COVERS: 'novel-covers',
  ILLUSTRATIONS: 'chapter-illustrations',
  PROFILES: 'user-profiles',
  PORTRAITS: 'character-portraits',
} as const;

export type StorageProvider = 'supabase' | 'local';

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

  if (!supabase) {
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
  if (!supabase) {
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
    if (!supabase) {
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
