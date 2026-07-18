import Link from 'next/link';
import { Bookmark, Clock3, Heart, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import type { LibraryTab } from './types';

export type { LibraryTab } from './types';

interface LibraryTabsProps {
  activeTab: LibraryTab;
}

const tabs: { id: LibraryTab; label: string; icon: React.ReactNode }[] = [
  { id: 'history', label: '이어보기', icon: <Clock3 className="h-5 w-5" /> },
  { id: 'bookmarks', label: '북마크', icon: <Bookmark className="h-5 w-5" /> },
  { id: 'likes', label: '좋아요', icon: <Heart className="h-5 w-5" /> },
  { id: 'reviews', label: '리뷰한 작품', icon: <MessageSquare className="h-5 w-5" /> },
];

export default function LibraryTabs({ activeTab }: LibraryTabsProps) {
  return (
    <nav className="mb-6 flex gap-2 overflow-x-auto border-b border-border hide-scrollbar" aria-label="서재 분류">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={`/library?tab=${tab.id}`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          className={clsx(
            'relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
            activeTab === tab.id ? 'text-accent' : 'text-zinc-400 hover:text-zinc-200'
          )}
        >
          {tab.icon}
          {tab.label}
          {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
        </Link>
      ))}
    </nav>
  );
}
