'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

export default function VisibilityButton({ novelId, title, isPublished }: { novelId: string; title: string; isPublished: boolean }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function toggleVisibility() {
    if (isLoading) return;
    const nextValue = !isPublished;
    const confirmed = window.confirm(nextValue ? `'${title}' 작품을 다시 공개할까요?` : `'${title}' 작품을 공개 사이트에서 내릴까요?`);
    if (!confirmed) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/ops/novels/${novelId}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: nextValue }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        window.alert(result.error || '공개 상태 변경에 실패했습니다.');
        return;
      }

      router.refresh();
    } catch {
      window.alert('공개 상태 변경 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button type="button" onClick={toggleVisibility} disabled={isLoading} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-surface-muted disabled:opacity-60">
      {isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      {isPublished ? '내리기' : '공개'}
    </button>
  );
}
