'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Pencil, Star, Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ReportButton from '@/components/novel/ReportButton';

type ReviewItem = {
  id: string;
  rating: number;
  content: string;
  hasSpoiler: boolean;
  createdAt: string;
  updatedAt?: string;
  user: {
    id: string;
    nickname: string | null;
    image: string | null;
  };
};

type ReviewResponse = {
  items: ReviewItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  averageRating: number;
};

type ReviewSectionProps = {
  novelId: string;
  initialAverageRating?: number;
  initialTotal?: number;
};

const PAGE_SIZE = 10;

function RatingPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="flex items-center gap-1" aria-label={`${value}점 선택됨`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={`rounded p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
              score <= value ? 'text-yellow-300' : 'text-zinc-700 hover:text-yellow-200'
            }`}
            aria-label={`${score}점`}
            aria-pressed={score === value}
          >
            <Star className="h-5 w-5" fill={score <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function ReviewSection({
  novelId,
  initialAverageRating = 0,
  initialTotal = 0,
}: ReviewSectionProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const sectionRef = useRef<HTMLElement | null>(null);
  const loadedNovelIdRef = useRef<string | null>(null);
  const latestRequestRef = useRef(0);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(Math.ceil(initialTotal / PAGE_SIZE));
  const [total, setTotal] = useState(initialTotal);
  const [averageRating, setAverageRating] = useState(initialAverageRating);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [hasSpoiler, setHasSpoiler] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListLoading, setIsListLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editContent, setEditContent] = useState('');
  const [editHasSpoiler, setEditHasSpoiler] = useState(false);
  const [editError, setEditError] = useState('');
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  const [reviewToDelete, setReviewToDelete] = useState<ReviewItem | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(() => new Set());

  const loadReviews = useCallback(async (targetPage = 1) => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setIsListLoading(true);
    setListError('');

    try {
      const response = await fetch(
        `/api/novels/${novelId}/reviews?page=${targetPage}&limit=${PAGE_SIZE}`,
        { cache: 'no-store' },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '리뷰를 불러오지 못했습니다.');
      }

      if (latestRequestRef.current !== requestId) return;
      const data = result.data as ReviewResponse;
      setReviews(data.items);
      setPage(data.page);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setAverageRating(data.averageRating);
    } catch (error) {
      if (latestRequestRef.current !== requestId) return;
      setListError(error instanceof Error ? error.message : '리뷰를 불러오는 중 오류가 발생했습니다.');
    } finally {
      if (latestRequestRef.current === requestId) setIsListLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || loadedNovelIdRef.current === novelId) return;

    const requestReviews = () => {
      if (loadedNovelIdRef.current === novelId) return;
      loadedNovelIdRef.current = novelId;
      void loadReviews(1);
    };

    if (!('IntersectionObserver' in window)) {
      requestReviews();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        requestReviews();
      },
      { rootMargin: '400px 0px' },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [loadReviews, novelId]);

  const refreshAfterMutation = async (targetPage: number) => {
    await loadReviews(targetPage);
    router.refresh();
  };

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!session?.user || !content.trim()) return;

    setIsSubmitting(true);
    setFormError('');
    try {
      const response = await fetch(`/api/novels/${novelId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, content, hasSpoiler }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || '리뷰 저장에 실패했습니다.');
      setContent('');
      setHasSpoiler(false);
      await refreshAfterMutation(1);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '리뷰 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (review: ReviewItem) => {
    setEditingReviewId(review.id);
    setEditRating(review.rating);
    setEditContent(review.content);
    setEditHasSpoiler(review.hasSpoiler);
    setEditError('');
  };

  const cancelEditing = () => {
    setEditingReviewId(null);
    setEditError('');
  };

  const saveEditedReview = async (event: FormEvent, reviewId: string) => {
    event.preventDefault();
    if (!editContent.trim()) return;

    setPendingReviewId(reviewId);
    setEditError('');
    try {
      const response = await fetch(`/api/novels/${novelId}/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: editRating, content: editContent, hasSpoiler: editHasSpoiler }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || '리뷰 수정에 실패했습니다.');
      setEditingReviewId(null);
      await refreshAfterMutation(page);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : '리뷰 수정 중 오류가 발생했습니다.');
    } finally {
      setPendingReviewId(null);
    }
  };

  const deleteReview = async () => {
    if (!reviewToDelete) return;
    const reviewId = reviewToDelete.id;
    setPendingReviewId(reviewId);
    setEditError('');

    try {
      const response = await fetch(`/api/novels/${novelId}/reviews/${reviewId}`, { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || '리뷰 삭제에 실패했습니다.');
      const targetPage = page > 1 && reviews.length === 1 ? page - 1 : page;
      setReviewToDelete(null);
      setEditingReviewId(null);
      await refreshAfterMutation(targetPage);
    } catch (error) {
      setReviewToDelete(null);
      setListError(error instanceof Error ? error.message : '리뷰 삭제 중 오류가 발생했습니다.');
    } finally {
      setPendingReviewId(null);
    }
  };

  const toggleSpoiler = (reviewId: string) => {
    setRevealedSpoilers((current) => {
      const next = new Set(current);
      if (next.has(reviewId)) next.delete(reviewId);
      else next.add(reviewId);
      return next;
    });
  };

  const changePage = (targetPage: number) => {
    if (isListLoading || targetPage < 1 || targetPage > totalPages || targetPage === page) return;
    void loadReviews(targetPage);
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <section
        ref={sectionRef}
        className="scroll-mt-[190px] rounded-md border border-border bg-background-secondary xl:scroll-mt-[134px]"
        aria-busy={isListLoading}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div>
            <h2 className="font-bold text-white">리뷰</h2>
            <p className="text-sm text-zinc-500">
              {total > 0 ? `평균 ${averageRating.toFixed(1)}점` : '아직 평점 없음'} · {total.toLocaleString()}개
            </p>
          </div>
          <div className="flex items-center gap-1 text-yellow-300" aria-label={total > 0 ? `평균 평점 ${averageRating.toFixed(1)}점` : '평점 없음'}>
            <Star className="h-5 w-5" fill={total > 0 ? 'currentColor' : 'none'} />
            <span className="font-semibold">{total > 0 ? averageRating.toFixed(1) : '-'}</span>
          </div>
        </div>

        {session?.user ? (
          <form onSubmit={submitReview} className="space-y-3 border-b border-border p-4">
            <div>
              <p className="mb-1 text-sm font-semibold text-zinc-200">내 리뷰</p>
              <p className="text-xs text-zinc-500">이미 작성한 리뷰가 있으면 새 내용으로 업데이트됩니다.</p>
            </div>
            <RatingPicker value={rating} onChange={setRating} label="리뷰 평점" />
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="작품에 대한 감상을 남겨주세요."
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-primary"
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? 'review-form-error' : 'review-form-count'}
            />
            {formError && <p id="review-form-error" role="alert" className="text-sm text-rose-300">{formError}</p>}
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <input type="checkbox" checked={hasSpoiler} onChange={(event) => setHasSpoiler(event.target.checked)} className="rounded border-border bg-background" />
                스포일러 포함
              </label>
              <div className="flex items-center gap-3">
                <span id="review-form-count" className="text-xs text-zinc-600">{content.length}/2000</span>
                <Button type="submit" size="sm" isLoading={isSubmitting} disabled={!content.trim()}>
                  리뷰 저장
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="border-b border-border p-4 text-sm text-zinc-500">
            리뷰를 작성하려면 <Link href={`/login?callbackUrl=${encodeURIComponent(`/novels/${novelId}`)}`} className="font-medium text-accent">로그인</Link>이 필요합니다.
          </div>
        )}

        {listError && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-rose-500/5 px-4 py-3" role="alert">
            <p className="text-sm text-rose-300">{listError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadReviews(page)} disabled={isListLoading}>
              다시 시도
            </Button>
          </div>
        )}

        <div className={`divide-y divide-border transition-opacity ${isListLoading && reviews.length > 0 ? 'opacity-60' : ''}`}>
          {isListLoading && reviews.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">리뷰를 불러오는 중입니다.</p>
          ) : reviews.length === 0 && !listError ? (
            <p className="p-4 text-sm text-zinc-500">아직 등록된 리뷰가 없습니다.</p>
          ) : (
            reviews.map((review) => {
              const isOwner = session?.user?.id === review.user.id;
              const isEditing = editingReviewId === review.id;
              const isSpoilerRevealed = revealedSpoilers.has(review.id);
              const contentId = `review-content-${review.id}`;

              return (
                <article key={review.id} className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{review.user.nickname || '익명'}</p>
                      <time dateTime={review.createdAt} className="text-xs text-zinc-600">
                        {new Date(review.createdAt).toLocaleDateString('ko-KR')}
                      </time>
                    </div>
                    <div className="flex items-center gap-1 text-yellow-300" aria-label={`${review.rating}점`}>
                      <Star className="h-4 w-4" fill="currentColor" />
                      <span className="text-sm">{review.rating}</span>
                    </div>
                  </div>

                  {isEditing ? (
                    <form onSubmit={(event) => saveEditedReview(event, review.id)} className="mt-3 space-y-3 rounded-md border border-border bg-background p-3">
                      <RatingPicker value={editRating} onChange={setEditRating} label="수정할 리뷰 평점" />
                      <textarea
                        value={editContent}
                        onChange={(event) => setEditContent(event.target.value)}
                        rows={4}
                        maxLength={2000}
                        className="w-full resize-none rounded-md border border-border bg-background-secondary px-3 py-2 text-sm text-white outline-none focus:border-primary"
                        aria-invalid={Boolean(editError)}
                        aria-describedby={editError ? `review-edit-error-${review.id}` : undefined}
                      />
                      {editError && <p id={`review-edit-error-${review.id}`} role="alert" className="text-sm text-rose-300">{editError}</p>}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm text-zinc-400">
                          <input type="checkbox" checked={editHasSpoiler} onChange={(event) => setEditHasSpoiler(event.target.checked)} />
                          스포일러 포함
                        </label>
                        <div className="flex gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={cancelEditing} disabled={pendingReviewId === review.id}>취소</Button>
                          <Button type="submit" size="sm" isLoading={pendingReviewId === review.id} disabled={!editContent.trim()}>수정 저장</Button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <>
                      {review.hasSpoiler && (
                        <button
                          type="button"
                          onClick={() => toggleSpoiler(review.id)}
                          className="mb-2 inline-flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/15"
                          aria-expanded={isSpoilerRevealed}
                          aria-controls={contentId}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {isSpoilerRevealed ? '스포일러 다시 가리기' : '스포일러 보기'}
                        </button>
                      )}
                      {review.hasSpoiler && !isSpoilerRevealed ? (
                        <div className="rounded-md border border-dashed border-amber-500/25 bg-amber-500/5 px-4 py-6 text-center text-sm text-amber-200/80">
                          스포일러가 포함된 리뷰입니다. 내용을 보려면 위 버튼을 눌러주세요.
                        </div>
                      ) : (
                        <p id={contentId} className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{review.content}</p>
                      )}
                    </>
                  )}

                  {isOwner && !isEditing && (
                    <div className="mt-3 flex justify-end gap-1 border-t border-border/70 pt-3">
                      <button type="button" onClick={() => startEditing(review)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-zinc-400 hover:bg-background-tertiary hover:text-white">
                        <Pencil className="h-3.5 w-3.5" /> 수정
                      </button>
                      <button type="button" onClick={() => setReviewToDelete(review)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-rose-300 hover:bg-rose-500/10">
                        <Trash2 className="h-3.5 w-3.5" /> 삭제
                      </button>
                    </div>
                  )}
                  {!isOwner && !isEditing && (
                    <div className="mt-3 flex justify-end border-t border-border/70 pt-3">
                      <ReportButton targetType="review" targetId={review.id} />
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <nav className="flex items-center justify-center gap-3 border-t border-border px-4 py-4" aria-label="리뷰 페이지 이동">
            <Button type="button" variant="outline" size="sm" onClick={() => changePage(page - 1)} disabled={page <= 1 || isListLoading}>
              <ChevronLeft className="mr-1 h-4 w-4" /> 이전
            </Button>
            <span className="min-w-20 text-center text-sm text-zinc-500"><strong className="text-zinc-200">{page}</strong> / {totalPages}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => changePage(page + 1)} disabled={page >= totalPages || isListLoading}>
              다음 <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </nav>
        )}
      </section>

      <ConfirmDialog
        isOpen={Boolean(reviewToDelete)}
        title="리뷰를 삭제할까요?"
        message="삭제한 리뷰는 복구할 수 없으며 작품 평점에도 바로 반영됩니다."
        confirmText="리뷰 삭제"
        isLoading={Boolean(reviewToDelete && pendingReviewId === reviewToDelete.id)}
        onConfirm={() => void deleteReview()}
        onCancel={() => {
          if (!pendingReviewId) setReviewToDelete(null);
        }}
      />
    </>
  );
}
