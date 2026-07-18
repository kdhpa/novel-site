# NovelVerse 코드베이스 가이드

이 문서는 현재 모노레포의 탐색용 색인입니다. 세부 실행·보안 규칙은 [AGENTS.md](./AGENTS.md), 환경 변수는 [.env.example](./.env.example), 운영 절차는 [README.md](./README.md)를 기준으로 합니다.

## 구성

```text
apps/
├─ web/                    독자·작가 Next.js 앱
│  └─ src/
│     ├─ app/
│     │  ├─ (auth)/        로그인·가입
│     │  ├─ (read)/        탐색·상세·리더·서재
│     │  ├─ (write)/       대시보드·작품·회차·캐릭터 관리
│     │  └─ api/           웹 REST API
│     ├─ components/
│     │  ├─ editor/        ChapterWriter, NovelForm, CoverImageManager
│     │  ├─ character/     캐릭터 폼·카드·초상화 작업
│     │  ├─ novel/         작품 카드·리더·리뷰
│     │  ├─ layout/        헤더·사이드바·모바일 내비게이션
│     │  └─ ui/            Button, Input, Card, Modal 등
│     └─ lib/
│        ├─ client/        이미지 작업 클라이언트
│        └─ server/        권한·검증·저장·보안 유틸리티
└─ ops/                    별도 운영 콘솔
   └─ src/app/
      ├─ (ops)/            사용자·작품·심사·시즌·감사 로그 화면
      └─ api/ops/          운영 변경 API

packages/
├─ auth/                   운영 콘솔용 NextAuth
├─ db/
│  ├─ prisma/              스키마와 마이그레이션
│  └─ src/                 Prisma 클라이언트
└─ shared/                 공용 라벨·타입·구조화 로깅
```

## 요청 흐름

### 작품 심사

```text
작가 초안 → 심사 요청(PENDING_REVIEW)
          → 관리자 승인(APPROVED + 공개)
          → 작가 내용 변경(DRAFT + 비공개)
```

작품·회차·표지·공개 캐릭터 변경 모두 동일한 심사 초기화 규칙을 사용합니다.

### 이미지 생성

```text
클라이언트
  → POST /api/ai/image-jobs
  → Replicate prediction + ImageGenerationJob
  → GET /api/ai/image-jobs/[id] 폴링
  → 원격 이미지 검증/재인코딩
  → Supabase 또는 영구 로컬 저장소
  → DB 결과 재사용
```

### 조회수

```text
공개 작품/회차 요청
  → 현재 작가·관리자 제외
  → 사용자 또는 IP+UA를 HMAC
  → UTC 일일 고유 레코드 INSERT
  → 최초 요청만 카운터 증가
```

## 데이터 모델

핵심 모델은 `User`, `Novel`, `Chapter`, `Character`, `ChapterIllustration`, `Bookmark`, `Like`, `Review`, `Comment`, `ReadingHistory`, `Season`, `AdminAuditLog`입니다.

운영 안정성 모델:

- `RateLimitBucket`: 인스턴스 간 공유 요청 제한
- `ContentView`: 일일 고유 조회
- `ImageGenerationJob`: 이미지 provider 및 저장 결과

정확한 필드와 인덱스는 `packages/db/prisma/schema.prisma`가 유일한 기준입니다.

## 검증 순서

```bash
npm run prisma:validate
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

CI는 빈 PostgreSQL에서 전체 마이그레이션을 재생한 뒤 같은 검증을 수행합니다.
