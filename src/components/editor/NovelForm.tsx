'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { NovelFormInput, Genre, Status } from '@/types';
import { GenreLabels, StatusLabels } from '@/types';

interface NovelFormProps {
  initialData?: Partial<NovelFormInput> & { id?: string };
  mode: 'create' | 'edit';
}

export default function NovelForm({ initialData, mode }: NovelFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [coverPreview, setCoverPreview] = useState(initialData?.coverImage || '');

  const [formData, setFormData] = useState<NovelFormInput>({
    title: initialData?.title || '',
    description: initialData?.description || '',
    genre: initialData?.genre || 'OTHER',
    status: initialData?.status || 'ONGOING',
    coverImage: initialData?.coverImage || '',
    tags: initialData?.tags || [],
    isPublished: initialData?.isPublished || false,
  });

  const genres: Genre[] = ['FANTASY', 'ROMANCE', 'SF', 'MARTIAL_ARTS', 'MYSTERY', 'HORROR', 'MODERN', 'OTHER'];
  const statuses: Status[] = ['ONGOING', 'COMPLETED', 'HIATUS'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const url = mode === 'create'
        ? '/api/novels'
        : `/api/novels/${initialData?.id}`;

      const method = mode === 'create' ? 'POST' : 'PATCH';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '저장에 실패했습니다.');
      }

      router.push(`/novels/${data.data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCover = async () => {
    if (!formData.title) {
      setError('표지를 생성하려면 제목을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cover',
          title: formData.title,
          genre: formData.genre,
          description: formData.description,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '이미지 생성에 실패했습니다.');
      }

      setFormData({ ...formData, coverImage: data.data.imageUrl });
      setCoverPreview(data.data.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 생성 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Title */}
      <Input
        label="제목"
        value={formData.title}
        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        placeholder="작품 제목을 입력하세요"
        required
      />

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          작품 소개
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="작품에 대한 소개를 입력하세요"
          rows={5}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Genre & Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            장르
          </label>
          <select
            value={formData.genre}
            onChange={(e) => setFormData({ ...formData, genre: e.target.value as Genre })}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {genres.map((genre) => (
              <option key={genre} value={genre}>
                {GenreLabels[genre]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            연재 상태
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as Status })}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {StatusLabels[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cover Image */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          표지 이미지
        </label>
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              value={formData.coverImage}
              onChange={(e) => {
                setFormData({ ...formData, coverImage: e.target.value });
                setCoverPreview(e.target.value);
              }}
              placeholder="이미지 URL 또는 AI로 생성"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleGenerateCover}
            isLoading={isLoading}
          >
            AI 생성
          </Button>
        </div>
        {coverPreview && (
          <div className="mt-4">
            <img
              src={coverPreview}
              alt="표지 미리보기"
              className="max-w-xs rounded-lg shadow-md"
            />
          </div>
        )}
      </div>

      {/* Published */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isPublished"
          checked={formData.isPublished}
          onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label htmlFor="isPublished" className="text-sm text-gray-700 dark:text-gray-300">
          작품 공개
        </label>
      </div>

      {/* Submit */}
      <div className="flex gap-4">
        <Button type="submit" isLoading={isLoading} fullWidth>
          {mode === 'create' ? '작품 등록' : '저장'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
