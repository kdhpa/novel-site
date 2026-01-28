# NovelVerse 코드베이스 가이드

웹소설 플랫폼 NovelVerse의 전체 코드 구조와 설명입니다.

---

## 목차

1. [프로젝트 구조](#프로젝트-구조)
2. [설정 파일](#1-설정-파일)
3. [데이터베이스 스키마 (Prisma)](#2-데이터베이스-스키마-prisma)
4. [핵심 앱 파일](#3-핵심-앱-파일)
5. [인증 시스템 (NextAuth)](#4-인증-시스템-nextauth)
6. [UI 컴포넌트](#5-ui-컴포넌트)
7. [레이아웃 컴포넌트](#6-레이아웃-컴포넌트)
8. [소설 관련 컴포넌트](#7-소설-관련-컴포넌트)
9. [에디터 컴포넌트](#8-에디터-컴포넌트)
10. [API 라우트](#9-api-라우트)
11. [라이브러리 파일](#10-라이브러리-파일)
12. [기술 스택](#기술-스택)

---

## 프로젝트 구조

```
src/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # 전체 레이아웃
│   ├── page.tsx                # 메인 홈페이지
│   ├── globals.css             # 전역 스타일
│   ├── (auth)/                 # 인증 페이지 그룹
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (read)/                 # 독자용 페이지 그룹
│   │   └── novels/
│   │       ├── page.tsx        # 소설 목록
│   │       └── [id]/           # 소설 상세/읽기
│   ├── (write)/                # 작가용 페이지 그룹
│   │   ├── dashboard/page.tsx  # 대시보드
│   │   └── novels/             # 소설/회차 관리
│   └── api/                    # API 라우트
│       ├── novels/             # 소설 CRUD
│       ├── auth/register/      # 회원가입
│       └── ai/generate-image/  # AI 이미지 생성
├── components/
│   ├── ui/                     # 재사용 UI (Button, Input, Card, Modal)
│   ├── layout/                 # 레이아웃 (Header, Footer, Sidebar)
│   ├── novel/                  # 소설 관련 (NovelCard, Reader, ChapterList)
│   └── editor/                 # 에디터 (ChapterEditor, NovelForm, ImageGenerator)
├── lib/                        # 유틸리티
│   ├── auth.ts                 # NextAuth 설정
│   ├── prisma.ts               # DB 클라이언트
│   └── supabase.ts             # Supabase 클라이언트
├── types/                      # TypeScript 타입
└── middleware.ts               # 인증 미들웨어
```

---

## 1. 설정 파일

### package.json

프로젝트 정보와 의존성을 정의합니다.

```json
{
  "scripts": {
    "dev": "next dev",       // 개발 서버 실행
    "build": "next build",   // 프로덕션 빌드
    "start": "next start",   // 프로덕션 서버 실행
    "lint": "eslint"         // 코드 검사
  }
}
```

**주요 의존성:**
- `next`: Next.js 프레임워크
- `next-auth`: 인증 라이브러리
- `@prisma/client`: 데이터베이스 ORM
- `@tiptap/react`: 리치 텍스트 에디터
- `tailwindcss`: CSS 프레임워크

### tsconfig.json

TypeScript 설정 파일입니다.

```json
{
  "compilerOptions": {
    "target": "ES2017",        // JavaScript 버전
    "strict": true,            // 엄격한 타입 검사
    "paths": {
      "@/*": ["./src/*"]       // @/로 시작하면 src/ 폴더를 의미
    }
  }
}
```

**경로 별칭 예시:**
- `@/components/Button` = `./src/components/Button`
- `@/lib/prisma` = `./src/lib/prisma`

---

## 2. 데이터베이스 스키마 (Prisma)

### prisma/schema.prisma

데이터베이스 구조를 정의하는 파일입니다.

#### Enum (열거형)

```prisma
enum Role {
  USER      // 일반 사용자
  AUTHOR    // 작가
  ADMIN     // 관리자
}

enum Genre {
  FANTASY       // 판타지
  ROMANCE       // 로맨스
  SF            // SF
  MARTIAL_ARTS  // 무협
  MYSTERY       // 미스터리
  HORROR        // 호러
  MODERN        // 현대
  OTHER         // 기타
}

enum Status {
  ONGOING    // 연재중
  COMPLETED  // 완결
  HIATUS     // 휴재
}
```

#### User 모델

```prisma
model User {
  id            String    @id @default(cuid())  // 고유 ID
  email         String    @unique               // 이메일 (중복불가)
  password      String?                         // 비밀번호 (OAuth는 null)
  name          String?                         // 이름
  nickname      String?   @unique               // 닉네임
  image         String?                         // 프로필 이미지
  bio           String?                         // 자기소개
  role          Role      @default(USER)        // 역할
  createdAt     DateTime  @default(now())       // 가입일
  updatedAt     DateTime  @updatedAt            // 수정일

  // 관계
  novels    Novel[]     // 작성한 소설들
  bookmarks Bookmark[]  // 북마크한 소설들
  likes     Like[]      // 좋아요한 소설들
  comments  Comment[]   // 작성한 댓글들
}
```

#### Novel 모델

```prisma
model Novel {
  id          String   @id @default(cuid())
  title       String                         // 제목
  description String?  @db.Text              // 설명 (긴 텍스트)
  coverImage  String?                        // 표지 이미지 URL
  genre       Genre    @default(OTHER)       // 장르
  status      Status   @default(ONGOING)     // 연재상태
  viewCount   Int      @default(0)           // 조회수
  isPublished Boolean  @default(false)       // 공개여부
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // 관계
  authorId  String
  author    User       @relation(...)        // 작가
  chapters  Chapter[]                        // 회차들
  bookmarks Bookmark[]
  likes     Like[]
  comments  Comment[]
  tags      TagsOnNovels[]
}
```

#### Chapter 모델

```prisma
model Chapter {
  id            String    @id @default(cuid())
  chapterNumber Int                          // 회차 번호
  title         String                       // 제목
  content       String    @db.Text           // 본문
  aiImage       String?                      // AI 생성 삽화
  aiImagePrompt String?                      // AI 이미지 프롬프트
  viewCount     Int       @default(0)        // 조회수
  isPublished   Boolean   @default(false)    // 공개여부
  publishedAt   DateTime?                    // 발행일
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // 관계
  novelId String
  novel   Novel  @relation(...)

  @@unique([novelId, chapterNumber])  // 소설별 회차번호 중복 방지
}
```

#### 기타 모델

```prisma
// 북마크
model Bookmark {
  id        String   @id @default(cuid())
  userId    String
  novelId   String
  createdAt DateTime @default(now())

  @@unique([userId, novelId])  // 중복 북마크 방지
}

// 좋아요
model Like {
  id        String   @id @default(cuid())
  userId    String
  novelId   String
  createdAt DateTime @default(now())

  @@unique([userId, novelId])  // 중복 좋아요 방지
}

// 댓글 (대댓글 지원)
model Comment {
  id        String    @id @default(cuid())
  content   String    @db.Text
  userId    String
  novelId   String
  parentId  String?   // 부모 댓글 (대댓글용)
  createdAt DateTime  @default(now())

  parent    Comment?  @relation("CommentReplies", fields: [parentId], ...)
  replies   Comment[] @relation("CommentReplies")
}

// 태그
model Tag {
  id     String         @id @default(cuid())
  name   String         @unique
  novels TagsOnNovels[]
}

// 소설-태그 다대다 관계
model TagsOnNovels {
  novelId String
  tagId   String

  @@id([novelId, tagId])
}
```

---

## 3. 핵심 앱 파일

### src/app/layout.tsx

모든 페이지에 적용되는 전체 레이아웃입니다.

```tsx
import { Noto_Sans_KR } from 'next/font/google';
import Providers from '@/components/providers/ThemeProvider';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

// 구글 폰트 로드
const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// SEO 메타데이터
export const metadata: Metadata = {
  title: {
    default: 'NovelVerse - 웹소설 플랫폼',
    template: '%s | NovelVerse',  // 각 페이지 제목 | NovelVerse
  },
  description: 'AI 이미지 생성 기능이 포함된 웹소설 플랫폼입니다.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${notoSansKR.variable} font-sans`}>
        <Providers>           {/* 테마 등 전역 상태 */}
          <div className="min-h-screen flex flex-col">
            <Header />        {/* 헤더 */}
            <main className="flex-1">{children}</main>  {/* 페이지 내용 */}
            <Footer />        {/* 푸터 */}
          </div>
        </Providers>
      </body>
    </html>
  );
}
```

### src/app/page.tsx

메인 홈페이지입니다. 서버 컴포넌트로 DB에서 직접 데이터를 조회합니다.

```tsx
import prisma from '@/lib/prisma';
import NovelCard from '@/components/novel/NovelCard';

// 최신 소설 조회
async function getLatestNovels() {
  const novels = await prisma.novel.findMany({
    where: { isPublished: true },    // 공개된 소설만
    take: 10,                         // 10개만
    orderBy: { createdAt: 'desc' },  // 최신순
    select: {
      id: true,
      title: true,
      author: { select: { nickname, image } },
      _count: { select: { chapters, likes } },
    },
  });
  return novels;
}

// 인기 소설 조회
async function getPopularNovels() {
  const novels = await prisma.novel.findMany({
    where: { isPublished: true },
    take: 5,
    orderBy: { viewCount: 'desc' },  // 조회수순
    // ...
  });
  return novels;
}

export default async function HomePage() {
  // 병렬로 데이터 조회
  const [latestNovels, popularNovels] = await Promise.all([
    getLatestNovels(),
    getPopularNovels(),
  ]);

  return (
    <div>
      {/* 히어로 섹션 */}
      <section className="bg-gradient-to-br from-indigo-600 to-purple-700">
        <h1>상상을 현실로, 이야기에 생명을 불어넣다</h1>
        <Button>작품 둘러보기</Button>
        <Button>작가로 시작하기</Button>
      </section>

      {/* 기능 소개 */}
      <section>
        <div>AI 이미지 생성</div>
        <div>강력한 에디터</div>
        <div>편안한 독서 환경</div>
      </section>

      {/* 인기 작품 */}
      <section>
        <h2>인기 작품</h2>
        <div className="grid grid-cols-5 gap-4">
          {popularNovels.map((novel) => (
            <NovelCard key={novel.id} novel={novel} />
          ))}
        </div>
      </section>

      {/* 최신 작품 */}
      <section>
        <h2>최신 작품</h2>
        {/* ... */}
      </section>
    </div>
  );
}
```

### src/app/globals.css

전역 CSS 스타일입니다.

```css
@import "tailwindcss";  /* Tailwind CSS 임포트 */

/* 라이트/다크 모드 색상 변수 */
:root {
  --background: #f9fafb;
  --foreground: #111827;
}

.dark {
  --background: #030712;
  --foreground: #f3f4f6;
}

/* 커스텀 스크롤바 */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}

.dark ::-webkit-scrollbar-thumb {
  background: #4b5563;
}

/* 텍스트 말줄임 */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 에디터 플레이스홀더 */
.ProseMirror p.is-editor-empty:first-child::before {
  color: #9ca3af;
  content: attr(data-placeholder);
  float: left;
  pointer-events: none;
}
```

---

## 4. 인증 시스템 (NextAuth)

### src/lib/auth.ts

NextAuth v5 메인 설정 파일입니다.

```tsx
import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import prisma from './prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),  // Prisma와 연동

  providers: [
    // 1. Google OAuth 로그인
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // 2. 이메일/비밀번호 로그인
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // DB에서 유저 찾기
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) return null;

        // 비밀번호 검증
        const isValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          nickname: user.nickname,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    // JWT 토큰에 유저 정보 저장
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.nickname = user.nickname;
      }
      return token;
    },

    // 세션에 토큰 정보 전달
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.nickname = token.nickname;
      return session;
    },
  },
});

// 헬퍼 함수들
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  return prisma.user.findUnique({
    where: { id: session.user.id },
  });
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  return session.user;
}

export async function requireAuthor() {
  const user = await requireAuth();
  if (user.role !== 'AUTHOR' && user.role !== 'ADMIN') {
    throw new Error('Author access required');
  }
  return user;
}
```

### src/lib/auth.config.ts

미들웨어용 Edge 호환 설정입니다.

```tsx
export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },  // JWT 세션 사용

  pages: {
    signIn: '/login',  // 커스텀 로그인 페이지
    error: '/login',
  },

  callbacks: {
    // 페이지 접근 권한 체크 (미들웨어에서 실행)
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // 보호된 경로들 (로그인 필요)
      const protectedPatterns = [
        /^\/dashboard/,
        /^\/novels\/new/,
        /^\/novels\/[^/]+\/edit/,
        /^\/novels\/[^/]+\/chapters/,
      ];

      // 인증 경로들 (비로그인만)
      const authPatterns = [/^\/login/, /^\/register/];

      const isProtectedRoute = protectedPatterns.some(p => p.test(pathname));
      const isAuthRoute = authPatterns.some(p => p.test(pathname));

      // 보호된 경로에 비로그인 접근 → 로그인 페이지로
      if (isProtectedRoute && !isLoggedIn) {
        return false;
      }

      // 로그인 상태에서 인증 페이지 접근 → 홈으로
      if (isAuthRoute && isLoggedIn) {
        return Response.redirect(new URL('/'));
      }

      return true;
    },
  },
};
```

### src/app/(auth)/login/page.tsx

로그인 페이지입니다.

```tsx
'use client';  // 클라이언트 컴포넌트

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const result = await signIn('credentials', {
      email: formData.email,
      password: formData.password,
      redirect: false,  // 직접 리다이렉트 처리
    });

    if (result?.error) {
      setError('이메일 또는 비밀번호가 일치하지 않습니다.');
    } else {
      router.push('/');
      router.refresh();
    }

    setIsLoading(false);
  };

  return (
    <Card>
      <h1>로그인</h1>

      {error && <div className="text-red-500">{error}</div>}

      <form onSubmit={handleSubmit}>
        <Input
          label="이메일"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
        <Input
          label="비밀번호"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        />
        <Button type="submit" isLoading={isLoading}>로그인</Button>
      </form>

      <hr />

      <Button onClick={() => signIn('google')}>
        Google로 로그인
      </Button>

      <p>
        계정이 없으신가요? <Link href="/register">회원가입</Link>
      </p>
    </Card>
  );
}
```

---

## 5. UI 컴포넌트

### src/components/ui/Button.tsx

재사용 가능한 버튼 컴포넌트입니다.

```tsx
'use client';

import { forwardRef } from 'react';
import { clsx } from 'clsx';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, fullWidth, children, ...props }, ref) => {

    const variants = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
      secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
      outline: 'border-2 border-gray-300 text-gray-700 hover:bg-gray-100',
      ghost: 'text-gray-700 hover:bg-gray-100',
      danger: 'bg-red-600 text-white hover:bg-red-700',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    };

    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center font-medium rounded-lg',
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
        )}
        disabled={isLoading}
        {...props}
      >
        {isLoading && <Spinner />}
        {children}
      </button>
    );
  }
);
```

**사용 예시:**
```tsx
<Button variant="primary" size="lg">저장하기</Button>
<Button variant="outline" isLoading={loading}>로딩 중...</Button>
<Button variant="danger" fullWidth>삭제</Button>
```

### src/components/ui/Input.tsx

입력 필드 컴포넌트입니다.

```tsx
'use client';

import { forwardRef } from 'react';
import { clsx } from 'clsx';

interface InputProps {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium mb-1">
            {label}
          </label>
        )}

        <input
          ref={ref}
          className={clsx(
            'w-full px-4 py-2 rounded-lg border',
            'focus:ring-2 focus:ring-indigo-500',
            error ? 'border-red-500' : 'border-gray-300',
          )}
          {...props}
        />

        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
        {helperText && !error && (
          <p className="mt-1 text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    );
  }
);
```

**사용 예시:**
```tsx
<Input label="이메일" type="email" placeholder="email@example.com" />
<Input label="비밀번호" error="8자 이상 입력해주세요" />
<Input label="닉네임" helperText="다른 사용자에게 표시됩니다" />
```

### src/components/ui/Card.tsx

카드 컴포넌트입니다.

```tsx
'use client';

import { clsx } from 'clsx';

interface CardProps {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  onClick?: () => void;
}

export default function Card({ children, padding = 'md', hover, onClick }) {
  const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' };

  return (
    <div
      className={clsx(
        'bg-white dark:bg-gray-800 rounded-xl shadow-sm border',
        paddings[padding],
        hover && 'hover:shadow-md cursor-pointer',
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// 서브 컴포넌트
export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardFooter({ children }) {
  return (
    <div className="mt-4 pt-4 border-t">
      {children}
    </div>
  );
}
```

### src/components/ui/Modal.tsx

모달 컴포넌트입니다. Headless UI 사용.

```tsx
'use client';

import { Dialog, Transition } from '@headlessui/react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <Transition show={isOpen}>
      <Dialog onClose={onClose} className="relative z-50">
        {/* 배경 오버레이 */}
        <Transition.Child
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        {/* 모달 컨텐츠 */}
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className={clsx(
            'bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl',
            sizes[size]
          )}>
            {title && (
              <Dialog.Title className="text-lg font-semibold mb-4">
                {title}
              </Dialog.Title>
            )}
            {children}
          </Dialog.Panel>
        </div>
      </Dialog>
    </Transition>
  );
}
```

---

## 6. 레이아웃 컴포넌트

### src/components/layout/Header.tsx

헤더 컴포넌트입니다. 로그인 상태에 따라 다른 UI를 표시합니다.

```tsx
'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';

export default function Header() {
  const { data: session, status } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">

        {/* 로고 */}
        <Link href="/">
          <span className="text-2xl font-bold text-indigo-600">NovelVerse</span>
        </Link>

        {/* 데스크톱 네비게이션 */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/novels">작품 목록</Link>
          {session && <Link href="/dashboard">내 작품</Link>}
        </nav>

        {/* 우측 영역 */}
        <div className="flex items-center gap-4">
          <ThemeToggle />

          {status === 'loading' ? (
            // 로딩 중
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
          ) : session ? (
            // 로그인 상태
            <div className="relative">
              <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}>
                <img src={session.user.image} className="w-8 h-8 rounded-full" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg">
                  <p>{session.user.nickname}</p>
                  <Link href="/dashboard">내 작품 관리</Link>
                  <Link href="/novels/new">새 작품 등록</Link>
                  <button onClick={() => signOut()}>로그아웃</button>
                </div>
              )}
            </div>
          ) : (
            // 비로그인 상태
            <div className="flex items-center gap-2">
              <Link href="/login"><Button variant="ghost">로그인</Button></Link>
              <Link href="/register"><Button>회원가입</Button></Link>
            </div>
          )}

          {/* 모바일 메뉴 버튼 */}
          <button
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      {/* 모바일 네비게이션 */}
      {isMenuOpen && (
        <nav className="md:hidden py-4 border-t">
          <Link href="/novels">작품 목록</Link>
          {session && <Link href="/dashboard">내 작품</Link>}
        </nav>
      )}
    </header>
  );
}
```

### src/components/layout/Sidebar.tsx

대시보드용 사이드바입니다.

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

const dashboardLinks = [
  { href: '/dashboard', label: '대시보드', icon: <HomeIcon /> },
  { href: '/novels/new', label: '새 작품 등록', icon: <PlusIcon /> },
];

export default function Sidebar() {
  const pathname = usePathname();  // 현재 경로

  return (
    <aside className="w-64 bg-white border-r min-h-screen">
      <nav className="p-4 space-y-1">
        {dashboardLinks.map((link) => {
          const isActive = pathname === link.href;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'flex items-center gap-3 px-4 py-2.5 rounded-lg',
                isActive
                  ? 'bg-indigo-50 text-indigo-600'   // 활성 상태
                  : 'text-gray-700 hover:bg-gray-100' // 비활성 상태
              )}
            >
              {link.icon}
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

---

## 7. 소설 관련 컴포넌트

### src/components/novel/NovelCard.tsx

소설 카드 컴포넌트입니다. 목록에서 각 소설을 표시합니다.

```tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { GenreBadge, StatusBadge } from '@/components/ui/Badge';

export default function NovelCard({ novel }) {
  return (
    <Link href={`/novels/${novel.id}`}>
      <div className="bg-white rounded-xl shadow-sm hover:shadow-md">
        {/* 표지 이미지 */}
        <div className="relative aspect-[3/4]">
          {novel.coverImage ? (
            <Image
              src={novel.coverImage}
              alt={novel.title}
              fill
              className="object-cover hover:scale-105 transition-transform"
            />
          ) : (
            <PlaceholderIcon />
          )}

          {/* 연재 상태 배지 */}
          <div className="absolute top-2 right-2">
            <StatusBadge status={novel.status} />
          </div>
        </div>

        {/* 정보 */}
        <div className="p-4">
          <GenreBadge genre={novel.genre} />

          <h3 className="font-semibold line-clamp-1">{novel.title}</h3>
          <p className="text-sm text-gray-500">{novel.author.nickname}</p>

          {novel.description && (
            <p className="text-sm text-gray-600 mt-2 line-clamp-2">
              {novel.description}
            </p>
          )}

          {/* 통계 */}
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
            <span>{novel._count.chapters}화</span>
            <span>{novel._count.likes} 좋아요</span>
            <span>{novel.viewCount} 조회</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
```

### src/components/novel/NovelList.tsx

소설 목록 + 필터 컴포넌트입니다.

```tsx
'use client';

import { useState } from 'react';
import NovelCard from './NovelCard';
import { GenreLabels, StatusLabels } from '@/types';

export default function NovelList({ novels, showFilters = true }) {
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // 필터링 로직
  const filteredNovels = novels.filter((novel) => {
    if (selectedGenre && novel.genre !== selectedGenre) return false;
    if (selectedStatus && novel.status !== selectedStatus) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        novel.title.toLowerCase().includes(query) ||
        novel.description?.toLowerCase().includes(query) ||
        novel.author.nickname?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div>
      {showFilters && (
        <div className="mb-6 space-y-4">
          {/* 검색창 */}
          <input
            type="text"
            placeholder="작품 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* 필터 */}
          <div className="flex gap-4">
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
            >
              <option value="">모든 장르</option>
              {Object.entries(GenreLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">모든 상태</option>
              {Object.entries(StatusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            {(selectedGenre || selectedStatus || searchQuery) && (
              <button onClick={() => { /* 필터 초기화 */ }}>
                필터 초기화
              </button>
            )}
          </div>
        </div>
      )}

      <p>{filteredNovels.length}개의 작품</p>

      {/* 소설 그리드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filteredNovels.map((novel) => (
          <NovelCard key={novel.id} novel={novel} />
        ))}
      </div>
    </div>
  );
}
```

### src/components/novel/Reader.tsx

소설 리더 컴포넌트입니다. 글자 크기, 줄간격 조절 기능이 있습니다.

```tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Reader({ novelId, chapter, prevChapterId, nextChapterId }) {
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.8);

  // localStorage에서 설정 불러오기
  useEffect(() => {
    const savedFontSize = localStorage.getItem('reader-fontSize');
    if (savedFontSize) setFontSize(Number(savedFontSize));
  }, []);

  // 설정 저장
  const updateFontSize = (size: number) => {
    setFontSize(size);
    localStorage.setItem('reader-fontSize', String(size));
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* 컨트롤바 */}
      <div className="sticky top-16 bg-white/90 backdrop-blur py-4 mb-8">
        <Link href={`/novels/${novelId}`}>← 목록으로</Link>

        {/* 글자 크기 조절 */}
        <div className="flex items-center gap-2">
          <span>글자</span>
          <button onClick={() => updateFontSize(Math.max(14, fontSize - 2))}>-</button>
          <span>{fontSize}</span>
          <button onClick={() => updateFontSize(Math.min(28, fontSize + 2))}>+</button>
        </div>

        {/* 줄간격 조절 */}
        <div className="flex items-center gap-2">
          <span>줄간격</span>
          <button onClick={() => setLineHeight(Math.max(1.4, lineHeight - 0.2))}>-</button>
          <span>{lineHeight.toFixed(1)}</span>
          <button onClick={() => setLineHeight(Math.min(2.4, lineHeight + 0.2))}>+</button>
        </div>
      </div>

      {/* 챕터 헤더 */}
      <header className="mb-8 text-center">
        <p className="text-indigo-600">{chapter.chapterNumber}화</p>
        <h1 className="text-2xl font-bold">{chapter.title}</h1>
      </header>

      {/* AI 삽화 */}
      {chapter.aiImage && (
        <Image src={chapter.aiImage} alt="삽화" className="w-full rounded-lg mb-8" />
      )}

      {/* 본문 */}
      <article
        className="prose max-w-none"
        style={{ fontSize: `${fontSize}px`, lineHeight }}
      >
        <div dangerouslySetInnerHTML={{ __html: chapter.content }} />
      </article>

      {/* 이전/다음 화 네비게이션 */}
      <nav className="mt-12 pt-8 border-t flex justify-between">
        {prevChapterId ? (
          <Link href={`/novels/${novelId}/${prevChapterId}`}>← 이전 화</Link>
        ) : <div />}

        <Link href={`/novels/${novelId}`}>목록</Link>

        {nextChapterId ? (
          <Link href={`/novels/${novelId}/${nextChapterId}`}>다음 화 →</Link>
        ) : <div />}
      </nav>
    </div>
  );
}
```

---

## 8. 에디터 컴포넌트

### src/components/editor/ChapterEditor.tsx

회차 에디터입니다. TipTap 에디터를 사용합니다.

```tsx
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageGenerator from './ImageGenerator';

export default function ChapterEditor({ novelId, initialData, mode, nextChapterNumber }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showImageGenerator, setShowImageGenerator] = useState(false);

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    content: initialData?.content || '',
    chapterNumber: initialData?.chapterNumber || nextChapterNumber,
    aiImage: initialData?.aiImage || '',
    aiImagePrompt: initialData?.aiImagePrompt || '',
    isPublished: initialData?.isPublished || false,
  });

  // TipTap 에디터 초기화
  const editor = useEditor({
    extensions: [StarterKit],
    content: formData.content,
    onUpdate: ({ editor }) => {
      setFormData((prev) => ({ ...prev, content: editor.getHTML() }));
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const url = mode === 'create'
      ? `/api/novels/${novelId}/chapters`
      : `/api/novels/${novelId}/chapters/${initialData?.id}`;

    const response = await fetch(url, {
      method: mode === 'create' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      router.push(`/novels/${novelId}/chapters`);
    }

    setIsLoading(false);
  };

  const handleImageGenerated = useCallback((imageUrl: string, prompt: string) => {
    setFormData((prev) => ({
      ...prev,
      aiImage: imageUrl,
      aiImagePrompt: prompt,
    }));
    setShowImageGenerator(false);
  }, []);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 회차 번호 + 제목 */}
      <div className="grid grid-cols-4 gap-4">
        <Input
          label="회차"
          type="number"
          value={formData.chapterNumber}
          onChange={(e) => setFormData({ ...formData, chapterNumber: Number(e.target.value) })}
        />
        <div className="col-span-3">
          <Input
            label="제목"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>
      </div>

      {/* 에디터 툴바 */}
      <div className="border rounded-lg">
        <div className="flex gap-1 p-2 border-b bg-gray-50">
          <button type="button" onClick={() => editor?.chain().toggleBold().run()}>
            <strong>B</strong>
          </button>
          <button type="button" onClick={() => editor?.chain().toggleItalic().run()}>
            <em>I</em>
          </button>
          <button type="button" onClick={() => editor?.chain().toggleHeading({ level: 2 }).run()}>
            H2
          </button>
          <button type="button" onClick={() => editor?.chain().toggleBulletList().run()}>
            목록
          </button>
        </div>

        {/* 에디터 본문 */}
        <EditorContent editor={editor} className="min-h-[400px] p-4" />
      </div>

      {/* AI 삽화 */}
      <div>
        <div className="flex justify-between mb-2">
          <label>AI 삽화</label>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowImageGenerator(!showImageGenerator)}
          >
            {showImageGenerator ? '닫기' : 'AI로 삽화 생성'}
          </Button>
        </div>

        {showImageGenerator && (
          <ImageGenerator onImageGenerated={handleImageGenerated} />
        )}

        {formData.aiImage && (
          <div className="mt-4">
            <img src={formData.aiImage} alt="AI 삽화" className="max-w-md rounded-lg" />
            <button
              type="button"
              onClick={() => setFormData({ ...formData, aiImage: '', aiImagePrompt: '' })}
            >
              삽화 제거
            </button>
          </div>
        )}
      </div>

      {/* 공개 여부 */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.isPublished}
          onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
        />
        <label>회차 공개 (발행)</label>
      </div>

      {/* 제출 */}
      <div className="flex gap-4">
        <Button type="submit" isLoading={isLoading} fullWidth>
          {mode === 'create' ? '회차 등록' : '저장'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          취소
        </Button>
      </div>
    </form>
  );
}
```

### src/components/editor/ImageGenerator.tsx

AI 이미지 생성 컴포넌트입니다.

```tsx
'use client';

import { useState } from 'react';

export default function ImageGenerator({ onImageGenerated }) {
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  const [request, setRequest] = useState({
    prompt: '',           // 설명
    negativePrompt: '',   // 제외할 요소
    style: 'anime',       // 스타일
    aspectRatio: '16:9',  // 비율
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
  ];

  const handleGenerate = async () => {
    setIsLoading(true);

    const response = await fetch('/api/ai/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'illustration', ...request }),
    });

    const data = await response.json();
    setPreviewUrl(data.data.imageUrl);
    setIsLoading(false);
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      {/* 프롬프트 */}
      <textarea
        placeholder="생성할 이미지를 설명해주세요 (예: 달빛 아래 숲속을 걷는 은발의 소녀)"
        value={request.prompt}
        onChange={(e) => setRequest({ ...request, prompt: e.target.value })}
        rows={3}
      />

      {/* 제외할 요소 */}
      <input
        placeholder="제외할 요소 (예: blurry, watermark)"
        value={request.negativePrompt}
        onChange={(e) => setRequest({ ...request, negativePrompt: e.target.value })}
      />

      {/* 스타일 & 비율 */}
      <div className="grid grid-cols-2 gap-4">
        <select
          value={request.style}
          onChange={(e) => setRequest({ ...request, style: e.target.value })}
        >
          {styles.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={request.aspectRatio}
          onChange={(e) => setRequest({ ...request, aspectRatio: e.target.value })}
        >
          {aspectRatios.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <Button onClick={handleGenerate} isLoading={isLoading} fullWidth>
        이미지 생성
      </Button>

      {/* 미리보기 */}
      {previewUrl && (
        <div className="mt-4">
          <img src={previewUrl} alt="생성된 이미지" className="w-full rounded-lg" />
          <div className="flex gap-2 mt-4">
            <Button onClick={() => onImageGenerated(previewUrl, request.prompt)} fullWidth>
              이 이미지 사용
            </Button>
            <Button variant="secondary" onClick={handleGenerate} isLoading={isLoading}>
              다시 생성
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 9. API 라우트

### src/app/api/novels/route.ts

소설 목록 조회 및 생성 API입니다.

```tsx
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

// GET /api/novels - 소설 목록 조회
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const genre = searchParams.get('genre');
  const search = searchParams.get('search');

  // 필터 조건
  const where = { isPublished: true };
  if (genre) where.genre = genre;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  // 병렬로 데이터 조회
  const [novels, total] = await Promise.all([
    prisma.novel.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        author: { select: { id: true, nickname: true, image: true } },
        _count: { select: { chapters: true, likes: true } },
      },
    }),
    prisma.novel.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      items: novels,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// POST /api/novels - 소설 생성
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: '로그인이 필요합니다.' },
      { status: 401 }
    );
  }

  const body = await request.json();

  if (!body.title?.trim()) {
    return NextResponse.json(
      { success: false, error: '제목을 입력해주세요.' },
      { status: 400 }
    );
  }

  // 첫 작품 등록 시 USER → AUTHOR로 승급
  if (session.user.role === 'USER') {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { role: 'AUTHOR' },
    });
  }

  const novel = await prisma.novel.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim(),
      genre: body.genre || 'OTHER',
      status: body.status || 'ONGOING',
      coverImage: body.coverImage,
      isPublished: body.isPublished || false,
      authorId: session.user.id,
    },
  });

  return NextResponse.json(
    { success: true, data: novel, message: '작품이 등록되었습니다.' },
    { status: 201 }
  );
}
```

### src/app/api/novels/[id]/route.ts

소설 상세 조회, 수정, 삭제 API입니다.

```tsx
// GET /api/novels/[id] - 소설 상세 조회
export async function GET(request, { params }) {
  const { id } = await params;

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, nickname: true, image: true } },
      chapters: {
        where: { isPublished: true },
        orderBy: { chapterNumber: 'asc' },
      },
      tags: { include: { tag: true } },
      _count: { select: { chapters: true, likes: true, comments: true } },
    },
  });

  if (!novel) {
    return NextResponse.json(
      { success: false, error: '작품을 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  // 조회수 증가
  await prisma.novel.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  });

  return NextResponse.json({ success: true, data: novel });
}

// PATCH /api/novels/[id] - 소설 수정
export async function PATCH(request, { params }) {
  const session = await auth();
  const { id } = await params;

  if (!session?.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // 권한 확인
  const novel = await prisma.novel.findUnique({ where: { id } });
  if (novel.authorId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json();

  const updatedNovel = await prisma.novel.update({
    where: { id },
    data: {
      ...(body.title && { title: body.title.trim() }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.genre && { genre: body.genre }),
      ...(body.isPublished !== undefined && { isPublished: body.isPublished }),
    },
  });

  return NextResponse.json({ success: true, data: updatedNovel });
}

// DELETE /api/novels/[id] - 소설 삭제
export async function DELETE(request, { params }) {
  const session = await auth();
  const { id } = await params;

  // 권한 확인 후 삭제
  const novel = await prisma.novel.findUnique({ where: { id } });
  if (novel.authorId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
  }

  await prisma.novel.delete({ where: { id } });

  return NextResponse.json({ success: true, message: '작품이 삭제되었습니다.' });
}
```

### src/app/api/novels/[id]/chapters/route.ts

회차 목록 조회 및 생성 API입니다.

```tsx
// GET /api/novels/[id]/chapters - 회차 목록
export async function GET(request, { params }) {
  const { id } = await params;
  const session = await auth();

  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { authorId: true },
  });

  const isAuthor = session?.user?.id === novel.authorId;

  // 작가는 모든 회차, 독자는 공개된 회차만
  const chapters = await prisma.chapter.findMany({
    where: {
      novelId: id,
      ...(!(isAuthor) && { isPublished: true }),
    },
    orderBy: { chapterNumber: 'asc' },
    select: {
      id: true,
      chapterNumber: true,
      title: true,
      isPublished: true,
      publishedAt: true,
      viewCount: true,
    },
  });

  return NextResponse.json({ success: true, data: chapters });
}

// POST /api/novels/[id]/chapters - 회차 생성
export async function POST(request, { params }) {
  const session = await auth();
  const { id } = await params;

  // 권한 확인
  const novel = await prisma.novel.findUnique({ where: { id } });
  if (novel.authorId !== session.user.id) {
    return NextResponse.json({ error: '작성 권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json();

  // 회차 번호 자동 계산
  let chapterNumber = body.chapterNumber;
  if (!chapterNumber) {
    const lastChapter = await prisma.chapter.findFirst({
      where: { novelId: id },
      orderBy: { chapterNumber: 'desc' },
    });
    chapterNumber = (lastChapter?.chapterNumber || 0) + 1;
  }

  // 중복 체크
  const existing = await prisma.chapter.findFirst({
    where: { novelId: id, chapterNumber },
  });
  if (existing) {
    return NextResponse.json(
      { error: `${chapterNumber}화는 이미 존재합니다.` },
      { status: 400 }
    );
  }

  const chapter = await prisma.chapter.create({
    data: {
      novelId: id,
      chapterNumber,
      title: body.title.trim(),
      content: body.content,
      aiImage: body.aiImage,
      aiImagePrompt: body.aiImagePrompt,
      isPublished: body.isPublished || false,
      publishedAt: body.isPublished ? new Date() : null,
    },
  });

  return NextResponse.json(
    { success: true, data: chapter, message: '회차가 등록되었습니다.' },
    { status: 201 }
  );
}
```

---

## 10. 라이브러리 파일

### src/lib/prisma.ts

Prisma 클라이언트 싱글톤입니다.

```tsx
import { PrismaClient } from '@/generated/prisma/client';

// 전역에 Prisma 인스턴스 저장 (개발 시 핫리로드 대응)
const globalForPrisma = globalThis as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    accelerateUrl: process.env.DATABASE_URL,
  });

// 개발 환경에서만 전역에 저장 (인스턴스 중복 방지)
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
```

### src/types/index.ts

TypeScript 타입 정의 파일입니다.

```tsx
import { Role, Genre, Status } from '@/generated/prisma/client';

// Re-export enums
export { Role, Genre, Status };

// 소설 목록용 타입
export type NovelListItem = {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  genre: Genre;
  status: Status;
  viewCount: number;
  createdAt: Date;
  author: { id: string; nickname?: string; image?: string };
  _count: { chapters: number; likes: number };
};

// 회차 목록용 타입
export type ChapterListItem = {
  id: string;
  chapterNumber: number;
  title: string;
  isPublished: boolean;
  publishedAt?: Date;
  createdAt: Date;
  viewCount: number;
};

// API 응답 타입
export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

// 페이지네이션 응답
export type PaginatedResponse<T> = ApiResponse<{
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}>;

// 폼 입력 타입
export type NovelFormInput = {
  title: string;
  description?: string;
  genre: Genre;
  status?: Status;
  coverImage?: string;
  tags?: string[];
  isPublished?: boolean;
};

export type ChapterFormInput = {
  title: string;
  content: string;
  chapterNumber?: number;
  aiImage?: string;
  aiImagePrompt?: string;
  isPublished?: boolean;
};

// AI 이미지 요청 타입
export type AIImageRequest = {
  prompt: string;
  negativePrompt?: string;
  style?: 'anime' | 'realistic' | 'fantasy' | 'watercolor';
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3';
};

// 한글 라벨
export const GenreLabels: Record<Genre, string> = {
  FANTASY: '판타지',
  ROMANCE: '로맨스',
  SF: 'SF',
  MARTIAL_ARTS: '무협',
  MYSTERY: '미스터리',
  HORROR: '호러',
  MODERN: '현대',
  OTHER: '기타',
};

export const StatusLabels: Record<Status, string> = {
  ONGOING: '연재중',
  COMPLETED: '완결',
  HIATUS: '휴재',
};

export const RoleLabels: Record<Role, string> = {
  USER: '독자',
  AUTHOR: '작가',
  ADMIN: '관리자',
};
```

### src/middleware.ts

인증 미들웨어입니다.

```tsx
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

// NextAuth 미들웨어를 그대로 사용
const { auth } = NextAuth(authConfig);
export const middleware = auth;

// 미들웨어가 적용될 경로
export const config = {
  matcher: [
    // API, 정적 파일 제외한 모든 경로
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
};
```

---

## 기술 스택

| 분야 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| 인증 | NextAuth v5 (Google OAuth + Credentials) |
| 데이터베이스 | PostgreSQL + Prisma ORM |
| 스타일링 | Tailwind CSS |
| UI 라이브러리 | Headless UI |
| 에디터 | TipTap (리치 텍스트) |
| AI | Stability AI (이미지 생성) |
| 스토리지 | Supabase Storage |
| 배포 | Vercel (권장) |

---

## 실행 방법

```bash
# 개발 서버
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버
npm run start

# 코드 검사
npm run lint
```

---

## 환경 변수 (.env)

```env
# 데이터베이스
DATABASE_URL="postgresql://..."

# NextAuth
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Supabase
NEXT_PUBLIC_SUPABASE_URL="..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."

# Stability AI (이미지 생성)
STABILITY_API_KEY="..."
```

---

*이 문서는 NovelVerse 프로젝트의 전체 코드 구조를 설명합니다.*
