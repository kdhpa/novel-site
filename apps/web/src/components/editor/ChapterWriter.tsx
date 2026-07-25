'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { formatHtmlContent } from '@/lib/text-formatter';
import { isOptimizableImageSource } from '@/lib/image-hosts';
import {
  ILLUSTRATION_FILE_SIZE_LABEL,
  MAX_ILLUSTRATION_FILE_BYTES,
} from '@/lib/illustration-upload-limits';
import {
  createImageJobClientRequestId,
  isImageJobAbortError,
  pollImageJob,
  readRecoverableImageJob,
  removeRecoverableImageJob,
  startImageJob,
  writeRecoverableImageJob,
  type RecoverableImageJob,
} from '@/lib/client/image-jobs';
import {
  ArrowLeft,
  Bold,
  BookOpen,
  Clock3,
  Eye,
  EyeOff,
  Heading2,
  ImagePlus,
  Italic,
  List,
  Quote,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
} from 'lucide-react';

type CharacterReference = {
  id: string;
  name: string;
  appearance: string;
  role: string | null;
};

type ChapterWriterInput = {
  id?: string;
  title: string;
  content: string;
  chapterNumber?: number;
  aiImage?: string;
  aiImagePrompt?: string;
  isPublished?: boolean;
};

type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

type SavedChapter = {
  id: string;
};

type DraftData = ChapterWriterInput & {
  ownerUserId: string;
  updatedAt: string;
};

type ChapterImageJobRecord = RecoverableImageJob<Record<string, unknown>>;
const CHAPTER_IMAGE_JOB_STORAGE_PREFIX = 'novelverse.chapterImageJob.v1';

function getChapterImageJobStorageKey(
  ownerUserId: string,
  novelId: string,
  chapterId?: string
) {
  return `${CHAPTER_IMAGE_JOB_STORAGE_PREFIX}:${ownerUserId}:${novelId}:${chapterId || 'new'}`;
}

function removeChapterImageJobIfMatches(
  storageKey: string,
  ownerUserId: string,
  clientRequestId: string
) {
  if (!storageKey || !ownerUserId) return;
  const storedJob = readRecoverableImageJob<Record<string, unknown>>(
    storageKey,
    ownerUserId
  );
  if (storedJob?.clientRequestId === clientRequestId) {
    removeRecoverableImageJob(storageKey);
  }
}

type ChapterWriterProps = {
  novelId: string;
  mode: 'create' | 'edit';
  initialData?: Partial<ChapterWriterInput>;
  nextChapterNumber?: number;
  characters?: CharacterReference[];
};

function stripHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function snapshotOf(value: ChapterWriterInput) {
  return JSON.stringify({
    title: value.title.trim(),
    content: value.content,
    chapterNumber: value.chapterNumber || 1,
    aiImage: value.aiImage || '',
    aiImagePrompt: value.aiImagePrompt || '',
    isPublished: Boolean(value.isPublished),
  });
}

function formatSavedTime(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatInteger(value: number) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    return { success: false, error: '서버 응답을 읽지 못했습니다.' };
  }
}

export default function ChapterWriter({
  novelId,
  mode,
  initialData,
  nextChapterNumber = 1,
  characters = [],
}: ChapterWriterProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const ownerUserId = session?.user?.id || '';
  const initialFormRef = useRef<ChapterWriterInput>({
    id: initialData?.id,
    title: initialData?.title || '',
    content: initialData?.content || '',
    chapterNumber: initialData?.chapterNumber || nextChapterNumber,
    aiImage: initialData?.aiImage || '',
    aiImagePrompt: initialData?.aiImagePrompt || '',
    isPublished: Boolean(initialData?.isPublished),
  });

  const [title, setTitle] = useState(initialFormRef.current.title);
  const [content, setContent] = useState(initialFormRef.current.content);
  const [chapterNumber, setChapterNumber] = useState(
    initialFormRef.current.chapterNumber || nextChapterNumber
  );
  const [isPublished, setIsPublished] = useState(Boolean(initialFormRef.current.isPublished));
  const [aiImage, setAiImage] = useState(initialFormRef.current.aiImage || '');
  const [aiImagePrompt, setAiImagePrompt] = useState(initialFormRef.current.aiImagePrompt || '');
  const [imagePrompt, setImagePrompt] = useState(initialFormRef.current.aiImagePrompt || '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<DraftData | null>(null);
  const saveInFlightRef = useRef(false);
  const imageGenerationInFlightRef = useRef(false);
  const imageGenerationAbortRef = useRef<AbortController | null>(null);
  const imageGenerationMountedRef = useRef(false);
  const imageUploadInFlightRef = useRef(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(() =>
    snapshotOf(initialFormRef.current)
  );

  const draftKey = useMemo(
    () => ownerUserId
      ? `chapter-draft:v2:${ownerUserId}:${novelId}:${initialData?.id || 'new'}`
      : '',
    [initialData?.id, novelId, ownerUserId]
  );
  const chapterImageJobStorageKey = useMemo(
    () => ownerUserId
      ? getChapterImageJobStorageKey(ownerUserId, novelId, initialData?.id)
      : '',
    [initialData?.id, novelId, ownerUserId]
  );
  const activeImageJobStorageKeyRef = useRef(chapterImageJobStorageKey);

  useEffect(() => {
    activeImageJobStorageKeyRef.current = chapterImageJobStorageKey;
  }, [chapterImageJobStorageKey]);

  const editorExtensions = useMemo(() => [
      StarterKit,
      Placeholder.configure({
        placeholder: '본문을 작성하세요. 문단, 대사, 장면 전환을 자유롭게 정리할 수 있습니다.',
      }),
      TiptapImage.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: 'ai-illustration-img',
          loading: 'lazy',
        },
      }),
    ], []);

  const editor = useEditor({
    extensions: editorExtensions,
    content: initialFormRef.current.content,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      setContent(currentEditor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'min-h-[62vh] px-4 py-4 text-[16px] leading-7 text-zinc-100 outline-none sm:px-8 sm:py-6 sm:text-[17px] sm:leading-8',
        role: 'textbox',
        'aria-label': '회차 본문',
        'aria-multiline': 'true',
        spellcheck: 'true',
        lang: 'ko',
        autocorrect: 'on',
      },
    },
  });

  const formValue = useMemo<ChapterWriterInput>(
    () => ({
      id: initialData?.id,
      title,
      content,
      chapterNumber,
      aiImage,
      aiImagePrompt,
      isPublished,
    }),
    [aiImage, aiImagePrompt, chapterNumber, content, initialData?.id, isPublished, title]
  );

  const currentSnapshot = useMemo(() => snapshotOf(formValue), [formValue]);
  const hasChanges = currentSnapshot !== lastSavedSnapshot;
  const deferredContent = useDeferredValue(content);
  const plainText = useMemo(() => stripHtml(deferredContent), [deferredContent]);

  const stats = useMemo(() => {
    const noSpaceCount = plainText.replace(/\s/g, '').length;
    const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
    const readingMinutes = Math.max(1, Math.ceil(noSpaceCount / 500));

    return {
      characters: plainText.length,
      noSpaceCount,
      wordCount,
      readingMinutes,
    };
  }, [plainText]);

  useEffect(() => {
    setDraftReady(false);
    setPendingDraft(null);
    if (!ownerUserId || !draftKey) return;

    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) {
        setDraftReady(true);
        return;
      }

      const draft = JSON.parse(raw) as DraftData;
      if (
        draft.ownerUserId === ownerUserId &&
        snapshotOf(draft) !== snapshotOf(initialFormRef.current)
      ) {
        setPendingDraft(draft);
      } else if (draft.ownerUserId !== ownerUserId) {
        window.localStorage.removeItem(draftKey);
      }
    } catch {
      window.localStorage.removeItem(draftKey);
    } finally {
      setDraftReady(true);
    }
  }, [draftKey, ownerUserId]);

  useEffect(() => {
    if (!ownerUserId || !draftKey || !draftReady || pendingDraft) return;

    const timer = window.setTimeout(() => {
      if (!hasChanges) {
        window.localStorage.removeItem(draftKey);
        return;
      }

      const draft: DraftData = {
        ...formValue,
        ownerUserId,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    }, 800);

    return () => window.clearTimeout(timer);
  }, [draftKey, draftReady, formValue, hasChanges, ownerUserId, pendingDraft]);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;

    setTitle(pendingDraft.title || '');
    setContent(pendingDraft.content || '');
    setChapterNumber(pendingDraft.chapterNumber || nextChapterNumber);
    setIsPublished(Boolean(pendingDraft.isPublished));
    setAiImage(pendingDraft.aiImage || '');
    setAiImagePrompt(pendingDraft.aiImagePrompt || '');
    setImagePrompt(pendingDraft.aiImagePrompt || '');
    editor?.commands.setContent(pendingDraft.content || '');
    setPendingDraft(null);
  }, [editor, nextChapterNumber, pendingDraft]);

  const discardDraft = useCallback(() => {
    if (draftKey) window.localStorage.removeItem(draftKey);
    setPendingDraft(null);
  }, [draftKey]);

  const saveChapter = useCallback(
    async (leaveAfterSave = false) => {
      if (saveInFlightRef.current) return;

      const latestContent = editor?.getHTML() || content;
      const latestText = stripHtml(latestContent);

      if (!title.trim()) {
        setError('회차 제목을 입력해 주세요.');
        return;
      }

      if (!latestText) {
        setError('본문을 입력해 주세요.');
        return;
      }

      saveInFlightRef.current = true;
      setIsSaving(true);
      setError('');

      const payload: ChapterWriterInput = {
        title: title.trim(),
        content: latestContent,
        chapterNumber,
        aiImage,
        aiImagePrompt,
        isPublished,
      };

      const url =
        mode === 'create'
          ? `/api/novels/${novelId}/chapters`
          : `/api/novels/${novelId}/chapters/${initialData?.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await readJson<SavedChapter>(response);

        if (!response.ok || !data.success) {
          throw new Error(data.error || '저장에 실패했습니다.');
        }

        if (mode === 'create' && data.data?.id) {
          const activeJob = readRecoverableImageJob<Record<string, unknown>>(
            activeImageJobStorageKeyRef.current,
            ownerUserId
          );
          if (activeJob) {
            const savedChapterJobKey = getChapterImageJobStorageKey(
              ownerUserId,
              novelId,
              data.data.id
            );
            writeRecoverableImageJob(savedChapterJobKey, ownerUserId, activeJob);
            removeRecoverableImageJob(activeImageJobStorageKeyRef.current);
            activeImageJobStorageKeyRef.current = savedChapterJobKey;
          }
        }

        window.localStorage.removeItem(draftKey);
        setSavedAt(new Date());
        setLastSavedSnapshot(snapshotOf({ ...payload, id: initialData?.id || data.data?.id }));

        if (leaveAfterSave) {
          router.push(`/novels/${novelId}/chapters`);
          router.refresh();
          return;
        }

        if (mode === 'create' && data.data?.id) {
          router.replace(`/novels/${novelId}/chapters/${data.data.id}/edit`);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.');
      } finally {
        saveInFlightRef.current = false;
        setIsSaving(false);
      }
    },
    [
      aiImage,
      aiImagePrompt,
      chapterNumber,
      content,
      draftKey,
      editor,
      initialData?.id,
      isPublished,
      mode,
      novelId,
      ownerUserId,
      router,
      title,
    ]
  );

  const applyAutoCorrection = useCallback(() => {
    if (!editor) return;

    const formatted = formatHtmlContent(editor.getHTML());
    editor.commands.setContent(formatted);
    setContent(formatted);
  }, [editor]);

  const saveChapterRef = useRef(saveChapter);

  useEffect(() => {
    saveChapterRef.current = saveChapter;
  }, [saveChapter]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveChapterRef.current(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const runImageGeneration = useCallback(async (record: ChapterImageJobRecord) => {
    if (
      imageGenerationInFlightRef.current ||
      !ownerUserId ||
      !activeImageJobStorageKeyRef.current ||
      record.ownerUserId !== ownerUserId
    ) return;
    imageGenerationInFlightRef.current = true;
    if (imageGenerationMountedRef.current) {
      setIsGeneratingImage(true);
      setError('');
    }
    const controller = new AbortController();
    imageGenerationAbortRef.current = controller;
    const initialStorageKey = activeImageJobStorageKeyRef.current;

    try {
      const job = record.job || await startImageJob(record.input, {
        clientRequestId: record.clientRequestId,
        signal: controller.signal,
      });
      if (imageGenerationAbortRef.current !== controller) return;
      writeRecoverableImageJob(activeImageJobStorageKeyRef.current, ownerUserId, {
        ownerUserId,
        clientRequestId: record.clientRequestId,
        input: record.input,
        job,
      });
      const completed = await pollImageJob(job, {
        novelId,
        signal: controller.signal,
      });

      removeChapterImageJobIfMatches(initialStorageKey, ownerUserId, record.clientRequestId);
      removeChapterImageJobIfMatches(
        activeImageJobStorageKeyRef.current,
        ownerUserId,
        record.clientRequestId
      );
      if (
        imageGenerationMountedRef.current &&
        imageGenerationAbortRef.current === controller
      ) {
        setAiImage(completed.imageUrl);
        setAiImagePrompt(completed.prompt || String(record.input.prompt || ''));
      }
    } catch (err) {
      if (!isImageJobAbortError(err)) {
        removeChapterImageJobIfMatches(initialStorageKey, ownerUserId, record.clientRequestId);
        removeChapterImageJobIfMatches(
          activeImageJobStorageKeyRef.current,
          ownerUserId,
          record.clientRequestId
        );
        if (
          imageGenerationMountedRef.current &&
          imageGenerationAbortRef.current === controller
        ) {
          setError(err instanceof Error ? err.message : '삽화 생성 중 오류가 발생했습니다.');
        }
      }
    } finally {
      if (imageGenerationAbortRef.current === controller) {
        imageGenerationAbortRef.current = null;
        imageGenerationInFlightRef.current = false;
        if (imageGenerationMountedRef.current) setIsGeneratingImage(false);
      }
    }
  }, [novelId, ownerUserId]);

  useEffect(() => {
    imageGenerationMountedRef.current = true;
    if (!ownerUserId || !chapterImageJobStorageKey) return () => {
      imageGenerationMountedRef.current = false;
    };

    const storedJob = readRecoverableImageJob<Record<string, unknown>>(
      chapterImageJobStorageKey,
      ownerUserId
    );
    if (storedJob) void runImageGeneration(storedJob);

    return () => {
      imageGenerationMountedRef.current = false;
      const controller = imageGenerationAbortRef.current;
      imageGenerationAbortRef.current = null;
      imageGenerationInFlightRef.current = false;
      controller?.abort();
    };
  }, [chapterImageJobStorageKey, ownerUserId, runImageGeneration]);

  const generateImage = async () => {
    if (imageGenerationInFlightRef.current) return;

    if (!ownerUserId || !activeImageJobStorageKeyRef.current) {
      setError('로그인 정보를 확인한 뒤 다시 시도해 주세요.');
      return;
    }

    if (!imagePrompt.trim()) {
      setError('삽화 프롬프트를 입력해 주세요.');
      return;
    }

    const record: ChapterImageJobRecord = {
      version: 1,
      ownerUserId,
      clientRequestId: createImageJobClientRequestId(),
      input: {
        type: 'illustration',
        prompt: imagePrompt.trim(),
        style: 'anime',
        aspectRatio: '16:9',
        novelId,
      },
      updatedAt: new Date().toISOString(),
    };
    writeRecoverableImageJob(
      activeImageJobStorageKeyRef.current,
      ownerUserId,
      record
    );
    await runImageGeneration(record);
  };

  const cancelImageGeneration = () => {
    removeRecoverableImageJob(activeImageJobStorageKeyRef.current);
    const controller = imageGenerationAbortRef.current;
    imageGenerationAbortRef.current = null;
    imageGenerationInFlightRef.current = false;
    setIsGeneratingImage(false);
    controller?.abort();
  };

  const suggestImagePrompt = () => {
    const scene = plainText.slice(0, 500);
    const characterHint = characters
      .slice(0, 4)
      .map((character) => `${character.name}: ${character.appearance}`)
      .join(' / ');

    setImagePrompt(
      [
        title ? `회차 제목: ${title}` : '',
        scene ? `장면: ${scene}` : '',
        characterHint ? `등장인물: ${characterHint}` : '',
        '16:9 구도, 어두운 판타지 웹소설 삽화, 텍스트와 워터마크 없음',
      ]
        .filter(Boolean)
        .join('\n')
    );
  };

  const insertImageIntoBody = () => {
    if (!aiImage || !editor) return;
    editor.chain().focus().setImage({ src: aiImage, alt: `${title || '회차'} 삽화` }).run();
  };

  const uploadIllustration = async (file: File) => {
    if (imageUploadInFlightRef.current) return;

    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('JPEG, PNG, GIF, WEBP 이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > MAX_ILLUSTRATION_FILE_BYTES) {
      setError(`파일 크기는 ${ILLUSTRATION_FILE_SIZE_LABEL} 이하여야 합니다.`);
      return;
    }

    imageUploadInFlightRef.current = true;
    setIsUploadingImage(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('novelId', novelId);

      const response = await fetch('/api/upload/illustration', {
        method: 'POST',
        body: formData,
      });
      const data = await readJson<{ url: string }>(response);

      if (!response.ok || !data.success || !data.data?.url) {
        throw new Error(data.error || '삽화 업로드에 실패했습니다.');
      }

      setAiImage(data.data.url);
      setAiImagePrompt(`직접 업로드: ${file.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '삽화 업로드 중 오류가 발생했습니다.');
    } finally {
      imageUploadInFlightRef.current = false;
      setIsUploadingImage(false);
      if (imageFileInputRef.current) imageFileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="min-h-screen pb-28 sm:pb-0"
      aria-busy={isSaving || isGeneratingImage || isUploadingImage}
    >
      <span className="sr-only" role="status" aria-live="polite">
        {isSaving
          ? '회차를 저장하고 있습니다.'
          : isGeneratingImage
            ? '삽화를 생성하고 있습니다.'
            : isUploadingImage
              ? '삽화를 업로드하고 있습니다.'
              : ''}
      </span>
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-3 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/novels/${novelId}/chapters`}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-zinc-300 hover:border-accent-muted hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="회차 목록으로"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500">
                {mode === 'create' ? '새 회차 작성' : '회차 수정'}
              </p>
              <p className="truncate text-sm font-medium text-zinc-200">
                {title.trim() || '제목 없음'}
              </p>
            </div>
          </div>

          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs text-zinc-400">
              {hasChanges ? '저장 안 됨' : savedAt ? `${formatSavedTime(savedAt)} 저장됨` : '저장됨'}
            </span>
            <button
              type="button"
              onClick={() => setIsPublished((value) => !value)}
              aria-pressed={isPublished}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-zinc-200 hover:border-accent-muted hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {isPublished ? '공개' : '비공개'}
            </button>
            <button
              type="button"
              onClick={() => void saveChapter(false)}
              disabled={isSaving}
              aria-busy={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSaving ? '저장 중' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => void saveChapter(true)}
              disabled={isSaving}
              className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-semibold text-zinc-200 hover:border-accent-muted hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              저장 후 목록
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1440px] gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <main className="min-w-0 overflow-hidden rounded-md border border-border bg-background-secondary sm:rounded-lg">
          {pendingDraft && (
            <div className="flex flex-col gap-3 border-b border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
              <span>
                이 브라우저에 임시 저장본이 있습니다.{' '}
                {formatSavedTime(new Date(pendingDraft.updatedAt))} 기준입니다.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={restoreDraft}
                  className="inline-flex min-h-10 items-center gap-1 rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  불러오기
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="inline-flex min-h-10 items-center gap-1 rounded-md border border-amber-300/40 px-3 py-1.5 text-xs font-semibold text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  버리기
                </button>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="border-b border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="grid gap-3 border-b border-border p-4 sm:p-5 md:grid-cols-[120px_minmax(0,1fr)]">
            <label htmlFor="chapter-number" className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">회차</span>
              <input
                id="chapter-number"
                type="number"
                min={1}
                value={chapterNumber}
                onChange={(event) => setChapterNumber(Number(event.target.value) || 1)}
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-zinc-100 outline-none focus:border-primary"
              />
            </label>
            <label htmlFor="chapter-title" className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">제목</span>
              <input
                id="chapter-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="회차 제목"
                className="h-11 w-full rounded-md border border-border bg-background px-4 text-base font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-primary"
              />
            </label>
          </div>

          <div className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-border bg-background px-3 py-2 hide-scrollbar sm:flex-wrap" role="toolbar" aria-label="본문 서식 도구">
            <ToolbarButton
              label="굵게"
              active={editor?.isActive('bold')}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              label="기울임"
              active={editor?.isActive('italic')}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              label="소제목"
              active={editor?.isActive('heading', { level: 2 })}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              label="목록"
              active={editor?.isActive('bulletList')}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              label="인용"
              active={editor?.isActive('blockquote')}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              <Quote className="h-4 w-4" />
            </ToolbarButton>
            <span className="mx-1 h-6 w-px bg-border" />
            <ToolbarButton label="실행 취소" onClick={() => editor?.chain().focus().undo().run()}>
              <Undo2 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label="다시 실행" onClick={() => editor?.chain().focus().redo().run()}>
              <Redo2 className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton label="삽화 삽입" disabled={!aiImage} onClick={insertImageIntoBody}>
              <ImagePlus className="h-4 w-4" />
            </ToolbarButton>
            <span className="mx-1 h-6 w-px bg-border" />
            <ToolbarButton label="오타 정리" onClick={applyAutoCorrection}>
              <Wand2 className="h-4 w-4" />
            </ToolbarButton>
          </div>

          <div className="bg-background">
            <EditorContent editor={editor} />
          </div>
        </main>

        <aside className="space-y-4 sm:space-y-5">
          <section className="rounded-lg border border-border bg-background-secondary p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <BookOpen className="h-4 w-4 text-accent" />
              원고 상태
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="글자" value={formatInteger(stats.characters)} />
              <Stat label="공백 제외" value={formatInteger(stats.noSpaceCount)} />
              <Stat label="어절" value={formatInteger(stats.wordCount)} />
              <Stat
                label="예상 시간"
                value={`${formatInteger(stats.readingMinutes)}분`}
                icon={<Clock3 className="h-3.5 w-3.5" />}
              />
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-background-secondary p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Sparkles className="h-4 w-4 text-accent" />
              <label htmlFor="chapter-image-prompt">AI 삽화</label>
            </h2>
            <textarea
              id="chapter-image-prompt"
              value={imagePrompt}
              onChange={(event) => setImagePrompt(event.target.value)}
              rows={6}
              placeholder="삽화로 만들 장면을 적어 주세요."
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-primary"
            />
            <aside
              aria-label="외부 AI 데이터 전송 안내"
              className="mt-2 rounded-md border border-accent-muted/60 bg-accent-muted/10 px-3 py-2 text-xs leading-5 text-foreground-secondary"
            >
              <span className="font-semibold text-accent">외부 AI 전송 안내</span>
              <span className="mt-1 block">
                생성을 누르면 이 프롬프트와 본문에서 채운 장면·캐릭터 정보가 Replicate로 전송됩니다. 민감정보나 타인의 개인정보를 입력하지 마세요.
              </span>
            </aside>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                ref={imageFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                disabled={isUploadingImage || isGeneratingImage}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadIllustration(file);
                }}
              />
              <button
                type="button"
                onClick={() => imageFileInputRef.current?.click()}
                disabled={isUploadingImage || isGeneratingImage}
                aria-busy={isUploadingImage}
                className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-accent-muted hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {isUploadingImage ? '업로드 중' : '파일 업로드'}
              </button>
              <button
                type="button"
                onClick={suggestImagePrompt}
                className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-accent-muted hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Wand2 className="h-3.5 w-3.5" />
                본문으로 채우기
              </button>
              <button
                type="button"
                onClick={() => void generateImage()}
                disabled={isGeneratingImage}
                aria-busy={isGeneratingImage}
                className="inline-flex min-h-10 items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {isGeneratingImage ? '생성 중' : '생성'}
              </button>
              {isGeneratingImage && (
                <button
                  type="button"
                  onClick={cancelImageGeneration}
                  className="inline-flex min-h-10 items-center rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  확인 중단
                </button>
              )}
            </div>

            {aiImage && (
              <div className="mt-4 overflow-hidden rounded-md border border-border bg-background">
                <div className="relative aspect-video">
                  <Image
                    src={aiImage}
                    alt="회차 삽화"
                    fill
                    sizes="(min-width: 1024px) 320px, calc(100vw - 2rem)"
                    className="object-cover"
                    unoptimized={!isOptimizableImageSource(aiImage)}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 p-2">
                  <button
                    type="button"
                    onClick={insertImageIntoBody}
                    className="min-h-10 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:border-accent-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    본문에 삽입
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAiImage('');
                      setAiImagePrompt('');
                    }}
                    className="min-h-10 rounded-md px-2.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    제거
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-background-secondary p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-100">등장인물</h2>
            {characters.length > 0 ? (
              <div className="space-y-2">
                {characters.map((character) => (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => editor?.chain().focus().insertContent(character.name).run()}
                    className="block min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-left hover:border-accent-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="block truncate text-sm font-medium text-zinc-100">
                      {character.name}
                    </span>
                    {character.role && (
                      <span className="block truncate text-xs text-zinc-500">
                        {character.role}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-zinc-500">
                등록된 등장인물이 없습니다. 인물 정보를 추가하면 여기서 바로 본문에 넣을 수 있습니다.
              </p>
            )}
          </section>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex h-8 min-w-0 items-center rounded-md border border-border px-3 text-xs text-zinc-400">
            {hasChanges ? '저장 안 됨' : savedAt ? `${formatSavedTime(savedAt)} 저장됨` : '저장됨'}
          </span>
          <button
            type="button"
            onClick={() => setIsPublished((value) => !value)}
            aria-pressed={isPublished}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {isPublished ? '공개' : '비공개'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void saveChapter(false)}
            disabled={isSaving}
            aria-busy={isSaving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? '저장 중' : '저장'}
          </button>
          <button
            type="button"
            onClick={() => void saveChapter(true)}
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            저장 후 목록
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-zinc-300 hover:bg-background-tertiary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-background-tertiary text-accent' : ''
      }`}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <dt className="flex items-center gap-1 text-xs text-zinc-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-base font-semibold text-zinc-100">{value}</dd>
    </div>
  );
}
