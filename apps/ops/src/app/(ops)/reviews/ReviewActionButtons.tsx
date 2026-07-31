'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';

export default function ReviewActionButtons({ novelId, title }: { novelId: string; title: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  async function runAction(action: 'approve' | 'reject') {
    if (isLoading) return;

    let body: Record<string, string | boolean> = action === 'approve'
      ? { reviewConfirmed }
      : {};
    if (action === 'reject') {
      const note = window.prompt(`'${title}' 반려 사유`);
      if (!note?.trim()) return;
      body = { note: note.trim() };
    }

    const confirmed = window.confirm(action === 'approve' ? `'${title}' 작품을 승인하고 공개할까요?` : `'${title}' 작품을 반려할까요?`);
    if (!confirmed) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/ops/reviews/${novelId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        window.alert(result.error || '심사 처리에 실패했습니다.');
        return;
      }

      router.replace('/reviews');
      router.refresh();
    } catch {
      window.alert('심사 처리 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={reviewConfirmed}
          onChange={(event) => setReviewConfirmed(event.target.checked)}
          disabled={isLoading}
          className="mt-0.5 h-4 w-4"
        />
        모든 회차의 본문과 작품 정보를 직접 검토했습니다.
      </label>
      <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => runAction('approve')} disabled={isLoading || !reviewConfirmed} className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
        <Check className="h-4 w-4" />
        승인
      </button>
      <button type="button" onClick={() => runAction('reject')} disabled={isLoading} className="inline-flex h-9 items-center gap-2 rounded-md bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">
        <X className="h-4 w-4" />
        반려
      </button>
      </div>
    </div>
  );
}
