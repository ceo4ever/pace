# T01 사후 검토 — Claude 새 맥락 reviewer (anthropic, cross:false)

- 배정: P001 코디네이터(main 세션), 2026-11-16, 캡틴 결정 ①(파일 접근 가능한 reviewer)
- 방식: 1단계(목적+원본·이관본 파일만) → 2단계(TASK.md·TASK-CLOSE·evidence) 대조. 파일 수정 없음.
- 독립성 한계: 사후 검토(구현 뒤), 같은 제공자(작성자 claude) — 교차 아님. 앞선 codex 3회 원문을 2단계에서 읽음.

판정: pass (blocking 0)

독립 목표 대조(1단계): 맞음. 원본(fin-link dd68b5b)과 이관본을 diff로 비교했습니다. `capture-core.mjs`, `adapter.md`, `dom-stub.mjs`는 바이트가 같습니다. `build.mjs`는 사용 주석(2행)과 머리말 생성 명령 `GEN`(112행)만 다르고 로직은 그대로입니다. `SKILL.md`는 `name`·제목·도구 위치 표만, `schema.md`는 77행 첫 사례 문장(날짜·업무명 제거)만 바뀌었습니다. 테스트는 import 경로, 스킬 경로, 사례 의존 부분만 바뀌었습니다. 사례 의존 부분은 실제 서비스 흐름 대신 가상 fixture를 쓰고, fixture가 스키마 사전의 모든 행을 쓰는지 보는 S-5 테스트가 새로 붙었습니다. 동작이 바뀐 곳은 찾지 못했습니다.

2단계 대조: 1단계 판단과 다른 점은 없습니다. TASK.md의 "접근"이 diff로 본 변경 범위와 일치합니다(주민번호 형식 검사에서 `tools/`를 빼는 것까지 적혀 있습니다).
- 원본에서는 도구가 스킬 폴더 밖에 있어 형식 검사 대상이 아니었습니다. 그래서 `tools/`를 빼도 원본과 같은 범위입니다. 금지어 검사는 `tools/`까지 계속 봅니다.
- 앞선 codex 리뷰 세 건의 blocking은 모두 "파일을 열 수 없어 확인하지 못함"이었습니다. 이번에 원문을 직접 대조해 해소된 것으로 봅니다.

목표 달성: 달성.
- (1) 동일성 비교 재실행: 9흐름·106파일 불일치 0, exit 0. 생성기를 바꾼 대조군(lane 문구 한 글자)은 불일치 1, exit 1 — 검출력 확인.
- (2) 실값 grep 적중은 모두 허용 범위: 금지어 목록, 합성 표본(`900101-1234567`, `111-22-33333`, `홍길동`), 설치 테스트가 일부러 만든 기존 스킬 이름 `opal-auto-flow-maker`. fixture는 가상 서비스 내용.
- (3) `.mjs` 테스트 48건 모두 통과(원본 47 + 새 S-5). `evidence/check-test.txt` 요약 tests 878 / pass 872 / fail 0 / skipped 6 / exit 0, 래퍼 테스트 통과.
- (4) 격리 HOME 설치 테스트 통과.
- (5) fin-link HEAD 51cab14, `git status` 0줄.

F1 [should_fix] `evidence/check-test.txt:449-453` 외 — 실제 Windows 사용자 경로(`C:\Users\<사용자>\AppData\...`)가 13줄 들어 있다. 저장소가 공개로 바뀌었으니 문제다. → 커밋 전에 요약 줄만 남기거나 경로를 `<TEMP>`로 바꾼다.

F2 [handoff] `test/playbook-install.test.ts:26-28` — 추가된 항목에 `pace-playbook-maker`가 있는지만 확인하고 "추가는 하나뿐"(T-5)은 단언하지 않는다(같은 설치기에서 다른 PACE 스킬도 추가됨). → 기준 문구를 고치거나 PACE 스킬 목록과 대조하는 단언을 넣는다.

F3 [handoff] `TASK-CLOSE.md` T-1 행 — "대조군 9흐름 모두 FAIL"의 출력이 evidence에 없다(reviewer 대조군은 1흐름만 FAIL — 넣은 변경에 따라 다름). → 대조군 출력을 evidence에 저장하거나 문구를 "대조군 불일치 검출"로.

F4 [handoff] `test/playbook-maker.test.ts:23` — 실행 건수 하한 40이라 현재 48건에서 몇 건 빠져도 못 잡는다. → 하한을 48로.

F5 [handoff] `evidence/identity-result.txt`, `fin-link-baseline.txt`, `compare-identity.mjs` — 서비스 이름·fin-link 경로가 들어 있다. 이관 대상이 아닌 증거이고 main 백로그에 같은 이름이 이미 커밋돼 새 노출은 아니다. 공개 저장소이므로 사람 확인.

보안: 새 테스트는 `execFileSync`·`spawnSync`를 셸 없이 인자 배열로 부르고 임시 폴더만 쓴다. 설치기 변경 없음. 경로 처리 문제 없음.

실행한 명령과 결과 요약:
- 9개 파일 `git show dd68b5b` → 임시 폴더에 받아 `diff` → 위 차이만
- `node evidence/compare-identity.mjs …` → 9흐름 106파일 불일치 0, exit 0
- 바꾼 생성기로 같은 비교(임시 폴더) → 불일치 1, exit 1
- 실값 정규식 grep(서비스명·URL·이메일·주민번호·사업자번호 형식) → 허용 항목만
- `node --test test/playbook-maker.test.ts test/playbook-install.test.ts` → 2/2 pass
- `node --test test/playbook/*.test.mjs` → 48/48 pass
- fin-link `git status` → 0줄, HEAD 51cab14

한계:
- 전체 `npm run check`는 재실행하지 않고 evidence로만 확인.
- fin-link 테스트 4종과 실제 HOME 설치는 확인하지 않음(실제 설치는 main 병합 뒤).
- 실값 확인은 패턴 grep과 fixture 앞부분 직접 읽기까지 — fixture 전체를 한 줄씩 보지는 않음.
