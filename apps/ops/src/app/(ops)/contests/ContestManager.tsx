'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAllowedStoredImageSource } from '@novelverse/shared';

type ContestRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImage: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  novelCount: number;
};

type ContestFormState = {
  title: string;
  slug: string;
  description: string;
  coverImage: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

type BannerAiStyle = 'anime' | 'realistic' | 'fantasy' | 'watercolor';
type BannerAiJobStatus = 'starting' | 'processing' | 'finalizing' | 'succeeded' | 'failed';
type BannerOperation = 'idle' | 'uploading' | 'starting' | 'processing' | 'finalizing';

type ApiEnvelope<T> = {
  success?: unknown;
  data?: T;
  error?: unknown;
};

type BannerAiStartData = {
  id?: unknown;
  token?: unknown;
  status?: unknown;
  retryAfterMs?: unknown;
};

type BannerAiSnapshot = {
  status?: unknown;
  imageUrl?: unknown;
  error?: unknown;
  retryAfterMs?: unknown;
};

type BannerAiPendingStart = {
  version: 1;
  ownerUserId: string;
  createdAt: number;
  clientRequestId: string;
  prompt: string;
  style: BannerAiStyle;
};

const bannerAiStyles: Array<{ value: BannerAiStyle; label: string }> = [
  { value: 'anime', label: '애니메이션' },
  { value: 'realistic', label: '사실적' },
  { value: 'fantasy', label: '판타지' },
  { value: 'watercolor', label: '수채화' },
];

const bannerOperationLabels: Record<Exclude<BannerOperation, 'idle'>, string> = {
  uploading: '배너 이미지를 처리하고 있습니다.',
  starting: 'AI 배너 생성 요청을 전송하고 있습니다.',
  processing: 'AI가 배너 이미지를 생성하고 있습니다.',
  finalizing: '생성된 이미지를 검사하고 WebP로 저장하고 있습니다.',
};

const DEFAULT_BANNER_AI_POLL_MS = 3_000;
const MAX_BANNER_AI_PROMPT_LENGTH = 2_000;
const BANNER_AI_PENDING_START_STORAGE_KEY = 'novelverse.ops.contest-banner-ai.pending-start.v1';
const BANNER_AI_PENDING_START_TTL_MS = 2 * 60 * 60_000;
const MAX_BANNER_AI_TRANSIENT_FAILURES = 12;

const emptyForm: ContestFormState = {
  title: '',
  slug: '',
  description: '',
  coverImage: '',
  startsAt: '',
  endsAt: '',
  isActive: true,
};

function toDatetimeLocal(value: string) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

function getStatus(contest: ContestRow) {
  const now = Date.now();
  const startsAt = new Date(contest.startsAt).getTime();
  const endsAt = new Date(contest.endsAt).getTime();
  if (!contest.isActive) return { label: '비활성', className: 'bg-zinc-500/15 text-zinc-300' };
  if (startsAt > now) return { label: '예정', className: 'bg-blue-500/15 text-blue-200' };
  if (endsAt < now) return { label: '종료', className: 'bg-zinc-500/15 text-zinc-300' };
  return { label: '접수중', className: 'bg-emerald-500/15 text-emerald-200' };
}

function getBannerPreviewSource(value: string) {
  if (!isAllowedStoredImageSource(value)) return null;
  const generatedAsset = value.match(/^\/assets\/contest-banners\/([a-f0-9]{24}\.webp)$/);
  if (generatedAsset) return `/api/ops/seasons/banner/${generatedAsset[1]}`;
  return value.startsWith('/') ? null : value;
}

function buildDefaultBannerAiPrompt(form: ContestFormState) {
  const title = form.title.trim();
  const description = form.description.trim().replace(/\s+/g, ' ');
  const parts = [
    title ? `"${title}" 웹소설 공모전의 가로형 배너` : '웹소설 공모전의 가로형 배너',
    description ? `공모전 주제와 분위기: ${description}` : '',
    '넓고 인상적인 구도, 중요한 피사체는 중앙 안전 영역에 배치',
  ].filter(Boolean);

  return parts.join('. ').slice(0, MAX_BANNER_AI_PROMPT_LENGTH);
}

function isBannerAiJobStatus(value: unknown): value is BannerAiJobStatus {
  return value === 'starting'
    || value === 'processing'
    || value === 'finalizing'
    || value === 'succeeded'
    || value === 'failed';
}

function getBannerOperation(status: BannerAiJobStatus): BannerOperation {
  if (status === 'finalizing') return 'finalizing';
  if (status === 'processing' || status === 'succeeded') return 'processing';
  return 'starting';
}

function getBannerAiPollDelay(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_BANNER_AI_POLL_MS;
  return Math.min(30_000, Math.max(1_000, value));
}

function waitForBannerAiPoll(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('배너 생성 요청이 취소되었습니다.', 'AbortError'));
      return;
    }

    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException('배너 생성 요청이 취소되었습니다.', 'AbortError'));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

function getApiError(result: ApiEnvelope<unknown> | null, fallback: string) {
  return typeof result?.error === 'string' ? result.error : fallback;
}

function isBannerAiStyle(value: unknown): value is BannerAiStyle {
  return value === 'anime'
    || value === 'realistic'
    || value === 'fantasy'
    || value === 'watercolor';
}

function isFreshBannerAiPendingStart(
  value: Partial<BannerAiPendingStart> | null,
  ownerUserId: string,
): value is BannerAiPendingStart {
  const now = Date.now();
  return value?.version === 1
    && value.ownerUserId === ownerUserId
    && Number.isSafeInteger(value.createdAt)
    && value.createdAt! <= now + 5 * 60_000
    && value.createdAt! > now - BANNER_AI_PENDING_START_TTL_MS
    && typeof value.clientRequestId === 'string'
    && /^[A-Za-z0-9_-]{8,128}$/.test(value.clientRequestId)
    && typeof value.prompt === 'string'
    && Boolean(value.prompt)
    && value.prompt.length <= MAX_BANNER_AI_PROMPT_LENGTH
    && isBannerAiStyle(value.style);
}

function readBannerAiPendingStart(ownerUserId: string) {
  try {
    const raw = window.localStorage.getItem(BANNER_AI_PENDING_START_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<BannerAiPendingStart>;
    if (!isFreshBannerAiPendingStart(value, ownerUserId)) {
      window.localStorage.removeItem(BANNER_AI_PENDING_START_STORAGE_KEY);
      return null;
    }
    return value as BannerAiPendingStart;
  } catch {
    return null;
  }
}

function writeBannerAiPendingStart(value: BannerAiPendingStart) {
  try {
    window.localStorage.setItem(BANNER_AI_PENDING_START_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private browsing or storage policy can disable localStorage. The in-memory ref still works.
  }
}

function removeBannerAiPendingStart(ownerUserId: string, clientRequestId: string) {
  try {
    const current = readBannerAiPendingStart(ownerUserId);
    if (current?.clientRequestId === clientRequestId) {
      window.localStorage.removeItem(BANNER_AI_PENDING_START_STORAGE_KEY);
    }
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

export default function ContestManager({
  contests,
  adminUserId,
}: {
  contests: ContestRow[];
  adminUserId: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContestFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [bannerOperation, setBannerOperation] = useState<BannerOperation>('idle');
  const [bannerError, setBannerError] = useState('');
  const [bannerMessage, setBannerMessage] = useState('');
  const [isBannerAiPanelOpen, setIsBannerAiPanelOpen] = useState(false);
  const [bannerAiPrompt, setBannerAiPrompt] = useState('');
  const [bannerAiStyle, setBannerAiStyle] = useState<BannerAiStyle>('fantasy');
  const bannerRequestGenerationRef = useRef(0);
  const bannerRequestAbortRef = useRef<AbortController | null>(null);
  const bannerAiPendingStartRef = useRef<BannerAiPendingStart | null>(null);
  const submissionInFlightRef = useRef(false);

  const editingContest = contests.find((contest) => contest.id === editingId);
  const bannerPreviewSource = getBannerPreviewSource(form.coverImage);
  const isBannerBusy = bannerOperation !== 'idle';
  const isBannerUploading = bannerOperation === 'uploading';
  const isBannerAiBusy = bannerOperation === 'starting'
    || bannerOperation === 'processing'
    || bannerOperation === 'finalizing';
  const isFormBusy = isLoading || isBannerBusy;

  useEffect(() => () => {
    bannerRequestGenerationRef.current += 1;
    bannerRequestAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    bannerAiPendingStartRef.current = readBannerAiPendingStart(adminUserId);
  }, [adminUserId]);

  function invalidateBannerRequest() {
    bannerRequestGenerationRef.current += 1;
    bannerRequestAbortRef.current?.abort();
    bannerRequestAbortRef.current = null;
    setBannerOperation('idle');
  }

  function startBannerRequest(operation: Exclude<BannerOperation, 'idle'>) {
    bannerRequestAbortRef.current?.abort();
    const generation = bannerRequestGenerationRef.current + 1;
    bannerRequestGenerationRef.current = generation;
    const controller = new AbortController();
    bannerRequestAbortRef.current = controller;
    setBannerOperation(operation);
    return { generation, controller };
  }

  function isCurrentBannerRequest(generation: number, controller: AbortController) {
    return bannerRequestGenerationRef.current === generation && !controller.signal.aborted;
  }

  function finishBannerRequest(generation: number, controller: AbortController) {
    if (!isCurrentBannerRequest(generation, controller)) return;
    bannerRequestAbortRef.current = null;
    setBannerOperation('idle');
  }

  function getOrCreateBannerAiPendingStart(prompt: string, style: BannerAiStyle) {
    const inMemory = isFreshBannerAiPendingStart(bannerAiPendingStartRef.current, adminUserId)
      ? bannerAiPendingStartRef.current
      : null;
    if (!inMemory) bannerAiPendingStartRef.current = null;
    const persisted = readBannerAiPendingStart(adminUserId);
    const reusable = [inMemory, persisted].find(
      (value) => value?.ownerUserId === adminUserId
        && value.prompt === prompt
        && value.style === style,
    );
    const pending = reusable || {
      version: 1 as const,
      ownerUserId: adminUserId,
      createdAt: Date.now(),
      clientRequestId: crypto.randomUUID(),
      prompt,
      style,
    };
    bannerAiPendingStartRef.current = pending;
    writeBannerAiPendingStart(pending);
    return pending;
  }

  function clearBannerAiPendingStart(clientRequestId: string) {
    if (
      bannerAiPendingStartRef.current?.ownerUserId === adminUserId
      && bannerAiPendingStartRef.current.clientRequestId === clientRequestId
    ) {
      bannerAiPendingStartRef.current = null;
    }
    removeBannerAiPendingStart(adminUserId, clientRequestId);
  }

  function editContest(contest: ContestRow) {
    invalidateBannerRequest();
    setBannerError('');
    setBannerMessage('');
    setIsBannerAiPanelOpen(false);
    setBannerAiPrompt('');
    setEditingId(contest.id);
    setForm({
      title: contest.title,
      slug: contest.slug,
      description: contest.description,
      coverImage: contest.coverImage,
      startsAt: toDatetimeLocal(contest.startsAt),
      endsAt: toDatetimeLocal(contest.endsAt),
      isActive: contest.isActive,
    });
  }

  function resetForm() {
    invalidateBannerRequest();
    setEditingId(null);
    setForm(emptyForm);
    setBannerError('');
    setBannerMessage('');
    setIsBannerAiPanelOpen(false);
    setBannerAiPrompt('');
  }

  async function uploadBanner(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || bannerRequestAbortRef.current || isFormBusy) return;

    setBannerError('');
    setBannerMessage('');
    if (file.size > 4 * 1024 * 1024) {
      setBannerError('배너 이미지는 4MB 이하여야 합니다.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setBannerError('JPEG, PNG, WEBP 이미지만 선택할 수 있습니다.');
      return;
    }

    const { generation, controller } = startBannerRequest('uploading');
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch('/api/ops/seasons/banner', {
        method: 'POST',
        body,
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null) as {
        success?: unknown;
        data?: { url?: unknown };
        error?: unknown;
      } | null;
      if (!isCurrentBannerRequest(generation, controller)) return;
      const uploadedUrl = typeof result?.data?.url === 'string' ? result.data.url : '';
      if (!response.ok || result?.success !== true || !uploadedUrl) {
        setBannerError(
          typeof result?.error === 'string'
            ? result.error
            : '배너 이미지를 업로드하지 못했습니다.',
        );
        return;
      }
      setForm((current) => ({ ...current, coverImage: uploadedUrl }));
      setBannerMessage('배너를 처리해 URL에 입력했습니다. 공모전을 저장해 주세요.');
    } catch {
      if (controller.signal.aborted || !isCurrentBannerRequest(generation, controller)) return;
      setBannerError('배너 업로드 중 네트워크 오류가 발생했습니다.');
    } finally {
      finishBannerRequest(generation, controller);
    }
  }

  function openBannerAiPanel() {
    if (isFormBusy) return;
    setBannerError('');
    const inMemory = isFreshBannerAiPendingStart(bannerAiPendingStartRef.current, adminUserId)
      ? bannerAiPendingStartRef.current
      : null;
    if (!inMemory) bannerAiPendingStartRef.current = null;
    const pending = inMemory || readBannerAiPendingStart(adminUserId);
    if (pending) {
      bannerAiPendingStartRef.current = pending;
      setBannerAiPrompt(pending.prompt);
      setBannerAiStyle(pending.style);
      setBannerMessage('이전에 시작한 AI 배너 요청이 있습니다. 다시 시작하면 같은 작업에 안전하게 연결합니다.');
    } else {
      setBannerMessage('');
      setBannerAiPrompt((current) => current.trim() || buildDefaultBannerAiPrompt(form));
    }
    setIsBannerAiPanelOpen(true);
  }

  async function pollBannerAiJob(
    id: string,
    token: string,
    initialRetryAfterMs: unknown,
    generation: number,
    controller: AbortController,
    clientRequestId: string,
  ) {
    const deadline = Date.now() + 2 * 60 * 60_000;
    let retryAfterMs = getBannerAiPollDelay(initialRetryAfterMs);
    let transientFailures = 0;

    while (Date.now() < deadline) {
      await waitForBannerAiPoll(retryAfterMs, controller.signal);
      if (!isCurrentBannerRequest(generation, controller)) return;

      let response: Response;
      try {
        response = await fetch(`/api/ops/seasons/banner-ai-jobs/${encodeURIComponent(id)}`, {
          headers: { 'x-banner-ai-job-token': token },
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        transientFailures += 1;
        if (transientFailures >= MAX_BANNER_AI_TRANSIENT_FAILURES) {
          throw new Error('AI 배너 상태 확인이 계속 실패했습니다. 잠시 후 같은 설명으로 다시 시작하면 기존 작업에 연결합니다.');
        }
        retryAfterMs = Math.min(
          30_000,
          DEFAULT_BANNER_AI_POLL_MS * 2 ** Math.min(transientFailures, 4),
        );
        continue;
      }

      const result = await response.json().catch(() => null) as ApiEnvelope<BannerAiSnapshot> | null;
      if (!isCurrentBannerRequest(generation, controller)) return;

      if (!response.ok || result?.success !== true || !result.data) {
        if (response.status === 429 || response.status >= 500) {
          transientFailures += 1;
          if (transientFailures >= MAX_BANNER_AI_TRANSIENT_FAILURES) {
            throw new Error('AI 배너 상태 확인이 계속 실패했습니다. 잠시 후 같은 설명으로 다시 시작하면 기존 작업에 연결합니다.');
          }
          retryAfterMs = Math.min(
            30_000,
            DEFAULT_BANNER_AI_POLL_MS * 2 ** Math.min(transientFailures, 4),
          );
          continue;
        }
        if ([401, 403, 404, 410].includes(response.status)) {
          clearBannerAiPendingStart(clientRequestId);
        }
        throw new Error(getApiError(result, 'AI 배너 생성 상태를 확인하지 못했습니다.'));
      }

      transientFailures = 0;

      const snapshot = result.data;
      if (!isBannerAiJobStatus(snapshot.status)) {
        throw new Error('AI 배너 생성 상태 응답이 올바르지 않습니다.');
      }

      if (snapshot.status === 'failed') {
        clearBannerAiPendingStart(clientRequestId);
        throw new Error(
          typeof snapshot.error === 'string'
            ? snapshot.error
            : 'AI 배너를 생성하지 못했습니다.',
        );
      }

      if (snapshot.status === 'succeeded') {
        if (typeof snapshot.imageUrl !== 'string' || !snapshot.imageUrl) {
          throw new Error('생성된 배너 이미지 URL을 확인하지 못했습니다.');
        }
        setForm((current) => ({ ...current, coverImage: snapshot.imageUrl as string }));
        clearBannerAiPendingStart(clientRequestId);
        setBannerMessage('AI 배너를 생성해 URL에 입력했습니다. 공모전을 저장해 주세요.');
        setIsBannerAiPanelOpen(false);
        return;
      }

      setBannerOperation(getBannerOperation(snapshot.status));
      retryAfterMs = getBannerAiPollDelay(snapshot.retryAfterMs);
    }

    clearBannerAiPendingStart(clientRequestId);
    throw new Error('AI 배너 생성 상태 확인 시간이 만료되었습니다. 새로 생성해 주세요.');
  }

  async function generateBannerWithAi() {
    if (bannerRequestAbortRef.current || isFormBusy) return;

    const prompt = bannerAiPrompt.trim();
    if (!prompt) {
      setBannerError('AI로 만들 배너의 설명을 입력해 주세요.');
      return;
    }

    setBannerError('');
    setBannerMessage('');
    const pendingStart = getOrCreateBannerAiPendingStart(prompt, bannerAiStyle);
    const { generation, controller } = startBannerRequest('starting');

    try {
      const response = await fetch('/api/ops/seasons/banner-ai-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          style: bannerAiStyle,
          clientRequestId: pendingStart.clientRequestId,
        }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null) as ApiEnvelope<BannerAiStartData> | null;
      if (!isCurrentBannerRequest(generation, controller)) return;

      const job = result?.data;
      if (
        !response.ok
        || result?.success !== true
        || !job
        || typeof job.id !== 'string'
        || typeof job.token !== 'string'
        || !isBannerAiJobStatus(job.status)
      ) {
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          clearBannerAiPendingStart(pendingStart.clientRequestId);
        }
        throw new Error(getApiError(result, 'AI 배너 생성 작업을 시작하지 못했습니다.'));
      }

      setBannerOperation(getBannerOperation(job.status));
      await pollBannerAiJob(
        job.id,
        job.token,
        job.retryAfterMs,
        generation,
        controller,
        pendingStart.clientRequestId,
      );
    } catch (error) {
      if (controller.signal.aborted || !isCurrentBannerRequest(generation, controller)) return;
      setBannerError(
        error instanceof Error ? error.message : 'AI 배너 생성 중 오류가 발생했습니다.',
      );
    } finally {
      finishBannerRequest(generation, controller);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submissionInFlightRef.current || bannerRequestAbortRef.current || isFormBusy) return;
    submissionInFlightRef.current = true;
    setIsLoading(true);

    try {
      const response = await fetch(editingId ? `/api/ops/seasons/${editingId}` : '/api/ops/seasons', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '',
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : '',
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        window.alert(result.error || '공모전 저장에 실패했습니다.');
        return;
      }

      resetForm();
      router.refresh();
    } catch {
      window.alert('공모전 저장 중 네트워크 오류가 발생했습니다.');
    } finally {
      submissionInFlightRef.current = false;
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form onSubmit={submit} aria-busy={isFormBusy} className="rounded-lg border border-border bg-surface p-5">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-foreground">{editingContest ? '공모전 수정' : '새 공모전'}</h2>
          <p className="mt-1 text-sm text-muted">시즌별로 열리는 공모전의 접수 기간과 안내 내용을 관리합니다.</p>
        </div>

        <div className="space-y-4">
          <Field label="공모전 제목">
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} disabled={isFormBusy} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60" required />
          </Field>

          <Field label="주소 슬러그">
            <input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="2026-summer-contest" disabled={isFormBusy} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60" required />
          </Field>

          <Field label="공모전 안내">
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={5} disabled={isFormBusy} className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60" />
          </Field>

          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-foreground">공모전 배너</legend>
            <div className="space-y-3">
              {bannerPreviewSource ? (
                <BannerPreview key={bannerPreviewSource} src={bannerPreviewSource} />
              ) : form.coverImage ? (
                <div className="flex aspect-[16/7] items-center justify-center rounded-md border border-border bg-background-tertiary px-5 text-center text-sm text-muted">
                  이 상대 경로 또는 URL은 운영자 화면에서 미리보기를 표시할 수 없습니다.
                </div>
              ) : null}
              <input
                value={form.coverImage}
                onChange={(event) => {
                  setBannerError('');
                  setBannerMessage('');
                  setForm({ ...form, coverImage: event.target.value });
                }}
                placeholder="업로드하면 URL이 자동으로 입력됩니다"
                maxLength={2048}
                disabled={isFormBusy}
                aria-label="배너 이미지 URL 직접 입력"
                aria-describedby="contest-banner-help"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className={`inline-flex h-10 cursor-pointer items-center rounded-md border border-border px-4 text-sm font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 ${isFormBusy ? 'pointer-events-none opacity-60' : ''}`}>
                  {isBannerUploading ? '배너 처리 중...' : '배너 이미지 선택'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={uploadBanner}
                    disabled={isFormBusy}
                    aria-describedby="contest-banner-help"
                    className="sr-only"
                  />
                </label>
                <button
                  type="button"
                  onClick={openBannerAiPanel}
                  disabled={isFormBusy}
                  aria-expanded={isBannerAiPanelOpen}
                  aria-controls="contest-banner-ai-panel"
                  className="h-10 rounded-md border border-primary/50 bg-primary/10 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-primary/20 disabled:opacity-60"
                >
                  AI로 생성
                </button>
                {form.coverImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setBannerError('');
                      setBannerMessage('');
                      setForm({ ...form, coverImage: '' });
                    }}
                    disabled={isFormBusy}
                    className="h-10 rounded-md border border-border px-3 text-sm font-semibold text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
                  >
                    배너 연결 해제
                  </button>
                )}
              </div>
              {isBannerAiPanelOpen && (
                <div id="contest-banner-ai-panel" className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div>
                    <label htmlFor="contest-banner-ai-prompt" className="mb-1 block text-sm font-medium text-foreground">
                      배너 설명
                    </label>
                    <textarea
                      id="contest-banner-ai-prompt"
                      value={bannerAiPrompt}
                      onChange={(event) => {
                        setBannerError('');
                        setBannerAiPrompt(event.target.value);
                      }}
                      maxLength={MAX_BANNER_AI_PROMPT_LENGTH}
                      rows={4}
                      disabled={isFormBusy}
                      placeholder="공모전의 분위기, 배경, 등장 인물과 원하는 색감을 설명해 주세요."
                      aria-describedby="contest-banner-ai-help contest-banner-ai-disclosure"
                      className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
                    />
                    <div className="mt-1 flex items-start justify-between gap-3 text-xs leading-5 text-muted">
                      <span id="contest-banner-ai-help">제목과 공모전 안내를 바탕으로 기본 설명을 채웠습니다.</span>
                      <span aria-label={`최대 ${MAX_BANNER_AI_PROMPT_LENGTH}자 중 ${bannerAiPrompt.length}자 입력`} className="shrink-0 tabular-nums">
                        {bannerAiPrompt.length}/{MAX_BANNER_AI_PROMPT_LENGTH}
                      </span>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-foreground">이미지 스타일</span>
                    <select
                      value={bannerAiStyle}
                      onChange={(event) => setBannerAiStyle(event.target.value as BannerAiStyle)}
                      disabled={isFormBusy}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
                    >
                      {bannerAiStyles.map((style) => (
                        <option key={style.value} value={style.value}>{style.label}</option>
                      ))}
                    </select>
                  </label>

                  <p id="contest-banner-ai-disclosure" className="rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-200/90">
                    입력한 설명은 이미지 생성을 위해 Replicate로 전송되며 생성 비용이 발생합니다. 민감정보나 타인의 개인정보를 입력하지 마세요.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void generateBannerWithAi()}
                      disabled={isFormBusy || !bannerAiPrompt.trim()}
                      className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                    >
                      {isBannerAiBusy ? 'AI 생성 중...' : 'AI 생성 시작'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsBannerAiPanelOpen(false)}
                      disabled={isFormBusy}
                      className="h-10 rounded-md border border-border px-4 text-sm font-semibold text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              )}
              <p id="contest-banner-help" className="text-xs leading-5 text-muted">
                JPEG, PNG, WEBP · 최대 4MB · 자동 관심 영역 기준 1600×900으로 잘라 WebP로 변환합니다. 중요한 내용은 중앙 16:7 영역에 배치하세요.
              </p>
              <p className="text-xs leading-5 text-amber-300/80">
                로컬 Web 자산으로 저장되므로 공개 사이트에 반영하려면 생성 파일을 Web과 함께 배포해야 합니다. 연결을 해제해도 파일 자체는 남습니다.
              </p>
              {bannerOperation !== 'idle' && (
                <p role="status" aria-live="polite" className="text-sm text-muted">
                  {bannerOperationLabels[bannerOperation]}
                </p>
              )}
              {bannerMessage && <p role="status" aria-live="polite" className="text-sm text-emerald-300">{bannerMessage}</p>}
              {bannerError && <p role="alert" className="text-sm text-red-300">{bannerError}</p>}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="접수 시작">
              <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} disabled={isFormBusy} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60" required />
            </Field>
            <Field label="접수 종료">
              <input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} disabled={isFormBusy} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60" required />
            </Field>
          </div>

          <label className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">
            공모전 공개
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} disabled={isFormBusy} />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="submit" disabled={isFormBusy} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
            {isLoading ? '저장 중' : editingContest ? '수정 저장' : '공모전 생성'}
          </button>
          {editingContest && (
            <button type="button" onClick={resetForm} disabled={isFormBusy} className="h-10 rounded-md border border-border px-4 text-sm font-semibold text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-60">
              새로 만들기
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">공모전</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">접수 기간</th>
              <th className="px-4 py-3 font-medium">응모작</th>
              <th className="px-4 py-3 font-medium">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contests.map((contest) => {
              const status = getStatus(contest);
              return (
                <tr key={contest.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{contest.title}</p>
                    <p className="text-muted">/contests/{contest.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(contest.startsAt)}
                    <br />
                    {formatDate(contest.endsAt)}
                  </td>
                  <td className="px-4 py-3 text-muted">{contest.novelCount.toLocaleString()}개</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => editContest(contest)} disabled={isFormBusy} className="h-9 rounded-md border border-border px-3 text-sm font-semibold text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-60">
                      수정
                    </button>
                  </td>
                </tr>
              );
            })}
            {contests.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  아직 등록된 공모전이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function BannerPreview({ src }: { src: string }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div role="status" className="flex aspect-[16/7] items-center justify-center rounded-md border border-border bg-background-tertiary px-5 text-center text-sm text-muted">
        배너 미리보기를 불러오지 못했습니다. 로그인 상태와 이미지 URL을 확인해 주세요.
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/7] overflow-hidden rounded-md border border-border bg-background-tertiary">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="공모전 배너 미리보기"
        onError={() => setHasError(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
