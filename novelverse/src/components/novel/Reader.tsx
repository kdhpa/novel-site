'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Chapter } from '@/types';

interface ReaderProps {
  novelId: string;
  chapter: Chapter;
  prevChapterId?: string;
  nextChapterId?: string;
}

export default function Reader({
  novelId,
  chapter,
  prevChapterId,
  nextChapterId,
}: ReaderProps) {
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.8);

  // Load preferences from localStorage
  useEffect(() => {
    const savedFontSize = localStorage.getItem('reader-fontSize');
    const savedLineHeight = localStorage.getItem('reader-lineHeight');
    if (savedFontSize) setFontSize(Number(savedFontSize));
    if (savedLineHeight) setLineHeight(Number(savedLineHeight));
  }, []);

  // Save preferences
  const updateFontSize = (size: number) => {
    setFontSize(size);
    localStorage.setItem('reader-fontSize', String(size));
  };

  const updateLineHeight = (height: number) => {
    setLineHeight(height);
    localStorage.setItem('reader-lineHeight', String(height));
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Reader Controls */}
      <div className="sticky top-16 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 mb-8 py-4">
        <div className="flex items-center justify-between">
          <Link
            href={`/novels/${novelId}`}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            목록으로
          </Link>

          <div className="flex items-center gap-4">
            {/* Font size controls */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">글자</span>
              <button
                onClick={() => updateFontSize(Math.max(14, fontSize - 2))}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="글자 크기 줄이기"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="text-sm w-8 text-center">{fontSize}</span>
              <button
                onClick={() => updateFontSize(Math.min(28, fontSize + 2))}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="글자 크기 키우기"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            {/* Line height controls */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">줄간격</span>
              <button
                onClick={() => updateLineHeight(Math.max(1.4, lineHeight - 0.2))}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="줄 간격 줄이기"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="text-sm w-8 text-center">{lineHeight.toFixed(1)}</span>
              <button
                onClick={() => updateLineHeight(Math.min(2.4, lineHeight + 0.2))}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="줄 간격 키우기"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chapter Header */}
      <header className="mb-8 text-center">
        <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-2">
          {chapter.chapterNumber}화
        </p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {chapter.title}
        </h1>
      </header>

      {/* AI Illustration */}
      {chapter.aiImage && (
        <div className="mb-8 rounded-lg overflow-hidden">
          <Image
            src={chapter.aiImage}
            alt={`${chapter.title} 삽화`}
            width={768}
            height={432}
            className="w-full object-cover"
          />
          {chapter.aiImagePrompt && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-2 italic">
              AI 삽화
            </p>
          )}
        </div>
      )}

      {/* Chapter Content */}
      <article
        className="prose prose-gray dark:prose-invert max-w-none"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight,
        }}
      >
        <div
          className="whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: chapter.content }}
        />
      </article>

      {/* Chapter Navigation */}
      <nav className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          {prevChapterId ? (
            <Link
              href={`/novels/${novelId}/${prevChapterId}`}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              이전 화
            </Link>
          ) : (
            <div />
          )}

          <Link
            href={`/novels/${novelId}`}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            목록
          </Link>

          {nextChapterId ? (
            <Link
              href={`/novels/${novelId}/${nextChapterId}`}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              다음 화
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </nav>
    </div>
  );
}
