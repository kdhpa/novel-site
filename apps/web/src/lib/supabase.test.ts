import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

const storageEnvironmentKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_S3_ENDPOINT',
  'SUPABASE_S3_REGION',
  'SUPABASE_S3_ACCESS_KEY_ID',
  'SUPABASE_S3_SECRET_ACCESS_KEY',
  'LOCAL_UPLOAD_ROOT',
  'VERCEL',
  'REQUIRE_PERSISTENT_STORAGE',
  'ALLOW_EPHEMERAL_STORAGE',
] as const;

function configureRequiredProductionStorage() {
  vi.stubEnv('NODE_ENV', 'production');
  for (const key of storageEnvironmentKeys) {
    vi.stubEnv(key, '');
  }
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('REQUIRE_PERSISTENT_STORAGE', 'true');
  vi.stubEnv('ALLOW_EPHEMERAL_STORAGE', 'false');
}

describe('image storage configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it(
    'does not throw during import and safely rejects writes when production storage is missing',
    async () => {
      configureRequiredProductionStorage();

      const storage = await import('./supabase');
      const image = new Blob(['image'], { type: 'image/webp' });

      expect(storage.supabase).toBeNull();
      expect(storage.hasSupabaseConfig).toBe(false);
      expect(storage.hasDurableImageStorage).toBe(false);
      expect(storage.imageStorageConfigurationError).toBe(
        'Persistent image storage is not configured.'
      );

      await expect(
        storage.uploadFile('COVERS', 'novel/result.webp', image)
      ).resolves.toMatchObject({
        url: null,
        storageProvider: 'supabase',
      });
      await expect(
        storage.uploadFileOnce('COVERS', 'novel/result.webp', image)
      ).resolves.toMatchObject({
        url: null,
        storageProvider: 'supabase',
      });
      await expect(storage.deleteFile('COVERS', 'novel/result.webp')).resolves.toMatchObject({
        success: false,
      });
      await expect(
        storage.deleteFiles('COVERS', ['novel/result.webp'])
      ).resolves.toMatchObject({
        success: false,
      });
    },
    15_000
  );

  it('does not throw during import or report an invalid Supabase URL as durable storage', async () => {
    configureRequiredProductionStorage();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'not-a-url');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-value');

    const storage = await import('./supabase');

    expect(storage.supabase).toBeNull();
    expect(storage.hasSupabaseConfig).toBe(false);
    expect(storage.hasDurableImageStorage).toBe(false);
    expect(storage.imageStorageConfigurationError).toBe(
      'Supabase storage configuration is invalid.'
    );
  });

  it('accepts the current server-only Supabase secret key', async () => {
    configureRequiredProductionStorage();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project-ref.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test-only-placeholder');

    const storage = await import('./supabase');

    expect(storage.supabase).not.toBeNull();
    expect(storage.hasSupabaseConfig).toBe(true);
    expect(storage.hasDurableImageStorage).toBe(true);
    expect(storage.imageStorageConfigurationError).toBeNull();
  });

  it('uses the Supabase S3 client for upload, lookup, delete, and public URLs', async () => {
    configureRequiredProductionStorage();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project-ref.supabase.co');
    vi.stubEnv(
      'SUPABASE_S3_ENDPOINT',
      'https://project-ref.storage.supabase.co/storage/v1/s3'
    );
    vi.stubEnv('SUPABASE_S3_REGION', 'ap-northeast-2');
    vi.stubEnv('SUPABASE_S3_ACCESS_KEY_ID', 'test-access-key-id');
    vi.stubEnv('SUPABASE_S3_SECRET_ACCESS_KEY', 'test-secret-access-key');

    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      $metadata: {},
    } as never);
    const storage = await import('./supabase');
    const image = new Blob(['image'], { type: 'image/webp' });
    const path = 'novel name/result image.webp';
    const publicUrl =
      'https://project-ref.supabase.co/storage/v1/object/public/novel-covers/' +
      'novel%20name/result%20image.webp';

    expect(storage.hasSupabaseS3Config).toBe(true);
    expect(storage.hasDurableImageStorage).toBe(true);
    expect(storage.imageStorageConfigurationError).toBeNull();
    expect(storage.supabaseS3?.config.forcePathStyle).toBe(true);
    await expect(
      storage.supabaseS3?.config.requestChecksumCalculation()
    ).resolves.toBe('WHEN_REQUIRED');
    await expect(
      storage.supabaseS3?.config.responseChecksumValidation()
    ).resolves.toBe('WHEN_REQUIRED');

    await expect(storage.uploadFile('COVERS', path, image, image.type)).resolves.toEqual({
      url: publicUrl,
      error: null,
      storageProvider: 'supabase-s3',
    });
    const put = send.mock.calls[0]?.[0];
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect((put as PutObjectCommand).input).toMatchObject({
      Bucket: 'novel-covers',
      Key: path,
      ContentLength: 5,
      ContentType: 'image/webp',
      CacheControl: 'max-age=3600',
    });
    expect(Buffer.isBuffer((put as PutObjectCommand).input.Body)).toBe(true);

    send.mockClear();
    await expect(storage.findStoredFile('COVERS', path)).resolves.toEqual({
      url: publicUrl,
      storageProvider: 'supabase-s3',
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);

    send.mockClear();
    send.mockImplementation(async (command) => {
      if (command instanceof HeadObjectCommand) {
        throw Object.assign(new Error('test object not found'), {
          name: 'NotFound',
          $metadata: { httpStatusCode: 404 },
        });
      }
      return { $metadata: {} } as never;
    });
    await expect(storage.uploadFileOnce('COVERS', path, image, image.type)).resolves.toEqual({
      url: publicUrl,
      error: null,
      storageProvider: 'supabase-s3',
    });
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual([
      'HeadObjectCommand',
      'PutObjectCommand',
    ]);
    expect(
      (send.mock.calls[1]?.[0] as PutObjectCommand).input
    ).not.toHaveProperty('IfNoneMatch');

    send.mockReset();
    send.mockResolvedValue({ $metadata: {} } as never);
    await expect(storage.deleteFile('COVERS', path)).resolves.toEqual({
      success: true,
      error: null,
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);

    send.mockClear();
    await expect(storage.deleteFiles('COVERS', [path])).resolves.toEqual({
      success: true,
      error: null,
    });
    const deleteMany = send.mock.calls[0]?.[0];
    expect(deleteMany).toBeInstanceOf(DeleteObjectsCommand);
    expect((deleteMany as DeleteObjectsCommand).input).toMatchObject({
      Bucket: 'novel-covers',
      Delete: {
        Objects: [{ Key: path }],
        Quiet: true,
      },
    });
    expect(storage.getFileUrl('COVERS', path)).toBe(publicUrl);
  });

  it('rejects mismatched hosted Supabase project URLs for S3 storage', async () => {
    configureRequiredProductionStorage();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://other-project.supabase.co');
    vi.stubEnv(
      'SUPABASE_S3_ENDPOINT',
      'https://project-ref.storage.supabase.co/storage/v1/s3'
    );
    vi.stubEnv('SUPABASE_S3_REGION', 'ap-northeast-2');
    vi.stubEnv('SUPABASE_S3_ACCESS_KEY_ID', 'test-access-key-id');
    vi.stubEnv('SUPABASE_S3_SECRET_ACCESS_KEY', 'test-secret-access-key');

    const storage = await import('./supabase');

    expect(storage.hasSupabaseS3Config).toBe(false);
    expect(storage.hasDurableImageStorage).toBe(false);
    expect(storage.imageStorageConfigurationError).toBe(
      'Supabase S3 storage configuration is invalid.'
    );
  });

  it('requires an explicit public Supabase project URL for S3 storage', async () => {
    configureRequiredProductionStorage();
    vi.stubEnv(
      'SUPABASE_S3_ENDPOINT',
      'https://project-ref.storage.supabase.co/storage/v1/s3'
    );
    vi.stubEnv('SUPABASE_S3_REGION', 'ap-northeast-2');
    vi.stubEnv('SUPABASE_S3_ACCESS_KEY_ID', 'test-access-key-id');
    vi.stubEnv('SUPABASE_S3_SECRET_ACCESS_KEY', 'test-secret-access-key');

    const storage = await import('./supabase');

    expect(storage.hasSupabaseS3Config).toBe(false);
    expect(storage.hasDurableImageStorage).toBe(false);
    expect(storage.imageStorageConfigurationError).toBe(
      'Supabase S3 storage configuration is invalid.'
    );
  });
});
