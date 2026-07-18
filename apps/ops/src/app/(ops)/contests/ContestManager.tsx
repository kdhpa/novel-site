'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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

export default function ContestManager({ contests }: { contests: ContestRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContestFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(false);

  const editingContest = contests.find((contest) => contest.id === editingId);

  function editContest(contest: ContestRow) {
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
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isLoading) return;
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

          <Field label="배너 이미지 URL">
            <input
              value={form.coverImage}
              onChange={(event) => setForm({ ...form, coverImage: event.target.value })}
              placeholder="설정된 영구 이미지 저장소 URL"
              maxLength={2048}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </Field>

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
          <button type="submit" disabled={isLoading} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
            {isLoading ? '저장 중' : editingContest ? '수정 저장' : '공모전 생성'}
          </button>
          {editingContest && (
            <button type="button" onClick={resetForm} disabled={isLoading} className="h-10 rounded-md border border-border px-4 text-sm font-semibold text-muted hover:bg-surface-muted hover:text-foreground">
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
                    <button type="button" onClick={() => editContest(contest)} className="h-9 rounded-md border border-border px-3 text-sm font-semibold text-muted hover:bg-surface-muted hover:text-foreground">
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
