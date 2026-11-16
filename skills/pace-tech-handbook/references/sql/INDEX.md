# SQL 교본 색인
사용법: 평소엔 이 색인만 읽고 아래 안티패턴으로 주변 코드를 대조한다. 문제 판정(규칙 위반·안티패턴·버그 위험·참고 코드 없음)일 때만 줄 범위를 Read offset/limit로 읽는다. 우선순위: 저장소 규칙 > 주변 코드 > 교본. 주변 스타일 우선.
대상: PostgreSQL. Flyway 사용법은 교본에 없으므로 저장소 규칙을 따른다.

| 교본 | 절 | 줄 | 언제 읽나 |
|---|---|---|---|
| database-migrations | Migration Safety Checklist | 28-38 | 설계 시 확인 |
| database-migrations | Adding a Column Safely | 42-54 | 컬럼 추가 |
| database-migrations | Adding an Index Without Downtime | 56-67 | 인덱스 추가 |
| database-migrations | Renaming a Column (Zero-Downtime) | 69-85 | 이름 변경 |
| database-migrations | Removing a Column Safely | 87-97 | 컬럼 삭제 |
| database-migrations | Large Data Migrations | 99-126 | 대용량 이전 |
| database-migrations | Zero-Downtime Migration Strategy | 392-419 | 설계 시 확인 |
| database-migrations | Anti-Patterns | 421-430 | 판정 시 |
| database-migrations | Prisma (TypeScript/Node.js) | 128-176 | 읽지 않음 |
| database-migrations | Drizzle (TypeScript/Node.js) | 178-206 | 읽지 않음 |
| database-migrations | Kysely (TypeScript/Node.js) | 208-300 | 읽지 않음 |
| database-migrations | Django (Python) | 302-360 | 읽지 않음 |
| database-migrations | golang-migrate (Go) | 362-390 | 읽지 않음 |
| postgres-patterns | Index Cheat Sheet | 22-31 | 인덱스 선택 |
| postgres-patterns | Data Type Quick Reference | 33-41 | 컬럼 타입 선택 |
| postgres-patterns | Anti-Pattern Detection | 94-118 | 판정 시 |
| postgres-patterns | Common Patterns | 43-92 | 읽지 않음 (Supabase RLS·auth.uid 포함) |

안티패턴 요약 (판정 기준)
- 운영 DB에 수동 SQL, 배포된 마이그레이션 수정
- 기본값 없는 NOT NULL 추가, 큰 테이블에 인라인 인덱스(CONCURRENTLY 사용)
- 스키마와 데이터 변경을 한 마이그레이션에 섞기
- 코드 제거 전에 컬럼 삭제, 인덱스 없는 외래 키
