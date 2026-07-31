'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@novelverse/db/browser';

export default function UserRoleForm({
  userId,
  role,
  isVerifiedAuthor,
  canSkipReview,
  suspendedAt,
  suspensionReason,
}: {
  userId: string;
  role: Role;
  isVerifiedAuthor: boolean;
  canSkipReview: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
}) {
  const router = useRouter();
  const [nextRole, setNextRole] = useState<Role>(role);
  const [verified, setVerified] = useState(isVerifiedAuthor);
  const [reviewExempt, setReviewExempt] = useState(canSkipReview);
  const [isLoading, setIsLoading] = useState(false);

  async function save() {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/ops/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: nextRole,
          isVerifiedAuthor: verified,
          canSkipReview: nextRole === 'AUTHOR' && reviewExempt,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        window.alert(result.error || '계정 변경에 실패했습니다.');
        return;
      }

      router.refresh();
    } catch {
      window.alert('계정 변경 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleSuspension() {
    if (isLoading) return;
    const suspended = !suspendedAt;
    const reason = suspended
      ? window.prompt('계정 정지 사유를 입력해 주세요. (최대 500자)', '')
      : null;
    if (suspended && !reason?.trim()) return;
    if (!suspended && !window.confirm('이 계정의 정지를 해제할까요?')) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/ops/users/${userId}/suspension`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspended, ...(suspended ? { reason } : {}) }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        window.alert(result.error || '계정 정지 상태 변경에 실패했습니다.');
        return;
      }
      router.refresh();
    } catch {
      window.alert('계정 정지 상태 변경 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={nextRole}
        onChange={(event) => {
          const selectedRole = event.target.value as Role;
          setNextRole(selectedRole);
          if (selectedRole !== 'AUTHOR') setReviewExempt(false);
        }}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
      >
        <option value="USER">사용자</option>
        <option value="AUTHOR">작가</option>
        <option value="ADMIN">관리자</option>
      </select>
      <label className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-2 text-sm text-muted">
        <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
        인증 작가
      </label>
      <label className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={nextRole === 'AUTHOR' && reviewExempt}
          disabled={nextRole !== 'AUTHOR'}
          onChange={(event) => setReviewExempt(event.target.checked)}
        />
        수정 재심사 면제
      </label>
      <button type="button" onClick={save} disabled={isLoading} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
        저장
      </button>
      <button
        type="button"
        onClick={toggleSuspension}
        disabled={isLoading}
        title={suspensionReason || undefined}
        className={`h-9 rounded-md px-3 text-sm font-semibold disabled:opacity-60 ${suspendedAt ? 'bg-emerald-700 text-white hover:bg-emerald-600' : 'bg-red-700 text-white hover:bg-red-600'}`}
      >
        {suspendedAt ? '정지 해제' : '계정 정지'}
      </button>
    </div>
  );
}
