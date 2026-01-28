'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ImageGenerator from './ImageGenerator';
import type { ChapterFormInput } from '@/types';

interface ChapterEditorProps {
  novelId: string;
  initialData?: Partial<ChapterFormInput> & { id?: string };
  mode: 'create' | 'edit';
  nextChapterNumber?: number;
}

export default function ChapterEditor({
  novelId,
  initialData,
  mode,
  nextChapterNumber = 1,
}: ChapterEditorProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showImageGenerator, setShowImageGenerator] = useState(false);

  const [formData, setFormData] = useState<ChapterFormInput>({
    title: initialData?.title || '',
    content: initialData?.content || '',
    chapterNumber: initialData?.chapterNumber || nextChapterNumber,
    aiImage: initialData?.aiImage || '',
    aiImagePrompt: initialData?.aiImagePrompt || '',
    isPublished: initialData?.isPublished || false,
  });

  const editor = useEditor({
    extensions: [StarterKit],
    content: formData.content,
    onUpdate: ({ editor }) => {
      setFormData((prev) => ({ ...prev, content: editor.getHTML() }));
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-gray dark:prose-invert max-w-none min-h-[400px] p-4 focus:outline-none',
      },
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const url =
        mode === 'create'
          ? `/api/novels/${novelId}/chapters`
          : `/api/novels/${novelId}/chapters/${initialData?.id}`;

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

      router.push(`/novels/${novelId}/chapters`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageGenerated = useCallback(
    (imageUrl: string, prompt: string) => {
      setFormData((prev) => ({
        ...prev,
        aiImage: imageUrl,
        aiImagePrompt: prompt,
      }));
      setShowImageGenerator(false);
    },
    []
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Chapter Number & Title */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Input
            label="회차"
            type="number"
            value={formData.chapterNumber}
            onChange={(e) =>
              setFormData({ ...formData, chapterNumber: Number(e.target.value) })
            }
            min={1}
            required
          />
        </div>
        <div className="md:col-span-3">
          <Input
            label="제목"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="회차 제목을 입력하세요"
            required
          />
        </div>
      </div>

      {/* Editor Toolbar */}
      <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
        <div className="flex items-center gap-1 p-2 border-b border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor?.isActive('bold') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor?.isActive('italic') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
          >
            <em>I</em>
          </button>
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor?.isActive('heading', { level: 2 }) ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor?.isActive('heading', { level: 3 }) ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
          >
            H3
          </button>
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor?.isActive('bulletList') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor?.isActive('blockquote') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>
        </div>

        {/* Editor Content */}
        <div className="bg-white dark:bg-gray-900">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* AI Illustration */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
            AI 삽화
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowImageGenerator(!showImageGenerator)}
          >
            {showImageGenerator ? '닫기' : 'AI로 삽화 생성'}
          </Button>
        </div>

        {showImageGenerator && (
          <div className="p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800">
            <ImageGenerator onImageGenerated={handleImageGenerated} />
          </div>
        )}

        {formData.aiImage && (
          <div className="mt-4">
            <img
              src={formData.aiImage}
              alt="AI 삽화"
              className="max-w-md rounded-lg shadow-md"
            />
            {formData.aiImagePrompt && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                프롬프트: {formData.aiImagePrompt}
              </p>
            )}
            <button
              type="button"
              onClick={() =>
                setFormData({ ...formData, aiImage: '', aiImagePrompt: '' })
              }
              className="text-sm text-red-600 hover:underline mt-2"
            >
              삽화 제거
            </button>
          </div>
        )}
      </div>

      {/* Published */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isPublished"
          checked={formData.isPublished}
          onChange={(e) =>
            setFormData({ ...formData, isPublished: e.target.checked })
          }
          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label
          htmlFor="isPublished"
          className="text-sm text-gray-700 dark:text-gray-300"
        >
          회차 공개 (발행)
        </label>
      </div>

      {/* Submit */}
      <div className="flex gap-4">
        <Button type="submit" isLoading={isLoading} fullWidth>
          {mode === 'create' ? '회차 등록' : '저장'}
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
