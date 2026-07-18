'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AlertTriangle, CalendarDays, CheckCircle2, ImageIcon, Info, Settings, Tags } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { transferDraftCoverImageJobs } from '@/lib/client/cover-image-jobs';
import type { Genre, NovelFormInput, SeasonOption, Status } from '@/types';
import { GenreLabels, StatusLabels } from './editor-labels';

interface NovelFormProps {
  initialData?: Partial<NovelFormInput> & { id?: string };
  mode: 'create' | 'edit';
  seasons?: SeasonOption[];
}

const genres: Genre[] = ['FANTASY', 'ROMANCE', 'SF', 'MARTIAL_ARTS', 'MYSTERY', 'HORROR', 'MODERN', 'OTHER'];
const statuses: Status[] = ['ONGOING', 'COMPLETED', 'HIATUS'];

const CoverImageManager = memo(dynamic(
  () => import('@/components/editor/CoverImageManager'),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-80 animate-pulse rounded-lg border border-border bg-background-tertiary"
        role="status"
        aria-label="표지 편집기를 불러오는 중"
      />
    ),
  }
));

export default function NovelForm({ initialData, mode, seasons = [] }: NovelFormProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const ownerUserId = session?.user?.id || '';
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const mutationInFlightRef = useRef(false);
  const coverManagerAnchorRef = useRef<HTMLDivElement>(null);
  const [shouldLoadCoverManager, setShouldLoadCoverManager] = useState(false);
  const [error, setError] = useState('');
  const [tagInput, setTagInput] = useState((initialData?.tags || []).join(', '));

  const [formData, setFormData] = useState<NovelFormInput>({
    title: initialData?.title || '',
    description: initialData?.description || '',
    genres: initialData?.genres || [],
    status: initialData?.status || 'ONGOING',
    coverImage: initialData?.coverImage || '',
    tags: initialData?.tags || [],
    seasonId: initialData?.seasonId || null,
  });

  const tags = tagInput.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 10);
  const isReadyForSubmit = formData.title.trim().length > 0 && formData.genres.length > 0;
  const showSeasonSelector = seasons.length > 0;
  const handleCoverChange = useCallback((url: string) => {
    setFormData((current) => ({ ...current, coverImage: url }));
  }, []);

  useEffect(() => {
    const target = coverManagerAnchorRef.current;
    if (!target) return;

    if (!('IntersectionObserver' in window)) {
      setShouldLoadCoverManager(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoadCoverManager(true);
        observer.disconnect();
      },
      { rootMargin: '200px 0px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mutationInFlightRef.current) return;

    mutationInFlightRef.current = true;
    setIsLoading(true);
    setError('');

    try {
      const url = mode === 'create' ? '/api/novels' : `/api/novels/${initialData?.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, tags }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '저장에 실패했습니다.');
      const transferredCoverJobs =
        mode === 'create' && ownerUserId
          ? transferDraftCoverImageJobs(ownerUserId, data.data.id)
          : 0;
      const destination = mode === 'create'
        ? transferredCoverJobs > 0
          ? `/novels/${data.data.id}/edit`
          : '/dashboard'
        : `/novels/${data.data.id}`;
      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      mutationInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!initialData?.id || mutationInFlightRef.current) return;

    mutationInFlightRef.current = true;
    setIsDeleting(true);
    setError('');

    try {
      const response = await fetch(`/api/novels/${initialData.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '삭제에 실패했습니다.');
      }
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
      setShowDeleteDialog(false);
    } finally {
      mutationInFlightRef.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" aria-busy={isLoading || isDeleting}>
      {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

      <StepHeader icon={<Info className="h-5 w-5" />} title="기본 정보" description="독자가 검색하고 판단할 제목, 소개, 장르를 입력합니다." />
      <Input label="제목" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="작품 제목" required />

      <div>
        <label htmlFor="novel-description" className="mb-1 block text-sm font-medium text-zinc-200">작품 소개</label>
        <textarea
          id="novel-description"
          value={formData.description ?? ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="작품의 핵심 매력, 주인공, 세계관을 간결하게 소개하세요."
          rows={6}
          className="w-full resize-none rounded-lg border border-border bg-background px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-zinc-200">장르</legend>
        <div className="flex flex-wrap gap-2">
          {genres.map((genre) => {
            const selected = formData.genres.includes(genre);
            return (
              <button
                key={genre}
                type="button"
                onClick={() => setFormData({ ...formData, genres: selected ? formData.genres.filter((item) => item !== genre) : [...formData.genres, genre] })}
                aria-pressed={selected}
                className={`min-h-10 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? 'border-primary bg-primary text-white' : 'border-border bg-background-tertiary text-zinc-400 hover:border-accent-muted hover:text-white'}`}
              >
                {GenreLabels[genre]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <StepHeader icon={<Tags className="h-5 w-5" />} title="키워드" description="쉼표로 구분해 최대 10개까지 입력합니다." />
      <Input label="태그" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="먼치킨, 회귀, 성장, 로맨스" helperText={tags.length > 0 ? `등록될 태그: ${tags.map((tag) => `#${tag}`).join(' ')}` : '검색과 키워드 탐색에 사용됩니다.'} />

      {showSeasonSelector && (
        <>
          <StepHeader icon={<CalendarDays className="h-5 w-5" />} title="공모전 응모" description="접수중인 공모전에 이 작품을 응모할 수 있습니다." />
          <div>
            <label htmlFor="novel-season" className="mb-1 block text-sm font-medium text-zinc-200">응모할 공모전</label>
            <select
              id="novel-season"
              value={formData.seasonId || ''}
              onChange={(e) => setFormData({ ...formData, seasonId: e.target.value || null })}
              aria-describedby="novel-season-help"
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-white outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="">응모하지 않음</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.title} ({formatDate(season.startsAt)} - {formatDate(season.endsAt)})
                </option>
              ))}
            </select>
            <p id="novel-season-help" className="mt-2 text-xs text-zinc-500">
              접수 기간이 끝난 공모전은 새로 선택할 수 없습니다. 이미 응모한 기록은 작품에 유지됩니다.
            </p>
          </div>
        </>
      )}

      <StepHeader icon={<ImageIcon className="h-5 w-5" />} title="표지" description="AI 생성, 업로드, URL 입력 중 하나를 사용할 수 있습니다." />
      <div ref={coverManagerAnchorRef} className="min-h-80">
        {shouldLoadCoverManager ? (
          <CoverImageManager value={formData.coverImage || ''} onChange={handleCoverChange} title={formData.title} genres={formData.genres} description={formData.description ?? ''} novelId={initialData?.id} disabled={isLoading} />
        ) : (
          <button
            type="button"
            onClick={() => setShouldLoadCoverManager(true)}
            className="flex min-h-80 w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background px-6 text-center transition-colors hover:border-accent-muted hover:bg-background-tertiary"
          >
            <ImageIcon className="h-8 w-8 text-zinc-500" />
            <span className="mt-3 text-sm font-semibold text-zinc-200">표지 도구 열기</span>
            <span className="mt-1 text-xs text-zinc-500">이 영역에 가까이 스크롤하면 자동으로 불러옵니다.</span>
          </button>
        )}
      </div>

      <StepHeader icon={<Settings className="h-5 w-5" />} title="연재 상태" description="작품의 진행 상태를 선택합니다." />
      <div>
        <label htmlFor="novel-status" className="mb-1 block text-sm font-medium text-zinc-200">연재 상태</label>
        <select id="novel-status" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as Status })} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-white outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary">
          {statuses.map((status) => <option key={status} value={status}>{StatusLabels[status]}</option>)}
        </select>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> 저장 전 점검</div>
        <ul className="space-y-1 text-sm text-zinc-500">
          <li className={formData.title.trim() ? 'text-emerald-300' : ''}>제목 입력</li>
          <li className={formData.genres.length > 0 ? 'text-emerald-300' : ''}>장르 1개 이상 선택</li>
          <li className={(formData.description || '').trim() ? 'text-emerald-300' : ''}>작품 소개 입력 (심사 필수)</li>
          <li className={formData.coverImage ? 'text-emerald-300' : ''}>표지 등록 권장</li>
        </ul>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" isLoading={isLoading} disabled={!isReadyForSubmit} fullWidth className="sm:flex-1" aria-describedby="novel-form-status">
          {mode === 'create' ? '초안 만들기' : '저장'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading} className="w-full sm:w-auto">취소</Button>
      </div>

      {mode === 'edit' && initialData?.id && (
        <div className="border-t border-border pt-6">
          <div className="flex flex-col gap-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-300"><AlertTriangle className="h-4 w-4" /> 위험 영역</h3>
              <p className="mt-1 text-sm text-rose-200/70">작품을 삭제하면 회차와 관련 데이터가 함께 삭제됩니다.</p>
            </div>
            <Button type="button" variant="danger" onClick={() => setShowDeleteDialog(true)} disabled={isLoading || isDeleting}>작품 삭제</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="작품 삭제"
        message={`'${formData.title}' 작품을 삭제할까요? 모든 회차와 관련 데이터가 삭제되며 되돌릴 수 없습니다.`}
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
      <span id="novel-form-status" className="sr-only" role="status" aria-live="polite">
        {isLoading ? '작품 정보를 저장하고 있습니다.' : isDeleting ? '작품을 삭제하고 있습니다.' : ''}
      </span>
    </form>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function StepHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-accent">{icon}</div>
      <div>
        <h2 className="font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
    </div>
  );
}
