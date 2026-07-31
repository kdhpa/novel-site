'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import Button from '@/components/ui/Button';
import type { Genre } from '@/types';
import { isOptimizableImageSource } from '@/lib/image-hosts';
import {
  createImageJobClientRequestId,
  isImageJobAbortError,
  pollImageJob,
  readRecoverableImageJob,
  removeRecoverableImageJob,
  startImageJob,
  writeRecoverableImageJob,
  type RecoverableImageJob,
} from '@/lib/client/image-jobs';

interface PortraitGeneratorProps {
  characterId: string;
  appearance: string;
  genre?: Genre;
  currentPortraitUrl?: string | null;
  onGenerated?: (imageUrl: string, prompt: string) => void;
}

const STYLE_OPTIONS = [
  { value: 'anime', label: '애니메이션' },
  { value: 'realistic', label: '리얼리스틱' },
  { value: 'fantasy', label: '판타지' },
  { value: 'watercolor', label: '수채화' },
] as const;

const PORTRAIT_IMAGE_JOB_STORAGE_PREFIX = 'novelverse.portraitImageJob.v1';
type PortraitJobRecord = RecoverableImageJob<Record<string, unknown>>;

export default function PortraitGenerator({
  characterId,
  appearance,
  genre,
  currentPortraitUrl,
  onGenerated,
}: PortraitGeneratorProps) {
  const { data: session } = useSession();
  const ownerUserId = session?.user?.id || '';
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>('anime');
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPortraitUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);
  const [showEnhanced, setShowEnhanced] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [geminiAdultConfirmed, setGeminiAdultConfirmed] = useState(false);
  const generationInFlightRef = useRef(false);
  const enhancementInFlightRef = useRef(false);
  const generationAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const onGeneratedRef = useRef(onGenerated);
  const jobStorageKey = ownerUserId
    ? `${PORTRAIT_IMAGE_JOB_STORAGE_PREFIX}:${ownerUserId}:${characterId}`
    : '';

  useEffect(() => {
    onGeneratedRef.current = onGenerated;
  }, [onGenerated]);

  const runGeneration = useCallback(async (record: PortraitJobRecord) => {
    if (
      generationInFlightRef.current ||
      !ownerUserId ||
      !jobStorageKey ||
      record.ownerUserId !== ownerUserId
    ) return;

    generationInFlightRef.current = true;
    if (mountedRef.current) {
      setIsGenerating(true);
      setError(null);
      setGenerationStatus(
        record.job
          ? '진행 중이던 초상화 생성 작업을 다시 확인하고 있습니다.'
          : '초상화 생성 작업을 요청하는 중입니다.'
      );
    }

    const controller = new AbortController();
    generationAbortRef.current = controller;

    try {
      const job = record.job || await startImageJob(record.input, {
        clientRequestId: record.clientRequestId,
        signal: controller.signal,
        maxAttempts: 4,
      });
      if (generationAbortRef.current !== controller) return;

      writeRecoverableImageJob(jobStorageKey, ownerUserId, {
        ownerUserId,
        clientRequestId: record.clientRequestId,
        input: record.input,
        job,
      });

      const completed = await pollImageJob(job, {
        signal: controller.signal,
        onUpdate: () => {
          if (mountedRef.current && generationAbortRef.current === controller) {
            setGenerationStatus('초상화를 생성하고 영구 저장하는 중입니다.');
          }
        },
      });

      removeRecoverableImageJob(jobStorageKey);
      if (mountedRef.current && generationAbortRef.current === controller) {
        setPreviewUrl(completed.imageUrl);
        setGenerationStatus('');
        onGeneratedRef.current?.(completed.imageUrl, completed.prompt);
      }
    } catch (err) {
      if (!isImageJobAbortError(err)) {
        removeRecoverableImageJob(jobStorageKey);
        if (mountedRef.current && generationAbortRef.current === controller) {
          setError(err instanceof Error ? err.message : '초상화 생성 중 오류가 발생했습니다.');
        }
      }
      if (mountedRef.current && generationAbortRef.current === controller) {
        setGenerationStatus('');
      }
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
        generationInFlightRef.current = false;
        if (mountedRef.current) setIsGenerating(false);
      }
    }
  }, [jobStorageKey, ownerUserId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!ownerUserId || !jobStorageKey) return () => {
      mountedRef.current = false;
    };

    const storedJob = readRecoverableImageJob<Record<string, unknown>>(
      jobStorageKey,
      ownerUserId
    );
    if (storedJob) void runGeneration(storedJob);

    return () => {
      mountedRef.current = false;
      const controller = generationAbortRef.current;
      generationAbortRef.current = null;
      generationInFlightRef.current = false;
      controller?.abort();
    };
  }, [jobStorageKey, ownerUserId, runGeneration]);

  const handleGenerate = async () => {
    if (generationInFlightRef.current) return;

    if (!ownerUserId || !jobStorageKey) {
      setError('로그인 정보를 확인한 뒤 다시 시도해 주세요.');
      return;
    }

    if (!appearance.trim()) {
      setError('외형 설명을 먼저 입력해주세요.');
      return;
    }

    const record: PortraitJobRecord = {
      version: 1,
      ownerUserId,
      clientRequestId: createImageJobClientRequestId(),
      input: {
        type: 'portrait',
        characterId,
        appearance: enhancedPrompt || appearance,
        style: selectedStyle,
        genre,
      },
      updatedAt: new Date().toISOString(),
    };
    writeRecoverableImageJob(jobStorageKey, ownerUserId, record);
    await runGeneration(record);
  };

  const handleCancelGeneration = () => {
    removeRecoverableImageJob(jobStorageKey);
    const controller = generationAbortRef.current;
    generationAbortRef.current = null;
    generationInFlightRef.current = false;
    setIsGenerating(false);
    setGenerationStatus('');
    controller?.abort();
  };

  const handleEnhanceAppearance = async () => {
    if (enhancementInFlightRef.current) return;

    if (!appearance.trim()) {
      setError('외형 설명을 먼저 입력해주세요.');
      return;
    }

    enhancementInFlightRef.current = true;
    setIsEnhancing(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: appearance,
          adultConfirmed: geminiAdultConfirmed,
          context: {
            type: 'portrait',
            genre: genre,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '프롬프트 변환에 실패했습니다.');
      }

      setEnhancedPrompt(data.data.enhancedPrompt);
      setShowEnhanced(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '프롬프트 변환 중 오류가 발생했습니다.');
    } finally {
      enhancementInFlightRef.current = false;
      setIsEnhancing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Portrait Preview */}
        <div className="relative mx-auto h-32 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-background-tertiary sm:mx-0">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="캐릭터 초상화"
              fill
              sizes="128px"
              className="object-cover"
              unoptimized={!isOptimizableImageSource(previewUrl)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                className="h-12 w-12 text-zinc-600"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
          )}

          {isGenerating && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              스타일
            </label>
            <div className="flex flex-wrap gap-2">
              {STYLE_OPTIONS.map((style) => (
                <button
                  key={style.value}
                  type="button"
                  onClick={() => setSelectedStyle(style.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    selectedStyle === style.value
                      ? 'bg-primary text-white'
                      : 'bg-background-tertiary text-zinc-400 hover:bg-background-secondary'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <aside
            aria-label="외부 AI 데이터 전송 안내"
            className="rounded-md border border-accent-muted/60 bg-accent-muted/10 px-3 py-2 text-xs leading-5 text-foreground-secondary"
          >
            <span className="font-semibold text-accent">외부 AI 전송 안내</span>
            <span className="mt-1 block">
              초상화 생성 시 외형 설명과 장르가 Replicate로 전송됩니다. 프롬프트 변환을 사용하면 외형 설명이 Gemini에도 전송됩니다. 민감정보나 타인의 개인정보를 입력하지 마세요.
            </span>
            <label className="mt-2 flex items-start gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={geminiAdultConfirmed}
                onChange={(event) => setGeminiAdultConfirmed(event.target.checked)}
                disabled={isEnhancing}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <span>Gemini 프롬프트 변환을 사용할 때 본인이 만 18세 이상임을 확인합니다.</span>
            </label>
          </aside>

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleEnhanceAppearance}
              disabled={isEnhancing || !appearance.trim() || !geminiAdultConfirmed || isGenerating}
              isLoading={isEnhancing}
              variant="ghost"
              size="sm"
            >
              외형 설명을 프롬프트로 변환
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !appearance.trim()}
              variant="secondary"
              size="sm"
            >
              {isGenerating ? (
                <>
                  <svg
                    className="w-4 h-4 mr-2 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  생성 중...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  AI 초상화 생성
                </>
              )}
            </Button>
            {isGenerating && (
              <Button
                type="button"
                onClick={handleCancelGeneration}
                variant="ghost"
                size="sm"
              >
                확인 중단
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-rose-400">{error}</p>
      )}

      {generationStatus && (
        <p className="text-sm text-accent" role="status">{generationStatus}</p>
      )}

      {showEnhanced && enhancedPrompt && (
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-accent">변환된 프롬프트</span>
            <button
              type="button"
              onClick={() => setShowEnhanced(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              닫기
            </button>
          </div>
          <p className="text-xs text-zinc-300">이미지 생성용 설명 변환을 마쳤습니다.</p>
        </div>
      )}

      <p className="text-xs leading-5 text-zinc-500">
        생성된 초상화는 챕터 삽화 생성 시 캐릭터 일관성을 유지하는 데 사용됩니다.
      </p>
    </div>
  );
}
