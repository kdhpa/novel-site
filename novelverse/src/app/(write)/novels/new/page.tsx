import NovelForm from '@/components/editor/NovelForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '새 작품 등록',
  description: '새로운 작품을 등록하세요.',
};

export default function NewNovelPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
        새 작품 등록
      </h1>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <NovelForm mode="create" />
      </div>
    </div>
  );
}
