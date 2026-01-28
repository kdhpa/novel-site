# NovelVerse - 웹소설 플랫폼 가이드

AI 이미지 생성 기능이 포함된 웹소설 플랫폼입니다.

## 목차

1. [프로젝트 구조](#프로젝트-구조)
2. [설치 및 실행](#설치-및-실행)
3. [환경변수 설정](#환경변수-설정)
4. [주요 기능](#주요-기능)
5. [기술 스택](#기술-스택)
6. [API 엔드포인트](#api-엔드포인트)

---

## 프로젝트 구조

```
novelverse/
├── prisma/
│   └── schema.prisma          # 데이터베이스 스키마
├── src/
│   ├── app/                   # Next.js App Router 페이지
│   │   ├── (auth)/            # 인증 관련 페이지 (로그인, 회원가입)
│   │   ├── (read)/            # 독자용 페이지 (작품 목록, 상세, 리더)
│   │   ├── (write)/           # 작가용 페이지 (대시보드, 작품 관리)
│   │   ├── api/               # API Routes
│   │   ├── layout.tsx         # 루트 레이아웃
│   │   ├── page.tsx           # 홈페이지
│   │   └── globals.css        # 전역 스타일
│   ├── components/            # React 컴포넌트
│   │   ├── ui/                # 기본 UI 컴포넌트
│   │   ├── layout/            # 레이아웃 컴포넌트
│   │   ├── novel/             # 소설 관련 컴포넌트
│   │   ├── editor/            # 에디터 컴포넌트
│   │   └── providers/         # Context Providers
│   ├── lib/                   # 유틸리티 및 설정
│   │   ├── prisma.ts          # Prisma 클라이언트
│   │   ├── supabase.ts        # Supabase 클라이언트
│   │   ├── auth.ts            # NextAuth 설정
│   │   └── ai.ts              # AI 이미지 생성
│   ├── types/                 # TypeScript 타입 정의
│   └── middleware.ts          # 인증 미들웨어
└── package.json
```

---

## 설치 및 실행

### 1. 의존성 설치

```bash
cd novelverse
npm install
```

### 2. 환경변수 설정

`.env` 파일을 생성하고 필요한 환경변수를 설정합니다. (아래 환경변수 설정 섹션 참조)

### 3. 데이터베이스 설정

```bash
# Prisma 클라이언트 생성
npx prisma generate

# 데이터베이스 마이그레이션
npx prisma migrate dev --name init
```

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

### 5. 빌드 및 프로덕션 실행

```bash
# 빌드
npm run build

# 프로덕션 실행
npm run start
```

---

## 환경변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 변수들을 설정합니다:

```env
# 데이터베이스 (PostgreSQL)
DATABASE_URL="postgresql://username:password@localhost:5432/novelverse"

# NextAuth 설정
NEXTAUTH_SECRET="your-super-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth (선택사항)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Supabase (이미지 저장용)
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"

# Stability AI (이미지 생성용)
STABILITY_API_KEY="your-stability-ai-api-key"
```

### 환경변수 설명

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `DATABASE_URL` | 필수 | PostgreSQL 데이터베이스 연결 URL |
| `NEXTAUTH_SECRET` | 필수 | NextAuth 암호화 키 (32자 이상 권장) |
| `NEXTAUTH_URL` | 필수 | 앱 URL (개발: http://localhost:3000) |
| `GOOGLE_CLIENT_ID` | 선택 | Google OAuth 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | 선택 | Google OAuth 클라이언트 시크릿 |
| `NEXT_PUBLIC_SUPABASE_URL` | 선택 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 선택 | Supabase 익명 키 |
| `STABILITY_API_KEY` | 선택 | Stability AI API 키 |

---

## 주요 기능

### 사용자 기능

#### 1. 회원가입 및 로그인
- 이메일/비밀번호 로그인
- Google OAuth 로그인 (선택)
- 자동 세션 관리

#### 2. 소설 읽기
- 소설 목록 조회 및 검색
- 장르/상태별 필터링
- 소설 상세 정보 조회
- 회차별 읽기
- 글자 크기/줄 간격 조절
- 라이트/다크 모드 지원

### 작가 기능

#### 1. 작품 관리
- 새 작품 등록
- 작품 정보 수정/삭제
- 표지 이미지 설정 또는 AI 생성

#### 2. 회차 관리
- 회차 작성 (TipTap 에디터)
- 회차 수정/삭제
- 공개/비공개 설정
- AI 삽화 생성

### AI 기능

#### 이미지 생성
- Stability AI SDXL 모델 사용
- 표지 이미지 자동 생성
- 회차 삽화 생성
- 스타일 선택 (애니메이션, 실사, 판타지, 디지털아트)
- 비율 선택 (1:1, 16:9, 9:16, 4:3)

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| 스타일링 | Tailwind CSS |
| 데이터베이스 | PostgreSQL + Prisma ORM |
| 인증 | NextAuth.js v5 |
| 파일 저장소 | Supabase Storage |
| AI 이미지 | Stability AI |
| 텍스트 에디터 | TipTap |
| 테마 | next-themes |

---

## API 엔드포인트

### 인증

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/[...nextauth]` | NextAuth 인증 |

### 소설

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/novels` | 소설 목록 조회 |
| POST | `/api/novels` | 새 소설 등록 |
| GET | `/api/novels/[id]` | 소설 상세 조회 |
| PATCH | `/api/novels/[id]` | 소설 수정 |
| DELETE | `/api/novels/[id]` | 소설 삭제 |

### 회차

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/novels/[id]/chapters` | 회차 목록 조회 |
| POST | `/api/novels/[id]/chapters` | 새 회차 등록 |
| GET | `/api/novels/[id]/chapters/[chapterId]` | 회차 상세 조회 |
| PATCH | `/api/novels/[id]/chapters/[chapterId]` | 회차 수정 |
| DELETE | `/api/novels/[id]/chapters/[chapterId]` | 회차 삭제 |

### AI 이미지

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/api/ai/generate-image` | AI 이미지 생성 |

### 사용자

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/user` | 현재 사용자 정보 |
| PATCH | `/api/user` | 사용자 정보 수정 |

---

## 데이터베이스 관리

### Prisma Studio 실행

데이터베이스를 시각적으로 관리하려면:

```bash
npx prisma studio
```

브라우저에서 `http://localhost:5555`로 접속합니다.

### 마이그레이션

스키마 변경 후:

```bash
npx prisma migrate dev --name migration_name
```

### 클라이언트 재생성

```bash
npx prisma generate
```

---

## 배포 가이드

### Vercel 배포

1. GitHub에 코드를 푸시합니다.
2. Vercel에서 프로젝트를 import합니다.
3. 환경변수를 설정합니다.
4. 배포합니다.

### 환경변수 설정 시 주의사항

- `NEXTAUTH_URL`을 실제 배포 URL로 변경
- `DATABASE_URL`을 프로덕션 데이터베이스 URL로 변경
- 모든 API 키가 유효한지 확인

---

## 문제 해결

### 일반적인 문제

#### Prisma 클라이언트 오류
```bash
npx prisma generate
```

#### 데이터베이스 연결 오류
- `DATABASE_URL` 환경변수 확인
- PostgreSQL 서버 실행 여부 확인

#### NextAuth 오류
- `NEXTAUTH_SECRET` 설정 확인
- `NEXTAUTH_URL` 설정 확인

#### AI 이미지 생성 실패
- `STABILITY_API_KEY` 유효성 확인
- API 사용량 제한 확인

---

## 라이선스

MIT License

---

## 문의

이슈나 기능 요청은 GitHub Issues를 통해 제출해주세요.
