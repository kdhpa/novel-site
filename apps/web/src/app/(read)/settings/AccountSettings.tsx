'use client';

import { FormEvent, useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { normalizeIdentityEmail } from '@novelverse/shared';

export default function AccountSettings({
  email,
  hasPassword,
  initialDeletionToken = '',
  initialExportToken = '',
}: {
  email: string;
  hasPassword: boolean;
  initialDeletionToken?: string;
  initialExportToken?: string;
}) {
  const [emailConfirmation, setEmailConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [deletionToken, setDeletionToken] = useState(initialDeletionToken);
  const [exportToken, setExportToken] = useState(initialExportToken);
  const [exportPassword, setExportPassword] = useState('');
  const [exportRequestPending, setExportRequestPending] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [exportError, setExportError] = useState('');
  const [requestPending, setRequestPending] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if ((initialDeletionToken || initialExportToken) && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [initialDeletionToken, initialExportToken]);

  async function requestExportConfirmation() {
    if (exportRequestPending || exportPending) return;
    setExportRequestPending(true);
    setExportMessage('');
    setExportError('');
    try {
      const response = await fetch('/api/user/export/request', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || '내보내기 확인 메일을 요청하지 못했습니다.');
      }
      setExportMessage(payload.data?.message || '내보내기 확인 메일을 전송했습니다.');
      if (payload.data?.exportUrl) {
        const token = new URL(payload.data.exportUrl).searchParams.get('exportToken');
        if (token) setExportToken(token);
      }
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : '내보내기 확인 메일을 요청하지 못했습니다.');
    } finally {
      setExportRequestPending(false);
    }
  }

  async function downloadData() {
    if (exportPending) return;
    setExportPending(true);
    setExportError('');
    try {
      const response = await fetch('/api/user/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: exportToken,
          ...(hasPassword ? { password: exportPassword } : {}),
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || '데이터를 내보내지 못했습니다.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `novelverse-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setExportToken('');
      setExportPassword('');
      setExportMessage('데이터 내보내기를 시작했습니다.');
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : '데이터를 내보내지 못했습니다.');
    } finally {
      setExportPending(false);
    }
  }

  async function requestDeletionConfirmation() {
    if (requestPending || pending) return;
    setRequestPending(true);
    setRequestMessage('');
    setError('');
    try {
      const response = await fetch('/api/user/delete-account/request', {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || '삭제 확인 메일을 요청하지 못했습니다.');
      }
      setRequestMessage(payload.data?.message || '삭제 확인 메일을 전송했습니다.');
      if (payload.data?.deletionUrl) {
        const token = new URL(payload.data.deletionUrl).searchParams.get('deleteToken');
        if (token) setDeletionToken(token);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '삭제 확인 메일을 요청하지 못했습니다.');
    } finally {
      setRequestPending(false);
    }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/user/delete-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          emailConfirmation,
          token: deletionToken,
          ...(hasPassword ? { password } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '계정을 삭제하지 못했습니다.');
      await signOut({ callbackUrl: '/' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '계정을 삭제하지 못했습니다.');
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-12 sm:px-6">
      <header>
        <h1 className="text-3xl font-bold text-white">계정 설정</h1>
        <p className="mt-2 text-zinc-400">개인 데이터 사본을 받거나 계정을 영구 삭제할 수 있습니다.</p>
      </header>

      <section className="rounded-lg border border-border bg-background-secondary p-6">
        <h2 className="text-lg font-semibold text-white">내 데이터 내보내기</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          프로필, 작성 작품과 회차, 서재·좋아요·댓글·리뷰, AI 작업 기록을 JSON 파일로 받습니다.
        </p>
        <div className="mt-5 space-y-4">
          {exportError && <p role="alert" className="rounded-md border border-rose-800 bg-rose-950/60 p-3 text-sm text-rose-300">{exportError}</p>}
          {exportMessage && <p role="status" className="rounded-md border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">{exportMessage}</p>}
          <Button
            type="button"
            variant="outline"
            isLoading={exportRequestPending}
            disabled={exportPending}
            onClick={requestExportConfirmation}
          >
            내보내기 확인 메일 받기
          </Button>
          <Input
            label="이메일로 받은 내보내기 확인 토큰"
            type="text"
            autoComplete="off"
            minLength={32}
            maxLength={128}
            value={exportToken}
            onChange={(event) => setExportToken(event.target.value.trim())}
            helperText="메일의 확인 링크로 들어오면 자동으로 입력됩니다. 토큰은 10분 동안 한 번만 사용할 수 있습니다."
            required
          />
          {hasPassword && (
            <Input
              label="현재 비밀번호"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={exportPassword}
              onChange={(event) => setExportPassword(event.target.value)}
              required
            />
          )}
          <Button
            type="button"
            isLoading={exportPending}
            disabled={exportToken.length < 32 || (hasPassword && !exportPassword)}
            onClick={downloadData}
          >
            데이터 다운로드
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-rose-900/70 bg-rose-950/20 p-6">
        <h2 className="text-lg font-semibold text-rose-200">계정 영구 삭제</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          계정과 연결된 작품·회차·댓글·리뷰·서재 데이터는 삭제되며 되돌릴 수 없습니다.
          신고 당시의 제한된 원문과 보안 감사 기록은 계정 연결 식별자를 제거하고 관리자 제한 접근 상태로 처리방침 기간 동안 보존될 수 있습니다.
        </p>
        <form onSubmit={deleteAccount} className="mt-5 space-y-4">
          {error && <p role="alert" className="rounded-md border border-rose-800 bg-rose-950/60 p-3 text-sm text-rose-300">{error}</p>}
          {requestMessage && <p role="status" className="rounded-md border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">{requestMessage}</p>}
          <Button
            type="button"
            variant="outline"
            isLoading={requestPending}
            disabled={pending}
            onClick={requestDeletionConfirmation}
          >
            계정 삭제 확인 메일 받기
          </Button>
          <Input
            label="이메일로 받은 삭제 확인 토큰"
            type="text"
            autoComplete="off"
            minLength={32}
            maxLength={128}
            value={deletionToken}
            onChange={(event) => setDeletionToken(event.target.value.trim())}
            helperText="메일의 확인 링크로 들어오면 자동으로 입력됩니다. 토큰은 10분 동안 한 번만 사용할 수 있습니다."
            required
          />
          <Input
            label={`확인을 위해 ${email} 입력`}
            type="email"
            autoComplete="email"
            value={emailConfirmation}
            onChange={(event) => setEmailConfirmation(event.target.value)}
            required
          />
          {hasPassword && (
            <Input
              label="현재 비밀번호"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          )}
          <Button
            type="submit"
            variant="danger"
            isLoading={pending}
            disabled={
              deletionToken.length < 32
              || normalizeIdentityEmail(emailConfirmation) !== normalizeIdentityEmail(email)
              || (hasPassword && !password)
            }
          >
            계정과 데이터 영구 삭제
          </Button>
        </form>
      </section>
    </div>
  );
}
