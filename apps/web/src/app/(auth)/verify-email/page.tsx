'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(
    searchParams.get('sent') === '1' ? '인증 이메일을 보냈습니다. 받은편지함을 확인해 주세요.' : '',
  );
  const [verified, setVerified] = useState(false);

  async function verify() {
    if (!token || !email || pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, token }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '이메일 인증에 실패했습니다.');
      setVerified(true);
      setMessage('이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.');
      window.history.replaceState({}, '', '/verify-email?verified=1');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '이메일 인증에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  async function resend(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '인증 이메일을 전송하지 못했습니다.');
      const verificationUrl = payload.data?.verificationUrl;
      if (typeof verificationUrl === 'string') {
        const parsed = new URL(verificationUrl, window.location.origin);
        if (parsed.origin === window.location.origin) {
          window.location.assign(`${parsed.pathname}${parsed.search}`);
          return;
        }
      }
      setMessage('가입한 이메일이라면 인증 안내를 전송했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '인증 이메일을 전송하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card padding="lg">
      <h1 className="text-center text-2xl font-bold text-white">이메일 인증</h1>
      <p className="mt-2 text-center text-sm text-zinc-400">
        이메일 주소를 확인해야 비밀번호 로그인을 사용할 수 있습니다.
      </p>

      {message && <p role="status" className="mt-5 rounded-md border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-300">{message}</p>}
      {error && <p role="alert" className="mt-5 rounded-md border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-300">{error}</p>}

      {token && !verified ? (
        <div className="mt-6 space-y-4">
          <p className="break-all text-sm text-zinc-400">{email}</p>
          <Button type="button" onClick={verify} isLoading={pending} fullWidth>
            이메일 인증 완료하기
          </Button>
        </div>
      ) : !verified ? (
        <form onSubmit={resend} className="mt-6 space-y-4">
          <Input
            label="가입 이메일"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Button type="submit" isLoading={pending} fullWidth>인증 메일 재전송</Button>
        </form>
      ) : null}

      <p className="mt-6 text-center text-sm text-zinc-500">
        <Link href="/login" className="text-indigo-400 hover:underline">로그인으로 돌아가기</Link>
      </p>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Card padding="lg"><div className="h-64 animate-pulse" /></Card>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
