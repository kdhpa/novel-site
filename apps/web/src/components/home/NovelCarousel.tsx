'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { NovelListItem } from '@/types';
import NovelCardCompact from '@/components/novel/NovelCardCompact';

interface NovelCarouselProps {
  title: string;
  novels: NovelListItem[];
  moreLink?: string;
  description?: string;
}

export default function NovelCarousel({ title, novels, moreLink, description }: NovelCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 8);
  };

  useEffect(() => {
    checkScroll();
    const element = scrollRef.current;
    if (!element) return;
    element.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      element.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [novels.length]);

  const scroll = (direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: direction === 'left' ? -360 : 360, behavior: 'smooth' });
  };

  if (novels.length === 0) return null;

  return (
    <section className="py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 h-0.5 w-10 rounded-full bg-accent/70" />
            <h2 className="text-xl font-bold text-white">{title}</h2>
            {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
          </div>
          {moreLink && (
            <Link href={moreLink} className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-zinc-400 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-muted hover:text-white">
              더보기
            </Link>
          )}
        </div>

        <div className="group relative">
          {canScrollLeft && <ScrollButton direction="left" onClick={() => scroll('left')} />}
          {canScrollRight && <ScrollButton direction="right" onClick={() => scroll('right')} />}
          <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar snap-x">
            {novels.map((novel, index) => (
              <div
                key={novel.id}
                className="home-card-in w-32 shrink-0 snap-start sm:w-36 md:w-[152px]"
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              >
                <NovelCardCompact novel={novel} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ScrollButton({ direction, onClick }: { direction: 'left' | 'right'; onClick: () => void }) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-1/2 z-10 hidden -translate-y-1/2 rounded-md border border-white/10 bg-background-secondary/90 p-2 text-zinc-300 opacity-0 shadow-[0_14px_32px_rgba(0,0,0,0.32)] backdrop-blur transition-all duration-300 hover:-translate-y-[54%] hover:text-white group-hover:opacity-100 md:block ${direction === 'left' ? 'left-0' : 'right-0'}`}
      aria-label={direction === 'left' ? '왼쪽으로 스크롤' : '오른쪽으로 스크롤'}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
