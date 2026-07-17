# E2E 테스트 실행 가이드

핵심 E2E는 작가 로그인, 작품·회차 작성, 심사 제출, 운영 콘솔의 전체 본문 확인과 승인, 익명 독자의 공개 열람까지 실제 UI와 API 경로로 검증합니다. 승인 상태를 DB에서 직접 덮어쓰지 않습니다.

## 안전한 테스트 데이터베이스

Playwright는 일반 `DATABASE_URL`을 그대로 사용하지 않습니다. 반드시 전용 PostgreSQL 데이터베이스를 준비하고 `E2E_DATABASE_URL`을 지정해야 합니다.

```powershell
$env:E2E_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/novelverse_e2e?schema=public'
$env:DATABASE_URL=$env:E2E_DATABASE_URL
$env:DIRECT_URL=$env:E2E_DATABASE_URL
npm run prisma:deploy
npm run test:e2e
```

`prisma:deploy`는 Prisma CLI 규칙에 따라 `DATABASE_URL`/`DIRECT_URL`을 읽으므로, 위처럼 E2E URL을 세 변수에 동일하게 넣은 터미널에서만 마이그레이션을 적용합니다. Playwright 자체는 실행 시 `E2E_DATABASE_URL`을 다시 검증하고 두 서버의 DB 환경을 강제로 덮어씁니다.

다음 안전장치가 적용됩니다.

- 데이터베이스 이름에 `test`, `e2e`, `ci` 중 하나가 없으면 실행하지 않습니다.
- 기본적으로 `localhost`, `127.0.0.1`, `::1`만 허용합니다.
- 원격 전용 테스트 DB를 사용해야 할 때만 `E2E_ALLOW_REMOTE_DATABASE=true`를 추가합니다.
- Playwright가 Web(3000)과 Ops(3002)를 직접 기동하며, 이미 실행 중인 서버는 재사용하지 않습니다. 기존 서버가 다른 DB에 연결된 상태로 테스트되는 일을 막기 위한 설정입니다.

테스트는 외부 메일 공급자를 호출하지 않습니다. 이메일 인증이 완료된 작가와 관리자 계정만 전용 DB에 시드한 뒤, 두 계정 모두 실제 credentials 로그인 정책을 통과합니다. 테스트가 끝나면 생성한 작품, 조회 식별자, 감사 로그, 계정과 관련 레이트리밋 버킷을 정리합니다.

CI에서는 빈 로컬 PostgreSQL 서비스에 마이그레이션을 적용한 뒤 같은 흐름을 실행합니다.
