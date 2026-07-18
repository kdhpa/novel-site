'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BarChart3, BookOpen, Eye, Heart, Trophy } from 'lucide-react';
import type { NovelListItem } from '@/types';
import { isOptimizableImageSource } from '@/lib/image-hosts';
import { GenreLabels } from '@/types';

interface RankingSectionProps {
  novels: NovelListItem[];
}

type RankingTab = 'combined' | 'views' | 'likes';
const LIKE_WEIGHT = 10;

export default function RankingSection({ novels }: RankingSectionProps) {
  const [activeTab, setActiveTab] = useState<RankingTab>('combined');

  const sortedNovels = useMemo(() => {
    return [...novels]
      .sort((a, b) => {
        if (activeTab === 'views') return b.viewCount - a.viewCount;
        if (activeTab === 'likes') return b._count.likes - a._count.likes;
        return b.viewCount + b._count.likes * LIKE_WEIGHT - (a.viewCount + a._count.likes * LIKE_WEIGHT);
      })
      .slice(0, 10);
  }, [novels, activeTab]);

  if (novels.length === 0) return null;

  const tabs: { key: RankingTab; label: string; icon: React.ReactNode }[] = [
    { key: 'combined', label: '종합', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'views', label: '조회', icon: <Eye className="h-4 w-4" /> },
    { key: 'likes', label: '좋아요', icon: <Heart className="h-4 w-4" /> },
  ];

  const statLabel = activeTab === 'views' ? '조회' : activeTab === 'likes' ? '좋아요' : '점수';
  const topNovels = sortedNovels.slice(0, 3);
  const restNovels = sortedNovels.slice(3);

  return (
    <section className="relative isolate overflow-hidden border-y border-border bg-background py-10">
      <div className="absolute inset-x-0 top-0 -z-10 h-48 bg-[radial-gradient(circle_at_50%_0%,rgba(111,199,189,0.12),transparent_58%)]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-accent-muted bg-background-secondary text-accent shadow-[0_0_24px_rgba(111,199,189,0.12)]">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">인기 순위</p>
              <h2 className="mt-1 text-2xl font-bold text-white">실시간 인기 10선</h2>
            </div>
          </div>

          <div className="flex w-full rounded-md border border-white/10 bg-background-secondary p-1 sm:w-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-all duration-300 sm:flex-none ${activeTab === tab.key ? 'home-tab-active bg-primary text-white' : 'text-zinc-400 hover:bg-background-secondary hover:text-white'}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {topNovels.map((novel, index) => {
            const primaryGenre = novel.genres?.[0];
            const statValue = activeTab === 'views'
              ? novel.viewCount
              : activeTab === 'likes'
                ? novel._count.likes
                : novel.viewCount + novel._count.likes * LIKE_WEIGHT;

            return (
              <Link
                key={novel.id}
                href={`/novels/${novel.id}`}
                className="home-card-in group relative isolate min-h-[220px] overflow-hidden rounded-md border border-white/10 bg-background-secondary transition-all duration-300 hover:-translate-y-1 hover:border-accent-muted hover:shadow-[0_24px_55px_rgba(0,0,0,0.34)]"
                style={{ animationDelay: `${index * 55}ms` }}
              >
                {novel.coverImage ? (
                  <Image src={novel.coverImage} alt={novel.title} fill sizes="(min-width: 1024px) 33vw, 100vw" unoptimized={!isOptimizableImageSource(novel.coverImage)} className="absolute inset-0 -z-20 object-cover opacity-70 transition-transform duration-700 group-hover:scale-[1.06]" />
                ) : (
                  <div className="absolute inset-0 -z-20 flex items-center justify-center bg-background-tertiary text-zinc-600">
                    <BookOpen className="h-14 w-14" />
                  </div>
                )}
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/80 to-background/20" />
                <div className="flex h-full min-h-[220px] flex-col justify-between p-4">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex h-9 min-w-9 items-center justify-center rounded px-2 text-sm font-bold ${index === 0 ? 'bg-accent text-zinc-950' : 'bg-white/10 text-white backdrop-blur'}`}>#{index + 1}</span>
                    <span className="rounded-sm border border-white/10 bg-black/30 px-2 py-1 text-xs font-semibold text-zinc-300">{statLabel}</span>
                  </div>
                  <div>
                    <h3 className="line-clamp-2 text-lg font-bold leading-6 text-white transition-colors group-hover:text-accent">{novel.title}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <span>{novel.author.nickname || '익명 작가'}</span>
                      {primaryGenre && <span className="rounded bg-white/10 px-1.5 py-0.5 text-zinc-200">{GenreLabels[primaryGenre]}</span>}
                    </div>
                    <p className="mt-3 text-lg font-bold text-accent">{statValue.toLocaleString()}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {restNovels.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {restNovels.map((novel, restIndex) => {
              const index = restIndex + 3;
              const primaryGenre = novel.genres?.[0];
              const statValue = activeTab === 'views'
                ? novel.viewCount
                : activeTab === 'likes'
                  ? novel._count.likes
                  : novel.viewCount + novel._count.likes * LIKE_WEIGHT;

              return (
                <Link
                  key={novel.id}
                  href={`/novels/${novel.id}`}
                  className="home-card-in group flex items-center gap-4 rounded-md border border-white/10 bg-background-secondary/90 p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-muted hover:bg-background-tertiary hover:shadow-[0_16px_36px_rgba(0,0,0,0.22)]"
                  style={{ animationDelay: `${index * 35}ms` }}
                >
                  <div className="w-9 shrink-0 text-center">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-background-tertiary text-sm font-bold text-zinc-400">{index + 1}</span>
                  </div>

                  <div className="relative h-[74px] w-14 shrink-0 overflow-hidden rounded bg-background-tertiary">
                    {novel.coverImage ? (
                      <Image src={novel.coverImage} alt={novel.title} fill sizes="56px" unoptimized={!isOptimizableImageSource(novel.coverImage)} className="object-cover transition-transform duration-500 group-hover:scale-[1.08]" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-zinc-600"><BookOpen className="h-6 w-6" /></div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-1 font-semibold text-white transition-colors group-hover:text-accent">{novel.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span>{novel.author.nickname || '익명 작가'}</span>
                    {primaryGenre && <span className="rounded bg-background-tertiary px-1.5 py-0.5 text-zinc-300">{GenreLabels[primaryGenre]}</span>}
                  </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-accent">{statValue.toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">{statLabel}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/rankings" className="text-sm font-medium text-zinc-400 transition-colors hover:text-accent">전체 랭킹 보기</Link>
        </div>
      </div>
    </section>
  );
}
