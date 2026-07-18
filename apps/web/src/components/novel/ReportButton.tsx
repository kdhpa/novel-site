'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Button from '@/components/ui/Button';

const reasons = [
  ['spam', '스팸·도배'],
  ['harassment', '괴롭힘·혐오'],
  ['copyright', '저작권 침해'],
  ['privacy', '개인정보 노출'],
  ['other', '기타'],
] as const;

export default function ReportButton({
  targetType,
  targetId,
}: {
  targetType: 'comment' | 'review';
  targetId: string;
}) {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof reasons)[number][0]>('spam');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, reason, details }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || '신고를 접수하지 못했습니다.');
      setOpen(false);
      setDetails('');
      window.alert('신고가 접수되었습니다.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '신고를 접수하지 못했습니다.');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (status !== 'authenticated') {
            window.alert('신고하려면 로그인해 주세요.');
            return;
          }
          setOpen(true);
        }}
        className="inline-flex min-h-9 items-center rounded-md px-3 text-xs font-medium text-zinc-500 hover:bg-background-tertiary hover:text-zinc-200"
      >
        신고
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby={`report-${targetId}`}>
          <div className="w-full max-w-md rounded-lg border border-border bg-background-secondary p-5 shadow-2xl">
            <h2 id={`report-${targetId}`} className="text-lg font-bold text-white">콘텐츠 신고</h2>
            <label className="mt-4 block text-sm text-zinc-300">
              사유
              <select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3">
                {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-sm text-zinc-300">
              상세 설명 (선택)
              <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1000} rows={4} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            {error && <p className="mt-2 text-sm text-rose-300" role="alert">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소</Button>
              <Button type="button" onClick={() => void submit()} isLoading={pending}>신고 접수</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
