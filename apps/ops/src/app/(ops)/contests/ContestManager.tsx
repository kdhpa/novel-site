'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAllowedStoredImageSource } from '@novelverse/shared';

type ContestRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImage: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  novelCount: number;
};

type ContestFormState = {
  title: string;
  slug: string;
  description: string;
  coverImage: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const emptyForm: ContestFormState = {
  title: '',
  slug: '',
  description: '',
  coverImage: '',
  startsAt: '',
  endsAt: '',
  isActive: true,
};

function toDatetimeLocal(value: string) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

function getStatus(contest: ContestRow) {
  const now = Date.now();
  const startsAt = new Date(contest.startsAt).getTime();
  const endsAt = new Date(contest.endsAt).getTime();
  if (!contest.isActive) return { label: '비활성', className: 'bg-zinc-500/15 text-zinc-300' };
  if (startsAt > now) return { label: '예정', className: 'bg-blue-500/15 text-blue-200' };
  if (endsAt < now) return { label: '종료', className: 'bg-zinc-500/15 text-zinc-300' };
  return { label: '접수중', className: 'bg-emerald-500/15 text-emerald-200' };
}

function getBannerPreviewSource(value: string) {
  if (!isAllowedStoredImageSource(value)) return null;
  const generatedAsset = value.match(/^\/assets\/contest-banners\/([a-f0-9]{24}\.webp)$/);
  if (generatedAsset) return `/api/ops/seasons/banner/${generatedAsset[1]}`;
  return value.startsWith('/') ? null : value;
}

export default function ContestManager({ contests }: { contests: ContestRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContestFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isBannerUploading, setIsBannerUploading] = useState(false);
  const [bannerError, setBannerError] = useState('');
  const [bannerMessage, setBannerMessage] = useState('');

  const editingContest = contests.find((contest) => contest.id === editingId);
  const bannerPreviewSource = getBannerPreviewSource(form.coverImage);

  function editContest(contest: ContestRow) {
    setBannerError('');
    setBannerMessage('');
    setEditingId(contest.id);
    setForm({
      title: contest.title,
      slug: contest.slug,
      description: contest.description,
      coverImage: contest.coverImage,
      startsAt: toDatetimeLocal(contest.startsAt),
      endsAt: toDatetimeLocal(contest.endsAt),
      isActive: contest.isActive,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setBannerError('');
    setBannerMessage('');
  }

  async function uploadBanner(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isBannerUploading) return;

    setBannerError('');
    setBannerMessage('');
    if (file.size > 4 * 1024 * 1024) {
      setBannerError('배너 이미지는 4MB 이하여야 합니다.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setBannerError('JPEG, PNG, WEBP 이미지만 선택할 수 있습니다.');
      return;
    }

    setIsBannerUploading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch('/api/ops/seasons/banner', { method: 'POST', body });
      const result = await response.json().catch(() => null) as {
        success?: unknown;
        data?: { url?: unknown };
        error?: unknown;
      } | null;
      const uploadedUrl = typeof result?.data?.url === 'string' ? result.data.url : '';
      if (!response.ok || result?.success !== true || !uploadedUrl) {
        setBannerError(
          typeof result?.error === 'string'
            ? result.error
            : '배너 이미지를 업로드하지 못했습니다.',
        );
        return;
      }
      setForm((current) => ({ ...current, coverImage: uploadedUrl }));
      setBannerMessage('배너를 처리해 URL에 입력했습니다. 공모전을 저장해 주세요.');
    } catch {
      setBannerError('배너 업로드 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsBannerUploading(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isLoading || isBannerUploading) return;
    setIsLoading(true);

    try {
      const response = await fetch(editingId ? `/api/ops/seasons/${editingId}` : '/api/ops/seasons', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '',
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : '',
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        window.alert(result.error || '공모전 저장에 실패했습니다.');
        return;
      }

      resetForm();
      router.refresh();
    } catch {
      window.alert('공모전 저장 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form onSubmit={submit} className="rounded-lg border border-border bg-surface p-5">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-foreground">{editingContest ? '공모전 수정' : '새 공모전'}</h2>
          <p className="mt-1 text-sm text-muted">시즌별로 열리는 공모전의 접수 기간과 안내 내용을 관리합니다.</p>
        </div>

        <div className="space-y-4">
          <Field label="공모전 제목">
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" required />
          </Field>

          <Field label="주소 슬러그">
            <input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="2026-summer-contest" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" required />
          </Field>

          <Field label="공모전 안내">
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={5} className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
          </Field>

          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-foreground">공모전 배너</legend>
            <div className="space-y-3">
              {bannerPreviewSource ? (
                <BannerPreview key={bannerPreviewSource} src={bannerPreviewSource} />
              ) : form.coverImage ? (
                <div className="flex aspect-[16/7] items-center justify-center rounded-md border border-border bg-background-tertiary px-5 text-center text-sm text-muted">
                  이 상대 경로 또는 URL은 운영자 화면에서 미리보기를 표시할 수 없습니다.
                </div>
              ) : null}
              <input
                value={form.coverImage}
                onChange={(event) => {
                  setBannerError('');
                  setBannerMessage('');
                  setForm({ ...form, coverImage: event.target.value });
                }}
                placeholder="업로드하면 URL이 자동으로 입력됩니다"
                maxLength={2048}
                disabled={isBannerUploading || isLoading}
                aria-label="배너 이미지 URL 직접 입력"
                aria-describedby="contest-banner-help"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className={`inline-flex h-10 cursor-pointer items-center rounded-md border border-border px-4 text-sm font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 ${(isBannerUploading || isLoading) ? 'pointer-events-none opacity-60' : ''}`}>
                  {isBannerUploading ? '배너 처리 중...' : '배너 이미지 선택'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={uploadBanner}
                    disabled={isBannerUploading || isLoading}
                    aria-describedby="contest-banner-help"
                    className="sr-only"
                  />
                </label>
                {form.coverImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setBannerError('');
                      setBannerMessage('');
                      setForm({ ...form, coverImage: '' });
                    }}
                    disabled={isBannerUploading || isLoading}
                    className="h-10 rounded-md border border-border px-3 text-sm font-semibold text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
                  >
                    배너 연결 해제
                  </button>
                )}
              </div>
              <p id="contest-banner-help" className="text-xs leading-5 text-muted">
                JPEG, PNG, WEBP · 최대 4MB · 자동 관심 영역 기준 1600×900으로 잘라 WebP로 변환합니다. 중요한 내용은 중앙 16:7 영역에 배치하세요.
              </p>
              <p className="text-xs leading-5 text-amber-300/80">
                로컬 Web 자산으로 저장되므로 공개 사이트에 반영하려면 생성 파일을 Web과 함께 배포해야 합니다. 연결을 해제해도 파일 자체는 남습니다.
              </p>
              {isBannerUploading && <p role="status" className="text-sm text-muted">배너 이미지를 처리하고 있습니다.</p>}
              {bannerMessage && <p role="status" className="text-sm text-emerald-300">{bannerMessage}</p>}
              {bannerError && <p role="alert" className="text-sm text-red-300">{bannerError}</p>}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="접수 시작">
              <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" required />
            </Field>
            <Field label="접수 종료">
              <input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" required />
            </Field>
          </div>

          <label className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">
            공모전 공개
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="submit" disabled={isLoading || isBannerUploading} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
            {isLoading ? '저장 중' : editingContest ? '수정 저장' : '공모전 생성'}
          </button>
          {editingContest && (
            <button type="button" onClick={resetForm} disabled={isLoading || isBannerUploading} className="h-10 rounded-md border border-border px-4 text-sm font-semibold text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-60">
              새로 만들기
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">공모전</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">접수 기간</th>
              <th className="px-4 py-3 font-medium">응모작</th>
              <th className="px-4 py-3 font-medium">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contests.map((contest) => {
              const status = getStatus(contest);
              return (
                <tr key={contest.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{contest.title}</p>
                    <p className="text-muted">/contests/{contest.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(contest.startsAt)}
                    <br />
                    {formatDate(contest.endsAt)}
                  </td>
                  <td className="px-4 py-3 text-muted">{contest.novelCount.toLocaleString()}개</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => editContest(contest)} disabled={isLoading || isBannerUploading} className="h-9 rounded-md border border-border px-3 text-sm font-semibold text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-60">
                      수정
                    </button>
                  </td>
                </tr>
              );
            })}
            {contests.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  아직 등록된 공모전이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function BannerPreview({ src }: { src: string }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div role="status" className="flex aspect-[16/7] items-center justify-center rounded-md border border-border bg-background-tertiary px-5 text-center text-sm text-muted">
        배너 미리보기를 불러오지 못했습니다. 로그인 상태와 이미지 URL을 확인해 주세요.
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/7] overflow-hidden rounded-md border border-border bg-background-tertiary">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="공모전 배너 미리보기"
        onError={() => setHasError(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
