'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import type { AIImageRequest } from '@/types';

interface ImageGeneratorProps {
  onImageGenerated: (imageUrl: string, prompt: string) => void;
}

export default function ImageGenerator({ onImageGenerated }: ImageGeneratorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  const [request, setRequest] = useState<AIImageRequest>({
    prompt: '',
    negativePrompt: '',
    style: 'anime',
    aspectRatio: '16:9',
  });

  const styles = [
    { value: 'anime', label: '애니메이션' },
    { value: 'realistic', label: '실사' },
    { value: 'fantasy', label: '판타지 아트' },
    { value: 'watercolor', label: '디지털 아트' },
  ];

  const aspectRatios = [
    { value: '1:1', label: '정사각형 (1:1)' },
    { value: '16:9', label: '가로형 (16:9)' },
    { value: '9:16', label: '세로형 (9:16)' },
    { value: '4:3', label: '표준 (4:3)' },
  ];

  const handleGenerate = async () => {
    if (!request.prompt.trim()) {
      setError('프롬프트를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'illustration',
          ...request,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '이미지 생성에 실패했습니다.');
      }

      setPreviewUrl(data.data.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseImage = () => {
    if (previewUrl) {
      onImageGenerated(previewUrl, request.prompt);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Prompt */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          프롬프트
        </label>
        <textarea
          value={request.prompt}
          onChange={(e) => setRequest({ ...request, prompt: e.target.value })}
          placeholder="생성할 이미지를 설명해주세요 (예: 달빛 아래 숲속을 걷는 은발의 소녀)"
          rows={3}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Negative Prompt */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          제외할 요소 (선택)
        </label>
        <input
          type="text"
          value={request.negativePrompt}
          onChange={(e) => setRequest({ ...request, negativePrompt: e.target.value })}
          placeholder="이미지에서 제외할 요소 (예: blurry, watermark)"
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Style & Aspect Ratio */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            스타일
          </label>
          <select
            value={request.style}
            onChange={(e) =>
              setRequest({
                ...request,
                style: e.target.value as AIImageRequest['style'],
              })
            }
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {styles.map((style) => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            비율
          </label>
          <select
            value={request.aspectRatio}
            onChange={(e) =>
              setRequest({
                ...request,
                aspectRatio: e.target.value as AIImageRequest['aspectRatio'],
              })
            }
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {aspectRatios.map((ratio) => (
              <option key={ratio.value} value={ratio.value}>
                {ratio.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Generate Button */}
      <Button
        type="button"
        onClick={handleGenerate}
        isLoading={isLoading}
        fullWidth
      >
        {isLoading ? '생성 중...' : '이미지 생성'}
      </Button>

      {/* Preview */}
      {previewUrl && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            미리보기
          </p>
          <img
            src={previewUrl}
            alt="생성된 이미지"
            className="w-full rounded-lg shadow-md"
          />
          <div className="flex gap-2 mt-4">
            <Button type="button" onClick={handleUseImage} fullWidth>
              이 이미지 사용
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleGenerate}
              isLoading={isLoading}
            >
              다시 생성
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
