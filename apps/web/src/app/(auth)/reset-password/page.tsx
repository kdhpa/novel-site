'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (password !== confirmation) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, token, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '비밀번호를 변경하지 못했습니다.');
      setComplete(true);
      window.history.replaceState({}, '', '/reset-password?complete=1');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '비밀번호를 변경하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  const invalidLink = !email || !token;
  return (
    <Card padding="lg">
      <h1 className="text-center text-2xl font-bold text-white">새 비밀번호 설정</h1>
      {complete ? (
        <div className="mt-6 space-y-5 text-center">
          <p role="status" className="text-emerald-300">비밀번호가 변경되었습니다. 기존 로그인은 모두 만료되었습니다.</p>
          <Link href="/login" className="text-indigo-400 hover:underline">새 비밀번호로 로그인</Link>
        </div>
      ) : invalidLink ? (
        <p role="alert" className="mt-6 text-center text-rose-300">재설정 링크가 올바르지 않습니다.</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <p role="alert" className="rounded-md border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-300">{error}</p>}
          <Input label="새 비밀번호" type="password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required />
          <Input label="새 비밀번호 확인" type="password" minLength={8} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
          <Button type="submit" isLoading={pending} fullWidth>비밀번호 변경</Button>
        </form>
      )}
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Card padding="lg"><div className="h-64 animate-pulse" /></Card>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
