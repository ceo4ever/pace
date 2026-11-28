# T01 테마 저장

- 프로젝트: [P001](../../PROJECT.md)
- 상태: 진행
- 사전 검토: v1
- TASK 형식: v2

## 목적

사용자가 고른 테마를 settings.json에 저장해 다음 실행에도 유지한다.

## 재료

- `src/settings.ts:1-9` `loadSettings(path)`가 settings.json을 읽고, 없거나 깨진 파일이면 기본값을 낸다. 저장 함수는 없다.
- 기존 회귀 시험: `test/settings.test.ts`(읽기 기본값).

## 증명 범위

- 판정 주체: 자동 테스트(`node --test`)
- 구현 후 reviewer: 생략 — 작은 함수 하나를 더한다
- 포함(변경 영향 경로): 새 `saveTheme(path, theme)`의 settings.json 쓰기와 다시 읽기, 잘못된 값 거부
- 범위 밖: `loadSettings`의 기존 읽기·기본값 동작 — 기존 동작, 기존 회귀 시험(`test/settings.test.ts`)

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | `saveTheme(path, "dark")` 뒤 `loadSettings(path).theme`이 "dark"이고 다른 키는 그대로다 |
| T-2 | theme 값이 "light"·"dark"가 아니면 쓰지 않고 오류를 던지며 파일 바이트가 바뀌지 않는다 |
## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | 임시 폴더의 settings.json `{"lang":"ko"}` | `saveTheme` 뒤 **새 자식 프로세스**(`node -e`)에서 `loadSettings`, 파일 원문도 `JSON.parse` | 자식 결과와 파일 원문 모두 theme "dark", lang "ko" | `test/settings.test.ts` |
| S-2 | unit | T-2 | 같은 파일, `node:fs`의 `writeFileSync`·`renameSync`를 `mock.method`로 감시 | `saveTheme(path, "blue")` | 오류, 쓰기·이름 바꾸기 호출 0회, 파일 바이트와 mtime 동일 | `test/settings.test.ts` |
## 접근

`src/settings.ts`에 `saveTheme`를 더한다. 값 검사를 먼저 하고, 파일을 읽어 theme만 바꾼 JSON을 쓴다.
