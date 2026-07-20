'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Sparkles, TriangleAlert } from 'lucide-react';

type ApiResponse = {
  success: boolean;
  data?: {
    enabled: boolean;
    updatedAt: string | null;
  };
  error?: string;
};

function formatUpdatedAt(value: string | null) {
  if (!value) return '초기 기본값';
  return new Date(value).toLocaleString('ko-KR');
}

export default function AiSettingsForm({
  initialEnabled,
  initialUpdatedAt,
}: {
  initialEnabled: boolean;
  initialUpdatedAt: string | null;
}) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const updateEnabled = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setNotice('');
    setError('');

    const nextEnabled = !enabled;
    try {
      const response = await fetch('/api/ops/settings/ai', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const result = await response.json() as ApiResponse;
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'AI 설정을 저장하지 못했습니다.');
      }

      setEnabled(result.data.enabled);
      setUpdatedAt(result.data.updatedAt);
      setNotice(`Gemini를 ${result.data.enabled ? '활성화' : '비활성화'}했습니다.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI 설정을 저장하지 못했습니다.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <section className="rounded-lg border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">Google Gemini</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  enabled
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-slate-500/20 text-slate-300'
                }`}>
                  {enabled ? '활성' : '비활성'}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                프롬프트 보조와 장면 분석 등 Gemini를 사용하는 모든 기능에 즉시 적용됩니다.
              </p>
              <p className="mt-2 text-xs text-muted">마지막 변경: {formatUpdatedAt(updatedAt)}</p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Gemini AI 사용 여부"
            onClick={() => void updateEnabled()}
            disabled={isSubmitting}
            className={`relative inline-flex h-8 w-14 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60 ${
              enabled ? 'border-primary bg-primary' : 'border-border bg-surface-muted'
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <div className="flex gap-3 text-sm text-muted">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              API 키는 Web 배포 환경의 <code className="text-foreground">GOOGLE_GEMINI_API_KEY</code>에서
              별도 관리되며, 이 화면과 API에는 키 값이 노출되지 않습니다.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-5">
        <div className="flex gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-amber-200">외부 AI 전송 안내</h2>
            <p className="mt-1 text-sm leading-6 text-amber-100/80">
              활성화하면 사용자가 입력한 작품 설명이나 본문 일부가 기능 수행을 위해 Google Gemini로
              전송될 수 있습니다. 서비스 고지와 공급자 정책을 함께 관리해 주세요.
            </p>
          </div>
        </div>
      </section>

      <div className="min-h-6" aria-live="polite">
        {isSubmitting && <p className="text-sm text-muted">설정을 저장하는 중입니다.</p>}
        {!isSubmitting && notice && <p className="text-sm text-emerald-300">{notice}</p>}
        {!isSubmitting && error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      </div>
    </div>
  );
}
