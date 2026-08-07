import { z } from 'zod';
import { Genre, Status } from '@novelverse/db/browser';
import { isAllowedProfileImageSource, isAllowedStoredImageSource } from '@/lib/image-hosts';
import {
  normalizeIdentityEmail,
  normalizeNicknameDisplay,
} from '@novelverse/shared';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || undefined);

const optionalNullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      return value || null;
    });

const imageUrl = z
  .string()
  .trim()
  .max(2048, '이미지 URL은 2,048자 이하여야 합니다.')
  .nullable()
  .optional()
  .refine((value) => {
    if (!value) return true;
    return isAllowedStoredImageSource(value);
  }, '유효한 HTTPS 이미지 URL을 입력해 주세요.')
  .transform((value) => {
    if (value === undefined) return undefined;
    return value || null;
  });

export function normalizeEmailAddress(value: string) {
  return normalizeIdentityEmail(value);
}

export const normalizedEmailSchema = z.preprocess(
  (value) => typeof value === 'string' ? normalizeEmailAddress(value) : value,
  z.string().email('올바른 이메일 형식이 아닙니다.').max(255),
);

const normalizedNicknameSchema = z.preprocess(
  (value) => typeof value === 'string' ? normalizeNicknameDisplay(value) : value,
  z.string().min(2, '닉네임은 2자 이상이어야 합니다.').max(20, '닉네임은 20자 이하여야 합니다.'),
);

const profileImageUrl = z
  .string()
  .trim()
  .max(2048, '이미지 URL은 2,048자 이하여야 합니다.')
  .refine((value) => {
    if (!value) return true;
    return isAllowedProfileImageSource(value);
  }, '프로필 이미지는 영구 저장소 또는 지원되는 로그인 공급자의 URL이어야 합니다.');

const jamoOnlyPattern = /^[\u3131-\u318E\s]+$/u;
const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .refine((tag) => !jamoOnlyPattern.test(tag), '초성만으로 된 태그는 등록할 수 없습니다.');

export const registerSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.').max(128),
  nickname: normalizedNicknameSchema,
  name: optionalText(50),
}).strict();

const authTokenSchema = z
  .string()
  .trim()
  .min(32, '인증 토큰이 올바르지 않습니다.')
  .max(128, '인증 토큰이 올바르지 않습니다.')
  .regex(/^[A-Za-z0-9_-]+$/, '인증 토큰이 올바르지 않습니다.');

export const authEmailSchema = z.object({
  email: normalizedEmailSchema,
}).strict();

export const emailVerificationSchema = z.object({
  email: normalizedEmailSchema,
  token: authTokenSchema,
}).strict();

export const passwordResetConfirmSchema = z.object({
  email: normalizedEmailSchema,
  token: authTokenSchema,
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.').max(128),
}).strict();

export const accountDeletionSchema = z.object({
  emailConfirmation: normalizedEmailSchema,
  token: authTokenSchema,
  password: z.string().max(128).optional(),
}).strict();

export const accountExportSchema = z.object({
  token: authTokenSchema,
  password: z.string().max(128).optional(),
}).strict();

export const userProfilePatchSchema = z
  .object({
    name: z.string().trim().min(1, '이름은 1자 이상이어야 합니다.').max(50, '이름은 50자 이하여야 합니다.').nullable().optional(),
    nickname: normalizedNicknameSchema.optional(),
    image: profileImageUrl.nullable().optional(),
    bio: z.string().trim().max(500, '소개는 500자 이하여야 합니다.').nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '수정할 프로필 정보를 입력해 주세요.');

export const novelSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해 주세요.').max(100),
  description: optionalNullableText(5000),
  genres: z.array(z.nativeEnum(Genre)).max(5).default([]),
  status: z.nativeEnum(Status).optional(),
  coverImage: imageUrl,
  tags: z.array(tagSchema).max(10).optional(),
  isPublished: z.boolean().optional(),
  seasonId: z.string().trim().min(1).max(100).optional().nullable(),
}).strict();

export const novelPatchSchema = novelSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, '수정할 작품 정보를 입력해 주세요.');

export const chapterSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해 주세요.').max(120),
  content: z.string().trim().min(1, '본문을 입력해 주세요.').max(500_000),
  chapterNumber: z.number().int().positive().optional(),
  aiImage: imageUrl,
  aiImagePrompt: optionalNullableText(2000),
  isPublished: z.boolean().optional(),
}).strict();

export const chapterPatchSchema = chapterSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, '수정할 회차 정보를 입력해 주세요.');

export const characterSchema = z.object({
  name: z.string().trim().min(1, '캐릭터 이름을 입력해 주세요.').max(80),
  description: optionalNullableText(3000),
  appearance: z.string().trim().min(1, '외형 설명을 입력해 주세요.').max(5000),
  personality: optionalNullableText(3000),
  role: optionalNullableText(80),
  portraitUrl: imageUrl,
  portraitPrompt: optionalNullableText(3000),
}).strict();

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  content: z.string().trim().min(1, '리뷰 내용을 입력해 주세요.').max(2000),
  hasSpoiler: z.boolean().optional().default(false),
}).strict();

export const reviewPatchSchema = reviewSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  '수정할 내용을 입력해 주세요.'
);

export const aiImageSchema = z.object({
  type: z.enum(['cover', 'illustration', 'custom', 'portrait']),
  clientRequestId: z.string().trim().min(16).max(100),
  prompt: z.string().trim().max(2000).optional(),
  negativePrompt: z.string().trim().max(2000).optional(),
  style: z.enum(['anime', 'realistic', 'fantasy', 'watercolor']).optional(),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3']).optional(),
  title: z.string().trim().max(100).optional(),
  genre: z.string().trim().max(40).optional(),
  description: z.string().trim().max(2000).optional(),
  novelId: z.string().trim().max(100).optional(),
  characterId: z.string().trim().max(100).optional(),
  characterIds: z.array(z.string().trim().min(1).max(100)).max(4).optional(),
  appearance: z.string().trim().max(3000).optional(),
  variation: z.string().trim().max(500).optional(),
  options: z
    .object({
      style: z.enum(['anime', 'realistic', 'fantasy', 'watercolor']).optional(),
      mood: z.enum(['mystical', 'dark', 'bright', 'romantic', 'action', 'calm']).optional(),
      useCustomPrompt: z.boolean().optional(),
      customPrompt: z.string().trim().max(2000).optional(),
    })
    .strict()
    .optional(),
}).strict();
