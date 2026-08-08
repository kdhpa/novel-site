'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Pencil,
  Reply,
  Trash2,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ReportButton from '@/components/novel/ReportButton';

type CommentAuthor = {
  id: string | null;
  nickname: string | null;
  image: string | null;
};

type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  parentId: string | null;
  isDeleted: boolean;
  user: CommentAuthor;
  replies?: CommentItem[];
  replyTotal?: number;
  hasMoreReplies?: boolean;
};

type CommentListResponse = {
  items: CommentItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type CommentSectionProps = {
  novelId: string;
  chapterId?: string;
};

const PAGE_SIZE = 10;
const MAX_CONTENT_LENGTH = 1000;

async function readApiResult(response: Response, fallback: string) {
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || fallback);
  }
  return result;
}

function CommentBody({
  comment,
  currentUserId,
  isPending,
  isEditing,
  editContent,
  editError,
  onStartReply,
  onStartEdit,
  onEditContent,
  onCancelEdit,
  onSaveEdit,
  onRequestDelete,
  isReply = false,
}: {
  comment: CommentItem;
  currentUserId?: string;
  isPending: boolean;
  isEditing: boolean;
  editContent: string;
  editError: string;
  onStartReply?: () => void;
  onStartEdit: () => void;
  onEditContent: (content: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (event: FormEvent) => void;
  onRequestDelete: () => void;
  isReply?: boolean;
}) {
  const isOwner = Boolean(currentUserId && comment.user.id === currentUserId);
  const createdAt = new Date(comment.createdAt);
  const updatedAt = new Date(comment.updatedAt);
  const isEdited = updatedAt.getTime() - createdAt.getTime() > 1000;

  return (
    <article
      className={
        isReply
          ? 'border-l-2 border-border py-3 pl-3 sm:pl-4'
          : 'py-4'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${comment.isDeleted ? 'text-zinc-500' : 'text-zinc-100'}`}>
            {comment.isDeleted ? '삭제된 사용자' : comment.user.nickname || '익명'}
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">
            <time dateTime={comment.createdAt}>{createdAt.toLocaleString('ko-KR')}</time>
            {isEdited && !comment.isDeleted ? ' · 수정됨' : ''}
          </p>
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={onSaveEdit} className="mt-3 space-y-2">
          <label htmlFor={`comment-edit-${comment.id}`} className="sr-only">
            댓글 수정 내용
          </label>
          <textarea
            id={`comment-edit-${comment.id}`}
            value={editContent}
            onChange={(event) => onEditContent(event.target.value)}
            rows={3}
            maxLength={MAX_CONTENT_LENGTH}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-primary focus:ring-1 focus:ring-primary"
            aria-invalid={Boolean(editError)}
            aria-describedby={editError ? `comment-edit-error-${comment.id}` : `comment-edit-count-${comment.id}`}
            autoFocus
          />
          {editError && (
            <p id={`comment-edit-error-${comment.id}`} role="alert" className="text-sm text-rose-300">
              {editError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span id={`comment-edit-count-${comment.id}`} className="text-xs text-zinc-600">
              {editContent.length}/{MAX_CONTENT_LENGTH}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit} disabled={isPending}>
                취소
              </Button>
              <Button type="submit" size="sm" isLoading={isPending} disabled={!editContent.trim()}>
                저장
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <>
          <p className={`mt-3 whitespace-pre-wrap break-words text-sm leading-6 ${comment.isDeleted ? 'italic text-zinc-600' : 'text-zinc-300'}`}>
            {comment.content}
          </p>
          {!comment.isDeleted && (
            <div className="mt-2 flex flex-wrap gap-1">
              {onStartReply && (
                <button
                  type="button"
                  onClick={onStartReply}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-zinc-400 transition-colors hover:bg-background-tertiary hover:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <Reply className="h-3.5 w-3.5" aria-hidden="true" /> 답글
                </button>
              )}
              {isOwner && (
                <>
                  <button
                    type="button"
                    onClick={onStartEdit}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-zinc-400 transition-colors hover:bg-background-tertiary hover:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> 수정
                  </button>
                  <button
                    type="button"
                    onClick={onRequestDelete}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10 focus:outline-none focus:ring-2 focus:ring-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> 삭제
                  </button>
                </>
              )}
              {!isOwner && <ReportButton targetType="comment" targetId={comment.id} />}
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default function CommentSection({ novelId, chapterId }: CommentSectionProps) {
  const { data: session, status } = useSession();
  const latestRequestRef = useRef(0);
  const pendingMutationRef = useRef<string | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [formError, setFormError] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyError, setReplyError] = useState('');
  const [editingComment, setEditingComment] = useState<CommentItem | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState('');
  const [commentToDelete, setCommentToDelete] = useState<CommentItem | null>(null);
  const [replyLoadingId, setReplyLoadingId] = useState<string | null>(null);
  const [replyLoadErrors, setReplyLoadErrors] = useState<Record<string, string>>({});
  const commentsEndpoint = `/api/novels/${novelId}/comments`;
  const chapterQuery = chapterId ? `chapterId=${encodeURIComponent(chapterId)}&` : '';
  const loginCallback = chapterId
    ? `/novels/${novelId}/${chapterId}#댓글`
    : `/novels/${novelId}#댓글`;

  const loadComments = useCallback(async (targetPage: number) => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setIsLoading(true);
    setListError('');

    try {
      const response = await fetch(
        `${commentsEndpoint}?${chapterQuery}page=${targetPage}&limit=${PAGE_SIZE}`,
        { cache: 'no-store' },
      );
      const result = await readApiResult(response, '댓글을 불러오지 못했습니다.');
      if (latestRequestRef.current !== requestId) return;
      const data = result.data as CommentListResponse;
      setComments(data.items);
      setPage(data.page);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (error) {
      if (latestRequestRef.current !== requestId) return;
      setListError(error instanceof Error ? error.message : '댓글을 불러오는 중 오류가 발생했습니다.');
    } finally {
      if (latestRequestRef.current === requestId) setIsLoading(false);
    }
  }, [chapterQuery, commentsEndpoint]);

  useEffect(() => {
    setComments([]);
    setPage(1);
    void loadComments(1);
  }, [loadComments]);

  const beginMutation = (key: string) => {
    if (pendingMutationRef.current) return false;
    pendingMutationRef.current = key;
    setPendingKey(key);
    return true;
  };

  const finishMutation = (key: string) => {
    if (pendingMutationRef.current !== key) return;
    pendingMutationRef.current = null;
    setPendingKey(null);
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    const mutationKey = 'create';
    if (!content.trim() || !session?.user || !beginMutation(mutationKey)) return;
    setFormError('');
    const clientRequestId = crypto.randomUUID();

    try {
      const response = await fetch(commentsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          clientRequestId,
          ...(chapterId ? { chapterId } : {}),
        }),
      });
      await readApiResult(response, '댓글 작성에 실패했습니다.');
      setContent('');
      await loadComments(1);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '댓글 작성 중 오류가 발생했습니다.');
    } finally {
      finishMutation(mutationKey);
    }
  };

  const submitReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!replyContent.trim() || !replyingTo || !session?.user) return;
    const mutationKey = `reply:${replyingTo.id}`;
    if (!beginMutation(mutationKey)) return;
    setReplyError('');
    const clientRequestId = crypto.randomUUID();

    try {
      const response = await fetch(commentsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: replyContent,
          parentId: replyingTo.id,
          clientRequestId,
          ...(chapterId ? { chapterId } : {}),
        }),
      });
      await readApiResult(response, '답글 작성에 실패했습니다.');
      setReplyContent('');
      setReplyingTo(null);
      await loadComments(page);
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : '답글 작성 중 오류가 발생했습니다.');
    } finally {
      finishMutation(mutationKey);
    }
  };

  const startEditing = (comment: CommentItem) => {
    setEditingComment(comment);
    setEditContent(comment.content);
    setEditError('');
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingComment || !editContent.trim()) return;
    const mutationKey = `edit:${editingComment.id}`;
    if (!beginMutation(mutationKey)) return;
    setEditError('');

    try {
      const response = await fetch(
        `/api/novels/${novelId}/comments/${editingComment.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editContent }),
        },
      );
      await readApiResult(response, '댓글 수정에 실패했습니다.');
      setEditingComment(null);
      await loadComments(page);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : '댓글 수정 중 오류가 발생했습니다.');
    } finally {
      finishMutation(mutationKey);
    }
  };

  const deleteComment = async () => {
    if (!commentToDelete) return;
    const target = commentToDelete;
    const mutationKey = `delete:${target.id}`;
    if (!beginMutation(mutationKey)) return;
    setListError('');

    try {
      const response = await fetch(`/api/novels/${novelId}/comments/${target.id}`, {
        method: 'DELETE',
      });
      await readApiResult(response, '댓글 삭제에 실패했습니다.');
      setCommentToDelete(null);
      if (editingComment?.id === target.id) setEditingComment(null);
      const removesTopLevel =
        !target.parentId && (target.replyTotal || target.replies?.length || 0) === 0;
      const targetPage = removesTopLevel && comments.length === 1 && page > 1 ? page - 1 : page;
      await loadComments(targetPage);
    } catch (error) {
      setCommentToDelete(null);
      setListError(error instanceof Error ? error.message : '댓글 삭제 중 오류가 발생했습니다.');
    } finally {
      finishMutation(mutationKey);
    }
  };

  const beginReply = (comment: CommentItem) => {
    setReplyingTo(comment);
    setReplyContent('');
    setReplyError('');
  };

  const loadMoreReplies = async (comment: CommentItem) => {
    if (replyLoadingId || !comment.hasMoreReplies) return;
    setReplyLoadingId(comment.id);
    setReplyLoadErrors((current) => ({ ...current, [comment.id]: '' }));

    try {
      const offset = comment.replies?.length || 0;
      const response = await fetch(
        `${commentsEndpoint}?${chapterQuery}parentId=${encodeURIComponent(comment.id)}&offset=${offset}&limit=20`,
        { cache: 'no-store' },
      );
      const result = await readApiResult(response, '답글을 불러오지 못했습니다.');
      const data = result.data as {
        items: CommentItem[];
        total: number;
        hasMore: boolean;
      };
      setComments((current) => current.map((item) => {
        if (item.id !== comment.id) return item;
        const existingIds = new Set((item.replies || []).map((reply) => reply.id));
        const appended = data.items.filter((reply) => !existingIds.has(reply.id));
        return {
          ...item,
          replies: [...(item.replies || []), ...appended],
          replyTotal: data.total,
          hasMoreReplies: data.hasMore,
        };
      }));
    } catch (error) {
      setReplyLoadErrors((current) => ({
        ...current,
        [comment.id]: error instanceof Error ? error.message : '답글을 불러오지 못했습니다.',
      }));
    } finally {
      setReplyLoadingId(null);
    }
  };

  const changePage = (targetPage: number) => {
    if (isLoading || targetPage < 1 || targetPage > totalPages || targetPage === page) return;
    setReplyingTo(null);
    setEditingComment(null);
    void loadComments(targetPage);
    document.getElementById('댓글')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderComment = (comment: CommentItem, isReply = false) => (
    <CommentBody
      key={comment.id}
      comment={comment}
      currentUserId={session?.user?.id}
      isPending={pendingKey === `edit:${comment.id}`}
      isEditing={editingComment?.id === comment.id}
      editContent={editContent}
      editError={editingComment?.id === comment.id ? editError : ''}
      onStartReply={!isReply && session?.user ? () => beginReply(comment) : undefined}
      onStartEdit={() => startEditing(comment)}
      onEditContent={setEditContent}
      onCancelEdit={() => setEditingComment(null)}
      onSaveEdit={saveEdit}
      onRequestDelete={() => setCommentToDelete(comment)}
      isReply={isReply}
    />
  );

  return (
    <section
      id="댓글"
      className="scroll-mt-[190px] overflow-hidden rounded-md border border-border bg-background-secondary xl:scroll-mt-[134px]"
      aria-busy={isLoading}
      aria-labelledby="comments-heading"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <h2 id="comments-heading" className="flex items-center gap-2 font-bold text-white">
            <MessageCircle className="h-5 w-5 text-accent" aria-hidden="true" />
            {chapterId ? '회차 댓글' : '댓글'}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">총 {total.toLocaleString()}개</p>
        </div>
      </div>

      {status === 'authenticated' ? (
        <form onSubmit={submitComment} className="space-y-3 border-b border-border p-4 sm:p-5">
          <label htmlFor="new-comment" className="text-sm font-semibold text-zinc-200">
            댓글 작성
          </label>
          <textarea
            id="new-comment"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={3}
            maxLength={MAX_CONTENT_LENGTH}
            placeholder={chapterId ? '이 회차에 대한 생각을 남겨 주세요.' : '작품에 대한 생각을 남겨 주세요.'}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-primary focus:ring-1 focus:ring-primary"
            aria-invalid={Boolean(formError)}
            aria-describedby={formError ? 'comment-form-error' : 'comment-form-count'}
          />
          {formError && <p id="comment-form-error" role="alert" className="text-sm text-rose-300">{formError}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span id="comment-form-count" className="text-xs text-zinc-600">{content.length}/{MAX_CONTENT_LENGTH}</span>
            <Button type="submit" size="sm" isLoading={pendingKey === 'create'} disabled={!content.trim()}>
              댓글 등록
            </Button>
          </div>
        </form>
      ) : status === 'unauthenticated' ? (
        <div className="border-b border-border px-4 py-4 text-sm text-zinc-500 sm:px-5">
          댓글을 작성하려면{' '}
          <Link href={`/login?callbackUrl=${encodeURIComponent(loginCallback)}`} className="font-medium text-accent hover:underline">
            로그인
          </Link>
          이 필요합니다.
        </div>
      ) : (
        <div className="border-b border-border px-4 py-4 text-sm text-zinc-500 sm:px-5">로그인 상태를 확인하는 중입니다.</div>
      )}

      {listError && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-rose-500/5 px-4 py-3 sm:px-5" role="alert">
          <p className="text-sm text-rose-300">{listError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadComments(page)} disabled={isLoading}>
            다시 시도
          </Button>
        </div>
      )}

      <div className={`divide-y divide-border px-4 sm:px-5 ${isLoading && comments.length > 0 ? 'opacity-60' : ''}`} aria-live="polite">
        {isLoading && comments.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">댓글을 불러오는 중입니다.</p>
        ) : comments.length === 0 && !listError ? (
          <p className="py-8 text-center text-sm text-zinc-500">첫 댓글을 남겨 보세요.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id}>
              {renderComment(comment)}

              {replyingTo?.id === comment.id && (
                <form onSubmit={submitReply} className="mb-4 ml-2 space-y-2 border-l-2 border-accent-muted pl-3 sm:ml-5 sm:pl-4">
                  <label htmlFor={`reply-${comment.id}`} className="text-xs font-semibold text-zinc-300">
                    {comment.user.nickname || '익명'}님에게 답글
                  </label>
                  <textarea
                    id={`reply-${comment.id}`}
                    value={replyContent}
                    onChange={(event) => setReplyContent(event.target.value)}
                    rows={3}
                    maxLength={MAX_CONTENT_LENGTH}
                    className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    aria-invalid={Boolean(replyError)}
                    aria-describedby={replyError ? `reply-error-${comment.id}` : `reply-count-${comment.id}`}
                    autoFocus
                  />
                  {replyError && <p id={`reply-error-${comment.id}`} role="alert" className="text-sm text-rose-300">{replyError}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span id={`reply-count-${comment.id}`} className="text-xs text-zinc-600">{replyContent.length}/{MAX_CONTENT_LENGTH}</span>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setReplyingTo(null)} disabled={pendingKey === `reply:${comment.id}`}>취소</Button>
                      <Button type="submit" size="sm" isLoading={pendingKey === `reply:${comment.id}`} disabled={!replyContent.trim()}>답글 등록</Button>
                    </div>
                  </div>
                </form>
              )}

              {(comment.replies?.length || 0) > 0 && (
                <div className="mb-2 ml-2 space-y-0 sm:ml-5">
                  {comment.replies?.map((reply) => renderComment(reply, true))}
                </div>
              )}
              {comment.hasMoreReplies && (
                <div className="mb-4 ml-2 sm:ml-5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    isLoading={replyLoadingId === comment.id}
                    onClick={() => void loadMoreReplies(comment)}
                  >
                    답글 더 보기 ({Math.max(
                      (comment.replyTotal || 0) - (comment.replies?.length || 0),
                      0,
                    )})
                  </Button>
                </div>
              )}
              {replyLoadErrors[comment.id] && (
                <p className="mb-4 ml-2 text-sm text-rose-300 sm:ml-5" role="alert">
                  {replyLoadErrors[comment.id]}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 border-t border-border px-4 py-4" aria-label="댓글 페이지 이동">
          <Button type="button" variant="outline" size="sm" onClick={() => changePage(page - 1)} disabled={page <= 1 || isLoading}>
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" /> 이전
          </Button>
          <span className="min-w-20 text-center text-sm text-zinc-500"><strong className="text-zinc-200">{page}</strong> / {totalPages}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => changePage(page + 1)} disabled={page >= totalPages || isLoading}>
            다음 <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        </nav>
      )}

      <ConfirmDialog
        isOpen={Boolean(commentToDelete)}
        title="댓글을 삭제할까요?"
        message={
          (commentToDelete?.replyTotal || commentToDelete?.replies?.length || 0) > 0
            ? '답글 흐름을 보존하기 위해 댓글 내용과 작성자 표시는 삭제 상태로 전환됩니다.'
            : '삭제한 댓글은 복구할 수 없습니다.'
        }
        confirmText="댓글 삭제"
        isLoading={Boolean(commentToDelete && pendingKey === `delete:${commentToDelete.id}`)}
        onConfirm={() => void deleteComment()}
        onCancel={() => {
          if (!pendingKey) setCommentToDelete(null);
        }}
      />
    </section>
  );
}
