# NovelVerse

NovelVerse는 독자용 웹소설 서비스, 작가 도구, 운영자 콘솔을 하나의 npm workspace로 관리하는 Next.js 모노레포입니다. 작품·회차 작성, 심사·공개, 서재·좋아요·리뷰, 공모전과 AI 이미지 생성 기능을 제공합니다.

## 구성

- `apps/web` — 독자·작가 서비스 (`http://localhost:3000`)
- `apps/ops` — 관리자 전용 운영 콘솔 (`http://localhost:3002`)
- `packages/db` — Prisma 스키마, 마이그레이션, DB 클라이언트
- `packages/auth` — 두 앱이 공유하는 NextAuth 설정
- `packages/shared` — 공용 타입과 유틸리티

Node.js 22와 npm 11을 기준으로 개발·검증합니다.

## 로컬 실행

```bash
npm ci
# PowerShell
Copy-Item .env.example .env
Copy-Item .env.example apps/web/.env.local
Copy-Item .env.example apps/ops/.env.local
npm run prisma:generate
npm run prisma:deploy
npm run dev:web
```

macOS/Linux에서는 같은 세 파일을 `cp`로 복사하세요. 루트 `.env`는 Prisma CLI가,
각 앱의 `.env.local`은 해당 Next.js 앱이 읽습니다. 예시 값은 개발용이므로 실제 비밀값으로 교체해야 합니다.

운영 콘솔은 별도 터미널에서 실행합니다.

```bash
npm run dev:ops
```

각 앱은 자신의 `apps/<app>/.env.local`도 읽습니다. 공통 값의 중복을 피하려면 배포 플랫폼에서 앱별 환경변수로 관리하세요.

## 주요 명령

```bash
npm run lint             # 모든 workspace ESLint
npm run typecheck        # packages, web, ops TypeScript
npm test                 # 단위·보안 회귀 테스트
npm run test:e2e         # Playwright 핵심 사용자 흐름
npm run build            # web과 ops 프로덕션 빌드
npm run check            # 배포 전 전체 로컬 검증
npm run prisma:validate  # Prisma 스키마 검증
npm run prisma:generate  # Prisma Client 생성
npm run prisma:migrate   # 로컬 개발 migration 생성/적용
npm run prisma:deploy    # 커밋된 migration 적용
```

## 환경변수

전체 목록과 안전한 예시는 [`.env.example`](./.env.example)에 있습니다.

필수 운영 값:

- `DATABASE_URL`, `DIRECT_URL`
- `NEXTAUTH_SECRET`/`AUTH_SECRET`, 앱별 URL
- `NEXT_PUBLIC_SUPABASE_URL`, 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`
- 사용하는 AI 공급자의 토큰
- `NEXT_PUBLIC_APP_URL`
- 실제 운영자가 확인하는 `NEXT_PUBLIC_PRIVACY_CONTACT` 이메일 또는 HTTPS 요청 URL

모든 운영 배포는 `RESEND_API_KEY`와 검증된 발신자 `EMAIL_FROM`을 모두 설정해야
합니다. 계정 삭제·데이터 내보내기의 이메일 step-up에 필수이므로 둘 중 하나라도 없으면
관련 API가 `503`으로 닫히고 `/api/health`도 unhealthy를 반환합니다.
인증 링크의 기준 URL인 `NEXT_PUBLIC_APP_URL`은 운영에서 반드시 HTTPS여야 합니다.
이메일과 닉네임 고유 키는 NFKC·공백 제거·ASCII 대문자(A-Z) 접기로 정규화되며, credentials 로그인은 이메일
인증을 완료한 활성 계정에만 허용됩니다. 비밀번호 재설정은 단일 사용 30분 토큰으로
기존 JWT를 폐기합니다. 데이터 내보내기와 계정 삭제에는 검증 이메일로 발송되는
각각의 단일 사용 10분 토큰이 필요하며,
credentials 계정은 현재 비밀번호도 함께 확인합니다. 삭제 후 신고·감사 증거는 사용자
계정 연결 식별자를 제거한 상태로 정책 기간 동안 보존될 수 있습니다. 운영자는 Ops 계정 관리에서
사유와 함께 계정을 정지·해제할 수 있습니다.

정지되었거나 로그인할 수 없는 사용자의 열람·삭제 요청은 공개 개인정보 문의 채널로
접수하고 [개인정보 권리 요청 운영 절차](./docs/privacy-rights-runbook.md)에 따라 처리합니다.

### 최초 관리자 bootstrap

먼저 일반 계정을 만들고 이메일 인증을 완료한 뒤, 아직 `ADMIN` 사용자가 한 명도 없을
때만 아래 명령을 한 번 실행합니다.

```bash
# 환경변수 또는 .env.local에 BOOTSTRAP_ADMIN_EMAIL을 잠시 설정
npm run bootstrap:admin
```

명령은 DB advisory lock 안에서 기존 관리자가 0명인지, 대상 사용자가 정확히 한 명인지,
`emailVerified`가 있는지 다시 확인합니다. 승격과 `admin_audit_logs` 기록은 같은
트랜잭션으로 커밋됩니다. 성공 후 `BOOTSTRAP_ADMIN_EMAIL`은 즉시 제거하세요. 기존
관리자가 있으면 명령은 안전하게 실패하며 이후 역할 변경은 운영 콘솔에서 수행합니다.

운영 Ops에는 조직에서 MFA를 강제한 Google Workspace SSO를 기본으로 사용하세요.
Google OAuth가 설정된 production에서는 비밀번호 provider가 자동으로 제거됩니다.
Workspace 계정만 허용하려면 `OPS_GOOGLE_HOSTED_DOMAIN`을 설정해 `hd` claim도 검증하세요.
장애 대응 중 비밀번호 로그인이 반드시 필요할 때만 변경 승인·짧은 만료 시간과 함께
`OPS_ALLOW_PASSWORD_LOGIN=true`를 잠시 설정하고, 복구 직후 다시 제거해야 합니다.

Gemini를 프로덕션에서 사용하려면 현재 공급자 약관과 데이터 정책을 검토하고 유료 처리
조건, 로그 보존, 제공 지역, 최소 이용 연령을 서비스 약관·화면 고지와 일치시킨 뒤에만
`GEMINI_PRODUCTION_POLICY_ACKNOWLEDGED=true`를 설정하세요. 키만 넣고 이 확인값을 생략하면
Gemini 호출과 `/api/health`가 fail-closed 됩니다. 개발 환경에는 이 확인값이 필요하지 않습니다.

프로덕션은 플랫폼과 무관하게 영구 이미지 저장소가 없으면 시작하지 않습니다. Supabase 서비스 역할 키를 사용하거나,
셀프 호스팅에서 영속 볼륨의 `LOCAL_UPLOAD_ROOT`를 지정하세요. `ALLOW_EPHEMERAL_STORAGE=true`는 장애 대응용
명시적 예외이며 일회성 파일시스템을 쓰는 일반 배포에서는 켜지 마세요. anon 키로 서버 업로드를 허용하지 않습니다.

`CRON_SECRET`을 32자 이상의 임의값으로 설정하고 매일
`GET /api/internal/maintenance`를 `Authorization: Bearer <CRON_SECRET>` 헤더와 함께 호출하세요.
이 작업은 만료된 조회 식별자·레이트리밋·인증 토큰과 보존기간이 지난 이미지 작업을 배치 단위로 정리합니다.

## 데이터베이스 변경

1. `packages/db/prisma/schema.prisma`를 수정합니다.
2. `npm run prisma:migrate -- --name <변경명>`으로 migration을 만듭니다.
3. 생성 SQL이 기존 데이터를 보존하는지 직접 검토합니다.
4. `npm run prisma:generate && npm run check`를 실행합니다.
5. PR CI가 빈 PostgreSQL에서 전체 migration 이력을 재현하는지 확인합니다.

이미 적용된 migration 파일은 수정하지 않습니다. 잘못된 변경은 새 정정 migration으로 복구합니다. 운영 롤백은 보통 코드부터 이전 버전으로 되돌린 뒤, 데이터 보존형 역방향 migration을 별도로 작성하는 방식으로 진행합니다.

2026년 2월 이전 DB를 업그레이드할 때는 AUTHOR enum 전환 사전점검이 필요합니다.
[레거시 DB 업그레이드 안내](./docs/legacy-database-upgrade.md)를 먼저 따르세요.

## 배포

`web`과 `ops`는 독립 배포 단위입니다.

- Web root: `apps/web`, 명령은 루트 workspace의 `npm run build:web`
- Ops root: `apps/ops`, 명령은 루트 workspace의 `npm run build:ops`
- migration은 앱 배포 전에 한 번만 `npm run prisma:deploy`로 실행
- Ops는 별도 도메인과 접근 제어를 사용하고 검색 색인을 금지

배포 전 체크리스트:

1. CI의 migration, lint, typecheck, test, build, production audit가 모두 통과
2. `/api/health`에서 DB·스토리지·신뢰 프록시 설정 상태 확인
3. OAuth callback URL과 앱별 `NEXTAUTH_URL`/`AUTH_URL` 확인
4. 이미지·AI 공급자별 예산, rate limit, 오류율 알림 확인
5. 배포 후 회원가입 → 작성 → 심사 → 공개 읽기 smoke test
6. Ops의 심사 상세에서 모든 회차 본문을 연 뒤 승인 확인 절차 smoke test
7. `BACKUP_RETENTION_DAYS`를 실제 DB·스토리지 공급자의 자동 삭제 주기와 일치시키고 복원 테스트
8. 개인정보 안내의 신고·감사·AI 공급자 보존 조건이 실제 운영 계약과 일치하는지 확인

## 보안 원칙

- 관리 권한은 JWT 값만 믿지 않고 DB의 현재 역할을 다시 확인합니다.
- 승인된 작품의 심사 대상 내용이 바뀌면 초안·비공개 상태로 돌아갑니다.
- 외부 이미지는 public HTTPS, 크기·시간·MIME 제한을 통과한 경우만 저장합니다.
- 회차 HTML은 서버 allowlist로 정화하며 SVG, 이벤트 속성, 위험 URL을 허용하지 않습니다.
- 사용자·AI 비용 API의 제한은 모든 인스턴스가 공유하는 저장소를 사용합니다.
- Gemini/Replicate 기반 기능을 사용하면 입력한 작품 설명·본문 일부·캐릭터 설명이 이미지/문장 생성을 위해 외부 AI 공급자에 전송될 수 있습니다. 배포 전 개인정보 처리방침과 이용약관에 공급자·목적·보존 정책을 명시하세요.

### 프록시와 클라이언트 IP

레이트리밋과 비로그인 조회 중복 제거에 쓰는 IP는 `TRUSTED_PROXY_PROVIDER`로 명시한 프록시의 헤더만 신뢰합니다. 기본값 `none`은 `X-Forwarded-For`, `X-Real-IP` 등 클라이언트가 직접 보낼 수 있는 전달 헤더를 모두 무시합니다.

- `vercel`: Vercel이 설정하는 `X-Vercel-Forwarded-For`만 사용
- `cloudflare`: Cloudflare가 설정하는 단일 `CF-Connecting-IP`만 사용
- `generic`: `X-Forwarded-For` 체인에서 `TRUSTED_PROXY_HOPS`만큼 오른쪽부터 거슬러 올라간 주소를 사용
- `none`: 전달 헤더를 사용하지 않고 `unknown`으로 처리

표준 Web `Request`에는 소켓의 직접 원격 주소가 없으므로, 신뢰할 프록시를 설정하지 않은 요청의 안정적인 대체값은 `unknown`입니다. 이 경우 비로그인 요청들이 같은 IP 레이트리밋 버킷을 공유할 수 있습니다.
프로덕션에서 기본값 `none`을 유지하면 `/api/health`는 이 운영상 한계를 `degraded`로 표시합니다.

`vercel`, `cloudflare`, `generic`은 애플리케이션 원본에 직접 접속할 수 없을 때만 설정하세요. Cloudflare는 Tunnel, Authenticated Origin Pulls 또는 원본 방화벽 허용 목록으로 Cloudflare 이외의 접근을 차단하고, 일반 리버스 프록시는 원본 포트를 비공개로 유지하면서 수신 `X-Forwarded-For`를 제거하거나 정상적으로 덧붙여야 합니다. 원본 직접 접근이 열려 있으면 공격자가 신뢰 헤더를 위조할 수 있습니다.

취약점이나 데이터 노출을 발견했다면 공개 이슈 대신 저장소 관리자에게 비공개로 전달해 주세요.
