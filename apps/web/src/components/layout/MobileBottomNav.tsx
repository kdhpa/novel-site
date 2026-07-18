'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { BookOpen, Home, Library, Search, Trophy, UserCircle } from 'lucide-react';

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (/\/novels\/[^/]+\/[^/]+$/.test(pathname)) {
    return null;
  }

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const navItems = [
    { href: '/', label: '홈', icon: <Home className="h-5 w-5" /> },
    { href: '/rankings', label: '랭킹', icon: <Trophy className="h-5 w-5" /> },
    { href: '/novels', label: '검색', icon: <Search className="h-5 w-5" /> },
    { href: '/library', label: '서재', icon: <Library className="h-5 w-5" /> },
    {
      href: session ? '/dashboard' : '/login',
      label: session ? '작가센터' : '로그인',
      icon: session ? <BookOpen className="h-5 w-5" /> : <UserCircle className="h-5 w-5" />,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-safe md:hidden" aria-label="모바일 하단 메뉴">
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex h-full w-full flex-col items-center justify-center gap-1 border-t-2 transition-colors ${
              isActive(item.href) ? 'border-accent text-accent' : 'border-transparent text-zinc-500 hover:text-zinc-200'
            }`}
          >
            {item.icon}
            <span className="text-[11px] font-medium leading-none">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
