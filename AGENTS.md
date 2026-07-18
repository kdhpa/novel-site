# AGENTS.md

이 파일은 NovelVerse 저장소에서 작업할 때 필요한 현재 기준을 요약합니다.

## Language Preference

**모든 응답은 한국어로 작성합니다.**

## 프로젝트 개요

NovelVerse는 독자용 웹소설 서비스, 작가 도구, 별도 운영자 콘솔을 포함한 Next.js 모노레포입니다.

- `apps/web`: 독자·작가 서비스 (기본 포트 3000)
- `apps/ops`: 운영자 전용 콘솔 (기본 포트 3002)
- `packages/db`: Prisma 스키마, 마이그레이션, DB 클라이언트
- `packages/auth`: 운영 콘솔이 공유하는 NextAuth 설정
- `packages/shared`: 공용 타입·라벨·서버 로깅 유틸리티

## 개발 명령

모든 명령은 저장소 루트에서 실행합니다.

```bash
npm run dev:web
npm run dev:ops
npm run build
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run check
```

Prisma:

```bash
npm run prisma:generate
npm run prisma:validate
npm run prisma:migrate -- --name <name>
npm run prisma:deploy
```

적용된 마이그레이션을 직접 수정하지 말고 새 보정 마이그레이션을 추가합니다.

## 기술 스택

- Next.js 16 App Router, React 19, TypeScript
- PostgreSQL, Prisma ORM 7
- NextAuth v5 (Google OAuth, credentials, JWT session)
- Tailwind CSS 4
- TipTap 3
- Replicate 이미지 생성, Gemini 프롬프트 보조
- Supabase Storage 또는 명시적인 self-hosted 영구 로컬 저장소
- Vitest, Playwright

## 주요 경로

- `apps/web/src/app/api`: 웹 API
- `apps/web/src/components/ui`: 공통 UI
- `apps/web/src/components/editor/ChapterWriter.tsx`: 현재 회차 편집기
- `apps/web/src/lib/server`: 검증, 권한, 레이트리밋, 이미지 보안
- `apps/ops/src/app/api/ops`: 운영자 API
- `packages/db/prisma/schema.prisma`: DB 스키마
- `packages/db/prisma/migrations`: 순차 마이그레이션
- `packages/db/src/generated/prisma`: 생성물, 직접 수정 금지

`@/*`는 각 앱의 `src/*`에 매핑됩니다. 내부 패키지는 `@novelverse/db`, `@novelverse/auth`, `@novelverse/shared`를 사용합니다.

## 핵심 도메인 규칙

- 역할: `USER`, `AUTHOR`, `ADMIN`
- 작품 공개는 `isPublished=true`와 `approvalStatus=APPROVED`를 모두 만족해야 합니다.
- 일반 작가가 심사 대기·승인 콘텐츠를 바꾸면 작품은 `DRAFT` 및 비공개로 돌아갑니다.
- 관리자 변경 API는 JWT 역할만 믿지 않고 DB의 현재 역할을 확인합니다.
- 조회수는 HMAC 처리한 사용자/요청 식별자 기준 하루 한 번만 증가합니다.
- 비용성 API의 제한은 PostgreSQL 버킷을 사용해 인스턴스 간 공유합니다.

## AI 이미지 흐름

1. `POST /api/ai/image-jobs`가 Replicate prediction과 DB 작업을 생성합니다.
2. 클라이언트가 `GET /api/ai/image-jobs/[id]`를 폴링합니다.
3. 성공 결과는 허용 호스트·공개 IP·크기·MIME·파일 시그니처·디코딩을 검증합니다.
4. 이미지를 WebP로 재인코딩한 뒤 결정적 경로에 한 번만 영구 저장합니다.
5. DB 작업 결과를 재사용하며 표지·삽화·초상화 권한을 다시 확인합니다.

## 주요 환경 변수

전체 예시는 `.env.example`을 봅니다.

- `DATABASE_URL`, `DIRECT_URL`
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `AUTH_SECRET`, `AUTH_URL`
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `REPLICATE_API_TOKEN`
- `GOOGLE_GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_APP_URL`

비밀값과 실제 `.env*` 파일은 커밋하지 않습니다.
