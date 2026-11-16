# T01 시제품 스킬 이관 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

목표(기능 변경 없는 이관으로 확장의 바닥 만들기)는 상위 목적에 정합하고 **달성**으로 판단한다: 9흐름 106파일 바이트 동일(대조군은 불일치 검출), 설치본에서 생성기·코어 동작, 실값 금지어·형식 검사 통과. 한계: codex 교차 검토는 읽기 전용이라 파일을 못 열어 "증거 미확인"으로만 답했다(독립 1·2단계 판정으로는 부분 부합·미확인). 이 한계는 아래 리뷰에 그대로 적는다 — 번복 근거 없음.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1: `evidence/identity-result.txt` — 흐름 9개, 파일 106개 비교, 불일치 0. 대조군(생성기 한 글자 변경) 불일치 검출(출력 원문은 evidence에 저장하지 않음 — 바꾸는 부분에 따라 불일치 흐름 수가 다르다) |
| T-2 | 통과 | S-2: `test/playbook/skill-doc.test.mjs` S-1·S-2 통과(금지어·주민번호 형식 문서 검사·name·링크·크기). 이름·경로·GEN만 변경 — diff는 `review-codex-2.md` 입력 참고 |
| T-3 | 통과 | S-3: fixture `test/fixtures/playbook/sample-flow/steps.json`, `skill-doc.test.mjs` S-5(사전 모든 행 사용), `build.test.mjs` S-6 통과 |
| T-4 | 통과 | S-4: `evidence/check-tsc.txt`(tsc exit=0), `evidence/check-test.txt`(tests 878 pass 872 fail 0 skipped 6, exit 0, 래퍼 `playbook-maker .mjs 테스트가 실제로 실행되고 모두 통과한다` ✔), `evidence/secret-scan.txt`(통과, scan exit=0) |
| T-5 | 통과 | S-5: `test/playbook-install.test.ts` ✔ — 격리 HOME, 기존 사용자 스킬(`시제품 스킬`) 해시 불변, 추가는 `pace-playbook-maker`뿐, 설치본 `build.mjs` 실행·`capture-core.mjs` import |
| T-6 | 통과 | S-6: `evidence/case-baseline.txt` — 4종 통과, HEAD <이후 main 커밋>·status 0줄, `~/.claude/skills` 불변 |

## 단위 테스트

- `.mjs` 48건(생성기·코어·스킬 문서) 전부 통과 — `node --test test/playbook/*.test.mjs`.
- `npm run check` 전체: tsc exit 0, `node scripts/test.ts` tests 878 / pass 872 / fail 0 / skipped 6(기존 skip). `evidence/check-tsc.txt`·`evidence/check-test.txt`.
- `node scripts/secret-scan.ts` 통과 641개 파일.

## E2E

- S-1 동일성 비교(`evidence/compare-identity.mjs` — 저장소 밖 빈 폴더, 사례 저장소 읽기 전용 `git show <기준 커밋>`): 통과.
- 실제 HOME 설치 전후 비교는 이 worktree에서 하지 않는다(설치는 main에서만) — 격리 HOME 설치 테스트(T-5)와 시작 전·후 HOME 목록 비교로 대체. main 병합 뒤 실설치 때 한 번 더 확인할 것.

## 리뷰

- 구현이 사전 검토보다 먼저 끝남 — 사후 교차 검토로 대체(main 판단, 결정 메모 기록).
- 1차: tester pass(check·동일성 출력, 워크트리 PM 판정) · reviewer(codex, openai, cross:true) revise — blocking 2 · should_fix 1: should_fix(GEN에 실행 가능한 명령)는 반영. blocking은 ① 입력이 1단계 경계 미충족(사후 검토라 불가피, 한계로 기록) ② 기능 보존·실값·사례 저장소 무영향 미확인(diff만 받음) — 증거 제시로 대응. 원문 `evidence/review-codex.md`.
- 2차: reviewer revise — blocking 2(근거가 범위에 못 미침: 설치 후 구성·실값 증거 / 파일 열람 차단으로 확인 불가) · should_fix 2: `~` 셸 의존 → GEN을 `<PACE 설치본 app>` 표기로 반영, 독립성 한계는 기록. blocking은 reviewer가 파일을 읽지 못해 남은 것으로, 해당 증거는 T-1·T-2·T-5 테스트·검사가 직접 제공한다. 해소로 인정하지 않고 "reviewer blocking 미해소(증거 열람 한계)"로 남긴다. 원문 `evidence/review-codex-2.md`.
- 3차: reviewer(codex, openai, cross:true) revise — blocking 1(캡처 코어 등 전체 원문·기준 커밋 원문을 직접 대조하지 못함, 발췌 본문 한계) · should_fix 1(실값 미반입은 grep만으로 안 닫힘). 증거 원문(반입 파일 목록·금지어·형식 grep, 격리 HOME 설치·설치본 실행, 동일성 106파일, 사례 저장소)을 본문에 실었으나 reviewer는 읽기 전용이라 파일을 열지 못한다. 같은 실패 3회 → 캡틴 결정으로 escalation. 원문 `evidence/review-codex-3.md`. 독립성 한계: 2·3차는 이전 지적과 작성자 검증 주장에 노출된 상태.
- 4차(같은 제공자 대체, 캡틴 승인 ①): 파일 접근 가능한 새 맥락 reviewer(anthropic, cross:false, continuity changed — codex가 읽기 전용으로 파일을 열람하지 못해 원문 대조 미수행) 2단계 pass(blocking 0). 원문 `evidence/review-claude.md`. PRE-REVIEW.json은 codex 3회 `unavailable`(사유 기록) 뒤 anthropic pass. 한계: 같은 제공자(작성자와 동일)라 교차 검증이 아니다. 지적 처리: F1(should_fix) evidence의 사용자 경로를 `<TEMP>`·`<USER-PATH>`로 가림 반영 · F2 `test/playbook-install.test.ts`에 "추가 항목은 PACE skills/ 목록 안" 단언 추가 · F3 문구 수정 · F4 실행 건수 하한 40→48 · F5(증거에 서비스 이름·사례 저장소 경로 포함: `identity-result.txt`·`case-baseline.txt`·`compare-identity.mjs`)는 이미 main 백로그에 같은 이름이 커밋돼 새 노출은 아니며 캡틴 확인 사항으로 올림.
- 교본: typescript — 새 코드는 테스트 래퍼 2개뿐(`erasableSyntaxOnly`·`.ts` import 규칙 준수, `spawnSync`로 중첩 러너 환경변수 제거). `.mjs`는 시제품 코드 그대로(이관 단계 비변경).

## 남긴 것

- reviewer blocking 2건 미해소(codex가 파일 접근 불가). 병합 전 사람이 위 증거로 판단하거나 파일 접근 가능한 검토가 필요하면 PROJECT-CLOSE에서 다시 다룬다. T02부터는 구현 전 사전 검토를 받는다.
- 검토 입력 요령: `pace agent verify`는 파일을 열 수 없어 본문에 증거를 실어야 한다 — 다음 검토 때 diff 전문과 증거 원문을 한 파일에 담는다.
- 생성 머리말은 이제 설치본 경로 표기(`<PACE 설치본 app>`)다. 업무 저장소 vendoring·해시 버전 확인은 T03 이후.
- 스킬 문서 테스트 S-2의 주민번호 형식 검사는 `tools/`를 제외(가림 검사용 합성 표본).
- 실제 HOME 설치 전후 사례 저장소 비교는 main 병합·설치 뒤 한 번 더.
