'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Suspense } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

function resolveOpsRedirect(candidate: string | null | undefined, fallback: string) {
  const fallbackUrl = new URL(fallback, window.location.origin);
  const safeFallback = fallbackUrl.origin === window.location.origin
    ? fallbackUrl
    : new URL('/', window.location.origin);

  if (!candidate) return safeFallback.toString();

  const candidateUrl = new URL(candidate, window.location.origin);
  return candidateUrl.origin === window.location.origin
    ? candidateUrl.toString()
    : safeFallback.toString();
}

function OpsLoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<{ credentials: boolean; google: boolean } | null>(null);
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  useEffect(() => {
    getProviders()
      .then((available) => setProviders({
        credentials: Boolean(available?.credentials),
        google: Boolean(available?.google),
      }))
      .catch(() => setProviders({ credentials: false, google: false }));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError('로그인 정보를 확인해 주세요.');
        return;
      }

      window.location.assign(resolveOpsRedirect(result?.url, callbackUrl));
    } catch {
      setError('로그인 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-6">
          <p className="text-sm font-semibold text-primary">NovelVerse Ops</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">운영 사이트 로그인</h1>
        </div>

        {searchParams.get('error') === 'AccessDenied' && (
          <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            관리자 권한이 필요합니다.
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {providers?.google && (
          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl })}
            className="mb-5 h-11 w-full rounded-md border border-border bg-background text-sm font-semibold text-foreground transition-colors hover:border-primary"
          >
            Google SSO로 로그인
          </button>
        )}

        {providers?.credentials && <form onSubmit={handleSubmit}>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-foreground">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-primary"
            required
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1 block text-sm font-medium text-foreground">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-primary"
            required
          />
        </label>

        <button
          type="submit"
          disabled={isLoading}
          className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? '로그인 중...' : '로그인'}
        </button>
        </form>}

        {providers && !providers.google && !providers.credentials && (
          <p className="text-sm text-red-200">사용 가능한 로그인 공급자가 없습니다. 운영 설정을 확인해 주세요.</p>
        )}
        <p className="mt-5 text-xs leading-5 text-muted">운영 계정은 조직에서 관리하는 MFA 적용 Google SSO 사용을 권장합니다.</p>
      </div>
    </main>
  );
}

export default function OpsLoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-background text-muted">로딩 중...</main>}>
      <OpsLoginForm />
    </Suspense>
  );
}
