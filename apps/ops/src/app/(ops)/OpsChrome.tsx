'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { BarChart3, BookOpenCheck, CalendarDays, ClipboardList, Flag, LogOut, Shield, Sparkles, UsersRound } from 'lucide-react';

const navItems = [
  { href: '/contests', label: '공모전', icon: CalendarDays },
  { href: '/', label: '대시보드', icon: BarChart3 },
  { href: '/reviews', label: '심사', icon: ClipboardList },
  { href: '/reports', label: '신고', icon: Flag },
  { href: '/novels', label: '작품', icon: BookOpenCheck },
  { href: '/users', label: '계정', icon: UsersRound },
  { href: '/ai-settings', label: 'AI 설정', icon: Sparkles },
  { href: '/audit-logs', label: '운영 로그', icon: Shield },
];

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function OpsChrome({
  children,
  userLabel,
  email,
}: {
  children: ReactNode;
  userLabel: string;
  email: string;
}) {
  const pathname = usePathname();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const logout = async () => {
    setIsSigningOut(true);
    setLogoutError('');
    try {
      await signOut({ callbackUrl: '/login' });
    } catch {
      setIsSigningOut(false);
      setLogoutError('로그아웃하지 못했습니다. 다시 시도해 주세요.');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface px-4 py-5 lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-white">NV</span>
          <span className="text-lg font-bold text-foreground">NovelVerse Ops</span>
        </Link>
        <nav className="space-y-1" aria-label="운영 메뉴">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary text-white'
                    : 'text-muted hover:bg-surface-muted hover:text-foreground'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border pt-4">
          <p className="truncate text-sm font-medium text-foreground">{userLabel}</p>
          <p className="truncate text-xs text-muted">{email}</p>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={isSigningOut}
            className="mt-3 flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {isSigningOut ? '로그아웃 중' : '로그아웃'}
          </button>
          {logoutError && <p role="alert" className="mt-2 text-xs text-rose-300">{logoutError}</p>}
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <nav className="flex min-w-0 flex-1 gap-2 overflow-x-auto lg:hidden" aria-label="모바일 운영 메뉴">
              {navItems.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-surface text-muted hover:text-foreground'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto hidden min-w-0 text-right text-sm text-muted sm:block">
              <p className="max-w-52 truncate font-medium text-foreground">{userLabel}</p>
              <p className="max-w-52 truncate">{email}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              disabled={isSigningOut}
              className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-wait disabled:opacity-60 lg:hidden"
              aria-label={isSigningOut ? '로그아웃 중' : '로그아웃'}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">{isSigningOut ? '처리 중' : '로그아웃'}</span>
            </button>
          </div>
          {logoutError && <p role="alert" className="mt-2 text-right text-xs text-rose-300 lg:hidden">{logoutError}</p>}
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
