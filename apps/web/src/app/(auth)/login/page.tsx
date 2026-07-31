'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

const GOOGLE_PROVIDER_CACHE_KEY = 'novelverse:google-provider-available';
let googleProviderRequest: Promise<boolean> | undefined;

function resolveSafeCallbackPath(candidate: string | null | undefined) {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return '/';

  try {
    const url = new URL(candidate, 'https://novelverse.local');
    if (url.origin !== 'https://novelverse.local') return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function loadGoogleProviderAvailability() {
  try {
    const cached = window.sessionStorage.getItem(GOOGLE_PROVIDER_CACHE_KEY);
    if (cached !== null) return Promise.resolve(cached === 'true');
  } catch {
    // Continue without browser storage when it is unavailable.
  }

  if (!googleProviderRequest) {
    googleProviderRequest = getProviders()
      .then((providers) => {
        const hostname = window.location.hostname;
        const isLanIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) && hostname !== '127.0.0.1';
        const isAvailable = Boolean(providers?.google) && !isLanIp;

        try {
          window.sessionStorage.setItem(GOOGLE_PROVIDER_CACHE_KEY, String(isAvailable));
        } catch {
          // Availability can still be used for this render without caching it.
        }

        return isAvailable;
      })
      .finally(() => {
        googleProviderRequest = undefined;
      });
  }

  return googleProviderRequest;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = resolveSafeCallbackPath(searchParams.get('callbackUrl'));
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasGoogleProvider, setHasGoogleProvider] = useState(false);
  const [emailRecoveryEnabled, setEmailRecoveryEnabled] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const submissionInFlightRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    setIsHydrated(true);

    loadGoogleProviderAvailability()
      .then((isAvailable) => {
        if (mounted) setHasGoogleProvider(isAvailable);
      })
      .catch(() => {
        if (mounted) setHasGoogleProvider(false);
      });

    fetch('/api/auth/register', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (mounted) setEmailRecoveryEnabled(payload.data?.enabled === true);
      })
      .catch(() => {
        if (mounted) setEmailRecoveryEnabled(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submissionInFlightRef.current) return;

    submissionInFlightRef.current = true;
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        setError('이메일 또는 비밀번호가 일치하지 않습니다.');
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      submissionInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl });
  };

  return (
    <Card padding="lg">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">로그인</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          NovelVerse에 다시 오신 것을 환영합니다.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="이메일"
          type="email"
          value={formData.email}
          onChange={(event) => setFormData({ ...formData, email: event.target.value })}
          placeholder="이메일 주소를 입력하세요"
          disabled={!isHydrated || isLoading}
          required
        />

        <Input
          label="비밀번호"
          type="password"
          value={formData.password}
          onChange={(event) => setFormData({ ...formData, password: event.target.value })}
          placeholder="********"
          disabled={!isHydrated || isLoading}
          required
        />

        <Button type="submit" isLoading={isLoading} disabled={!isHydrated} fullWidth>
          로그인
        </Button>
      </form>

      {emailRecoveryEnabled && (
        <div className="mt-3 flex justify-between text-sm">
          <Link href="/verify-email" className="text-zinc-500 hover:text-zinc-300 hover:underline">
            인증 메일 재전송
          </Link>
          <Link href="/forgot-password" className="text-indigo-600 dark:text-indigo-400 hover:underline">
            비밀번호를 잊으셨나요?
          </Link>
        </div>
      )}

      {hasGoogleProvider && (
        <>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">또는</span>
            </div>
          </div>

          <Button type="button" variant="outline" fullWidth onClick={handleGoogleSignIn}>
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google로 로그인
          </Button>
        </>
      )}

      <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
        계정이 없으신가요?{' '}
        <Link href="/register" className="text-indigo-600 dark:text-indigo-400 hover:underline">
          회원가입
        </Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Card padding="lg"><div className="h-80 animate-pulse" /></Card>}>
      <LoginForm />
    </Suspense>
  );
}
