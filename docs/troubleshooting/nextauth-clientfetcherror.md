# NextAuth ClientFetchError 해결 가이드

## 에러 내용

```
Console ClientFetchError
Unexpected token '<', "<!DOCTYPE "... is not valid JSON.
Read more at https://errors.authjs.dev#autherror
```

## 에러 원인

이 에러는 NextAuth의 `SessionProvider`가 `/api/auth/session` 엔드포인트를 호출할 때 발생합니다.

**핵심 문제**: API가 JSON 대신 HTML을 반환함

`"<!DOCTYPE "...`는 HTML 문서의 시작 부분입니다. 이는 NextAuth API 라우트가 정상적으로 작동하지 않고, Next.js가 에러 페이지(HTML)를 반환하고 있다는 의미입니다.

### 주요 원인

1. **Google OAuth 환경 변수 미설정**
   - `GOOGLE_CLIENT_ID`와 `GOOGLE_CLIENT_SECRET`이 설정되지 않으면 NextAuth 초기화가 실패합니다.
   - 기존 코드에서 `!` (non-null assertion)를 사용하여 값이 반드시 있다고 가정했습니다.

2. **데이터베이스 연결 실패**
   - Prisma 어댑터가 PostgreSQL에 연결하지 못하면 에러가 발생합니다.

3. **미들웨어 설정 문제**
   - API 라우트가 잘못된 페이지로 리다이렉트될 수 있습니다.

## 해결 방법

### 수정된 코드

**`src/lib/auth.config.ts`** 및 **`src/lib/auth.ts`**에서 Google OAuth를 선택적(optional)으로 변경:

```typescript
// 변경 전 (문제가 되는 코드)
providers: [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
  // ...
]

// 변경 후 (수정된 코드)
providers: [
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      ]
    : []),
  // ...
]
```

### 변경 내용 설명

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 환경 변수 처리 | `!` 사용 (필수) | 조건부 체크 (선택적) |
| Google OAuth | 항상 등록 | 환경 변수가 있을 때만 등록 |
| 에러 발생 | 환경 변수 없으면 실패 | 환경 변수 없으면 건너뜀 |

## 환경 변수 확인

`.env` 파일에 다음 변수들이 올바르게 설정되어 있는지 확인하세요:

```env
# 필수
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# 선택적 (Google OAuth 사용 시)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

## 디버깅 방법

에러가 계속 발생하면 다음을 확인하세요:

1. **서버 콘솔 확인**: 브라우저 콘솔이 아닌 터미널에서 실제 에러 메시지 확인
2. **API 직접 호출**: 브라우저에서 `http://localhost:3000/api/auth/session` 접속하여 응답 확인
3. **데이터베이스 연결 테스트**: `npx prisma studio` 실행하여 DB 연결 확인

## 관련 파일

- `src/lib/auth.ts` - NextAuth 메인 설정 (Prisma 어댑터 포함)
- `src/lib/auth.config.ts` - Edge 호환 설정 (미들웨어용)
- `src/app/api/auth/[...nextauth]/route.ts` - API 라우트 핸들러
- `src/components/providers/ThemeProvider.tsx` - SessionProvider 위치
