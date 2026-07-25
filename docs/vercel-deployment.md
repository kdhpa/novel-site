# Vercel Web·Ops 배포 가이드

NovelVerse는 Web과 관리자 전용 Ops를 서로 다른 Vercel 프로젝트로 배포합니다. 두 프로젝트는 같은 GitHub 저장소를 사용하되 Root Directory와 환경변수를 분리합니다.

| 배포 대상 | Vercel 프로젝트 예시 | Root Directory |
| --- | --- | --- |
| Web | `novelverse-web` | `apps/web` |
| Ops | `novelverse-ops` | `apps/ops` |

두 프로젝트는 Next.js, Node.js 22.x, `master` Production Branch를 사용합니다. 내부 패키지와 루트 `package-lock.json`을 참조하므로 **Include source files outside of the Root Directory**를 활성화합니다.

현재 운영 DB는 AWS `ap-northeast-1`에 있으므로 두 앱의 Function region을 도쿄 `hnd1`로 고정합니다.

Vercel Hobby는 개인·비상업 용도에 한정됩니다. 개인 테스트 공개는 Hobby로 시작할 수 있지만 NovelVerse를 상업 서비스로 운영한다면 [Vercel 플랜 정책](https://vercel.com/docs/plans/hobby)과 [Fair Use 정책](https://vercel.com/docs/limits/fair-use-guidelines)을 확인하고 적합한 유료 플랜을 선택합니다.

## Ops 관리자 배포

`apps/ops`는 별도 관리자 주소로 배포합니다.

- 권장 주소는 `https://admin.<domain>`이며 최소한 Vercel HTTPS 주소를 사용합니다.
- 모든 관리 화면과 변경 API는 로그인 후 DB의 현재 `ADMIN` 역할을 확인합니다.
- Google SSO와 MFA를 우선 사용하고 비밀번호 로그인은 필요할 때만 활성화합니다.
- 가능하면 Cloudflare Access 같은 추가 접근 보호를 관리자 주소 앞에 둡니다.
- Web 프로젝트에는 관리자 주소를 넣지 않아 일반 사용자 화면에서 노출하지 않습니다.
- 로컬 개발은 계속 `npm run dev:ops`와 `http://localhost:3002`를 사용합니다.

Ops Production 환경변수:

| 이름 | 설명 |
| --- | --- |
| `DATABASE_URL` | Web과 같은 운영 PostgreSQL pooler URL |
| `DB_POOL_MAX` | 초기 권장값 `2` |
| `AUTH_SECRET` | 32자 이상의 Ops 전용 세션 서명 키 |
| `AUTH_URL` | Ops 운영 원본 URL |
| `AUTH_TRUST_HOST` | `true` |
| `TRUSTED_PROXY_PROVIDER` | `vercel` |
| `GOOGLE_CLIENT_ID` | Ops Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Ops Google OAuth secret |
| `OPS_ALLOW_PASSWORD_LOGIN` | Google SSO 사용 시 `false`; 필요할 때만 `true` |
| `OPS_GOOGLE_HOSTED_DOMAIN` | Google Workspace 도메인을 제한할 때만 설정 |
| `NEXT_PUBLIC_SUPABASE_URL` | 이미지 표시용 Supabase URL |
| `NEXT_PUBLIC_IMAGE_HOSTS` | 추가 이미지 호스트가 있을 때만 설정 |

Google OAuth callback URI:

```text
https://<ops-domain>/api/auth/callback/google
```

Ops는 관리자 계정을 자동 생성하지 않습니다. 로그인 계정은 운영 DB에서 `ADMIN` 역할이어야 하며 정지 상태가 아니어야 합니다.

## 배포 전 필수 조건

- 외부에서 TLS로 접근 가능한 운영 PostgreSQL을 준비합니다.
- Web 이미지 저장소로 Supabase Storage를 준비하고 필요한 네 개의 공개 bucket을 생성합니다.
- 배포 직전 복구 가능한 DB 백업을 만들고 실제 보존 기간을 확인합니다.
- GitHub `production` Environment와 Vercel Web 프로젝트 환경변수를 등록합니다.
- Google OAuth의 Web callback URI를 운영 주소에 맞게 등록합니다.
- GitHub 저장소의 `master` 브랜치를 보호하고 CI 실패 상태에서는 병합하지 않도록 설정합니다.

로컬 사전 검증은 저장소 루트에서 실행합니다.

```bash
npm ci
npm run prisma:generate
npm run check
```

## Vercel Web 프로젝트 생성

GitHub의 NovelVerse 저장소를 한 번 가져와 Web 프로젝트를 생성합니다.

- Root Directory: `apps/web`
- Framework Preset: Next.js
- Node.js Version: 22.x
- Install Command: 기본값
- Build Command: 기본값 (`npm run build`)
- Output Directory: 기본값
- Production Branch: `master`
- Include source files outside of the Root Directory: 활성화

`apps/web/vercel.json`은 Next.js 프레임워크와 `hnd1` Function region을 명시하고, 하루 한 번 유지보수 API를 호출하는 Cron을 등록합니다.

## GitHub `production` Environment

GitHub 저장소의 **Settings → Environments → production**에는 운영 마이그레이션에 필요한 다음 Secrets만 등록합니다. 이 값들은 Vercel Runtime 환경변수를 대신하지 않습니다.

| Secret | 용도 |
| --- | --- |
| `PRODUCTION_DATABASE_URL` | 운영 Web이 사용하는 PostgreSQL pooler 연결 문자열 |
| `PRODUCTION_DIRECT_URL` | `prisma migrate deploy` 전용 direct 또는 session pooler 연결 문자열 |

두 값 중 하나라도 없으면 `migrate-production` 작업이 값을 출력하지 않고 명확한 오류로 중단됩니다. Environment protection rule을 사용한다면 운영 마이그레이션 승인 담당자도 지정합니다. Ops 배포용 인증값이나 URL은 이 Environment에 추가하지 않습니다.

## Vercel Web 환경변수

환경변수는 Web 프로젝트의 **Settings → Environments**에서 Production에 등록합니다. Preview에서도 로그인·DB 기능을 검증하려면 별도의 Preview 값과 테스트 DB를 사용하며, 운영 DB 비밀값을 무분별하게 Preview에 복사하지 않습니다.

### 필수값

| 이름 | 설명 |
| --- | --- |
| `DATABASE_URL` | 서버리스 런타임용 PostgreSQL pooler URL |
| `DB_POOL_MAX` | 초기 권장값 `2`; DB 허용 연결 수에 맞춰 조정 |
| `TRUSTED_PROXY_PROVIDER` | `vercel` |
| `NEXTAUTH_SECRET` | 32자 이상의 무작위 Web 세션 서명 키 |
| `NEXTAUTH_URL` | Web 운영 원본 URL |
| `NEXT_PUBLIC_APP_URL` | Web 운영 원본 URL |
| `NEXT_PUBLIC_WEB_URL` | Web 운영 원본 URL |
| `GOOGLE_CLIENT_ID` | Web Google OAuth 공개 client ID |
| `GOOGLE_CLIENT_SECRET` | Web Google OAuth secret |
| `NEXT_PUBLIC_SUPABASE_URL` | 이미지가 제공되는 Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저 연동이 필요한 경우의 Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 업로드 전용 service-role key |
| `REQUIRE_PERSISTENT_STORAGE` | `true` |
| `ALLOW_EPHEMERAL_STORAGE` | `false` |
| `RESEND_API_KEY` | 개인정보 보호 단계 인증 메일 발송 키 |
| `EMAIL_FROM` | 실제 발신 가능한 주소 |
| `BACKUP_RETENTION_DAYS` | DB 공급자에서 실제 적용한 백업 보존 일수 |
| `NEXT_PUBLIC_PRIVACY_CONTACT` | 모니터링되는 이메일 또는 HTTPS 요청 페이지 |
| `CRON_SECRET` | 32자 이상의 무작위 유지보수 Bearer secret |

`NEXT_PUBLIC_OPS_URL`은 이 목록에 포함되지 않습니다. 관리자 주소는 일반 사용자용 Web 환경변수에 등록하지 않습니다.

`NEXT_PUBLIC_IMAGE_HOSTS`, `REMOTE_IMAGE_ALLOWED_HOSTS`, 보존 기간, 사용자별 생성 한도는 `.env.example` 기준으로 운영 정책에 맞게 추가합니다. `NEXT_PUBLIC_*` 값은 빌드 결과에 포함되므로 변경 후 Web을 다시 배포합니다.

Replicate나 Gemini 기능을 운영에서 사용할 때만 해당 API key와 모델 설정을 추가합니다. Gemini API 키는 Vercel 서버 환경 변수에만 보관하고, 런타임 활성화 여부는 Ops의 **AI 설정**에서 관리합니다.

## DB 연결과 마이그레이션

Vercel Runtime의 `DATABASE_URL`은 공급자가 제공하는 서버리스 호환 pooler 연결 문자열을 사용합니다. 인스턴스가 늘어날 때 PostgreSQL 연결이 급증할 수 있으므로 `DB_POOL_MAX=2`로 시작하고 DB 지표를 보며 조정합니다. 값이 누락돼도 Vercel에서는 코드 기본값 `2`를 사용하며, 로컬·self-hosted 기본값은 `10`입니다. Vercel에서는 idle timeout을 5초로 줄이고 `attachDatabasePool` 훅으로 Fluid Compute가 일시 중지되기 전에 유휴 연결을 정리합니다.

GitHub의 `PRODUCTION_DIRECT_URL`은 마이그레이션에만 사용하고 Vercel Runtime에는 넣지 않습니다. 우선 DB의 direct 연결을 사용합니다. GitHub 호스팅 러너가 IPv6 전용 direct endpoint에 접근하지 못하는 경우에는 DB 공급자의 **session pooler** 연결 문자열을 대안으로 사용할 수 있습니다. 트랜잭션 pooler URL은 마이그레이션 연결로 사용하지 않습니다.

`master` push의 배포 흐름은 다음과 같습니다.

1. `verify`가 빈 PostgreSQL에서 전체 마이그레이션과 모노레포의 lint, typecheck, unit test, build, production audit을 검증합니다.
2. `e2e`가 Playwright 흐름을 검증합니다.
3. 두 작업이 성공한 뒤 `migrate-production`이 운영 DB에서 `npm run prisma:deploy`를 한 번 실행합니다.
4. Vercel이 같은 `master` commit의 Web 배포를 운영 도메인에 승격합니다.

Vercel Web 프로젝트에서 GitHub Actions의 `migrate-production`을 필수 [Deployment Check](https://vercel.com/docs/deployment-checks)로 지정합니다. Vercel 빌드가 먼저 끝나더라도 운영 마이그레이션이 성공하기 전에는 운영 도메인에 새 Web 버전이 연결되지 않습니다. Ops에는 이 설정을 적용하지 않습니다.

적용된 Prisma 마이그레이션 파일은 수정하지 않습니다. 코드 롤백과 DB 롤백은 별개이며, 데이터 보존이 필요한 스키마 복구는 새 보정 마이그레이션으로 roll-forward합니다.

## 영구 이미지 저장과 업로드 제한

Vercel 함수의 로컬 파일시스템은 영구 저장소가 아닙니다. Web은 `VERCEL` 환경을 감지하면 `LOCAL_UPLOAD_ROOT`를 영구 저장소로 인정하지 않으므로, 운영에서는 Supabase URL과 `SUPABASE_SERVICE_ROLE_KEY`를 반드시 설정합니다. `ALLOW_EPHEMERAL_STORAGE=true`는 운영에서 사용하지 않습니다.

[Vercel Function의 요청 payload 상한](https://vercel.com/docs/functions/limitations)은 4.5MB입니다. 표지 업로드는 multipart 여유 공간을 포함해 플랫폼 한도보다 작게 제한하며, 현재 사용자 파일 상한은 4MiB입니다. 더 큰 파일을 지원하려면 인증된 브라우저가 저장소로 직접 업로드하고 서버가 결과를 검증·재인코딩하는 별도 흐름을 설계합니다.

## Web Google OAuth callback

Google Cloud Console의 운영 OAuth client에는 Web callback URI 하나만 등록합니다.

```text
https://<web-domain>/api/auth/callback/google
```

Ops는 별도 OAuth client 사용을 권장하며 Ops 운영 주소의 callback URI만 등록합니다. Vercel 기본 도메인에서 커스텀 도메인으로 바꿀 때는 각 앱의 URL 환경변수와 OAuth callback URI를 함께 변경한 뒤 다시 배포합니다. 임시 Preview URL은 운영 OAuth callback으로 사용하지 않습니다.

## 유지보수 Cron

Web의 `vercel.json`은 `/api/internal/maintenance`를 매일 `18:00 UTC`에 호출합니다. 한국 시간으로 다음 날 오전 3시이며, [Vercel Hobby Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs)에서는 지정된 한 시간 안에서 실행 시각이 달라질 수 있습니다.

Vercel은 Web 프로젝트의 `CRON_SECRET`을 `Authorization: Bearer <value>` 헤더로 전송합니다. 기존 엔드포인트는 32자 미만이거나 헤더가 일치하지 않으면 fail-closed로 거부합니다. Cron은 Web Production 배포에서만 실행되며, 실행 결과는 Vercel Logs에서 확인합니다.

## 최초 배포와 Web smoke test

1. 운영 DB 백업과 복원 절차를 확인합니다.
2. GitHub `production`의 DB Secrets를 등록합니다.
3. Vercel Web 프로젝트를 만들고 환경변수와 Production Branch를 설정합니다.
4. Web 프로젝트에 `migrate-production` Deployment Check를 등록합니다.
5. Google OAuth에 Web callback URI 하나만 등록합니다.
6. `master`의 CI와 Web 배포가 모두 성공했는지 확인합니다.
7. Web health endpoint를 확인합니다.

```bash
curl --fail --show-error --silent "https://<web-domain>/api/health"
```

Web health는 DB, 영구 저장소, 프록시 신뢰, AI 공급자 정책, 백업 보존 기간, 메일과 개인정보 문의 채널이 모두 유효해야 200을 반환합니다. 응답의 `release`는 Vercel이 제공하는 Git commit SHA를 표시합니다.

마지막으로 Web Google 로그인, 회원가입, 4MiB 이하 표지 업로드, AI 이미지 작업 생성·폴링·영구 저장, 작품 작성·심사·공개 읽기와 주요 변경 API를 직접 smoke test합니다. Ops localhost는 이 운영 smoke test에 포함하지 않습니다.

## Web 롤백

코드 문제는 Vercel Web 프로젝트의 **Deployments**에서 직전 정상 배포로 Instant Rollback합니다. 롤백 후 Web 로그인과 `/api/health`를 다시 확인합니다. Ops localhost는 Vercel 롤백 대상이 아닙니다.

Vercel 코드 롤백은 환경변수나 DB 스키마를 되돌리지 않습니다. 같은 배포에서 환경변수를 바꿨다면 별도로 복구하고 Web을 다시 배포합니다. 새 스키마가 이전 코드와 호환되지 않는다면 이전 배포만 즉시 승격하지 말고, 먼저 데이터 보존형 보정 마이그레이션과 호환 코드로 roll-forward합니다.
