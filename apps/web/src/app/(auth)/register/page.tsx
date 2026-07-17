'use client';

import { useEffect, useRef, useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

const GOOGLE_PROVIDER_CACHE_KEY = 'novelverse:google-provider-available';
let googleProviderRequest: Promise<boolean> | undefined;

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

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasGoogleProvider, setHasGoogleProvider] = useState(false);
  const [credentialsEnabled, setCredentialsEnabled] = useState<boolean | null>(null);
  const submissionInFlightRef = useRef(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    nickname: '',
  });

  useEffect(() => {
    let mounted = true;

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
        if (mounted) setCredentialsEnabled(payload.data?.enabled === true);
      })
      .catch(() => {
        if (mounted) setCredentialsEnabled(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submissionInFlightRef.current) return;

    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    submissionInFlightRef.current = true;
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          nickname: formData.nickname,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '회원가입에 실패했습니다.');
        return;
      }

      const fallback = `/verify-email?${new URLSearchParams({
        email: formData.email,
        sent: '1',
      })}`;
      const verificationUrl = data.data?.verificationUrl;
      if (typeof verificationUrl === 'string') {
        const parsed = new URL(verificationUrl, window.location.origin);
        router.push(parsed.origin === window.location.origin
          ? `${parsed.pathname}${parsed.search}`
          : fallback);
      } else {
        router.push(fallback);
      }
    } catch {
      setError('회원가입 중 오류가 발생했습니다.');
    } finally {
      submissionInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: '/' });
  };

  return (
    <Card padding="lg">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          회원가입
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          NovelVerse에서 이야기를 시작하세요.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {credentialsEnabled === false && (
        <p role="status" className="mb-4 rounded-md border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-300">
          현재 이메일 회원가입이 비활성화되어 있습니다. Google 가입을 이용해 주세요.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="이메일"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="이메일 주소를 입력하세요"
          required
        />

        <Input
          label="닉네임"
          value={formData.nickname}
          onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
          placeholder="2~20자"
          helperText="다른 사용자에게 표시되는 이름입니다."
          required
        />

        <Input
          label="비밀번호"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="8자 이상"
          helperText="8자 이상 입력해주세요."
          required
        />

        <Input
          label="비밀번호 확인"
          type="password"
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          placeholder="비밀번호를 다시 입력"
          required
        />

        <Button type="submit" isLoading={isLoading} disabled={credentialsEnabled !== true} fullWidth>
          회원가입
        </Button>
        <p className="text-xs leading-5 text-zinc-500">
          가입 후 이메일 인증을 완료해야 비밀번호로 로그인할 수 있습니다.
        </p>
      </form>

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

          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={handleGoogleSignIn}
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google로 가입
          </Button>
        </>
      )}

      <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
          로그인
        </Link>
      </p>
    </Card>
  );
}
