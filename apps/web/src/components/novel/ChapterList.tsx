'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Eye, FileText, Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { ChapterListItem } from '@/types';

interface ChapterListProps {
  novelId: string;
  chapters: ChapterListItem[];
  mode?: 'reader' | 'manage';
}

export default function ChapterList({ novelId, chapters, mode = 'reader' }: ChapterListProps) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<ChapterListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isManagementView = mode === 'manage';

  const handleDeleteChapter = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/novels/${novelId}/chapters/${deleteTarget.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '회차 삭제에 실패했습니다.');
      }
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '회차 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (chapters.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
        <FileText className="mb-4 h-12 w-12 text-zinc-600" />
        <p className="text-zinc-400">아직 등록된 회차가 없습니다.</p>
        {isManagementView && (
          <Link href={`/novels/${novelId}/chapters/new`} className="mt-4 text-sm font-medium text-accent hover:text-white">
            첫 회차 작성하기
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-border">
        {chapters.map((chapter) => {
          const date = chapter.publishedAt || chapter.createdAt;
          return (
            <div key={chapter.id} className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-background-tertiary">
              <Link
                href={isManagementView ? `/novels/${novelId}/chapters/${chapter.id}/edit` : `/novels/${novelId}/${chapter.id}`}
                className="flex min-w-0 flex-1 items-center gap-4"
              >
                <span className="w-14 shrink-0 text-center text-sm font-semibold text-accent">{chapter.chapterNumber}화</span>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-medium text-white">{chapter.title}</h4>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span>{formatDistanceToNow(new Date(date), { addSuffix: true, locale: ko })}</span>
                    {!chapter.isPublished && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">비공개</span>
                    )}
                  </div>
                </div>
              </Link>

              <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {chapter.viewCount.toLocaleString()}
                </span>
                {isManagementView && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(chapter)}
                    className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                    aria-label="회차 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="회차 삭제"
        message={deleteTarget ? `${deleteTarget.chapterNumber}화 '${deleteTarget.title}'을 삭제할까요? 이 작업은 되돌릴 수 없습니다.` : ''}
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDeleteChapter}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
