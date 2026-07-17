'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { getCoverImageJobStorageKey } from '@/lib/client/cover-image-jobs';
import {
  createImageJobClientRequestId,
  fetchImageJob,
  isImageJobAbortError,
  isRetryableImageJobError,
  pollImageJob,
  startImageJob,
  type ImageJobSnapshot,
} from '@/lib/client/image-jobs';
import type {
  CoverStyle,
  CoverMood,
  CoverHistoryItem,
  CoverGenerationOptions,
  Genre,
} from '@/types';
import { CoverStyleLabels, CoverMoodLabels, GenreLabels } from './editor-labels';
import { isOptimizableImageSource } from '@/lib/image-hosts';

type TabType = 'ai' | 'upload' | 'url';
type CoverJobStatus = 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';

type CoverImageJob = {
  ownerUserId: string;
  id: string;
  token: string;
  clientRequestId: string;
  status: CoverJobStatus;
  prompt: string;
  imageUrl?: string;
  error?: string;
  style: CoverStyle;
  createdAt: string;
  updatedAt?: string;
  requestInput?: Record<string, unknown>;
};

const pendingCoverJobStatuses = new Set<CoverJobStatus>(['starting', 'processing']);
const coverJobStatusLabels: Record<CoverJobStatus, string> = {
  starting: '대기',
  processing: '생성 중',
  succeeded: '완료',
  failed: '실패',
  canceled: '취소됨',
};

function normalizeCoverJobStatus(status: string): CoverJobStatus {
  if (status === 'succeeded' || status === 'failed' || status === 'canceled') return status;
  if (status === 'starting') return 'starting';
  return 'processing';
}

interface CoverImageManagerProps {
  value: string;
  onChange: (url: string) => void;
  title: string;
  genres: Genre[];
  description?: string;
  novelId?: string;
  disabled?: boolean;
}

export default function CoverImageManager({
  value,
  onChange,
  title,
  genres,
  description,
  novelId,
  disabled = false,
}: CoverImageManagerProps) {
  const { data: session } = useSession();
  const ownerUserId = session?.user?.id || '';
  // Use the first genre for AI prompt, or OTHER if no genres selected
  const primaryGenre = genres.length > 0 ? genres[0] : 'OTHER';
  const [activeTab, setActiveTab] = useState<TabType>('ai');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isStoringUrl, setIsStoringUrl] = useState(false);
  const [error, setError] = useState('');
  const [urlInput, setUrlInput] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationInFlightRef = useRef(false);
  const startingJobClientRequestIdRef = useRef<string | null>(null);
  const uploadInFlightRef = useRef(false);
  const enhancementInFlightRef = useRef(false);
  const jobPollingControllersRef = useRef(new Map<string, AbortController>());

  // AI generation options
  const [style, setStyle] = useState<CoverStyle>('fantasy');
  const [mood, setMood] = useState<CoverMood>('mystical');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [enhancedCustomPrompt, setEnhancedCustomPrompt] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [geminiAdultConfirmed, setGeminiAdultConfirmed] = useState(false);

  // Image history (session-only)
  const [history, setHistory] = useState<CoverHistoryItem[]>([]);
  const [jobs, setJobs] = useState<CoverImageJob[]>([]);
  const [loadedJobStorageKey, setLoadedJobStorageKey] = useState<string | null>(null);
  const jobStorageKey = ownerUserId
    ? getCoverImageJobStorageKey(ownerUserId, novelId)
    : '';

  const styles: CoverStyle[] = ['anime', 'realistic', 'fantasy', 'watercolor'];
  const moods: CoverMood[] = ['mystical', 'dark', 'bright', 'romantic', 'action', 'calm'];

  const addToHistory = useCallback((item: Omit<CoverHistoryItem, 'id' | 'createdAt'>) => {
    const newItem: CoverHistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setHistory((prev) =>
      prev.some((historyItem) => historyItem.imageUrl === newItem.imageUrl)
        ? prev
        : [newItem, ...prev].slice(0, 10)
    );
  }, []);

  useEffect(() => {
    let nextJobs: CoverImageJob[] = [];

    if (!ownerUserId || !jobStorageKey) {
      setJobs([]);
      setLoadedJobStorageKey(null);
      return;
    }

    try {
      const storedJobs = window.localStorage.getItem(jobStorageKey);
      if (storedJobs) {
        const parsedJobs = JSON.parse(storedJobs) as unknown;
        nextJobs = Array.isArray(parsedJobs)
          ? parsedJobs
              .filter((job): job is Partial<CoverImageJob> =>
                typeof job === 'object' &&
                job !== null &&
                'ownerUserId' in job &&
                job.ownerUserId === ownerUserId &&
                typeof job.id === 'string' &&
                typeof job.status === 'string'
              )
              .map((job) => {
                const status = normalizeCoverJobStatus(String(job.status));
                const isPending = pendingCoverJobStatuses.has(status);
                return {
                  ...job,
                  ownerUserId,
                  id: String(job.id),
                  token: isPending && typeof job.token === 'string' ? job.token : '',
                  clientRequestId:
                    typeof job.clientRequestId === 'string' && job.clientRequestId
                      ? job.clientRequestId
                      : createImageJobClientRequestId(),
                  status,
                  prompt: typeof job.prompt === 'string' ? job.prompt : '표지 이미지 생성',
                  style: job.style || 'fantasy',
                  createdAt: job.createdAt || new Date().toISOString(),
                  requestInput: isPending ? job.requestInput : undefined,
                } satisfies CoverImageJob;
              })
              .filter((job) => !pendingCoverJobStatuses.has(job.status) || job.token || job.requestInput)
              .slice(0, 10)
          : [];
      }
    } catch {
      nextJobs = [];
    }

    setJobs(nextJobs);
    setLoadedJobStorageKey(jobStorageKey);
  }, [jobStorageKey, ownerUserId]);

  useEffect(() => {
    if (!ownerUserId || !jobStorageKey || loadedJobStorageKey !== jobStorageKey) return;
    const persistedJobs = jobs.slice(0, 10).map((job) =>
      pendingCoverJobStatuses.has(job.status)
        ? job
        : { ...job, token: '', requestInput: undefined }
    );
    try {
      window.localStorage.setItem(jobStorageKey, JSON.stringify(persistedJobs));
    } catch {
      // 저장소가 차단되어도 현재 탭의 생성·조회 흐름은 유지합니다.
    }
  }, [jobs, jobStorageKey, loadedJobStorageKey, ownerUserId]);

  const updateJob = useCallback((nextJob: CoverImageJob) => {
    setJobs((prev) =>
      prev
        .map((job) =>
          job.clientRequestId === nextJob.clientRequestId ? nextJob : job
        )
        .slice(0, 10)
    );
  }, []);

  const applyJobSnapshot = useCallback(
    (job: CoverImageJob, snapshot: ImageJobSnapshot) => {
      const nextStatus = normalizeCoverJobStatus(snapshot.status);
      const terminal = !pendingCoverJobStatuses.has(nextStatus);
      const nextJob: CoverImageJob = {
        ...job,
        token: terminal ? '' : job.token,
        status: nextStatus,
        prompt: snapshot.prompt || job.prompt,
        imageUrl: snapshot.imageUrl || job.imageUrl,
        error: snapshot.error || undefined,
        requestInput: terminal ? undefined : job.requestInput,
        updatedAt: new Date().toISOString(),
      };

      updateJob(nextJob);
      if (nextStatus === 'succeeded' && nextJob.imageUrl) {
        addToHistory({
          imageUrl: nextJob.imageUrl,
          prompt: nextJob.prompt,
          style: nextJob.style,
          source: 'ai',
        });
      }
      return nextJob;
    },
    [addToHistory, updateJob]
  );

  const resumeJob = useCallback(
    async (storedJob: CoverImageJob) => {
      if (!ownerUserId || storedJob.ownerUserId !== ownerUserId) return;
      const pollingKey = storedJob.clientRequestId;
      if (jobPollingControllersRef.current.has(pollingKey)) return;

      const controller = new AbortController();
      jobPollingControllersRef.current.set(pollingKey, controller);
      let job = storedJob;

      try {
        if (!job.token) {
          if (!job.requestInput) {
            throw new Error('복구할 표지 생성 요청 정보가 없습니다.');
          }
          const created = await startImageJob(job.requestInput, {
            clientRequestId: job.clientRequestId,
            signal: controller.signal,
          });
          if (jobPollingControllersRef.current.get(pollingKey) !== controller) return;
          job = {
            ...job,
            id: created.id,
            token: created.token,
            status: normalizeCoverJobStatus(created.status),
            prompt: created.prompt,
            imageUrl: created.imageUrl || undefined,
            createdAt: created.createdAt,
            updatedAt: new Date().toISOString(),
          };
          updateJob(job);
          if (startingJobClientRequestIdRef.current === pollingKey) {
            startingJobClientRequestIdRef.current = null;
            generationInFlightRef.current = false;
            setIsGenerating(false);
          }
        }

        const completed = await pollImageJob(
          { id: job.id, token: job.token },
          {
            novelId,
            signal: controller.signal,
            onUpdate: (snapshot) => {
              if (jobPollingControllersRef.current.get(pollingKey) === controller) {
                job = applyJobSnapshot(job, snapshot);
              }
            },
          }
        );
        if (jobPollingControllersRef.current.get(pollingKey) === controller) {
          applyJobSnapshot(job, completed);
        }
      } catch (err) {
        if (
          !isImageJobAbortError(err) &&
          jobPollingControllersRef.current.get(pollingKey) === controller
        ) {
          updateJob({
            ...job,
            token: '',
            status: 'failed',
            error: err instanceof Error ? err.message : '작업 상태를 확인하지 못했습니다.',
            requestInput: undefined,
            updatedAt: new Date().toISOString(),
          });
          setError(err instanceof Error ? err.message : '표지 생성 작업 중 오류가 발생했습니다.');
        }
      } finally {
        jobPollingControllersRef.current.delete(pollingKey);
        if (startingJobClientRequestIdRef.current === pollingKey) {
          startingJobClientRequestIdRef.current = null;
          generationInFlightRef.current = false;
          setIsGenerating(false);
        }
      }
    },
    [applyJobSnapshot, novelId, ownerUserId, updateJob]
  );

  const refreshJob = useCallback(
    async (job: CoverImageJob) => {
      if (!pendingCoverJobStatuses.has(job.status)) return;
      if (!job.token) {
        void resumeJob(job);
        return;
      }

      try {
        const snapshot = await fetchImageJob(job.id, job.token, { novelId });
        applyJobSnapshot(job, snapshot);
      } catch (err) {
        if (isRetryableImageJobError(err)) return;
        updateJob({
          ...job,
          token: '',
          status: 'failed',
          error: err instanceof Error ? err.message : '작업 상태를 확인하지 못했습니다.',
          requestInput: undefined,
          updatedAt: new Date().toISOString(),
        });
      }
    },
    [applyJobSnapshot, novelId, resumeJob, updateJob]
  );

  const pendingJobSignature = jobs
    .filter((job) => pendingCoverJobStatuses.has(job.status))
    .map((job) => `${job.clientRequestId}:${job.id}:${job.token}`)
    .join('|');

  useEffect(() => {
    if (!pendingJobSignature || loadedJobStorageKey !== jobStorageKey) return;
    jobs
      .filter((job) => pendingCoverJobStatuses.has(job.status))
      .forEach((job) => void resumeJob(job));
  }, [jobStorageKey, jobs, loadedJobStorageKey, pendingJobSignature, resumeJob]);

  useEffect(() => () => {
    jobPollingControllersRef.current.forEach((controller) => controller.abort());
    jobPollingControllersRef.current.clear();
    startingJobClientRequestIdRef.current = null;
    generationInFlightRef.current = false;
  }, [jobStorageKey]);

  const handleJobSelect = (job: CoverImageJob) => {
    if (job.imageUrl) {
      onChange(job.imageUrl);
    }
  };

  const handleJobRemove = (job: CoverImageJob) => {
    jobPollingControllersRef.current.get(job.clientRequestId)?.abort();
    jobPollingControllersRef.current.delete(job.clientRequestId);
    setJobs((prev) =>
      prev.filter((item) => item.clientRequestId !== job.clientRequestId)
    );
    if (startingJobClientRequestIdRef.current === job.clientRequestId) {
      startingJobClientRequestIdRef.current = null;
      generationInFlightRef.current = false;
      setIsGenerating(false);
    }
  };

  const handleGenerateCover = () => {
    if (generationInFlightRef.current) return;

    if (!ownerUserId || !jobStorageKey) {
      setError('로그인 정보를 확인한 뒤 다시 시도해 주세요.');
      return;
    }

    if (!title) {
      setError('표지를 생성하려면 제목을 입력해주세요.');
      return;
    }

    if (useCustomPrompt && !customPrompt.trim()) {
      setError('커스텀 프롬프트를 입력해주세요.');
      return;
    }

    generationInFlightRef.current = true;
    setIsGenerating(true);
    setError('');

    const options: CoverGenerationOptions = {
      style,
      mood,
      useCustomPrompt,
      customPrompt: useCustomPrompt ? (enhancedCustomPrompt || customPrompt) : undefined,
    };
    const clientRequestId = createImageJobClientRequestId();
    startingJobClientRequestIdRef.current = clientRequestId;
    const requestInput: Record<string, unknown> = {
      type: 'cover',
      title,
      genre: primaryGenre,
      description,
      novelId,
      options,
    };
    const pendingJob: CoverImageJob = {
      ownerUserId,
      id: `pending:${clientRequestId}`,
      token: '',
      clientRequestId,
      status: 'starting',
      prompt: useCustomPrompt
        ? (enhancedCustomPrompt || customPrompt)
        : `${title} 표지 이미지`,
      style,
      createdAt: new Date().toISOString(),
      requestInput,
    };
    const nextJobs = [pendingJob, ...jobs].slice(0, 10);
    setJobs(nextJobs);
    try {
      window.localStorage.setItem(jobStorageKey, JSON.stringify(nextJobs));
    } catch {
      // 저장소가 차단되어도 현재 탭에서의 생성은 계속합니다.
    }
    void resumeJob(pendingJob);
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (uploadInFlightRef.current) return;

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('파일 크기는 5MB 이하여야 합니다.');
      return;
    }

    uploadInFlightRef.current = true;
    setIsUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/cover', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '업로드에 실패했습니다.');
      }

      const imageUrl = data.data.url;
      onChange(imageUrl);
      addToHistory({
        imageUrl,
        prompt: file.name,
        style: 'realistic',
        source: 'upload',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.');
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  }, [onChange, addToHistory]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) {
      setError('URL을 입력해 주세요.');
      return;
    }

    try {
      const parsed = new URL(urlInput.trim());
      if (parsed.protocol !== 'https:') throw new Error('HTTPS required');

      setIsStoringUrl(true);
      setError('');
      const response = await fetch('/api/images/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: parsed.toString(),
          target: 'cover',
          ...(novelId && { novelId }),
        }),
      });
      const data = await response.json() as {
        data?: { imageUrl?: string };
        error?: string;
      };
      if (!response.ok || !data.data?.imageUrl) {
        throw new Error(data.error || '이미지를 영구 저장하지 못했습니다.');
      }

      const storedUrl = data.data.imageUrl;
      onChange(storedUrl);
      setUrlInput(storedUrl);
      addToHistory({
        imageUrl: storedUrl,
        prompt: '외부 URL에서 영구 저장',
        style: 'realistic',
        source: 'url',
      });
    } catch (urlError) {
      setError(urlError instanceof Error ? urlError.message : '유효한 HTTPS 이미지 URL을 입력해 주세요.');
    } finally {
      setIsStoringUrl(false);
    }
  };

  const handleHistorySelect = (item: CoverHistoryItem) => {
    onChange(item.imageUrl);
  };

  const handleEnhancePrompt = async () => {
    if (enhancementInFlightRef.current) return;

    if (!customPrompt.trim()) {
      setError('프롬프트를 입력해주세요.');
      return;
    }

    enhancementInFlightRef.current = true;
    setIsEnhancing(true);
    setError('');

    try {
      const response = await fetch('/api/ai/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: customPrompt,
          adultConfirmed: geminiAdultConfirmed,
          context: {
            type: 'cover',
            genre: primaryGenre,
            novelTitle: title,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '프롬프트 개선에 실패했습니다.');
      }

      setEnhancedCustomPrompt(data.data.enhancedPrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : '프롬프트 개선 중 오류가 발생했습니다.');
    } finally {
      enhancementInFlightRef.current = false;
      setIsEnhancing(false);
    }
  };

  const tabs = [
    { id: 'ai' as TabType, label: 'AI 생성' },
    { id: 'upload' as TabType, label: '직접 업로드' },
    { id: 'url' as TabType, label: 'URL 입력' },
  ];

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-zinc-200">표지 이미지</label>

      {/* Tab Navigation */}
      <div className="hide-scrollbar flex overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            disabled={disabled}
            className={`min-h-10 shrink-0 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-accent text-accent'
                : 'text-zinc-400 hover:text-zinc-200'
            } disabled:opacity-50`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Tab Content */}
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        {/* Preview Section */}
        <div className="min-w-0">
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
            {value ? (
              <Image
                src={value}
                alt="표지 미리보기"
                fill
                sizes="(min-width: 1024px) 360px, calc(100vw - 3rem)"
                className="object-cover"
                unoptimized={!isOptimizableImageSource(value)}
              />
            ) : (
              <div className="text-center text-zinc-500">
                <svg
                  className="w-16 h-16 mx-auto mb-2 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm">이미지 없음</p>
              </div>
            )}
          </div>
        </div>

        {/* Controls Section */}
        <div className="min-w-0 space-y-4">
          {activeTab === 'ai' && (
            <>
              <aside
                aria-label="외부 AI 데이터 전송 안내"
                className="rounded-md border border-accent-muted/60 bg-accent-muted/10 px-3 py-2 text-xs leading-5 text-foreground-secondary"
              >
                <span className="font-semibold text-accent">외부 AI 전송 안내</span>
                <span className="mt-1 block">
                  이미지 생성 시 제목·장르·소개글 또는 입력한 프롬프트가 Replicate로 전송됩니다.
                  프롬프트 개선을 사용하면 입력 내용과 작품 정보가 Gemini에도 전송됩니다. 민감정보나 타인의 개인정보를 입력하지 마세요.
                </span>
                <label className="mt-2 flex items-start gap-2 text-zinc-300">
                  <input
                    type="checkbox"
                    checked={geminiAdultConfirmed}
                    onChange={(event) => setGeminiAdultConfirmed(event.target.checked)}
                    disabled={disabled || isEnhancing}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>Gemini 프롬프트 개선을 사용할 때 본인이 만 18세 이상임을 확인합니다.</span>
                </label>
              </aside>

              {/* Style Selector */}
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">
                  스타일
                </label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as CoverStyle)}
                  disabled={disabled || isGenerating}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:ring-2 focus:ring-primary disabled:opacity-50"
                >
                  {styles.map((s) => (
                    <option key={s} value={s}>
                      {CoverStyleLabels[s]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mood Selector */}
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">
                  분위기
                </label>
                <select
                  value={mood}
                  onChange={(e) => setMood(e.target.value as CoverMood)}
                  disabled={disabled || isGenerating}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:ring-2 focus:ring-primary disabled:opacity-50"
                >
                  {moods.map((m) => (
                    <option key={m} value={m}>
                      {CoverMoodLabels[m]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prompt Mode Toggle */}
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="promptMode"
                      checked={!useCustomPrompt}
                      onChange={() => setUseCustomPrompt(false)}
                      disabled={disabled || isGenerating}
                      className="h-4 w-4 shrink-0 accent-primary focus:ring-primary"
                    />
                    <span className="text-sm text-zinc-300">자동 프롬프트</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="promptMode"
                      checked={useCustomPrompt}
                      onChange={() => setUseCustomPrompt(true)}
                      disabled={disabled || isGenerating}
                      className="h-4 w-4 shrink-0 accent-primary focus:ring-primary"
                    />
                    <span className="text-sm text-zinc-300">커스텀 프롬프트</span>
                  </label>
                </div>

                {useCustomPrompt && (
                  <div className="space-y-2">
                    <textarea
                      value={customPrompt}
                      onChange={(e) => {
                        setCustomPrompt(e.target.value);
                        setEnhancedCustomPrompt('');
                      }}
                      placeholder="원하는 표지 이미지를 설명해주세요..."
                      disabled={disabled || isGenerating || isEnhancing}
                      rows={3}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-zinc-500 focus:border-primary focus:ring-2 focus:ring-primary disabled:opacity-50"
                    />
                    <Button
                      type="button"
                      onClick={handleEnhancePrompt}
                      disabled={disabled || !customPrompt.trim() || !geminiAdultConfirmed || isEnhancing || isGenerating}
                      isLoading={isEnhancing}
                      variant="secondary"
                      size="sm"
                    >
                      AI로 프롬프트 개선
                    </Button>
                    {enhancedCustomPrompt && (
                      <p className="text-xs text-emerald-400">이미지 생성용 설명을 개선했습니다.</p>
                    )}
                  </div>
                )}

                {!useCustomPrompt && (
                  <p className="text-xs text-zinc-500">
                    제목, 장르({genres.length > 0 ? genres.map((g) => GenreLabels[g]).join(', ') : '미선택'}), 소개글을 기반으로 프롬프트가 자동 생성됩니다.
                  </p>
                )}
              </div>

              {/* Generate Button */}
              <Button
                type="button"
                onClick={handleGenerateCover}
                isLoading={isGenerating}
                disabled={disabled || !title}
                fullWidth
              >
                이미지 생성 작업 시작
              </Button>

              {jobs.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-zinc-300">생성 작업</span>
                    <span className="text-xs text-zinc-500">
                      {jobs.filter((job) => pendingCoverJobStatuses.has(job.status)).length} 진행 중
                    </span>
                  </div>

                  <div className="space-y-2">
                    {jobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-background-secondary p-2"
                      >
                        <div className="relative flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-background">
                          {job.imageUrl ? (
                            <Image
                              src={job.imageUrl}
                              alt=""
                              fill
                              sizes="40px"
                              className="object-cover"
                              unoptimized={!isOptimizableImageSource(job.imageUrl)}
                            />
                          ) : (
                            <span className="text-[10px] text-zinc-500">
                              {coverJobStatusLabels[job.status]}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                job.status === 'succeeded'
                                  ? 'bg-emerald-400'
                                  : job.status === 'failed' || job.status === 'canceled'
                                    ? 'bg-rose-400'
                                    : 'bg-amber-400'
                              }`}
                            />
                            <span className="text-xs font-medium text-zinc-300">
                              {coverJobStatusLabels[job.status]}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-zinc-500">{CoverStyleLabels[job.style]} 표지 생성</p>
                          {job.error && (
                            <p className="mt-1 truncate text-xs text-rose-300">표지 생성에 실패했습니다.</p>
                          )}
                        </div>

                        <div className="flex shrink-0 gap-1">
                          {pendingCoverJobStatuses.has(job.status) && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => void refreshJob(job)}
                              disabled={disabled}
                            >
                              확인
                            </Button>
                          )}
                          {job.status === 'succeeded' && job.imageUrl && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleJobSelect(job)}
                              disabled={disabled}
                            >
                              사용
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleJobRemove(job)}
                            disabled={disabled}
                          >
                            삭제
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'upload' && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors sm:p-8 ${
                isDragging
                  ? 'border-accent bg-accent-muted/10'
                  : 'border-border hover:border-accent-muted'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                className="hidden"
                disabled={disabled || isUploading}
              />

              <svg
                className="mx-auto mb-4 h-12 w-12 text-zinc-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>

              <p className="mb-4 text-zinc-400">
                이미지를 드래그하거나
              </p>

              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                isLoading={isUploading}
                disabled={disabled}
              >
                파일 선택
              </Button>

              <p className="mt-4 text-xs text-zinc-500">
                PNG, JPG, GIF (최대 5MB)
              </p>
            </div>
          )}

          {activeTab === 'url' && (
            <div className="space-y-4">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="허용된 원격 HTTPS 이미지 URL"
                maxLength={2048}
                disabled={disabled || isStoringUrl}
              />
              <Button
                type="button"
                onClick={() => void handleUrlSubmit()}
                disabled={disabled || isStoringUrl || !urlInput.trim()}
                isLoading={isStoringUrl}
                fullWidth
              >
                검증 후 영구 저장
              </Button>
              <p className="text-xs text-foreground-secondary">
                서버가 파일 형식과 크기, 원격 주소를 검사한 뒤 프로젝트 저장소로 복사합니다.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Image History */}
      {history.length > 0 && (
        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            이미지 히스토리 (클릭하여 선택)
          </label>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {history.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleHistorySelect(item)}
                disabled={disabled}
                className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors relative ${
                  value === item.imageUrl
                    ? 'border-accent'
                    : 'border-border hover:border-accent-muted'
                } disabled:opacity-50`}
              >
                <Image
                  src={item.imageUrl}
                  alt="히스토리 이미지"
                  fill
                  sizes="(min-width: 640px) 160px, 45vw"
                  className="object-cover"
                  unoptimized={!isOptimizableImageSource(item.imageUrl)}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
