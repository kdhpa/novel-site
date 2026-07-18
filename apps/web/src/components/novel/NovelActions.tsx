'use client';

import { useState } from 'react';
import { Bookmark, Heart, Share2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

type NovelActionsProps = {
  novelId: string;
  initialLiked: boolean;
  initialBookmarked: boolean;
  initialLikeCount: number;
};

function getActionError(error: unknown, fallback: string) {
  return error instanceof Error && /[가-힣]/.test(error.message) ? error.message : fallback;
}

export default function NovelActions({ novelId, initialLiked, initialBookmarked, initialLikeCount }: NovelActionsProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isPending, setIsPending] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [actionError, setActionError] = useState('');
  const isSessionLoading = status === 'loading';

  const requireLogin = () => {
    if (isSessionLoading) return false;
    if (!session?.user) {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/novels/${novelId}`)}`);
      return false;
    }
    return true;
  };

  const toggleLike = async () => {
    if (!requireLogin() || isPending) return;
    setIsPending(true);
    setActionError('');
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));

    try {
      const response = await fetch(`/api/novels/${novelId}/like`, { method: nextLiked ? 'POST' : 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || '좋아요 처리에 실패했습니다.');
      if (typeof result.data?.count === 'number') setLikeCount(result.data.count);
    } catch (error) {
      setLiked(!nextLiked);
      setLikeCount((count) => Math.max(0, count + (nextLiked ? -1 : 1)));
      setActionError(getActionError(error, '좋아요 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setIsPending(false);
    }
  };

  const toggleBookmark = async () => {
    if (!requireLogin() || isPending) return;
    setIsPending(true);
    setActionError('');
    const nextBookmarked = !bookmarked;
    setBookmarked(nextBookmarked);

    try {
      const response = await fetch(`/api/novels/${novelId}/bookmark`, { method: nextBookmarked ? 'POST' : 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || '북마크 처리에 실패했습니다.');
    } catch (error) {
      setBookmarked(!nextBookmarked);
      setActionError(getActionError(error, '북마크 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setIsPending(false);
    }
  };

  const shareNovel = async () => {
    setActionError('');
    try {
      const url = `${window.location.origin}/novels/${novelId}`;
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1600);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setActionError('공유 링크를 전달하지 못했습니다. 브라우저 권한을 확인해 주세요.');
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 md:items-start">
      <div className="flex items-center justify-center gap-2 md:justify-start" aria-busy={isPending || isSessionLoading}>
        <button
          type="button"
          onClick={toggleBookmark}
          disabled={isPending || isSessionLoading}
          className={`rounded-md border border-border p-3 transition-colors ${bookmarked ? 'bg-primary text-white' : 'bg-background-tertiary text-zinc-400 hover:border-accent-muted hover:text-white'}`}
          aria-label={bookmarked ? '북마크 해제' : '북마크 추가'}
          aria-pressed={bookmarked}
        >
          <Bookmark className="h-5 w-5" fill={bookmarked ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          onClick={toggleLike}
          disabled={isPending || isSessionLoading}
          className={`flex items-center gap-2 rounded-md border border-border px-4 py-3 transition-colors ${liked ? 'bg-rose-600 text-white' : 'bg-background-tertiary text-zinc-400 hover:border-accent-muted hover:text-white'}`}
          aria-label={liked ? '좋아요 취소' : '좋아요'}
          aria-pressed={liked}
        >
          <Heart className="h-5 w-5" fill={liked ? 'currentColor' : 'none'} />
          <span className="text-sm font-semibold">{likeCount.toLocaleString()}</span>
        </button>
        <button
          type="button"
          onClick={shareNovel}
          className="rounded-md border border-border bg-background-tertiary p-3 text-zinc-400 transition-colors hover:border-accent-muted hover:text-white"
          aria-label="공유"
          title={copyState === 'copied' ? '링크 복사됨' : '공유'}
        >
          <Share2 className="h-5 w-5" />
        </button>
      </div>
      {actionError && <p role="alert" className="max-w-xs text-xs text-rose-300">{actionError}</p>}
      {copyState === 'copied' && <p role="status" className="text-xs text-accent">링크를 복사했습니다.</p>}
    </div>
  );
}
