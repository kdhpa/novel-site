'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const run = async (action: 'hide' | 'dismiss') => {
    if (pending) return;
    const resolution = window.prompt(action === 'hide' ? '숨김 처리 사유' : '기각 사유');
    if (!resolution?.trim()) return;
    if (!window.confirm(action === 'hide' ? '콘텐츠를 숨기고 신고를 처리할까요?' : '신고를 기각할까요?')) return;

    setPending(true);
    try {
      const response = await fetch(`/api/ops/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, resolution: resolution.trim() }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || '신고 처리에 실패했습니다.');
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '신고 처리에 실패했습니다.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending} onClick={() => void run('hide')} className="h-9 rounded-md bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-60">숨김 처리</button>
      <button type="button" disabled={pending} onClick={() => void run('dismiss')} className="h-9 rounded-md border border-border px-3 text-sm text-muted disabled:opacity-60">기각</button>
    </div>
  );
}
