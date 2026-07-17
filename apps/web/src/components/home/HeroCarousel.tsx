'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, ChevronLeft, ChevronRight, Eye, Heart, Play } from 'lucide-react';
import type { NovelListItem } from '@/types';
import { isOptimizableImageSource } from '@/lib/image-hosts';
import { GenreLabels } from '@/types';

interface HeroCarouselProps {
  novels: NovelListItem[];
}

function subscribeToReducedMotion(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function getReducedMotionPreference() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function HeroCarousel({ novels }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const prefersReducedMotion = useSyncExternalStore(subscribeToReducedMotion, getReducedMotionPreference, () => false);
  const slides = novels.slice(0, 5);

  const goToNext = useCallback(() => {
    if (slides.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);
  const goToPrev = useCallback(() => {
    if (slides.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (prefersReducedMotion || isHovered || isFocusWithin || slides.length <= 1) return;
    const interval = window.setInterval(goToNext, 6000);
    return () => window.clearInterval(interval);
  }, [goToNext, isFocusWithin, isHovered, prefersReducedMotion, slides.length]);

  if (slides.length === 0) return null;
  const safeCurrentIndex = currentIndex % slides.length;
  const currentNovel = slides[safeCurrentIndex];
  const primaryGenre = currentNovel.genres?.[0];

  return (
    <article
      className="group relative isolate overflow-hidden rounded-md border border-white/10 bg-black/35 shadow-[0_30px_90px_rgba(0,0,0,0.46)] backdrop-blur-[2px]"
      role="region"
      aria-roledescription="carousel"
      aria-label="추천 작품"
      tabIndex={0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsFocusWithin(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          goToPrev();
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          goToNext();
        }
      }}
    >
      <p className="sr-only" aria-live={isHovered || isFocusWithin ? 'polite' : 'off'}>
        {slides.length}개 추천 중 {safeCurrentIndex + 1}번째: {currentNovel.title}
      </p>
      <div className="home-hero-sheen pointer-events-none absolute -inset-y-10 left-0 -z-10 hidden sm:block" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/80 to-background/25" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/5 via-transparent to-background/90" />

      <div className="grid min-h-[430px] sm:min-h-[500px] md:grid-cols-[minmax(0,1fr)_260px] lg:min-h-[520px] xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="home-card-in flex min-w-0 flex-col justify-between p-4 sm:p-8 lg:p-10">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-sm border border-accent/35 bg-accent/10 px-2.5 py-1 text-accent transition-transform duration-300 hover:-translate-y-0.5">메인 추천</span>
              <span className="rounded-sm border border-white/10 bg-black/25 px-2.5 py-1 text-zinc-300 transition-transform duration-300 hover:-translate-y-0.5">지금 뜨는 작품</span>
              {primaryGenre && <span className="rounded-sm border border-white/10 bg-black/20 px-2 py-1 text-zinc-300 transition-transform duration-300 hover:-translate-y-0.5">{GenreLabels[primaryGenre]}</span>}
              <span className="rounded-sm border border-white/10 bg-black/20 px-2 py-1 text-zinc-300 transition-transform duration-300 hover:-translate-y-0.5">{currentNovel.status === 'ONGOING' ? '연재 중' : '완결/휴재'}</span>
            </div>

            <Link href={`/novels/${currentNovel.id}`}>
              <h1 className="line-clamp-2 max-w-3xl text-3xl font-bold leading-tight text-white transition-colors hover:text-accent sm:text-5xl lg:text-6xl">
                {currentNovel.title}
              </h1>
            </Link>
            <p className="mt-4 text-sm font-medium text-zinc-300">{currentNovel.author.nickname || '익명 작가'} 작가</p>
            {currentNovel.description && (
              <p className="mt-6 line-clamp-3 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-[15px]">
                {currentNovel.description}
              </p>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
              <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/22 px-3 py-2"><BookOpen className="h-4 w-4 text-accent" />{currentNovel._count.chapters}화</span>
              <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/22 px-3 py-2"><Heart className="h-4 w-4 text-accent" />{currentNovel._count.likes.toLocaleString()}</span>
              <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/22 px-3 py-2"><Eye className="h-4 w-4 text-accent" />{currentNovel.viewCount.toLocaleString()}</span>
            </div>

            <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
              <Link href={`/novels/${currentNovel.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(47,157,143,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-[0_18px_38px_rgba(47,157,143,0.36)]">
                <Play className="h-4 w-4" /> 작품 보기
              </Link>
              <Link href="/rankings" className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/15 bg-black/25 px-6 py-3 text-sm font-semibold text-zinc-200 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-muted hover:bg-background-tertiary">
                랭킹 보기
              </Link>
            </div>
          </div>

          {slides.length > 1 && (
            <div className="mt-10 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-2 xl:grid-cols-5">
              {slides.map((novel, index) => (
                <button
                  key={novel.id}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  aria-label={`${index + 1}번째 추천 작품: ${novel.title}`}
                  aria-pressed={index === safeCurrentIndex}
                  className={`min-w-0 rounded-md border px-3 py-2 text-left backdrop-blur transition-colors ${
                    index === safeCurrentIndex
                      ? 'border-accent/60 bg-accent/15 text-white shadow-[0_10px_28px_rgba(111,199,189,0.12)]'
                      : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:bg-black/30 hover:text-zinc-200'
                  }`}
                >
                  <span className="block text-xs text-accent">{String(index + 1).padStart(2, '0')}</span>
                  <span className="line-clamp-1 text-sm font-semibold">{novel.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Link href={`/novels/${currentNovel.id}`} className="relative hidden border-l border-white/10 bg-black/10 p-6 backdrop-blur-[1px] md:flex md:items-center md:justify-center">
          <div className="home-cover-float relative aspect-[3/4] w-full max-w-[205px] overflow-hidden rounded-md border border-white/15 bg-background-tertiary shadow-[0_28px_70px_rgba(0,0,0,0.55)] transition-transform duration-500 group-hover:scale-[1.025] xl:max-w-[230px]">
            {currentNovel.coverImage ? (
              <Image src={currentNovel.coverImage} alt={currentNovel.title} fill className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" sizes="230px" unoptimized={!isOptimizableImageSource(currentNovel.coverImage)} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
                <BookOpen className="h-16 w-16" />
              </div>
            )}
          </div>
        </Link>
      </div>

      {slides.length > 1 && (
        <div className="absolute right-3 top-3 hidden gap-2 md:flex">
          <button type="button" onClick={goToPrev} className="rounded-md border border-white/10 bg-black/35 p-2 text-zinc-300 backdrop-blur transition-colors hover:bg-black/50 hover:text-white" aria-label="이전 추천">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={goToNext} className="rounded-md border border-white/10 bg-black/35 p-2 text-zinc-300 backdrop-blur transition-colors hover:bg-black/50 hover:text-white" aria-label="다음 추천">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </article>
  );
}
