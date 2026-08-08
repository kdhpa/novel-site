'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Dialog } from '@headlessui/react';
import { isOptimizableImageSource } from '@/lib/image-hosts';
import { ArrowLeft, ChevronLeft, ChevronRight, List, Minus, Plus, Settings, X } from 'lucide-react';
import CommentSection from '@/components/novel/CommentSection';
import {
  accumulateNextChapterScroll,
  isPageAtBottom,
  NEXT_CHAPTER_SCROLL_THRESHOLD,
  NEXT_CHAPTER_TOUCH_THRESHOLD,
} from '@/lib/reader-navigation';

interface ReaderChapter {
  id: string;
  title: string;
  content: string;
  chapterNumber: number;
  aiImage?: string | null;
  aiImagePrompt?: string | null;
}

interface ReaderProps {
  novelId: string;
  chapter: ReaderChapter;
  prevChapterId?: string;
  nextChapterId?: string;
  commentsEnabled?: boolean;
}

type ReaderTheme = 'dark' | 'light' | 'sepia';

const DEFAULT_FONT_SIZE = 18;
const DEFAULT_LINE_HEIGHT = 1.8;
const DEFAULT_CONTENT_WIDTH = 720;
const READER_SETTINGS_EVENT = 'reader-settings-change';

function readNumber(key: string, fallback: number, min: number, max: number) {
  if (typeof window === 'undefined') return fallback;
  const storedValue = localStorage.getItem(key);
  if (storedValue === null) return fallback;

  const value = Number(storedValue);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function readTheme(): ReaderTheme {
  if (typeof window === 'undefined') return 'dark';
  const value = localStorage.getItem('reader-theme');
  return value === 'light' || value === 'sepia' || value === 'dark' ? value : 'dark';
}

function readBool(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback;
  const value = localStorage.getItem(key);
  return value === null ? fallback : value === 'true';
}

function subscribeToReaderSettings(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(READER_SETTINGS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(READER_SETTINGS_EVENT, onStoreChange);
  };
}

function notifyReaderSettingsChanged() {
  window.dispatchEvent(new Event(READER_SETTINGS_EVENT));
}

function normalizeLightboxImageSource(source: string) {
  try {
    const url = new URL(source, window.location.origin);
    if (url.origin === window.location.origin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return source;
  }

  return source;
}

function isReaderControlTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest('a, button, input, textarea, select, [contenteditable="true"]'),
  );
}

function useStoredNumber(key: string, fallback: number, min: number, max: number) {
  return useSyncExternalStore(
    subscribeToReaderSettings,
    () => readNumber(key, fallback, min, max),
    () => fallback,
  );
}

function useStoredTheme() {
  return useSyncExternalStore(subscribeToReaderSettings, readTheme, () => 'dark' as ReaderTheme);
}

function useStoredBool(key: string, fallback: boolean) {
  return useSyncExternalStore(
    subscribeToReaderSettings,
    () => readBool(key, fallback),
    () => fallback,
  );
}

const themeClass: Record<ReaderTheme, string> = {
  dark: 'bg-[#0b0c0e] text-zinc-200',
  light: 'bg-[#f7f7f5] text-zinc-900',
  sepia: 'bg-[#f2eadc] text-[#2e241b]',
};

const panelClass: Record<ReaderTheme, string> = {
  dark: 'border-border bg-background/95 text-zinc-200',
  light: 'border-zinc-200 bg-white/95 text-zinc-900',
  sepia: 'border-[#dfd1bd] bg-[#f8f0e2]/95 text-[#2e241b]',
};

export default function Reader({
  novelId,
  chapter,
  prevChapterId,
  nextChapterId,
  commentsEnabled = false,
}: ReaderProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const fontSize = useStoredNumber('reader-fontSize', DEFAULT_FONT_SIZE, 14, 28);
  const lineHeight = useStoredNumber('reader-lineHeight', DEFAULT_LINE_HEIGHT, 1.4, 2.4);
  const contentWidth = useStoredNumber('reader-width', DEFAULT_CONTENT_WIDTH, 560, 920);
  const theme = useStoredTheme();
  const indent = useStoredBool('reader-indent', true);
  const showImages = useStoredBool('reader-showImages', true);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isAtReaderEnd, setIsAtReaderEnd] = useState(false);
  const [nextScrollProgress, setNextScrollProgress] = useState(0);
  const [isNavigatingToNext, setIsNavigatingToNext] = useState(false);
  const lastScrollY = useRef(0);
  const articleRef = useRef<HTMLElement | null>(null);
  const isAtReaderEndRef = useRef(false);
  const nextScrollProgressRef = useRef(0);
  const nextScrollArmedAtRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartedAtEndRef = useRef(false);
  const isNavigatingToNextRef = useRef(false);
  const autoNavigationLockedRef = useRef(false);

  useEffect(() => {
    autoNavigationLockedRef.current = isSettingsOpen || Boolean(lightboxImage);
  }, [isSettingsOpen, lightboxImage]);

  const saveNumber = (key: string, value: number) => {
    localStorage.setItem(key, String(value));
    notifyReaderSettingsChanged();
  };

  const saveBool = (key: string, value: boolean) => {
    localStorage.setItem(key, String(value));
    notifyReaderSettingsChanged();
  };

  const updateTheme = (value: ReaderTheme) => {
    localStorage.setItem('reader-theme', value);
    notifyReaderSettingsChanged();
  };

  const openInlineIllustration = useCallback((target: EventTarget | null) => {
    if (!showImages || !(target instanceof HTMLImageElement)) return;
    if (target.closest('.ai-illustration') || target.classList.contains('ai-illustration-img')) {
      setLightboxImage(normalizeLightboxImageSource(target.currentSrc || target.src));
    }
  }, [showImages]);

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    openInlineIllustration(target);
  }, [openInlineIllustration]);

  const handleContentKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as HTMLElement;
    if (target.tagName !== 'IMG') return;
    event.preventDefault();
    openInlineIllustration(target);
  }, [openInlineIllustration]);

  const navigateToNextChapter = useCallback(() => {
    if (!nextChapterId || isNavigatingToNextRef.current) return;
    isNavigatingToNextRef.current = true;
    setIsNavigatingToNext(true);
    router.push(`/novels/${novelId}/${nextChapterId}`);
  }, [nextChapterId, novelId, router]);

  useEffect(() => {
    if (!nextChapterId) return;
    router.prefetch(`/novels/${novelId}/${nextChapterId}`);
  }, [nextChapterId, novelId, router]);

  useEffect(() => {
    if (!session?.user) return;

    const timer = window.setTimeout(async () => {
      try {
        await fetch('/api/reading-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ novelId, chapterNumber: chapter.chapterNumber }),
        });
      } catch (error) {
        console.error('Failed to save reading history:', error);
      }
    }, 800);

    return () => window.clearTimeout(timer);
  }, [session, novelId, chapter.chapterNumber]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < 80) {
        setIsNavVisible(true);
      } else if (currentScrollY > lastScrollY.current + 12) {
        setIsNavVisible(false);
        setIsSettingsOpen(false);
      } else if (currentScrollY < lastScrollY.current - 12) {
        setIsNavVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!nextChapterId) {
      isAtReaderEndRef.current = false;
      nextScrollProgressRef.current = 0;
      return;
    }

    const pageIsAtBottom = () => isPageAtBottom({
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
    });

    const resetProgress = () => {
      nextScrollProgressRef.current = 0;
      setNextScrollProgress(0);
    };

    const syncEndState = () => {
      const atEnd = pageIsAtBottom();
      if (atEnd === isAtReaderEndRef.current) return;
      isAtReaderEndRef.current = atEnd;
      setIsAtReaderEnd(atEnd);
      resetProgress();
      if (atEnd) nextScrollArmedAtRef.current = Date.now() + 450;
    };

    const handleExtraWheel = (event: WheelEvent) => {
      if (
        autoNavigationLockedRef.current
        || isReaderControlTarget(event.target)
        || Date.now() < nextScrollArmedAtRef.current
      ) return;

      if (!pageIsAtBottom()) {
        syncEndState();
        return;
      }

      const progress = accumulateNextChapterScroll(
        nextScrollProgressRef.current,
        event.deltaY,
      );
      nextScrollProgressRef.current = progress;
      setNextScrollProgress(progress);
      if (progress >= NEXT_CHAPTER_SCROLL_THRESHOLD) navigateToNextChapter();
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (autoNavigationLockedRef.current || isReaderControlTarget(event.target)) {
        touchStartYRef.current = null;
        touchStartedAtEndRef.current = false;
        return;
      }
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
      touchStartedAtEndRef.current = pageIsAtBottom();
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const startY = touchStartYRef.current;
      const endY = event.changedTouches[0]?.clientY;
      const startedAtEnd = touchStartedAtEndRef.current;
      touchStartYRef.current = null;
      touchStartedAtEndRef.current = false;
      if (
        startY === null
        || endY === undefined
        || !startedAtEnd
        || !pageIsAtBottom()
        || Date.now() < nextScrollArmedAtRef.current
      ) return;
      if (startY - endY >= NEXT_CHAPTER_TOUCH_THRESHOLD) navigateToNextChapter();
    };

    syncEndState();
    const resizeObserver = new ResizeObserver(syncEndState);
    resizeObserver.observe(document.body);
    window.addEventListener('scroll', syncEndState, { passive: true });
    window.addEventListener('wheel', handleExtraWheel, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', syncEndState);
      window.removeEventListener('wheel', handleExtraWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [navigateToNextChapter, nextChapterId]);

  const sanitizedContent = chapter.content;
  const hasInlineAiImage = Boolean(chapter.aiImage && sanitizedContent.includes(chapter.aiImage));

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;

    const images = article.querySelectorAll<HTMLImageElement>('.ai-illustration img, img.ai-illustration-img');
    images.forEach((image) => {
      image.tabIndex = showImages ? 0 : -1;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', `${image.alt || chapter.title + ' 삽화'} 크게 보기`);
    });
  }, [chapter.title, sanitizedContent, showImages]);

  return (
    <div className={`min-h-screen transition-colors ${themeClass[theme]}`}>
      <div className={`fixed left-0 right-0 top-0 z-50 border-b pt-[env(safe-area-inset-top)] backdrop-blur-xl transition-transform duration-300 ${panelClass[theme]} ${isNavVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href={`/novels/${novelId}`} className="flex items-center gap-2 text-sm opacity-75 transition-opacity hover:opacity-100">
            <ArrowLeft className="h-5 w-5" /> 작품으로
          </Link>
          <div className="min-w-0 px-4 text-center">
            <p className="text-xs opacity-60">{chapter.chapterNumber}화</p>
            <p className="line-clamp-1 text-sm font-semibold">{chapter.title}</p>
          </div>
          <button type="button" onClick={() => setIsSettingsOpen((value) => !value)} className="rounded-lg p-2 opacity-75 transition-opacity hover:opacity-100" aria-label="리더 설정" aria-expanded={isSettingsOpen} aria-controls="reader-settings-panel">
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {isSettingsOpen && (
          <div id="reader-settings-panel" className="border-t border-inherit">
            <div className="mx-auto grid max-w-4xl gap-4 px-4 py-4 md:grid-cols-2">
              <div className="space-y-3">
                <ControlRow label="글자 크기" value={`${fontSize}px`} onMinus={() => saveNumber('reader-fontSize', Math.max(14, fontSize - 1))} onPlus={() => saveNumber('reader-fontSize', Math.min(28, fontSize + 1))} />
                <ControlRow label="줄 간격" value={lineHeight.toFixed(1)} onMinus={() => saveNumber('reader-lineHeight', Math.max(1.4, Number((lineHeight - 0.1).toFixed(1))))} onPlus={() => saveNumber('reader-lineHeight', Math.min(2.4, Number((lineHeight + 0.1).toFixed(1))))} />
                <ControlRow label="본문 폭" value={`${contentWidth}px`} onMinus={() => saveNumber('reader-width', Math.max(560, contentWidth - 40))} onPlus={() => saveNumber('reader-width', Math.min(920, contentWidth + 40))} />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="mb-2 text-sm opacity-70">테마</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['dark', 'light', 'sepia'] as ReaderTheme[]).map((item) => (
                      <button key={item} type="button" onClick={() => updateTheme(item)} className={`rounded-md border px-3 py-2 text-sm ${theme === item ? 'border-accent-muted text-accent' : 'border-current/15 opacity-70'}`}>
                        {item === 'dark' ? '다크' : item === 'light' ? '라이트' : '세피아'}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center justify-between rounded-lg border border-current/10 px-3 py-2 text-sm">
                  문단 들여쓰기
                  <input type="checkbox" checked={indent} onChange={(e) => saveBool('reader-indent', e.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-current/10 px-3 py-2 text-sm">
                  삽화 표시
                  <input
                    type="checkbox"
                    checked={showImages}
                    onChange={(event) => {
                      if (!event.target.checked) setLightboxImage(null);
                      saveBool('reader-showImages', event.target.checked);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      <main className="mx-auto px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(6rem+env(safe-area-inset-top))]" style={{ maxWidth: `${contentWidth}px` }}>
        <header className="mb-10 text-center">
          <p className="mb-2 text-sm font-semibold text-accent">{chapter.chapterNumber}화</p>
          <h1 className="text-2xl font-bold leading-tight md:text-3xl">{chapter.title}</h1>
        </header>

        {showImages && chapter.aiImage && !hasInlineAiImage && (
          <button type="button" onClick={() => setLightboxImage(normalizeLightboxImageSource(chapter.aiImage || ''))} className="mb-10 block w-full overflow-hidden rounded-lg border border-current/10" aria-label="삽화 크게 보기">
            <Image src={chapter.aiImage} alt={`${chapter.title} 삽화`} width={1000} height={560} sizes="(max-width: 896px) 100vw, 896px" unoptimized={!isOptimizableImageSource(chapter.aiImage)} className="w-full object-cover" />
          </button>
        )}

        <article
          ref={articleRef}
          className={`reader-content ${indent ? 'reader-indent' : ''} ${showImages ? '' : 'reader-hide-images'}`}
          style={{ fontSize: `${fontSize}px`, lineHeight }}
          onClick={handleContentClick}
          onKeyDown={handleContentKeyDown}
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        />

        {commentsEnabled && (
          <div className="mt-16 text-zinc-200 [color-scheme:dark]">
            <CommentSection novelId={novelId} chapterId={chapter.id} />
          </div>
        )}

        <section
          className="mt-8 rounded-lg border border-current/10 px-5 py-6 text-center"
          aria-live="polite"
        >
          {nextChapterId ? (
            <>
              <p className="text-sm font-semibold">
                {isNavigatingToNext
                  ? '다음 화로 이동하는 중입니다.'
                  : isAtReaderEnd
                    ? '한 번 더 아래로 스크롤하면 다음 화로 이동합니다.'
                    : '아래에서 다음 화로 이어집니다.'}
              </p>
              <div className="mx-auto mt-3 h-1.5 max-w-56 overflow-hidden rounded-full bg-current/10">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-150"
                  style={{
                    width: `${Math.min(
                      100,
                      (nextScrollProgress / NEXT_CHAPTER_SCROLL_THRESHOLD) * 100,
                    )}%`,
                  }}
                />
              </div>
              <Link
                href={`/novels/${novelId}/${nextChapterId}`}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                바로 다음 화 보기 <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">현재 공개된 마지막 화입니다.</p>
              <Link
                href={`/novels/${novelId}`}
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
              >
                <List className="h-4 w-4" aria-hidden="true" /> 작품 목록으로
              </Link>
            </>
          )}
        </section>
      </main>

      {lightboxImage && (
        <Dialog open onClose={() => setLightboxImage(null)} className="relative z-[60]">
          <div className="fixed inset-0 bg-black/90" aria-hidden="true" />
          <div
            className="fixed inset-0 overflow-y-auto"
            style={{
              paddingTop: 'max(1rem, env(safe-area-inset-top))',
              paddingRight: 'max(1rem, env(safe-area-inset-right))',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
              paddingLeft: 'max(1rem, env(safe-area-inset-left))',
            }}
          >
            <div className="flex min-h-full items-center justify-center">
              <Dialog.Panel className="relative flex max-h-full max-w-full items-center justify-center">
                <Dialog.Title className="sr-only">삽화 크게 보기</Dialog.Title>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="absolute right-2 top-2 z-10 rounded-full bg-black/65 p-2 text-white transition-colors hover:bg-black/85 focus:outline-none focus:ring-2 focus:ring-white"
                  aria-label="확대 이미지 닫기"
                  autoFocus
                >
                  <X className="h-6 w-6" />
                </button>
                <Image src={lightboxImage} alt={`${chapter.title} 확대 삽화`} width={1400} height={900} sizes="90vw" className="max-h-[calc(100vh-2rem)] max-w-[90vw] object-contain" unoptimized={!isOptimizableImageSource(lightboxImage)} />
              </Dialog.Panel>
            </div>
          </div>
        </Dialog>
      )}

      <div className={`fixed bottom-0 left-0 right-0 z-50 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl transition-transform duration-300 ${panelClass[theme]} ${isNavVisible ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          {prevChapterId ? (
            <Link href={`/novels/${novelId}/${prevChapterId}`} className="flex items-center gap-2 text-sm opacity-75 hover:opacity-100">
              <ChevronLeft className="h-5 w-5" /> 이전 화
            </Link>
          ) : <div className="w-20" />}

          <Link href={`/novels/${novelId}`} className="flex items-center gap-2 rounded-full border border-current/10 px-4 py-2 text-sm opacity-80 hover:opacity-100">
            <List className="h-4 w-4" /> 목록
          </Link>

          {nextChapterId ? (
            <Link href={`/novels/${novelId}/${nextChapterId}`} className="flex items-center gap-2 text-sm opacity-75 hover:opacity-100">
              다음 화 <ChevronRight className="h-5 w-5" />
            </Link>
          ) : <div className="w-20" />}
        </div>
      </div>
    </div>
  );
}

function ControlRow({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm opacity-70">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onMinus} className="rounded-full border border-current/10 p-2" aria-label={`${label} 줄이기`}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-14 text-center text-sm font-semibold">{value}</span>
        <button type="button" onClick={onPlus} className="rounded-full border border-current/10 p-2" aria-label={`${label} 늘리기`}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
