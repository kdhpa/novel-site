'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  BookOpen,
  ChevronDown,
  CheckCircle2,
  Hash,
  Library,
  Megaphone,
  PenLine,
  Search,
  Sparkles,
  Trophy,
} from 'lucide-react';
import Button from '@/components/ui/Button';

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
}

const navItems: NavItem[] = [
  { key: 'novels', label: '\uC6F9\uC18C\uC124', href: '/novels', icon: <BookOpen className="h-4 w-4" /> },
  { key: 'rankings', label: '\uB7AD\uD0B9', href: '/rankings', icon: <Trophy className="h-4 w-4" /> },
  { key: 'new', label: '\uC2E0\uC791', href: '/novels/new-releases', icon: <Sparkles className="h-4 w-4" /> },
  { key: 'completed', label: '\uC644\uACB0', href: '/novels?status=COMPLETED', icon: <CheckCircle2 className="h-4 w-4" /> },
  { key: 'tags', label: '\uD0A4\uC6CC\uB4DC', href: '/tags', icon: <Hash className="h-4 w-4" /> },
];

type OpenSeason = {
  id: string;
  slug: string;
  title: string;
};

let openContestsPromise: Promise<OpenSeason[]> | null = null;

function getOpenContests() {
  if (!openContestsPromise) {
    openContestsPromise = fetch('/api/seasons/open')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) return [];
        return (result.data.items || []) as OpenSeason[];
      })
      .catch((error) => {
        openContestsPromise = null;
        throw error;
      });
  }

  return openContestsPromise;
}

function hrefMatchesSearch(href: string, pathname: string, searchParams: URLSearchParams) {
  const [base, queryString] = href.split('?');
  if (pathname !== base) return false;
  if (!queryString) return true;

  const hrefParams = new URLSearchParams(queryString);
  return Array.from(hrefParams.entries()).every(([key, value]) => searchParams.get(key) === value);
}

function getActiveNavKey(pathname: string, searchParams: URLSearchParams, items: NavItem[]) {
  const queryMatch = items.find((item) => item.href.includes('?') && hrefMatchesSearch(item.href, pathname, searchParams));
  if (queryMatch) return queryMatch.key;

  const pathOnlyMatch = items
    .filter((item) => !item.href.includes('?'))
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => {
      if (item.href === '/') return pathname === '/';
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    });

  return pathOnlyMatch?.key;
}

export default function Header() {
  const { data: session, status } = useSession();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ type: string; label: string; href: string }>>([]);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [contestNavItems, setContestNavItems] = useState<NavItem[]>([]);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchListboxId = useId();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const isReaderPage = /\/novels\/[^/]+\/[^/]+$/.test(pathname);

  const mergedNavItems = useMemo(() => {
    const [novels, ...rest] = navItems;
    return [novels, ...contestNavItems, ...rest];
  }, [contestNavItems]);
  const visibleNavItems = useMemo(
    () => mergedNavItems.filter((item) => item.key !== 'library' || session?.user),
    [mergedNavItems, session]
  );
  const activeNavKey = useMemo(
    () => getActiveNavKey(pathname, searchParams, visibleNavItems),
    [pathname, searchParams, visibleNavItems]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOpenContests() {
      try {
        const seasons = await getOpenContests();
        if (cancelled) return;
        setContestNavItems(
          seasons.map((season) => ({
            key: `contest-${season.id}`,
            label: season.title,
            href: `/contests/${season.slug}`,
            icon: <Megaphone className="h-4 w-4" />,
          }))
        );
      } catch {
        if (!cancelled) setContestNavItems([]);
      }
    }

    loadOpenContests();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (result.success) {
          setSuggestions(result.data.items || []);
          setIsSuggestOpen((result.data.items || []).length > 0);
          setActiveSuggestionIndex(-1);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setIsSuggestOpen(false);
          setActiveSuggestionIndex(-1);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!searchContainerRef.current?.contains(event.target as Node)) {
        setIsSuggestOpen(false);
        setActiveSuggestionIndex(-1);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const handleSearch = () => {
    const query = searchQuery.trim();
    if (!query) return;
    setIsSuggestOpen(false);
    setActiveSuggestionIndex(-1);
    router.push(`/novels?search=${encodeURIComponent(query)}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setIsSuggestOpen(true);
      setActiveSuggestionIndex((index) => (index + 1) % suggestions.length);
      return;
    }

    if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setIsSuggestOpen(true);
      setActiveSuggestionIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const activeSuggestion = isSuggestOpen ? suggestions[activeSuggestionIndex] : undefined;
      if (activeSuggestion) {
        setIsSuggestOpen(false);
        setActiveSuggestionIndex(-1);
        router.push(activeSuggestion.href);
      } else {
        handleSearch();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsSuggestOpen(false);
      setActiveSuggestionIndex(-1);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[68px] items-center justify-between gap-4">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label={'\u004EovelVerse \uD648'}>
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-white shadow-[0_10px_22px_rgba(47,157,143,0.18)] transition-transform duration-300 group-hover:-translate-y-0.5">
              NV
            </span>
            <span className="hidden text-xl font-bold text-white sm:inline">
              Novel<span className="text-accent">Verse</span>
            </span>
          </Link>

          <div className="hidden min-w-0 flex-1 items-center justify-center xl:flex">
            <nav className="flex max-w-full items-center gap-5 overflow-x-auto px-3 hide-scrollbar" aria-label="주요 메뉴">
              {visibleNavItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`inline-flex h-[68px] min-w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-1 text-sm font-semibold transition-all duration-300 ${
                    activeNavKey === item.key
                      ? 'border-accent text-white'
                      : 'border-transparent text-zinc-500 hover:-translate-y-px hover:text-zinc-200'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="hidden w-full max-w-md md:block">
            <div ref={searchContainerRef} className="relative">
              <label htmlFor={`${searchListboxId}-input`} className="sr-only">
                작품, 작가, 키워드 검색
              </label>
              <input
                id={`${searchListboxId}-input`}
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isSuggestOpen && suggestions.length > 0}
                aria-controls={searchListboxId}
                aria-activedescendant={activeSuggestionIndex >= 0 ? `${searchListboxId}-option-${activeSuggestionIndex}` : undefined}
                placeholder={'\uC791\uD488, \uC791\uAC00, \uD0A4\uC6CC\uB4DC \uAC80\uC0C9'}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim().length < 2) {
                    setSuggestions([]);
                    setIsSuggestOpen(false);
                    setActiveSuggestionIndex(-1);
                  }
                }}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0) setIsSuggestOpen(true);
                }}
                className="h-11 w-full rounded-md border border-border bg-background-secondary/90 py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition-all duration-300 focus:border-primary focus:shadow-[0_0_0_3px_rgba(47,157,143,0.12)]"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-accent"
                aria-label={'\uAC80\uC0C9'}
              >
                <Search className="h-5 w-5" />
              </button>

              {isSuggestOpen && suggestions.length > 0 && (
                <div
                  id={searchListboxId}
                  role="listbox"
                  aria-label="검색 제안"
                  className="absolute left-0 right-0 top-12 overflow-hidden rounded-md border border-border bg-background-secondary shadow-xl"
                >
                  {suggestions.map((item, index) => (
                    <Link
                      key={`${item.type}-${item.href}`}
                      id={`${searchListboxId}-option-${index}`}
                      href={item.href}
                      role="option"
                      aria-selected={activeSuggestionIndex === index}
                      className={`flex items-center justify-between px-4 py-3 text-sm transition-colors ${
                        activeSuggestionIndex === index
                          ? 'bg-background-tertiary text-white'
                          : 'text-zinc-300 hover:bg-background-tertiary hover:text-white'
                      }`}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      onClick={() => {
                        setIsSuggestOpen(false);
                        setActiveSuggestionIndex(-1);
                      }}
                    >
                      <span className="line-clamp-1">{item.label}</span>
                      <span className="ml-3 shrink-0 text-xs text-zinc-500">{item.type}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {session?.user && (
              <>
                <Link
                  href="/library"
                  className="hidden h-10 min-w-fit items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-muted hover:text-white lg:inline-flex"
                >
                  <Library className="h-4 w-4" />
                  {'\uC11C\uC7AC'}
                </Link>
                <Link
                  href="/dashboard"
                  className="hidden h-10 min-w-fit items-center gap-2 rounded-md bg-background-tertiary px-3 text-sm font-semibold text-zinc-200 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#2a2e31] lg:inline-flex"
                >
                  <PenLine className="h-4 w-4" />
                  {'\uC791\uAC00\uC13C\uD130'}
                </Link>
              </>
            )}

            {status === 'loading' ? (
              <div className="h-9 w-9 animate-pulse rounded-full bg-background-tertiary" />
            ) : session ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen((value) => !value)}
                  className="flex h-10 items-center gap-2 rounded-md border border-transparent p-1 pr-2 transition-colors hover:border-border hover:bg-background-tertiary"
                  aria-expanded={isUserMenuOpen}
                  aria-label={'\uC0AC\uC6A9\uC790 \uBA54\uB274'}
                >
                  {session.user.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.nickname || session.user.name || '\uC0AC\uC6A9\uC790'}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-md object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-sm font-semibold text-white">
                      {(session.user.nickname || session.user.name || '사')[0].toUpperCase()}
                    </div>
                  )}
                  <ChevronDown className="hidden h-4 w-4 text-zinc-500 sm:block" />
                </button>

                {isUserMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsUserMenuOpen(false)} />
                    <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-md border border-border bg-background-secondary shadow-xl">
                      <div className="border-b border-border px-4 py-3">
                        <p className="line-clamp-1 text-sm font-semibold text-white">
                          {session.user.nickname || session.user.name || '\uC0AC\uC6A9\uC790'}
                        </p>
                        <p className="line-clamp-1 text-xs text-zinc-500">{session.user.email}</p>
                      </div>
                      <Link href="/library" className="block px-4 py-2.5 text-sm text-zinc-300 hover:bg-background-tertiary" onClick={() => setIsUserMenuOpen(false)}>
                        {'\uB0B4 \uC11C\uC7AC'}
                      </Link>
                      <Link href="/dashboard" className="block px-4 py-2.5 text-sm text-zinc-300 hover:bg-background-tertiary" onClick={() => setIsUserMenuOpen(false)}>
                        {'\uC791\uAC00\uC13C\uD130'}
                      </Link>
                      <Link href="/novels/new" className="block px-4 py-2.5 text-sm text-zinc-300 hover:bg-background-tertiary" onClick={() => setIsUserMenuOpen(false)}>
                        {'\uC0C8 \uC791\uD488 \uB4F1\uB85D'}
                      </Link>
                      <Link href="/settings" className="block px-4 py-2.5 text-sm text-zinc-300 hover:bg-background-tertiary" onClick={() => setIsUserMenuOpen(false)}>
                        계정 설정
                      </Link>
                      {session?.user.role === 'ADMIN' && process.env.NEXT_PUBLIC_OPS_URL && (
                        <a href={`${process.env.NEXT_PUBLIC_OPS_URL.replace(/\/$/, '')}/reviews`} className="block px-4 py-2.5 text-sm text-zinc-300 hover:bg-background-tertiary" onClick={() => setIsUserMenuOpen(false)}>
                          {'\uAD00\uB9AC\uC790 \uC2EC\uC0AC'}
                        </a>
                      )}
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          signOut({ callbackUrl: '/' });
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-rose-300 hover:bg-background-tertiary"
                      >
                        {'\uB85C\uADF8\uC544\uC6C3'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">{'\uB85C\uADF8\uC778'}</Button>
                </Link>
                <Link href="/register" className="hidden sm:block">
                  <Button size="sm">{'\uD68C\uC6D0\uAC00\uC785'}</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isReaderPage && (
        <div className="border-t border-border xl:hidden">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 hide-scrollbar sm:px-6 lg:px-8">
            {visibleNavItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`inline-flex min-h-10 min-w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-4 text-sm font-semibold transition-all duration-300 ${
                  activeNavKey === item.key
                    ? 'bg-primary text-white'
                    : 'border border-border bg-background-secondary text-zinc-400 hover:border-accent-muted hover:text-white'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
