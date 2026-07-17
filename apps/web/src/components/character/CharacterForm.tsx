'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { Genre } from '@/types';

const PortraitGenerator = dynamic(() => import('./PortraitGenerator'), {
  ssr: false,
  loading: () => (
    <div
      className="h-44 animate-pulse rounded-lg border border-border bg-background-tertiary"
      role="status"
      aria-label="초상화 도구를 불러오는 중"
    />
  ),
});

interface CharacterFormProps {
  novelId: string;
  novelGenre: Genre;
  character?: {
    id: string;
    name: string;
    description: string | null;
    appearance: string;
    personality: string | null;
    role: string | null;
    portraitUrl: string | null;
    portraitPrompt: string | null;
  };
  isEditing?: boolean;
}

export default function CharacterForm({
  novelId,
  novelGenre,
  character,
  isEditing = false,
}: CharacterFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInFlightRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: character?.name || '',
    description: character?.description || '',
    appearance: character?.appearance || '',
    personality: character?.personality || '',
    role: character?.role || '',
    portraitUrl: character?.portraitUrl || '',
    portraitPrompt: character?.portraitPrompt || '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePortraitGenerated = (imageUrl: string, prompt: string) => {
    setFormData((prev) => ({
      ...prev,
      portraitUrl: imageUrl,
      portraitPrompt: prompt,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submissionInFlightRef.current) return;

    submissionInFlightRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const url = isEditing
        ? `/api/novels/${novelId}/characters/${character?.id}`
        : `/api/novels/${novelId}/characters`;

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        router.push(`/novels/${novelId}/characters`);
        router.refresh();
      } else {
        setError(data.error || '저장에 실패했습니다.');
      }
    } catch (err) {
      console.error('Submit error:', err);
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      submissionInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" aria-busy={isSubmitting}>
      {error && (
        <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-medium text-zinc-200">
          캐릭터 이름 <span aria-hidden="true" className="text-rose-400">*</span><span className="sr-only"> (필수)</span>
        </label>
        <Input
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="캐릭터 이름을 입력하세요"
          required
        />
      </div>

      {/* Role */}
      <div>
        <label htmlFor="role" className="mb-2 block text-sm font-medium text-zinc-200">
          역할
        </label>
        <Input
          id="role"
          name="role"
          value={formData.role}
          onChange={handleChange}
          placeholder="예: 주인공, 악역, 조연, 멘토"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="mb-2 block text-sm font-medium text-zinc-200">
          캐릭터 설명
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          placeholder="캐릭터에 대한 간단한 설명"
          className="w-full resize-none rounded-md border border-border bg-background px-4 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Appearance */}
      <div>
        <label htmlFor="appearance" className="mb-2 block text-sm font-medium text-zinc-200">
          외형 설명 <span aria-hidden="true" className="text-rose-400">*</span><span className="sr-only"> (필수)</span>
        </label>
        <textarea
          id="appearance"
          name="appearance"
          value={formData.appearance}
          onChange={handleChange}
          rows={4}
          placeholder="캐릭터의 외형을 자세히 설명해주세요. AI 이미지 생성에 사용됩니다."
          required
          aria-describedby="appearance-help"
          className="w-full resize-none rounded-md border border-border bg-background px-4 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <p id="appearance-help" className="mt-1 text-xs text-zinc-500">
          외형 설명이 자세할수록 AI가 더 정확한 이미지를 생성합니다.
        </p>
      </div>

      {/* Portrait Generator */}
      {isEditing && character ? (
        <section className="rounded-lg border border-border bg-background p-4" aria-labelledby="portrait-generator-title">
          <h3 id="portrait-generator-title" className="mb-4 text-sm font-medium text-zinc-200">AI 초상화</h3>
          <PortraitGenerator
            characterId={character?.id || 'new'}
            appearance={formData.appearance}
            genre={novelGenre}
            currentPortraitUrl={formData.portraitUrl}
            onGenerated={handlePortraitGenerated}
          />
        </section>
      ) : formData.appearance.trim() ? (
        <p className="rounded-lg border border-border bg-background p-4 text-sm text-zinc-400">
          캐릭터를 먼저 저장하면 AI 초상화를 생성할 수 있습니다.
        </p>
      ) : null}

      {/* Personality */}
      <div>
        <label htmlFor="personality" className="mb-2 block text-sm font-medium text-zinc-200">
          성격
        </label>
        <textarea
          id="personality"
          name="personality"
          value={formData.personality}
          onChange={handleChange}
          rows={3}
          placeholder="캐릭터의 성격, 말투, 행동 특성"
          className="w-full resize-none rounded-md border border-border bg-background px-4 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          취소
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          aria-describedby="character-form-status"
          className="w-full sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <svg
                aria-hidden="true"
                className="mr-2 h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              저장 중...
            </>
          ) : isEditing ? (
            '수정하기'
          ) : (
            '추가하기'
          )}
        </Button>
      </div>
      <span id="character-form-status" className="sr-only" role="status" aria-live="polite">
        {isSubmitting ? '캐릭터 정보를 저장하고 있습니다.' : ''}
      </span>
    </form>
  );
}
