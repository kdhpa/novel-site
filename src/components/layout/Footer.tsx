'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
              NovelVerse
            </Link>
            <p className="mt-2 text-gray-600 dark:text-gray-400 text-sm">
              AI 이미지 생성 기능이 포함된 웹소설 플랫폼입니다.
              <br />
              상상을 현실로, 이야기에 생명을 불어넣으세요.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
              둘러보기
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/novels"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  작품 목록
                </Link>
              </li>
              <li>
                <Link
                  href="/novels?genre=FANTASY"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  판타지
                </Link>
              </li>
              <li>
                <Link
                  href="/novels?genre=ROMANCE"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  로맨스
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
              작가 지원
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/register"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  회원가입
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  작가 대시보드
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} NovelVerse. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
