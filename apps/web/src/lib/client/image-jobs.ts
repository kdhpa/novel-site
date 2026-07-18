'use client';

export type ClientImageJobStatus =
  | 'starting'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type CreatedImageJob = {
  id: string;
  token: string;
  clientRequestId: string;
  status: ClientImageJobStatus;
  type: 'cover' | 'illustration' | 'custom' | 'portrait';
  prompt: string;
  imageUrl: string | null;
  createdAt: string;
};

export type ImageJobSnapshot = {
  id: string;
  status: ClientImageJobStatus;
  prompt: string;
  imageUrl: string | null;
  stored: boolean;
  storageProvider: string;
  error: string | null;
  retryAfterMs?: number;
};

export type CompletedImageJob = ImageJobSnapshot & {
  status: 'succeeded';
  imageUrl: string;
};

export type RecoverableImageJob<TInput extends Record<string, unknown>> = {
  version: 1;
  ownerUserId: string;
  clientRequestId: string;
  input: TInput;
  job?: CreatedImageJob;
  updatedAt: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  retryAfterMs?: number;
};

type StartImageJobOptions = {
  clientRequestId: string;
  signal?: AbortSignal;
  maxAttempts?: number;
  timeoutMs?: number;
};

const DEFAULT_RETRY_BASE_MS = 1_000;
const MAX_RETRY_DELAY_MS = 60_000;

export class ImageJobRequestError extends Error {
  status: number;
  retryAfterMs?: number;

  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'ImageJobRequestError';
    this.status = status;
    this.retryAfterMs = normalizeRetryAfterMs(retryAfterMs);
  }
}

function normalizeRetryAfterMs(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, MAX_RETRY_DELAY_MS)
    : undefined;
}

function retryAfterHeaderMs(response: Response) {
  const value = response.headers.get('Retry-After');
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.min(Math.max(0, timestamp - Date.now()), MAX_RETRY_DELAY_MS);
}

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return await response.json() as ApiEnvelope<T>;
  } catch {
    throw new ImageJobRequestError(
      response.ok ? 502 : response.status,
      '서버 응답을 읽지 못했습니다.',
      retryAfterHeaderMs(response)
    );
  }
}

export function createImageJobClientRequestId() {
  return crypto.randomUUID();
}

export function isImageJobAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

export function isRetryableImageJobError(error: unknown) {
  return error instanceof TypeError || (
    error instanceof ImageJobRequestError &&
    (error.status === 429 || error.status >= 500)
  );
}

function retryDelayMs(error: unknown, attempt: number, baseMs = DEFAULT_RETRY_BASE_MS) {
  const exponentialDelay = Math.min(
    MAX_RETRY_DELAY_MS,
    Math.max(250, baseMs) * (2 ** Math.min(attempt, 6))
  );
  const serverDelay = error instanceof ImageJobRequestError
    ? error.retryAfterMs
    : undefined;

  return Math.min(
    MAX_RETRY_DELAY_MS,
    Math.max(exponentialDelay, serverDelay || 0)
  );
}

function waitForRetry(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('요청이 취소되었습니다.', 'AbortError'));
      return;
    }

    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException('요청이 취소되었습니다.', 'AbortError'));
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export async function startImageJob(
  input: Record<string, unknown>,
  options: StartImageJobOptions
) {
  const maxAttempts = options.maxAttempts === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(1, options.maxAttempts);
  const deadline = Date.now() + Math.max(
    30_000,
    options.timeoutMs || 2 * 60 * 60 * 1000
  );
  let attempt = 0;

  while (attempt < maxAttempts && Date.now() < deadline) {
    try {
      const response = await fetch('/api/ai/image-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, clientRequestId: options.clientRequestId }),
        signal: options.signal,
      });
      const envelope = await readEnvelope<CreatedImageJob>(response);
      if (!response.ok || !envelope.success || !envelope.data) {
        throw new ImageJobRequestError(
          response.status,
          envelope.error || '이미지 생성 작업을 시작하지 못했습니다.',
          envelope.retryAfterMs ?? retryAfterHeaderMs(response)
        );
      }

      return {
        ...envelope.data,
        clientRequestId: options.clientRequestId,
      };
    } catch (error) {
      if (isImageJobAbortError(error)) throw error;
      attempt += 1;
      if (attempt >= maxAttempts || !isRetryableImageJobError(error)) throw error;
      await waitForRetry(retryDelayMs(error, attempt - 1), options.signal);
    }
  }

  throw new ImageJobRequestError(408, '이미지 생성 작업 요청 시간이 만료되었습니다.');
}

export async function fetchImageJob(
  id: string,
  token: string,
  options?: { novelId?: string; signal?: AbortSignal }
) {
  const search = new URLSearchParams();
  if (options?.novelId) search.set('novelId', options.novelId);
  const query = search.size > 0 ? `?${search.toString()}` : '';

  const response = await fetch(
    `/api/ai/image-jobs/${encodeURIComponent(id)}${query}`,
    {
      headers: { 'x-image-job-token': token },
      signal: options?.signal,
    }
  );
  const envelope = await readEnvelope<ImageJobSnapshot>(response);
  if (!response.ok || !envelope.success || !envelope.data) {
    throw new ImageJobRequestError(
      response.status,
      envelope.error || '이미지 생성 작업 상태를 확인하지 못했습니다.',
      envelope.retryAfterMs ?? retryAfterHeaderMs(response)
    );
  }
  return envelope.data;
}

export async function pollImageJob(
  job: Pick<CreatedImageJob, 'id' | 'token'>,
  options?: {
    novelId?: string;
    signal?: AbortSignal;
    intervalMs?: number;
    timeoutMs?: number;
    onUpdate?: (snapshot: ImageJobSnapshot) => void;
  }
) {
  const intervalMs = Math.max(1_000, options?.intervalMs || 4_000);
  const deadline = Date.now() + Math.max(30_000, options?.timeoutMs || 2 * 60 * 60 * 1000);
  let retryAttempt = 0;

  while (Date.now() < deadline) {
    try {
      const snapshot = await fetchImageJob(job.id, job.token, {
        novelId: options?.novelId,
        signal: options?.signal,
      });
      retryAttempt = 0;
      options?.onUpdate?.(snapshot);

      if (snapshot.status === 'succeeded' && snapshot.imageUrl) {
        return snapshot as CompletedImageJob;
      }
      if (snapshot.status === 'failed' || snapshot.status === 'canceled') {
        throw new ImageJobRequestError(
          422,
          snapshot.error || '이미지 생성 작업이 완료되지 못했습니다.'
        );
      }

      await waitForRetry(
        Math.max(intervalMs, normalizeRetryAfterMs(snapshot.retryAfterMs) || 0),
        options?.signal
      );
    } catch (error) {
      if (isImageJobAbortError(error)) throw error;
      if (!isRetryableImageJobError(error)) throw error;

      await waitForRetry(
        retryDelayMs(error, retryAttempt, intervalMs),
        options?.signal
      );
      retryAttempt += 1;
    }
  }

  throw new ImageJobRequestError(408, '이미지 생성 대기 시간이 만료되었습니다.');
}

export function readRecoverableImageJob<TInput extends Record<string, unknown>>(
  storageKey: string,
  ownerUserId: string
): RecoverableImageJob<TInput> | null {
  if (typeof window === 'undefined' || !ownerUserId) return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecoverableImageJob<TInput>>;
    if (
      parsed.version !== 1 ||
      parsed.ownerUserId !== ownerUserId ||
      typeof parsed.clientRequestId !== 'string' ||
      !parsed.clientRequestId ||
      !parsed.input ||
      typeof parsed.input !== 'object'
    ) {
      removeRecoverableImageJob(storageKey);
      return null;
    }

    if (parsed.job && (
      typeof parsed.job.id !== 'string' ||
      typeof parsed.job.token !== 'string' ||
      parsed.job.status === 'succeeded' ||
      parsed.job.status === 'failed' ||
      parsed.job.status === 'canceled'
    )) {
      removeRecoverableImageJob(storageKey);
      return null;
    }

    return parsed as RecoverableImageJob<TInput>;
  } catch {
    removeRecoverableImageJob(storageKey);
    return null;
  }
}

export function writeRecoverableImageJob<TInput extends Record<string, unknown>>(
  storageKey: string,
  ownerUserId: string,
  record: Omit<RecoverableImageJob<TInput>, 'version' | 'updatedAt'>
) {
  if (typeof window === 'undefined' || !ownerUserId || record.ownerUserId !== ownerUserId) return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      ...record,
      version: 1,
      updatedAt: new Date().toISOString(),
    } satisfies RecoverableImageJob<TInput>));
  } catch {
    // localStorage 차단/용량 초과가 이미지 생성 자체를 막아서는 안 됩니다.
  }
}

export function removeRecoverableImageJob(storageKey: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // localStorage 사용이 차단된 환경에서는 메모리 내 흐름만 유지합니다.
  }
}
