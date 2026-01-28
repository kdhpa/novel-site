# NovelVerse 웹 개발 입문 가이드

> 프로그래밍 기초는 있지만 웹 개발은 처음인 분들을 위한 가이드입니다.

## 목차

- [Part 1: 웹 개발 기초 개념](#part-1-웹-개발-기초-개념)
- [Part 2: 프로젝트 구조 파악하기](#part-2-프로젝트-구조-파악하기)
- [Part 3: 화면 만들기 - 컴포넌트](#part-3-화면-만들기---컴포넌트)
- [Part 4: 페이지와 라우팅](#part-4-페이지와-라우팅)
- [Part 5: 스타일링 - Tailwind CSS](#part-5-스타일링---tailwind-css)
- [Part 6: 데이터베이스 - Prisma](#part-6-데이터베이스---prisma)
- [Part 7: API 라우트 만들기](#part-7-api-라우트-만들기)
- [Part 8: 인증 시스템 - NextAuth](#part-8-인증-시스템---nextauth)
- [Part 9: 전체 흐름 따라가기](#part-9-전체-흐름-따라가기)

---

# Part 1: 웹 개발 기초 개념

## 1.1 웹이 작동하는 원리

웹은 **브라우저**(클라이언트)와 **서버** 간의 대화로 이루어집니다.

```
┌─────────────┐                      ┌─────────────┐
│   브라우저   │  ─── "페이지 줘!" ──▶ │    서버     │
│  (Chrome)   │  ◀── HTML/CSS/JS ─── │  (Next.js)  │
└─────────────┘                      └─────────────┘
```

**비유로 설명하면:**
- 브라우저 = 손님 (음식을 주문하는 사람)
- 서버 = 식당 주방 (음식을 만들어 주는 곳)
- URL = 메뉴판 (원하는 페이지의 주소)
- HTTP = 주문 방식 (어떻게 요청할지의 약속)

## 1.2 프론트엔드 vs 백엔드

| 구분 | 프론트엔드 | 백엔드 |
|------|-----------|--------|
| **역할** | 사용자가 보는 화면 | 데이터 처리와 저장 |
| **위치** | 브라우저에서 실행 | 서버에서 실행 |
| **담당** | UI, 인터랙션 | 비즈니스 로직, DB |
| **비유** | 식당의 홀 | 식당의 주방 |

**이 프로젝트에서:**
- 프론트엔드: `src/components/`, `src/app/*/page.tsx`
- 백엔드: `src/app/api/`, `prisma/`

## 1.3 HTML / CSS / JavaScript: 웹의 3요소

```
HTML  = 뼈대 (집의 구조, 벽과 문)
CSS   = 옷   (집의 인테리어, 색상과 배치)
JavaScript = 움직임 (집의 전기, 스위치 누르면 불 켜짐)
```

```html
<!-- HTML: 구조를 정의 -->
<button class="login-btn">로그인</button>

/* CSS: 모양을 꾸밈 */
.login-btn {
  background-color: blue;
  color: white;
}

// JavaScript: 동작을 추가
button.addEventListener('click', () => {
  alert('로그인 버튼 클릭!');
});
```

## 1.4 React란?

**React**는 UI를 만드는 JavaScript 라이브러리입니다. 화면을 **컴포넌트**라는 작은 조각으로 나눠서 개발합니다.

### 왜 React를 쓸까?
1. **재사용**: 버튼을 한 번 만들면 여러 곳에서 사용
2. **효율성**: 변경된 부분만 다시 그림 (Virtual DOM)
3. **명확한 구조**: 컴포넌트별로 코드 분리

```jsx
// 순수 HTML로 버튼 3개 만들기 (복붙의 지옥)
<button class="btn">저장</button>
<button class="btn">취소</button>
<button class="btn">삭제</button>

// React로 버튼 3개 만들기 (재사용의 천국)
<Button>저장</Button>
<Button>취소</Button>
<Button>삭제</Button>
```

## 1.5 Next.js란?

**Next.js**는 React를 더 쉽고 강력하게 쓸 수 있게 해주는 프레임워크입니다.

### React만 쓸 때 vs Next.js를 쓸 때

| 기능 | React만 | Next.js |
|------|---------|---------|
| 라우팅 | 직접 설정 | 폴더만 만들면 됨 |
| SEO | 어려움 | 자동 지원 |
| 서버 렌더링 | 직접 구현 | 기본 제공 |
| API | 별도 서버 필요 | 같이 포함 |

**비유로 설명하면:**
- React = 자동차 엔진
- Next.js = 완성된 자동차 (엔진 + 바퀴 + 핸들 + 네비게이션)

## 1.6 TypeScript란?

**TypeScript**는 JavaScript에 **타입(type)**을 추가한 언어입니다.

```javascript
// JavaScript - 타입이 없음
function greet(name) {
  return "안녕, " + name;
}
greet(123); // 에러 없이 실행됨 (런타임에 문제 발생 가능)
```

```typescript
// TypeScript - 타입이 있음
function greet(name: string): string {
  return "안녕, " + name;
}
greet(123); // ❌ 컴파일 에러! number는 string이 아닙니다
```

### 왜 TypeScript를 쓸까?
1. **실수 방지**: 코드 작성 중에 에러를 발견
2. **자동완성**: 에디터가 어떤 값이 들어올지 앎
3. **문서화**: 타입이 곧 문서 역할

## 1.7 데이터베이스란?

**데이터베이스(DB)**는 데이터를 저장하고 관리하는 곳입니다.

```
┌─────────────────────────────────────────┐
│           데이터베이스 (창고)            │
├─────────────────────────────────────────┤
│  User 테이블     │  Novel 테이블        │
│  ┌───┬───────┐   │  ┌───┬──────────┐   │
│  │id │ name  │   │  │id │  title   │   │
│  ├───┼───────┤   │  ├───┼──────────┤   │
│  │ 1 │ 철수  │   │  │ 1 │용사의 여행│   │
│  │ 2 │ 영희  │   │  │ 2 │ 마법학원 │   │
│  └───┴───────┘   │  └───┴──────────┘   │
└─────────────────────────────────────────┘
```

**이 프로젝트**: PostgreSQL (관계형 데이터베이스)

## 1.8 API란?

**API(Application Programming Interface)**는 프로그램들이 서로 대화하는 방법입니다.

```
프론트엔드                     백엔드
    │                           │
    │  GET /api/novels          │
    │  "소설 목록 줘"           │
    │ ─────────────────────────▶│
    │                           │
    │  { novels: [...] }        │
    │  "여기 소설 목록이야"     │
    │ ◀─────────────────────────│
```

### HTTP 메서드 (요청의 종류)
| 메서드 | 의미 | 예시 |
|--------|------|------|
| GET | 조회 | 소설 목록 가져오기 |
| POST | 생성 | 새 소설 등록 |
| PATCH/PUT | 수정 | 소설 제목 바꾸기 |
| DELETE | 삭제 | 소설 삭제하기 |

---

# Part 2: 프로젝트 구조 파악하기

## 2.1 폴더 구조 전체 그림

```
novelverse/
├── 📁 src/                    # 소스 코드의 모든 것
│   ├── 📁 app/                # 페이지와 API (Next.js App Router)
│   ├── 📁 components/         # 재사용 가능한 UI 조각들
│   ├── 📁 lib/                # 유틸리티와 설정
│   ├── 📁 types/              # TypeScript 타입 정의
│   └── 📄 middleware.ts       # 요청 가로채기 (인증 체크)
│
├── 📁 prisma/                 # 데이터베이스 관련
│   └── 📄 schema.prisma       # DB 테이블 구조 정의
│
├── 📄 package.json            # 프로젝트 설명서
├── 📄 tsconfig.json           # TypeScript 설정
└── 📄 next.config.ts          # Next.js 설정
```

## 2.2 src/app/ 폴더: 페이지의 세계

```
src/app/
├── 📄 page.tsx           # 홈페이지 (/)
├── 📄 layout.tsx         # 모든 페이지의 공통 틀
├── 📄 globals.css        # 전역 스타일
│
├── 📁 (auth)/            # 인증 관련 (괄호 = 그룹, URL에 안 나옴)
│   ├── 📁 login/         # /login
│   └── 📁 register/      # /register
│
├── 📁 (read)/            # 읽기 전용 페이지들
│   └── 📁 novels/        # /novels
│       ├── 📁 [id]/      # /novels/123 (동적 라우팅)
│       │   └── 📁 [chapterId]/  # /novels/123/1
│
├── 📁 (write)/           # 작가 전용 (로그인 필요)
│   ├── 📁 dashboard/     # /dashboard
│   └── 📁 novels/
│       └── 📁 new/       # /novels/new
│
└── 📁 api/               # 백엔드 API
    ├── 📁 auth/          # 인증 관련 API
    └── 📁 novels/        # 소설 관련 API
```

### 핵심 규칙
- `page.tsx` = 해당 폴더의 URL로 보이는 페이지
- `layout.tsx` = 하위 페이지들이 공유하는 틀
- `[변수]` = 동적 값 (예: 소설 ID)
- `(그룹)` = URL에 영향 없이 폴더 정리용

## 2.3 src/components/ 폴더: UI 조각 모음

```
src/components/
├── 📁 ui/                # 기본 UI 컴포넌트 (버튼, 입력창 등)
│   ├── 📄 Button.tsx     # 버튼 컴포넌트
│   ├── 📄 Input.tsx      # 입력창 컴포넌트
│   ├── 📄 Card.tsx       # 카드 컴포넌트
│   └── 📄 Modal.tsx      # 모달(팝업) 컴포넌트
│
├── 📁 layout/            # 레이아웃 관련
│   ├── 📄 Header.tsx     # 상단 네비게이션
│   └── 📄 Footer.tsx     # 하단 푸터
│
├── 📁 novel/             # 소설 관련 컴포넌트
│   ├── 📄 NovelCard.tsx  # 소설 카드 (목록에서 사용)
│   └── 📄 NovelList.tsx  # 소설 목록
│
└── 📁 editor/            # 에디터 관련
    ├── 📄 NovelForm.tsx  # 소설 작성 폼
    └── 📄 ChapterEditor.tsx  # 회차 에디터
```

## 2.4 src/lib/ 폴더: 도구 모음

```
src/lib/
├── 📄 auth.ts            # 인증 설정 (NextAuth)
├── 📄 prisma.ts          # 데이터베이스 연결
└── 📄 utils.ts           # 공통 유틸리티 함수
```

## 2.5 package.json: 프로젝트의 신분증

`package.json`은 프로젝트의 모든 정보가 담긴 파일입니다.

```json
{
  "name": "novelverse",        // 프로젝트 이름
  "version": "0.1.0",          // 버전
  "scripts": {                 // 실행 명령어
    "dev": "next dev",         // npm run dev → 개발 서버 실행
    "build": "next build",     // npm run build → 배포용 빌드
    "start": "next start"      // npm run start → 프로덕션 실행
  },
  "dependencies": {            // 의존성 (필요한 라이브러리)
    "next": "16.1.4",          // Next.js 프레임워크
    "react": "19.2.3",         // React 라이브러리
    "prisma": "^7.3.0",        // 데이터베이스 ORM
    "next-auth": "^5.0.0",     // 인증 라이브러리
    "tailwindcss": "^4"        // CSS 프레임워크
  }
}
```

### 자주 쓰는 명령어
```bash
npm install          # 의존성 설치 (처음 프로젝트 받을 때)
npm run dev          # 개발 서버 실행 (localhost:3000)
npm run build        # 배포용 빌드
npx prisma studio    # 데이터베이스 GUI
```

---

# Part 3: 화면 만들기 - 컴포넌트

## 3.1 컴포넌트란?

**컴포넌트**는 재사용 가능한 UI 조각입니다. 레고 블록처럼 조립해서 화면을 만듭니다.

```
┌────────────────────────────────────────┐
│              Header 컴포넌트           │
├────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐           │
│  │NovelCard │  │NovelCard │  ...      │
│  │ 컴포넌트 │  │ 컴포넌트 │           │
│  └──────────┘  └──────────┘           │
│        NovelList 컴포넌트              │
├────────────────────────────────────────┤
│              Footer 컴포넌트           │
└────────────────────────────────────────┘
```

## 3.2 JSX 문법: HTML처럼 생긴 JavaScript

**JSX**는 JavaScript 안에서 HTML처럼 코드를 쓸 수 있게 해주는 문법입니다.

```jsx
// src/components/ui/Button.tsx 참고

// 기본 JSX 문법
function Welcome() {
  const name = "NovelVerse";  // JavaScript 변수

  return (
    <div>                     {/* HTML처럼 생김 */}
      <h1>환영합니다!</h1>
      <p>{name}입니다</p>     {/* {중괄호} 안에 JS 표현식 */}
    </div>
  );
}
```

### JSX 규칙
1. **class 대신 className**: `<div className="box">`
2. **중괄호로 JS 삽입**: `<p>{변수}</p>`
3. **단일 루트 요소**: 최상위는 하나의 요소로 감싸야 함
4. **자기 닫는 태그**: `<img />`, `<input />`

## 3.3 Props: 컴포넌트에 데이터 전달하기

**Props(Properties)**는 부모가 자식 컴포넌트에 전달하는 데이터입니다.

```tsx
// src/components/ui/Button.tsx 예시

// Props 타입 정의 (TypeScript)
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline';  // ? = 선택적
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;  // 버튼 안의 내용
  onClick?: () => void;       // 클릭 시 실행할 함수
}

// 컴포넌트 정의
function Button({ variant = 'primary', size = 'md', children, onClick }: ButtonProps) {
  return (
    <button onClick={onClick} className={`btn-${variant} btn-${size}`}>
      {children}
    </button>
  );
}

// 사용 예시
<Button variant="primary" size="lg" onClick={() => alert('클릭!')}>
  로그인
</Button>
```

### Props 흐름
```
부모 컴포넌트                    자식 컴포넌트
     │                              │
     │   variant="primary"          │
     │   size="lg"                  │
     │ ────────────────────────────▶│
     │                              │
     │   props로 받아서             │
     │   스타일 결정                │
```

## 3.4 useState: 변하는 값 관리하기

**useState**는 컴포넌트 안에서 변하는 값(상태)을 관리하는 React Hook입니다.

```tsx
// useState 기본 사용법
import { useState } from 'react';

function Counter() {
  // [현재값, 값을변경하는함수] = useState(초기값)
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>클릭 횟수: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        +1
      </button>
    </div>
  );
}
```

### 실제 프로젝트 예시: 로딩 상태 관리

```tsx
// src/components/editor/NovelForm.tsx 참고

function NovelForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState('');

  async function handleSubmit() {
    setIsLoading(true);           // 로딩 시작
    await saveNovel(title);       // 저장 요청
    setIsLoading(false);          // 로딩 끝
  }

  return (
    <form>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Button isLoading={isLoading}>
        {isLoading ? '저장 중...' : '저장'}
      </Button>
    </form>
  );
}
```

## 3.5 useEffect: 부가 효과 처리하기

**useEffect**는 컴포넌트가 화면에 나타날 때, 또는 특정 값이 바뀔 때 실행되는 코드를 작성합니다.

```tsx
import { useState, useEffect } from 'react';

function NovelList() {
  const [novels, setNovels] = useState([]);

  // 컴포넌트가 화면에 나타날 때 데이터 불러오기
  useEffect(() => {
    async function fetchNovels() {
      const response = await fetch('/api/novels');
      const data = await response.json();
      setNovels(data.novels);
    }

    fetchNovels();
  }, []);  // 빈 배열 = 처음 한 번만 실행

  return (
    <div>
      {novels.map(novel => (
        <NovelCard key={novel.id} novel={novel} />
      ))}
    </div>
  );
}
```

### useEffect 의존성 배열
```tsx
useEffect(() => { ... }, []);        // 마운트 시 1번만
useEffect(() => { ... }, [count]);   // count가 바뀔 때마다
useEffect(() => { ... });            // 매 렌더링마다 (주의!)
```

## 3.6 실제 컴포넌트 분석: Button.tsx

프로젝트의 실제 버튼 컴포넌트를 살펴봅시다.

```tsx
// src/components/ui/Button.tsx

'use client';  // 클라이언트 컴포넌트임을 선언

import { forwardRef } from 'react';

// Props 타입 정의
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;    // 로딩 중인지
  fullWidth?: boolean;    // 너비 100%인지
}

// forwardRef: 부모가 버튼 DOM 요소에 접근할 수 있게 함
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, fullWidth, children, ...props }, ref) => {

    // variant에 따른 스타일 클래스
    const variantClasses = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700',
      secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
      outline: 'border-2 border-blue-600 text-blue-600',
      // ...
    };

    return (
      <button
        ref={ref}
        className={`${variantClasses[variant]} ${sizeClasses[size]}`}
        disabled={isLoading}
        {...props}  // 나머지 props 전달 (onClick 등)
      >
        {isLoading ? <Spinner /> : children}
      </button>
    );
  }
);
```

### 핵심 포인트
1. **`'use client'`**: 브라우저에서 실행되는 컴포넌트
2. **TypeScript 인터페이스**: Props의 타입을 명확히 정의
3. **조건부 스타일**: variant에 따라 다른 클래스 적용
4. **로딩 상태**: isLoading이면 스피너 표시

## 3.7 클라이언트 vs 서버 컴포넌트

Next.js 13부터 컴포넌트는 두 종류로 나뉩니다.

| 구분 | 서버 컴포넌트 | 클라이언트 컴포넌트 |
|------|--------------|-------------------|
| 선언 | 기본값 (아무것도 안 씀) | `'use client'` 필요 |
| 실행 위치 | 서버 | 브라우저 |
| useState/useEffect | ❌ 사용 불가 | ✅ 사용 가능 |
| onClick 등 이벤트 | ❌ 사용 불가 | ✅ 사용 가능 |
| DB 직접 접근 | ✅ 가능 | ❌ 불가능 |

```tsx
// 서버 컴포넌트 (기본값)
async function NovelPage() {
  const novels = await prisma.novel.findMany();  // DB 직접 접근 가능
  return <NovelList novels={novels} />;
}

// 클라이언트 컴포넌트
'use client';
function LikeButton() {
  const [liked, setLiked] = useState(false);  // useState 사용 가능
  return <button onClick={() => setLiked(true)}>좋아요</button>;
}
```

---

# Part 4: 페이지와 라우팅

## 4.1 App Router: 폴더가 곧 URL

Next.js App Router에서는 **폴더 구조가 곧 URL 경로**입니다.

```
폴더 구조                          URL
───────────────────────────────────────────
src/app/page.tsx                → /
src/app/about/page.tsx          → /about
src/app/novels/page.tsx         → /novels
src/app/novels/[id]/page.tsx    → /novels/123, /novels/456 ...
```

## 4.2 page.tsx vs layout.tsx

### page.tsx: 실제 페이지 내용

```tsx
// src/app/novels/page.tsx
// URL: /novels

export default function NovelsPage() {
  return (
    <div>
      <h1>소설 목록</h1>
      <NovelList />
    </div>
  );
}
```

### layout.tsx: 공통 틀 (감싸는 역할)

```tsx
// src/app/layout.tsx
// 모든 페이지에 적용되는 루트 레이아웃

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Header />          {/* 모든 페이지에 헤더 */}
        <main>{children}</main>  {/* 여기에 page.tsx 내용이 들어감 */}
        <Footer />          {/* 모든 페이지에 푸터 */}
      </body>
    </html>
  );
}
```

### 레이아웃 중첩 이해하기

```
루트 layout.tsx
├── Header
├── children ◀── (write)/layout.tsx
│              ├── Sidebar
│              └── children ◀── dashboard/page.tsx
└── Footer
```

## 4.3 동적 라우팅: [id] 폴더의 마법

**동적 라우팅**은 URL의 일부를 변수로 받는 것입니다.

```tsx
// src/app/(read)/novels/[id]/page.tsx
// URL: /novels/123 → id = "123"
// URL: /novels/abc → id = "abc"

interface PageProps {
  params: Promise<{ id: string }>;  // Next.js 15+에서는 Promise
}

export default async function NovelDetailPage({ params }: PageProps) {
  const { id } = await params;  // URL에서 id 추출

  const novel = await prisma.novel.findUnique({
    where: { id }
  });

  return <NovelDetail novel={novel} />;
}
```

### 중첩 동적 라우팅

```
src/app/(read)/novels/[id]/[chapterId]/page.tsx
URL: /novels/소설ID/회차ID

예: /novels/abc123/ch001
→ id = "abc123"
→ chapterId = "ch001"
```

## 4.4 라우트 그룹: (괄호)의 의미

**(괄호)**로 감싼 폴더는 URL에 나타나지 않고, **폴더 정리용**입니다.

```
src/app/
├── (auth)/           # URL에 auth가 포함되지 않음
│   ├── login/        → /login (not /auth/login)
│   └── register/     → /register
│
├── (read)/           # 읽기 전용 페이지 그룹
│   └── novels/       → /novels
│
└── (write)/          # 작가 전용 그룹 (다른 layout 적용 가능)
    ├── layout.tsx    # 이 그룹만의 레이아웃 (사이드바 등)
    └── dashboard/    → /dashboard
```

### 이 프로젝트의 라우트 그룹 구조

```tsx
// (auth) 그룹 - 인증 관련 (중앙 정렬 레이아웃)
// src/app/(auth)/layout.tsx
export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      {children}
    </div>
  );
}

// (write) 그룹 - 작가 전용 (사이드바 레이아웃 + 인증 필요)
// src/app/(write)/layout.tsx
export default async function WriteLayout({ children }) {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

## 4.5 라우팅 정리 표

| 폴더/파일 | URL | 설명 |
|-----------|-----|------|
| `app/page.tsx` | `/` | 홈페이지 |
| `app/(auth)/login/page.tsx` | `/login` | 로그인 |
| `app/(read)/novels/page.tsx` | `/novels` | 소설 목록 |
| `app/(read)/novels/[id]/page.tsx` | `/novels/123` | 소설 상세 |
| `app/(write)/dashboard/page.tsx` | `/dashboard` | 작가 대시보드 |
| `app/api/novels/route.ts` | `/api/novels` | API 엔드포인트 |

---

# Part 5: 스타일링 - Tailwind CSS

## 5.1 Tailwind란?

**Tailwind CSS**는 미리 정의된 CSS 클래스를 조합해서 스타일을 입히는 방식입니다.

### 기존 CSS vs Tailwind

```css
/* 기존 CSS - 별도 파일에 작성 */
.card {
  padding: 16px;
  margin: 8px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
```

```jsx
{/* Tailwind - 클래스명에 직접 작성 */}
<div className="p-4 m-2 bg-white rounded-lg shadow">
  카드 내용
</div>
```

### 왜 Tailwind를 쓸까?
1. **빠른 개발**: CSS 파일 왔다갔다 안 해도 됨
2. **일관성**: 미리 정해진 값 사용 (p-4 = 16px)
3. **작은 번들**: 사용한 클래스만 빌드됨

## 5.2 자주 쓰는 클래스들

### 여백 (Spacing)
```
p-{n}  = padding (안쪽 여백)      m-{n}  = margin (바깥 여백)
px-{n} = 좌우 padding            mx-{n} = 좌우 margin
py-{n} = 상하 padding            my-{n} = 상하 margin
pt/pr/pb/pl = 개별 방향          mt/mr/mb/ml = 개별 방향

수치: 1=4px, 2=8px, 4=16px, 6=24px, 8=32px
```

```jsx
<div className="p-4">16px 안쪽 여백</div>
<div className="px-6 py-2">좌우 24px, 상하 8px</div>
<div className="mt-4 mb-8">위 16px, 아래 32px</div>
```

### 레이아웃 (Flexbox)
```jsx
{/* 가로 정렬 */}
<div className="flex items-center justify-between">
  <span>왼쪽</span>
  <span>오른쪽</span>
</div>

{/* 세로 정렬 + 간격 */}
<div className="flex flex-col gap-4">
  <div>아이템 1</div>
  <div>아이템 2</div>
</div>
```

| 클래스 | 의미 |
|--------|------|
| `flex` | display: flex |
| `flex-col` | 세로 방향 |
| `items-center` | 수직 중앙 정렬 |
| `justify-between` | 양 끝 정렬 |
| `justify-center` | 수평 중앙 정렬 |
| `gap-4` | 요소 간 간격 16px |

### 그리드 (Grid)
```jsx
{/* 3열 그리드 */}
<div className="grid grid-cols-3 gap-4">
  <div>1</div>
  <div>2</div>
  <div>3</div>
</div>
```

### 크기 (Size)
```jsx
<div className="w-full">너비 100%</div>
<div className="h-screen">화면 높이</div>
<div className="w-64">너비 256px</div>
<div className="max-w-md">최대 너비 28rem</div>
```

### 글자 (Typography)
```jsx
<h1 className="text-3xl font-bold">큰 제목</h1>
<p className="text-gray-600 text-sm">작은 회색 글자</p>
<span className="font-medium">중간 굵기</span>
```

| 클래스 | 의미 |
|--------|------|
| `text-sm/base/lg/xl/2xl/3xl` | 글자 크기 |
| `font-normal/medium/semibold/bold` | 굵기 |
| `text-gray-600` | 회색 글자 (숫자↑ = 진함) |
| `text-center` | 중앙 정렬 |

### 색상 (Colors)
```jsx
<div className="bg-blue-500">파란 배경</div>
<div className="text-red-600">빨간 글자</div>
<div className="border border-gray-300">회색 테두리</div>
```

색상 스케일: 50 (연함) → 900 (진함)
- `blue-50`: 아주 연한 파랑
- `blue-500`: 기본 파랑
- `blue-900`: 아주 진한 파랑

### 테두리 (Border)
```jsx
<div className="border rounded-lg">기본 테두리 + 둥근 모서리</div>
<div className="border-2 border-blue-500">두꺼운 파란 테두리</div>
<div className="rounded-full">완전히 둥근 모서리 (원형)</div>
```

## 5.3 반응형 디자인: md:, lg: 접두사

Tailwind는 **모바일 우선(Mobile First)** 방식입니다.

```jsx
<div className="
  w-full          /* 기본(모바일): 100% */
  md:w-1/2        /* 768px 이상: 50% */
  lg:w-1/3        /* 1024px 이상: 33% */
">
  반응형 박스
</div>
```

| 접두사 | 최소 너비 |
|--------|----------|
| (없음) | 0px (모바일) |
| `sm:` | 640px |
| `md:` | 768px (태블릿) |
| `lg:` | 1024px (노트북) |
| `xl:` | 1280px |
| `2xl:` | 1536px |

### 실제 예시: 그리드 칼럼 수 변경

```jsx
{/* 모바일 1열 → 태블릿 2열 → 데스크탑 3열 */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <NovelCard />
  <NovelCard />
  <NovelCard />
</div>
```

## 5.4 다크모드: dark: 접두사

```jsx
<div className="
  bg-white         /* 라이트 모드: 흰색 배경 */
  dark:bg-gray-800 /* 다크 모드: 어두운 배경 */
  text-gray-900    /* 라이트 모드: 어두운 글자 */
  dark:text-white  /* 다크 모드: 흰 글자 */
">
  다크모드 지원
</div>
```

### 이 프로젝트의 다크모드

```tsx
// src/components/providers/ThemeProvider.tsx
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system">
      {children}
    </NextThemesProvider>
  );
}

// src/components/ui/ThemeToggle.tsx
'use client';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? '🌙' : '☀️'}
    </button>
  );
}
```

## 5.5 실제 프로젝트 코드 분석

```tsx
// src/components/novel/NovelCard.tsx 스타일 분석

<article className="
  bg-white dark:bg-gray-800      /* 배경: 흰색/다크모드 */
  rounded-lg                      /* 둥근 모서리 */
  shadow-md                       /* 그림자 */
  overflow-hidden                 /* 넘치는 내용 숨김 */
  hover:shadow-lg                 /* 호버 시 그림자 커짐 */
  transition-shadow               /* 부드러운 전환 효과 */
">
  {/* 이미지 */}
  <div className="relative h-48">
    <Image className="object-cover" ... />
  </div>

  {/* 내용 */}
  <div className="p-4">
    <h3 className="font-bold text-lg truncate">
      {novel.title}
    </h3>
    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
      {novel.author.nickname}
    </p>
  </div>
</article>
```

---

# Part 6: 데이터베이스 - Prisma

## 6.1 ORM이란?

**ORM(Object-Relational Mapping)**은 코드로 데이터베이스를 다루는 방법입니다.

```
SQL 직접 작성                    Prisma ORM 사용
─────────────────                ─────────────────
SELECT * FROM users              prisma.user.findMany()
WHERE id = '123';                { where: { id: '123' } }

INSERT INTO novels               prisma.novel.create({
(title, authorId)                  data: { title, authorId }
VALUES ('제목', '123');          })
```

### 왜 ORM을 쓸까?
1. **타입 안전**: TypeScript와 자동 연동
2. **자동완성**: 테이블, 칼럼명 자동 완성
3. **실수 방지**: SQL 오타 → 컴파일 에러로 잡힘

## 6.2 스키마 파일: 테이블 구조 정의

`prisma/schema.prisma` 파일에서 데이터베이스 구조를 정의합니다.

```prisma
// prisma/schema.prisma

// 데이터베이스 연결 설정
datasource db {
  provider = "postgresql"     // PostgreSQL 사용
  url      = env("DATABASE_URL")
}

// Prisma 클라이언트 생성 설정
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

// Enum 정의 (선택지가 정해진 값)
enum Role {
  USER    // 일반 사용자
  AUTHOR  // 작가
  ADMIN   // 관리자
}

enum Genre {
  FANTASY      // 판타지
  ROMANCE      // 로맨스
  SF           // SF
  MARTIAL_ARTS // 무협
  // ...
}

// 모델(테이블) 정의
model User {
  id        String   @id @default(cuid())  // 기본키
  email     String   @unique               // 유니크 (중복 불가)
  password  String?                        // ? = 선택적 (nullable)
  name      String?
  nickname  String   @unique
  role      Role     @default(USER)        // 기본값: USER
  createdAt DateTime @default(now())       // 자동 현재시간

  // 관계 정의
  novels    Novel[]    // 1:N - 유저는 여러 소설을 가짐
  bookmarks Bookmark[]
}

model Novel {
  id          String   @id @default(cuid())
  title       String
  description String?
  genre       Genre
  viewCount   Int      @default(0)
  isPublished Boolean  @default(false)

  // 외래키 관계
  authorId    String
  author      User     @relation(fields: [authorId], references: [id])

  chapters    Chapter[]
  createdAt   DateTime @default(now())
}

model Chapter {
  id            String   @id @default(cuid())
  chapterNumber Int
  title         String
  content       String   // 본문 내용
  viewCount     Int      @default(0)

  novelId       String
  novel         Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
}
```

### 스키마 문법 정리

| 문법 | 의미 |
|------|------|
| `@id` | 기본키 (Primary Key) |
| `@unique` | 유니크 제약 조건 |
| `@default(값)` | 기본값 |
| `?` | nullable (null 허용) |
| `@relation` | 외래키 관계 설정 |
| `onDelete: Cascade` | 부모 삭제 시 자식도 삭제 |

## 6.3 모델 관계: 1:N, M:N

### 1:N 관계 (일대다)

```prisma
// 한 명의 User가 여러 개의 Novel을 가짐

model User {
  id     String  @id
  novels Novel[] // 여러 개의 소설
}

model Novel {
  id       String @id
  authorId String
  author   User   @relation(fields: [authorId], references: [id])
}
```

```
User                    Novel
┌────┐                  ┌────┬──────────┐
│ id │                  │ id │ authorId │
├────┤                  ├────┼──────────┤
│ A  │──────┬──────────▶│ 1  │    A     │
│    │      │           │ 2  │    A     │
│    │      └──────────▶│ 3  │    A     │
├────┤                  ├────┼──────────┤
│ B  │─────────────────▶│ 4  │    B     │
└────┘                  └────┴──────────┘
```

### M:N 관계 (다대다)

```prisma
// 하나의 소설에 여러 태그, 하나의 태그에 여러 소설

model Novel {
  id   String         @id
  tags TagsOnNovels[]
}

model Tag {
  id     String         @id
  name   String         @unique
  novels TagsOnNovels[]
}

// 중간 테이블 (Junction Table)
model TagsOnNovels {
  novelId String
  tagId   String
  novel   Novel  @relation(fields: [novelId], references: [id])
  tag     Tag    @relation(fields: [tagId], references: [id])

  @@id([novelId, tagId])  // 복합 기본키
}
```

## 6.4 CRUD 작업: 데이터 다루기

```tsx
// src/lib/prisma.ts에서 prisma 가져오기
import { prisma } from '@/lib/prisma';

// CREATE - 생성
const newNovel = await prisma.novel.create({
  data: {
    title: '새로운 소설',
    description: '소설 설명',
    genre: 'FANTASY',
    authorId: userId,
  },
});

// READ - 조회 (여러 개)
const novels = await prisma.novel.findMany({
  where: {
    isPublished: true,
    genre: 'FANTASY',
  },
  include: {
    author: true,     // 작가 정보도 함께
    chapters: true,   // 회차 정보도 함께
  },
  orderBy: {
    createdAt: 'desc', // 최신순 정렬
  },
  take: 10,           // 10개만
  skip: 0,            // 페이지네이션
});

// READ - 조회 (하나)
const novel = await prisma.novel.findUnique({
  where: { id: novelId },
  include: {
    author: { select: { nickname: true, image: true } },
    chapters: { orderBy: { chapterNumber: 'asc' } },
  },
});

// UPDATE - 수정
const updated = await prisma.novel.update({
  where: { id: novelId },
  data: {
    title: '수정된 제목',
    viewCount: { increment: 1 },  // 조회수 +1
  },
});

// DELETE - 삭제
await prisma.novel.delete({
  where: { id: novelId },
});
```

### 유용한 쿼리 패턴

```tsx
// 조건부 필터링 (빈 값 무시)
const novels = await prisma.novel.findMany({
  where: {
    ...(genre && { genre }),           // genre가 있을 때만 필터
    ...(search && {
      OR: [
        { title: { contains: search } },
        { description: { contains: search } },
      ],
    }),
  },
});

// 관계 데이터 생성
const novelWithTags = await prisma.novel.create({
  data: {
    title: '소설 제목',
    authorId: userId,
    tags: {
      create: [
        { tag: { connectOrCreate: { where: { name: '판타지' }, create: { name: '판타지' } } } },
      ],
    },
  },
});

// 집계 쿼리
const stats = await prisma.novel.aggregate({
  where: { authorId: userId },
  _count: true,
  _sum: { viewCount: true },
});
```

## 6.5 Prisma 명령어

```bash
# 스키마 변경 후 DB에 반영
npx prisma db push

# 마이그레이션 생성 (프로덕션용)
npx prisma migrate dev --name add_chapter_table

# Prisma 클라이언트 재생성
npx prisma generate

# DB 내용 GUI로 보기
npx prisma studio
```

---

# Part 7: API 라우트 만들기

## 7.1 REST API 기초

**REST API**는 URL과 HTTP 메서드로 자원을 다루는 방식입니다.

```
GET    /api/novels        → 소설 목록 조회
POST   /api/novels        → 새 소설 생성
GET    /api/novels/123    → 특정 소설 조회
PATCH  /api/novels/123    → 특정 소설 수정
DELETE /api/novels/123    → 특정 소설 삭제
```

## 7.2 route.ts 파일: API 엔드포인트 정의

Next.js에서는 `route.ts` 파일로 API를 만듭니다.

```
src/app/api/
├── novels/
│   ├── route.ts              → /api/novels (GET, POST)
│   └── [id]/
│       └── route.ts          → /api/novels/[id] (GET, PATCH, DELETE)
```

### 기본 구조

```tsx
// src/app/api/novels/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/novels - 소설 목록 조회
export async function GET(request: NextRequest) {
  try {
    // URL 파라미터 추출
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const genre = searchParams.get('genre');

    // 데이터 조회
    const novels = await prisma.novel.findMany({
      where: {
        isPublished: true,
        ...(genre && { genre: genre as Genre }),
      },
      include: {
        author: { select: { nickname: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // 성공 응답
    return NextResponse.json({ novels, page, limit });

  } catch (error) {
    // 에러 응답
    return NextResponse.json(
      { error: '소설 목록을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// POST /api/novels - 새 소설 생성
export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }  // Unauthorized
      );
    }

    // 요청 본문 파싱
    const body = await request.json();
    const { title, description, genre } = body;

    // 유효성 검사
    if (!title || !genre) {
      return NextResponse.json(
        { error: '제목과 장르는 필수입니다.' },
        { status: 400 }  // Bad Request
      );
    }

    // 데이터 생성
    const novel = await prisma.novel.create({
      data: {
        title,
        description,
        genre,
        authorId: session.user.id,
      },
    });

    // 성공 응답 (201 Created)
    return NextResponse.json(novel, { status: 201 });

  } catch (error) {
    return NextResponse.json(
      { error: '소설 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
```

## 7.3 동적 API 라우트

```tsx
// src/app/api/novels/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/novels/[id] - 특정 소설 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      author: true,
      chapters: { orderBy: { chapterNumber: 'asc' } },
    },
  });

  if (!novel) {
    return NextResponse.json(
      { error: '소설을 찾을 수 없습니다.' },
      { status: 404 }  // Not Found
    );
  }

  return NextResponse.json(novel);
}

// PATCH /api/novels/[id] - 소설 수정
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth();

  // 권한 확인
  const novel = await prisma.novel.findUnique({ where: { id } });
  if (novel?.authorId !== session?.user?.id) {
    return NextResponse.json(
      { error: '수정 권한이 없습니다.' },
      { status: 403 }  // Forbidden
    );
  }

  const body = await request.json();
  const updated = await prisma.novel.update({
    where: { id },
    data: body,
  });

  return NextResponse.json(updated);
}

// DELETE /api/novels/[id] - 소설 삭제
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  await prisma.novel.delete({ where: { id } });

  return NextResponse.json({ message: '삭제되었습니다.' });
}
```

## 7.4 HTTP 상태 코드

| 코드 | 의미 | 사용 예시 |
|------|------|----------|
| `200` | OK | 조회, 수정 성공 |
| `201` | Created | 새 데이터 생성 성공 |
| `400` | Bad Request | 필수 값 누락, 잘못된 형식 |
| `401` | Unauthorized | 로그인 필요 |
| `403` | Forbidden | 권한 없음 |
| `404` | Not Found | 데이터 없음 |
| `500` | Internal Server Error | 서버 에러 |

## 7.5 프론트엔드에서 API 호출하기

```tsx
// 컴포넌트에서 API 호출

// GET 요청
async function fetchNovels() {
  const response = await fetch('/api/novels?page=1&limit=10');
  const data = await response.json();
  return data.novels;
}

// POST 요청
async function createNovel(novelData: NovelFormInput) {
  const response = await fetch('/api/novels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(novelData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return response.json();
}

// PATCH 요청
async function updateNovel(id: string, data: Partial<NovelFormInput>) {
  const response = await fetch(`/api/novels/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return response.json();
}

// DELETE 요청
async function deleteNovel(id: string) {
  await fetch(`/api/novels/${id}`, { method: 'DELETE' });
}
```

---

# Part 8: 인증 시스템 - NextAuth

## 8.1 인증 vs 인가

| 개념 | 인증 (Authentication) | 인가 (Authorization) |
|------|----------------------|---------------------|
| 질문 | "당신이 누구인가요?" | "당신이 이걸 해도 되나요?" |
| 예시 | 로그인 | 작가만 소설 등록 가능 |
| 방법 | 이메일/비밀번호, OAuth | 역할(Role) 확인 |

## 8.2 세션과 JWT

로그인 상태를 유지하는 두 가지 방법:

### 세션 방식 (서버 저장)
```
1. 로그인 성공
2. 서버가 세션 ID 생성 → DB에 저장
3. 클라이언트에 세션 ID 쿠키 전송
4. 매 요청 시 세션 ID로 사용자 확인
```

### JWT 방식 (토큰 저장)
```
1. 로그인 성공
2. 서버가 JWT 토큰 생성 (사용자 정보 포함)
3. 클라이언트에 토큰 전송 (쿠키 또는 localStorage)
4. 매 요청 시 토큰 검증으로 사용자 확인
```

**이 프로젝트**: JWT 전략 사용

## 8.3 NextAuth v5 설정

```tsx
// src/lib/auth.ts

import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Prisma 어댑터 - DB에 세션/계정 저장
  adapter: PrismaAdapter(prisma),

  // 인증 제공자 설정
  providers: [
    // 이메일/비밀번호 로그인
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // 이메일로 사용자 찾기
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) return null;

        // 비밀번호 확인
        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) return null;

        return user;
      },
    }),

    // 구글 소셜 로그인
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  // 세션 전략
  session: { strategy: 'jwt' },

  // 콜백 함수들
  callbacks: {
    // JWT 토큰에 사용자 정보 추가
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },

    // 세션에 사용자 정보 추가
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },

  // 커스텀 페이지
  pages: {
    signIn: '/login',  // 로그인 페이지 경로
  },
});
```

## 8.4 미들웨어: 페이지 접근 권한 체크

```tsx
// src/middleware.ts

export { auth as middleware } from '@/lib/auth';

// 미들웨어가 적용될 경로 설정
export const config = {
  matcher: [
    // 제외할 경로
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

```tsx
// src/lib/auth.config.ts - 인증 설정

export const authConfig = {
  callbacks: {
    // 페이지 접근 권한 체크
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // 보호된 경로 목록
      const protectedPaths = ['/dashboard', '/novels/new'];
      const isProtected = protectedPaths.some(path =>
        pathname.startsWith(path)
      );

      // 인증 전용 경로 (로그인한 사용자는 접근 불가)
      const authPaths = ['/login', '/register'];
      const isAuthPath = authPaths.includes(pathname);

      if (isProtected && !isLoggedIn) {
        return Response.redirect(new URL('/login', nextUrl));
      }

      if (isAuthPath && isLoggedIn) {
        return Response.redirect(new URL('/', nextUrl));
      }

      return true;
    },
  },
};
```

## 8.5 인증 상태 사용하기

### 서버 컴포넌트에서

```tsx
// 서버 컴포넌트에서 인증 확인
import { auth } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  return (
    <div>
      <h1>환영합니다, {session.user.nickname}님!</h1>
    </div>
  );
}
```

### 클라이언트 컴포넌트에서

```tsx
// 클라이언트 컴포넌트에서 인증 확인
'use client';
import { useSession } from 'next-auth/react';

export function Header() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div>로딩 중...</div>;
  }

  return (
    <header>
      {session ? (
        <div>
          <span>{session.user.nickname}</span>
          <button onClick={() => signOut()}>로그아웃</button>
        </div>
      ) : (
        <Link href="/login">로그인</Link>
      )}
    </header>
  );
}
```

## 8.6 역할 기반 접근 제어

```tsx
// src/lib/auth.ts - 헬퍼 함수들

// 로그인 필수
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  return session;
}

// 작가 권한 필수
export async function requireAuthor() {
  const session = await requireAuth();
  if (session.user.role !== 'AUTHOR' && session.user.role !== 'ADMIN') {
    throw new Error('작가 권한이 필요합니다.');
  }
  return session;
}

// 관리자 권한 필수
export async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== 'ADMIN') {
    throw new Error('관리자 권한이 필요합니다.');
  }
  return session;
}
```

---

# Part 9: 전체 흐름 따라가기

## 9.1 시나리오 1: 회원가입

사용자가 회원가입할 때 일어나는 일을 따라가봅시다.

```
┌──────────────────────────────────────────────────────────────┐
│ 1. 사용자가 /register 페이지 방문                           │
│    → src/app/(auth)/register/page.tsx 렌더링               │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. 회원가입 폼 작성                                         │
│    - 이메일, 비밀번호, 닉네임 입력                          │
│    - React Hook Form으로 폼 상태 관리                       │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. '가입하기' 버튼 클릭                                     │
│    → fetch('/api/auth/register', { method: 'POST', ... })  │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 4. API 라우트 실행                                          │
│    → src/app/api/auth/register/route.ts                    │
│                                                              │
│    async function POST(request) {                           │
│      const { email, password, nickname } = await request.json(); │
│                                                              │
│      // 유효성 검사                                         │
│      if (!email || !password || !nickname) {               │
│        return NextResponse.json({ error: '...' }, { status: 400 }); │
│      }                                                       │
│                                                              │
│      // 중복 확인                                           │
│      const exists = await prisma.user.findUnique({...});   │
│      if (exists) return NextResponse.json({...}, { status: 409 }); │
│                                                              │
│      // 비밀번호 암호화                                     │
│      const hashedPassword = await bcrypt.hash(password, 12); │
│                                                              │
│      // DB에 저장                                           │
│      const user = await prisma.user.create({               │
│        data: { email, password: hashedPassword, nickname, role: 'USER' } │
│      });                                                     │
│                                                              │
│      return NextResponse.json(user, { status: 201 });      │
│    }                                                         │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 5. 성공 시                                                  │
│    → 로그인 페이지로 이동 (router.push('/login'))          │
│    → 로그인 진행                                            │
└──────────────────────────────────────────────────────────────┘
```

### 관련 파일
- `src/app/(auth)/register/page.tsx` - 회원가입 UI
- `src/app/api/auth/register/route.ts` - 회원가입 API
- `prisma/schema.prisma` - User 모델

## 9.2 시나리오 2: 소설 등록

로그인한 사용자가 새 소설을 등록할 때:

```
┌──────────────────────────────────────────────────────────────┐
│ 1. 사용자가 /novels/new 페이지 방문                         │
│                                                              │
│    미들웨어 체크 (src/middleware.ts)                        │
│    → 로그인 안 됨? → /login으로 리다이렉트                 │
│    → 로그인 됨? → 페이지 렌더링                            │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. 소설 작성 폼 (src/components/editor/NovelForm.tsx)       │
│                                                              │
│    - 제목, 설명, 장르 입력                                  │
│    - 표지 이미지 URL 또는 AI 생성                           │
│    - useState로 폼 상태 관리                                │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. 'AI로 표지 생성' 버튼 클릭 (선택)                        │
│    → POST /api/ai/generate-image                           │
│    → 생성된 이미지 URL을 폼에 설정                          │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 4. '등록하기' 버튼 클릭                                     │
│    → POST /api/novels                                       │
│    → src/app/api/novels/route.ts의 POST 함수               │
│                                                              │
│    // 인증 확인                                              │
│    const session = await auth();                            │
│    if (!session) return 401;                                │
│                                                              │
│    // USER를 AUTHOR로 승격                                   │
│    if (session.user.role === 'USER') {                      │
│      await prisma.user.update({                             │
│        where: { id: session.user.id },                      │
│        data: { role: 'AUTHOR' }                             │
│      });                                                     │
│    }                                                         │
│                                                              │
│    // 소설 생성                                              │
│    const novel = await prisma.novel.create({                │
│      data: { title, description, genre, authorId, ... }    │
│    });                                                       │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 5. 성공 시                                                  │
│    → 소설 상세 페이지로 이동                                │
│    → router.push(`/novels/${novel.id}`)                    │
└──────────────────────────────────────────────────────────────┘
```

### 관련 파일
- `src/app/(write)/novels/new/page.tsx` - 소설 등록 페이지
- `src/components/editor/NovelForm.tsx` - 소설 작성 폼
- `src/app/api/novels/route.ts` - 소설 API (POST)
- `src/app/api/ai/generate-image/route.ts` - AI 이미지 생성

## 9.3 시나리오 3: 소설 읽기

사용자가 소설을 읽을 때:

```
┌──────────────────────────────────────────────────────────────┐
│ 1. 홈페이지 방문 (/)                                        │
│    → src/app/page.tsx                                       │
│                                                              │
│    // 서버에서 인기 소설 조회                               │
│    const popularNovels = await prisma.novel.findMany({      │
│      where: { isPublished: true },                          │
│      orderBy: { viewCount: 'desc' },                        │
│      take: 5,                                                │
│    });                                                       │
│                                                              │
│    // NovelCard 컴포넌트로 렌더링                           │
│    <NovelCard novel={novel} />                              │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. 소설 카드 클릭 → /novels/[id]                            │
│    → src/app/(read)/novels/[id]/page.tsx                   │
│                                                              │
│    // URL에서 id 추출                                        │
│    const { id } = await params;                             │
│                                                              │
│    // 소설 상세 정보 조회                                   │
│    const novel = await prisma.novel.findUnique({            │
│      where: { id },                                          │
│      include: {                                              │
│        author: true,                                         │
│        chapters: { where: { isPublished: true } },          │
│        _count: { select: { likes: true, bookmarks: true } } │
│      },                                                      │
│    });                                                       │
│                                                              │
│    // 조회수 증가                                            │
│    await prisma.novel.update({                              │
│      where: { id },                                          │
│      data: { viewCount: { increment: 1 } },                 │
│    });                                                       │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. 회차 목록에서 1화 클릭                                   │
│    → /novels/[id]/[chapterId]                               │
│    → src/app/(read)/novels/[id]/[chapterId]/page.tsx       │
│                                                              │
│    // 회차 정보 조회                                         │
│    const chapter = await prisma.chapter.findUnique({        │
│      where: { id: chapterId },                              │
│      include: { novel: true },                              │
│    });                                                       │
│                                                              │
│    // Reader 컴포넌트로 본문 표시                            │
│    <Reader                                                   │
│      content={chapter.content}                              │
│      aiImage={chapter.aiImage}                              │
│    />                                                        │
│                                                              │
│    // 이전/다음 회차 네비게이션                              │
│    <ChapterNavigation                                        │
│      novelId={id}                                            │
│      current={chapter.chapterNumber}                        │
│    />                                                        │
└──────────────────────────────────────────────────────────────┘
```

### 관련 파일
- `src/app/page.tsx` - 홈페이지
- `src/app/(read)/novels/page.tsx` - 소설 목록
- `src/app/(read)/novels/[id]/page.tsx` - 소설 상세
- `src/app/(read)/novels/[id]/[chapterId]/page.tsx` - 회차 읽기
- `src/components/novel/NovelCard.tsx` - 소설 카드
- `src/components/novel/ChapterList.tsx` - 회차 목록
- `src/components/novel/Reader.tsx` - 본문 뷰어

---

# 부록: 자주 사용하는 패턴

## A. TypeScript 타입 정의

```tsx
// src/types/index.ts

// API 응답 타입
interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// 페이지네이션 응답
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 소설 폼 입력
interface NovelFormInput {
  title: string;
  description?: string;
  genre: Genre;
  coverImage?: string;
  tags?: string[];
}
```

## B. 환경 변수 (.env)

```bash
# .env.local (Git에 올리지 않음!)

# 데이터베이스
DATABASE_URL="postgresql://user:password@localhost:5432/novelverse"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"

# 구글 OAuth
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="xxx"

# AI 서비스
STABILITY_API_KEY="sk-xxx"
```

## C. 유용한 라이브러리

| 라이브러리 | 용도 | 사용 예 |
|-----------|------|--------|
| `date-fns` | 날짜 포맷팅 | `formatDistanceToNow(date, { locale: ko })` |
| `zod` | 유효성 검사 | `z.string().email().parse(input)` |
| `react-hook-form` | 폼 관리 | `useForm()`, `register()` |
| `lucide-react` | 아이콘 | `<Heart />`, `<BookOpen />` |
| `clsx` | 조건부 클래스 | `clsx('btn', isActive && 'active')` |

---

# 다음 단계

이 가이드를 읽었다면, 다음을 시도해보세요:

1. **프로젝트 실행해보기**
   ```bash
   npm install
   npm run dev
   ```

2. **간단한 수정 해보기**
   - Button 컴포넌트 색상 바꿔보기
   - 홈페이지 텍스트 수정해보기

3. **새 기능 추가해보기**
   - 댓글 좋아요 기능
   - 소설 검색 필터 추가

4. **공식 문서 읽기**
   - [Next.js 공식 문서](https://nextjs.org/docs)
   - [React 공식 문서](https://react.dev)
   - [Prisma 공식 문서](https://prisma.io/docs)
   - [Tailwind CSS 공식 문서](https://tailwindcss.com/docs)

**질문이 있다면** 코드를 읽어보고, 실행해보고, 수정해보면서 배워나가세요!
