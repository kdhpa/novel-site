# Cloudflare Workers 배포 가이드

NovelVerse는 OpenNext를 통해 두 개의 Cloudflare Worker로 배포합니다.

| 앱 | Worker 이름 | 최초 주소 |
| --- | --- | --- |
| Web | `novelverse-web` | `https://novelverse-web.<account-subdomain>.workers.dev` |
| Ops | `novelverse-ops` | `https://novelverse-ops.<account-subdomain>.workers.dev` |

현재 `wrangler.jsonc`에는 커스텀 도메인 경로가 없으므로 첫 배포는 `workers.dev` 주소를 사용합니다. `<account-subdomain>`은 Cloudflare 대시보드의 Workers & Pages에서 확인합니다.

## 배포 전 필수 조건

- Cloudflare 계정에서 Workers Paid를 활성화합니다. 현재 Web Worker의 측정된 gzip 업로드 크기는 약 **4.36 MiB**로 Workers Free의 3 MiB 제한을 넘습니다. Ops는 약 2.82 MiB이지만 Web과 함께 유료 계정으로 운영합니다.
- 계정의 `workers.dev` 서브도메인과 Cloudflare Images 바인딩을 사용할 수 있는지 확인합니다.
- 외부에서 TLS로 접속 가능한 운영 PostgreSQL과 영구 이미지 저장용 Supabase를 준비합니다.
- 배포 직전 복구 가능한 DB 백업을 만들고 보존 기간을 확인합니다.
- GitHub의 `master` 브랜치만 운영 배포를 시작하도록 보호 규칙을 설정합니다.

로컬에서 배포 산출물을 확인할 때는 저장소 루트에서 다음을 실행합니다.

```bash
npm ci
npm run prisma:generate
npm run cf:typegen
npm run cf:build
```

필요하면 로컬 환경 변수를 준비한 뒤 `npm run cf:preview:web`과 `npm run cf:preview:ops`로 workerd 프리뷰를 확인합니다. 운영 배포는 로컬 수동 배포보다 아래 GitHub Actions 경로를 사용합니다.

## GitHub `production` Environment

GitHub 저장소의 **Settings → Environments → production**에 다음 값을 등록합니다. 운영 비밀값은 저장소 파일이나 Actions 로그에 쓰지 않습니다. 가능하면 `master` 브랜치 제한과 승인자를 함께 설정합니다.

### Secrets

| 이름 | 용도 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers를 배포할 수 있는 최소 권한 API 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | 배포 대상 Cloudflare 계정 ID |
| `PRODUCTION_DATABASE_URL` | Web/Ops Worker 런타임의 `DATABASE_URL` |
| `PRODUCTION_DIRECT_URL` | CI에서 `prisma migrate deploy`에만 사용하는 운영 DB 직접 연결 URL |
| `NEXTAUTH_SECRET` | Web 세션 서명 키, 32자 이상의 무작위 값 |
| `AUTH_SECRET` | Ops 세션 서명 키, 32자 이상의 무작위 값 |
| `GOOGLE_CLIENT_SECRET` | Web/Ops Google OAuth 클라이언트 비밀값 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 이미지 저장 키 |
| `RESEND_API_KEY` | 개인정보 보호 단계 인증 메일 전송 키 |
| `CRON_SECRET` | 일일 유지보수 API의 Bearer 토큰 |

AI 기능을 운영할 때만 `REPLICATE_API_TOKEN`과 `GOOGLE_GEMINI_API_KEY`를 추가합니다. 사용하지 않는 공급자의 키는 빈 문자열로 만들지 말고 등록하지 않습니다.

`--secrets-file` 배포는 기존 secret에 가산 적용됩니다. 예전에 설정한 선택 secret은 GitHub에서 항목만 지워도 Worker에 남으므로, AI 공급자 등을 끌 때는 Cloudflare Dashboard의 해당 Worker **Settings → Variables and Secrets**에서도 그 secret을 명시적으로 삭제합니다. 일반 변수는 저장소의 `wrangler.jsonc`를 기준으로 매 배포 때 정리됩니다.

### Variables

| 이름 | 예시/용도 |
| --- | --- |
| `WEB_PRODUCTION_URL` | `https://novelverse-web.<subdomain>.workers.dev` |
| `OPS_PRODUCTION_URL` | `https://novelverse-ops.<subdomain>.workers.dev` |
| `GOOGLE_CLIENT_ID` | Web/Ops Google OAuth 공개 클라이언트 ID |
| `NEXT_PUBLIC_SUPABASE_URL` | 영구 이미지 저장에 사용할 Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 개발/브라우저 연동이 필요할 때만 쓰는 선택적 Supabase anon 키 |
| `EMAIL_FROM` | 예: `NovelVerse <auth@example.com>` |
| `BACKUP_RETENTION_DAYS` | 실제 DB 공급자 백업 보존 기간, `1`~`3650` |
| `NEXT_PUBLIC_PRIVACY_CONTACT` | 모니터링되는 이메일 주소 또는 HTTPS 요청 페이지 |

워크플로는 두 운영 URL을 각 앱의 `NEXTAUTH_URL`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_OPS_URL`에 맞게 전달합니다. `OPS_GOOGLE_HOSTED_DOMAIN`, `NEXT_PUBLIC_IMAGE_HOSTS`, `REMOTE_IMAGE_ALLOWED_HOSTS`, AI 모델/제한값 등 선택 설정은 `.env.example`과 같은 이름의 Environment variable로 추가합니다. Gemini를 실제로 켠다면 현재 약관 검토를 마친 뒤 `GEMINI_PRODUCTION_POLICY_ACKNOWLEDGED=true`도 설정합니다.

Web의 `/api/health`가 200을 반환하려면 DB뿐 아니라 Supabase 영구 저장소, Resend 발신 설정, 실제 백업 보존 기간, 개인정보 문의 채널도 모두 유효해야 합니다.

CI는 두 health 응답의 `release`가 현재 `GITHUB_SHA`와 같은지도 확인합니다. 따라서 커스텀 도메인이 실수로 이전 Worker를 가리키는 경우에도 smoke test가 통과하지 않습니다.

운영 Ops는 Google-only 정책을 fail-closed로 검증합니다. `GOOGLE_CLIENT_ID`와 `GOOGLE_CLIENT_SECRET` 중 하나라도 빠지면 배포가 시작되지 않고, 배포 후 smoke test도 Google provider가 없거나 credentials provider가 보이면 실패합니다. 비상 비밀번호 로그인은 변경 승인과 만료 시간을 정한 뒤 Cloudflare Dashboard에서 `OPS_ALLOW_PASSWORD_LOGIN=true`로 임시 변경하고, 복구 직후 `false`로 되돌립니다. 다음 정상 배포도 저장소의 `false` 설정을 다시 적용합니다.

## Google OAuth 콜백

Google Cloud Console의 OAuth 클라이언트에 아래 두 Authorized redirect URI를 모두 등록합니다.

```text
https://novelverse-web.<account-subdomain>.workers.dev/api/auth/callback/google
https://novelverse-ops.<account-subdomain>.workers.dev/api/auth/callback/google
```

커스텀 도메인으로 전환할 때는 새 도메인의 콜백 URI도 먼저 추가합니다. 이어서 `WEB_PRODUCTION_URL`과 `OPS_PRODUCTION_URL`을 바꾸고 재배포한 후, 기존 `workers.dev` 콜백은 충분한 전환 시간을 둔 뒤 제거합니다.

## DB 연결 원칙

`PRODUCTION_DATABASE_URL`과 `PRODUCTION_DIRECT_URL`은 역할이 다릅니다.

- `PRODUCTION_DATABASE_URL`은 배포 시 Worker의 `DATABASE_URL`로 전달됩니다. Cloudflare에서 접근 가능한 앱용 연결 문자열을 사용하며, DB 공급자의 Workers 호환 transaction/session pooler를 사용할 수 있습니다. 현재 Worker의 요청별 풀 상한은 `DB_POOL_MAX=2`, 연결 재사용 상한은 `DB_POOL_MAX_USES=1`입니다.
- `PRODUCTION_DIRECT_URL`은 GitHub Actions의 Prisma 마이그레이션 단계에만 주입합니다. 스키마 변경 권한이 있는 DB 직접 연결을 사용하며 Worker secret으로 업로드하지 않습니다.

현재는 Hyperdrive를 사용하지 않습니다. NovelVerse의 역할 변경, 심사, 신고 처리 등 여러 트랜잭션이 PostgreSQL의 `pg_advisory_xact_lock`/`pg_advisory_xact_lock_shared`로 동시성을 제어하는데 Hyperdrive는 advisory lock을 지원하지 않습니다. 이를 무시하고 Hyperdrive로 전환하면 보호하려던 변경이 동시에 실행될 수 있습니다. 먼저 해당 잠금을 행 잠금 또는 별도 분산 잠금으로 교체하고 동시성 테스트를 통과시킨 뒤에만 Hyperdrive 도입을 검토합니다.

## 첫 배포

1. Cloudflare Workers Paid와 `workers.dev` 서브도메인을 확인합니다.
2. GitHub `production` Environment의 Secrets와 Variables를 모두 등록합니다.
3. Google OAuth에 Web/Ops 콜백 두 개를 등록합니다.
4. 운영 DB 백업을 만든 뒤 `master`에 배포 변경을 병합하거나 push합니다.
5. GitHub Actions에서 검증과 E2E가 통과하는지 확인합니다. 이후 같은 운영 배포 작업이 OpenNext 빌드, `npm run prisma:deploy`, Ops 배포, Web 배포와 smoke check를 순서대로 수행합니다.
6. 배포 로그에서 두 Worker URL을 확인하고 다음을 점검합니다.

```bash
curl --fail --show-error --silent "$WEB_PRODUCTION_URL/api/health"
curl --fail --show-error --silent "$OPS_PRODUCTION_URL/api/health"
curl --fail --show-error --silent "$OPS_PRODUCTION_URL/api/auth/providers"
```

마지막으로 Web Google 로그인, Ops 관리자 로그인, 이미지 업로드/변환, 작품 조회와 주요 변경 API를 직접 smoke test합니다. 커스텀 도메인을 붙일 경우 Cloudflare에서 도메인을 연결한 뒤 URL Variables와 Google OAuth 콜백을 갱신하고 다시 배포합니다.

## 롤백

코드 문제만 있는 경우 Cloudflare 대시보드에서 `novelverse-web`과 `novelverse-ops`의 **Deployments**를 각각 열어 직전 정상 버전으로 롤백합니다. 두 앱의 변경이 결합되어 있으면 Ops를 먼저, Web을 다음 순서로 되돌리고 로그인과 `/api/health`를 다시 확인합니다. Worker 버전 롤백은 GitHub Environment의 Secrets/Variables를 되돌리지 않으므로, 같은 배포에서 값을 바꿨다면 별도로 복구해야 합니다.

DB 마이그레이션은 기존 파일을 수정하거나 억지로 되돌리지 않습니다. 마이그레이션 뒤의 스키마가 이전 Worker와 호환될 때만 앱 버전을 롤백합니다. 호환되지 않거나 데이터가 변경됐다면 이전 버전 배포 대신 새 보정 마이그레이션과 수정 Worker를 만들어 roll-forward합니다. 마이그레이션은 성공했지만 Worker 배포가 실패한 경우에도 같은 원칙으로 스키마 호환성을 먼저 판단합니다.
