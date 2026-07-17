# 레거시 데이터베이스 업그레이드

신규 빈 데이터베이스는 `npm run prisma:deploy`만 실행하면 됩니다. 2026년 2월 이전 스키마를 직접 운영하던
데이터베이스는 historical migration `20260222115145_init`이 `Role.AUTHOR`를 잠시 제거하므로 사전 점검이 필요합니다.
적용된 migration 파일을 수정하거나 무조건 `migrate resolve`로 건너뛰지 마세요.

## 안전한 절차

1. 점검 화면으로 전환하고 Web·Ops·maintenance worker의 트래픽을 모두 drain한 뒤 쓰기를 중지합니다. 계정/작품 삭제와 태그 수정도 포함합니다. 검증 가능한 전체 백업을 만들고 staging 복제본에서 복원 테스트를 먼저 마칩니다.
2. 다음 쿼리로 역할과 Unicode NFKC·ASCII 대소문자 정규화 충돌 범위를 확인합니다. 아래 식은 migration과 같은 순서로 먼저 NFKC 정규화한 뒤 ECMAScript `trim()` 대상 문자를 제거하고, 마지막으로 ASCII `A-Z`만 소문자로 바꿉니다. 비 ASCII 문자의 대소문자는 서로 다른 값으로 유지됩니다.

```sql
SELECT "role", count(*) FROM "users" GROUP BY "role";
SELECT "id", "email" FROM "users" WHERE "role"::text = 'AUTHOR';

SELECT "id", "email"
FROM (
  SELECT "id", "email",
         translate(
           btrim(
             normalize("email", NFKC),
             U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
           ),
           'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
           'abcdefghijklmnopqrstuvwxyz'
         ) AS normalized_value
  FROM "users"
) normalized_users
WHERE normalized_value = '';

SELECT normalized_value,
       count(*) AS row_count,
       array_agg("id" ORDER BY "createdAt", "id") AS user_ids
FROM (
  SELECT "id", "createdAt",
         translate(
           btrim(
             normalize("email", NFKC),
             U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
           ),
           'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
           'abcdefghijklmnopqrstuvwxyz'
         ) AS normalized_value
  FROM "users"
) normalized_users
GROUP BY normalized_value
HAVING count(*) > 1;

SELECT normalized_value,
       count(*) AS row_count,
       array_agg("id" ORDER BY "createdAt", "id") AS user_ids
FROM (
  SELECT "id", "createdAt",
         translate(
           btrim(
             normalize("nickname", NFKC),
             U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
           ),
           'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
           'abcdefghijklmnopqrstuvwxyz'
         ) AS normalized_value
  FROM "users"
  WHERE "nickname" IS NOT NULL
) normalized_users
WHERE normalized_value <> ''
GROUP BY normalized_value
HAVING count(*) > 1;
```

정규화 충돌 결과가 한 행이라도 나오면 migration은 안전하게 중단됩니다. 이메일 충돌은 각 주소의 소유권과 로그인 공급자 연결 상태를 확인한 뒤 계정을 수동 병합하거나 잘못된 주소를 정정해야 합니다. 닉네임 충돌은 운영자가 중복 사용자와 조율해 하나를 변경하고 알림을 남기세요. 이메일이나 계정을 식별자만 보고 자동 병합하면 안 됩니다. 수정 후 위 쿼리가 0행인지 다시 확인합니다.

3. AUTHOR 행이 있고 해당 historical migration이 아직 미적용이면 임시 백업 테이블에 식별자를 보존한 뒤 USER로 바꿉니다.

```sql
CREATE TABLE IF NOT EXISTS "_upgrade_author_role_backup" AS
SELECT "id" FROM "users" WHERE "role"::text = 'AUTHOR';

UPDATE "users" SET "role" = 'USER' WHERE "role"::text = 'AUTHOR';
```

4. `npm run prisma:deploy`를 실행합니다. 후속 reconciliation migration이 AUTHOR enum 값을 다시 추가합니다.
5. 역할을 복원하고 행 수를 대조한 뒤 임시 테이블을 제거합니다.

```sql
UPDATE "users" u
SET "role" = 'AUTHOR'
FROM "_upgrade_author_role_backup" b
WHERE u."id" = b."id";

DROP TABLE "_upgrade_author_role_backup";
```

6. `npm run prisma:validate`, `/api/health`, 로그인·심사·공개 smoke test를 실행합니다.

## 배포창과 잠금 예산

`20260717000600`은 users를 정규화하고 unique index를 만드는 동안 users 읽기까지 대기시킬 수 있습니다. `20260717000700`은 likes/novels 카운터를 backfill하고, `20260717000800`은 기존 태그와 연결을 병합합니다. 운영 복제본에서 아래 규모를 기록하고 전체 migration 소요 시간과 잠금 대기 시간을 측정한 뒤 그보다 넉넉한 점검창을 잡으세요.

```sql
SELECT 'users' AS table_name, count(*) FROM "users"
UNION ALL SELECT 'novels', count(*) FROM "novels"
UNION ALL SELECT 'likes', count(*) FROM "likes"
UNION ALL SELECT 'tags', count(*) FROM "tags"
UNION ALL SELECT 'tag_links', count(*) FROM "tags_on_novels";

SELECT pg_size_pretty(pg_total_relation_size('users')) AS users_size,
       pg_size_pretty(pg_total_relation_size('novels')) AS novels_size,
       pg_size_pretty(pg_total_relation_size('likes')) AS likes_size,
       pg_size_pretty(pg_total_relation_size('tags')) AS tags_size;
```

무기한 lock 대기를 피하려면 migration 프로세스에 PostgreSQL `lock_timeout`과 충분한 `statement_timeout`을 설정합니다. 예를 들어 PowerShell 배포 셸에서는 아래처럼 해당 프로세스에만 적용합니다.

```powershell
$env:PGOPTIONS='-c lock_timeout=10s -c statement_timeout=30min'
npm run prisma:deploy
Remove-Item Env:PGOPTIONS
```

`20260717000700`과 `20260717000800`은 긴 backfill과 강한 잠금을 분리하려고 하나의 migration 파일 안에 여러 트랜잭션을 사용합니다. 따라서 뒤 단계의 `NOWAIT` 또는 timeout으로 실패하면 앞 단계의 컬럼·제약·트리거가 이미 커밋되어 있을 수 있습니다. 이는 재실행을 고려한 상태이지만, 쓰기 중지가 실제로 유지되는지와 남아 있는 앱/worker 연결을 먼저 확인해야 합니다. 특히 계정/작품 삭제, 좋아요 변경, 태그 변경 작업이 하나라도 남아 있으면 두 migration의 교차 테이블 잠금이 즉시 실패할 수 있습니다.

실패한 migration을 `migrate resolve --applied`로 적용 완료 처리하지 마세요. `_prisma_migrations`의 실패 기록과 실제 컬럼·제약·트리거 상태를 확인하고, `20260717000700` 또는 `20260717000800`의 재실행 가능한 단계만 일부 커밋된 상태임을 확인한 경우에만 다음처럼 실패 상태를 해제한 뒤 쓰기 중지 상태에서 배포를 다시 실행합니다.

```powershell
npx prisma migrate resolve --rolled-back 20260717000700_add_novel_like_counters
# 또는 실패한 migration이 태그 정규화인 경우:
npx prisma migrate resolve --rolled-back 20260717000800_normalize_tags
npm run prisma:deploy
```

`20260717000300`과 `20260717000600`은 단일 트랜잭션이므로 실패 시 해당 migration의 변경 전체가 롤백되어야 합니다. 어떤 경우든 실패 원인과 실제 스키마 상태를 확인하지 않은 채 resolve하지 마세요. 배포가 끝난 뒤 사용자 수·좋아요 수·태그 연결 수를 사전 값과 대조하고, 로그인과 태그 검색까지 확인한 다음 트래픽을 재개합니다.

이미 Prisma 밖에서 현재 스키마를 수동 구축한 데이터베이스라면 staging 복제본에서 전체 migration SQL과 실제 스키마를
비교한 후에만 `prisma migrate resolve --applied ...`를 사용하세요. 데이터가 있는 운영 DB에서 추측으로 baseline 처리하면 안 됩니다.
