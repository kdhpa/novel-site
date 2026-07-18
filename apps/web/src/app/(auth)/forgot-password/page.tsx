'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '요청을 처리하지 못했습니다.');
      const resetUrl = payload.data?.resetUrl;
      if (typeof resetUrl === 'string') {
        const parsed = new URL(resetUrl, window.location.origin);
        if (parsed.origin === window.location.origin) {
          window.location.assign(`${parsed.pathname}${parsed.search}`);
          return;
        }
      }
      setMessage('해당 이메일로 사용할 수 있는 계정이 있다면 재설정 안내를 전송했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '요청을 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card padding="lg">
      <h1 className="text-center text-2xl font-bold text-white">비밀번호 재설정</h1>
      <p className="mt-2 text-center text-sm text-zinc-400">가입한 이메일로 30분 동안 유효한 링크를 보내드립니다.</p>
      {message && <p role="status" className="mt-5 rounded-md border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-300">{message}</p>}
      {error && <p role="alert" className="mt-5 rounded-md border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-300">{error}</p>}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Input label="이메일" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <Button type="submit" isLoading={pending} fullWidth>재설정 링크 받기</Button>
      </form>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-indigo-400 hover:underline">로그인으로 돌아가기</Link></p>
    </Card>
  );
}
