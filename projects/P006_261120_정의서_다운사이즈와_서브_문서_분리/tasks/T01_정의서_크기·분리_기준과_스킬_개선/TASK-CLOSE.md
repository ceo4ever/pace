# T01 정의서 크기·분리 기준과 스킬 개선 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

- 상위 목적 정합: 맞음 — 정의서를 "한 번에 읽히는 지도"로 만들고 유지하려면 기준이 opi에 정본으로 있어야 한다. tester·reviewer(Codex) 모두 독립 1단계에서 같은 판단([tester-stage1](evidence/tester-stage1.md), [reviewer-stage1](evidence/reviewer-stage1.txt)).
- T01 목표(기준 한 곳 + 작성·최신화·템플릿이 따름): 달성 — 기준 절이 `references/project-docs.md`에만 숫자로 있고(S-1, 표기 변형 포함), SKILL §3·§4-1·§4-4·§4-5·§5가 측정 → 분리·등록 → 재측정, 승인 전 변경 금지, 한 단위 승인, 거부 시 미확정 기록을 절차로 따른다(S-2 변이). 바뀐 스킬만 받은 새 맥락 에이전트가 초과 사례 두 건에서 이 절차와 구체적 분리 제안(실제 파일 이름·문서 표 행·남길 요약)을 냈다([S-8](evidence/s8-walkthrough.md)).
- 미확인·한계: 이 스킬로 실제 정의서를 지도 크기로 만들어 내는지는 T02 실증 몫. 문구 검사는 다른 표현의 모순 문장을 막지 못한다 — S-5 reviewer·S-8 진행으로 보완(tester 판단 "충분"). 측정 도구는 프로젝트 증거 폴더에 있고 스킬은 재는 법만 행위로 적는다.
- 1·2단계 번복: tester 1단계 "조건부 미달"(근거 문장 오류·재는 법 누락) → 수정 뒤 3차 기준 모두 pass. reviewer 1단계 "미달"(재측정 시점·템플릿 링크) → 3차 pass.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1 `node --test test/project-init-skill.test.ts` 4/4([결과](evidence/test-project-init-skill.txt)), 기준 절 조건 문구 단언·변이(환경 예외화) 실패 확인 |
| T-2 | 통과 | S-2(절차 문구 + 삭제 변이 루프 + 절대 규칙·금지 문장), S-8 [s8-walkthrough](evidence/s8-walkthrough.md) 1·2차 |
| T-3 | 통과 | S-3 — 템플릿 구성 요소 `요약 · 상세`, 링크 예시와 `—` 예시, AGENTS 더 보기 읽는 시점, 역할 경계 길이 칸 |
| T-4 | 통과 | S-4 analysis.md §7 정의서 측정(6항목), 프로젝트 증거 폴더의 measure-selftest.ts 17 PASS([결과](evidence/measure-selftest.txt)) — 오탐·누락 사례와 대조군 |
| T-5 | 통과 | 숫자 정본 단일(S-1). 저장소 검사: 기존 실패 1건(test/intent-preview.test.ts:463 owned Chrome not observed — 간헐, 재실행 통과 가능, main 이슈 `canvas-미리보기-소유-chrome-관찰-간헐-실패`, main 13a66e9 동일 실패) 제외 통과(사용자 결정). 보안 검사 통과 2644개 파일([check-full](evidence/check-full.txt)) |
| T-6 | 통과 | S-7 — 기준 절 남김·값·형식·유일성, 템플릿 네 명령 하네스 판독, 백틱 제거·중복 라벨 사본 값 변화, 서브 문서 파일·문서 표 등록 분리 사본에서 `resolveAgent` codex·저장소 기본값 유지, 바꾼·지운 사본 변화 |

## 단위 테스트

- `node --test test/project-init-skill.test.ts`: 4 pass / 0 fail.
- 프로젝트 증거 폴더 measure-selftest.ts 실행: 17 PASS / 0 FAIL.
- `npm run check`(단독 실행): tests 1004 · pass 996 · fail 2 · skipped 6 · check exit 1 — 실패 2건은 ① `changed check timeout and parent OS termination never continue into tests or full fallback`: 동시 부하에서만 실패, 단독 재실행 `node --test test/changed-test.test.ts` 26/26 통과([check-changed-alone](evidence/check-changed-alone.txt)) ② intent-preview 소유 Chrome 관찰 — 위 T-5의 기존 간헐 실패(main 동일, 코디네이터 재현: 단독 4회 중 2회 fail). 원문 요약 [check-full](evidence/check-full.txt).
- `node scripts/secret-scan.ts`: 통과(2644개 파일).

## E2E

해당 없음 — 화면·프로세스 변경 없음. 스킬 절차의 실제 사용은 S-8(새 맥락 에이전트 진행, [s8-walkthrough](evidence/s8-walkthrough.md))로 확인.

## 리뷰

- 사전 검토(Codex, 다른 제공자): 1차 fail blocking 3 → 2차 fail blocking 2 → 반영 확인 fail blocking 1(반영 완료) → 사용자 게이트 예외(선택 A, [user-waiver](evidence/user-waiver.md), `PRE-REVIEW.json` waiver). 시도 해시는 검토 뒤 TASK 치환을 역순 적용해 재구성(기록 누락 — `note`에 명시).
- 1차: tester fail(blocking 4 — S-1 조건 문구·숫자 표기 변형·남김 줄, S-8 이름) · reviewer(Codex) 1단계 fail blocking 2(재측정 시점·템플릿 링크) → 2단계 fail blocking 2(F1 부분 승인·F4 증거) — 모두 반영.
- 2차: tester fail(blocking 1 — §5-2 단언) · reviewer fail blocking 1(F4 S-8 이름) → 반영(S-8 사례 B 재실행).
- 3차: tester pass(T-1~T-6, 새 결함 없음, [tester-rounds](evidence/tester-rounds.md)) · reviewer pass blocking 0([reviewer-r3](evidence/reviewer-r3.txt)).
- should_fix 처리: 링크 표시명 백틱(반영), S-7 실제 서브 문서(반영), §5 완료 기록(반영), docs 심볼릭 링크 순회 시작점·정의서 읽기(반영 — Windows 링크 생성 권한 때문에 selftest 사례는 남김), 150자 근거(반영).
- 호스트 기능: reviewer는 다른 제공자 `pace agent verify`/`pace agent run --agent codex --mode p`(read-only — codex p는 세션 재개 미지원이라 차수마다 새 세션에 원문 인계, 연속성 changed). tester와 S-8은 호스트 새 맥락 서브에이전트 — `pace agent run claude p` read-only는 셸 도구가 없어 tester가 명령을 직접 돌릴 수 없음.
- 교본: typescript — 테스트 안티패턴 대조(테스트 간 상태 공유 없음, 임시 폴더 격리·정리, 구현 세부 대신 하네스 공개 함수 결과 단언). 보안: 측정 도구 경로 순회의 심볼릭 링크 미추종.

## 남긴 것

- T02: 이 스킬의 최신화 절차로 이 저장소 정의서를 다운사이즈한다. 출발안(v1 초안·서브 문서 10개)은 로컬 ref `refs/wip/P006-T02-draft`. v1 초안 측정: 15,699B, 비고 150자 초과 2행(스킬 417자·워크스페이스 등록부 155자) — 기준에 맞게 줄여야 함. 프로젝트 증거 폴더의 측정 도구(measure.ts)·대조 도구(verify.ts)로 P-3~P-6 확인. 처음 보는 에이전트가 정의서에서 상세·명령·보안 기준을 찾는지(지도 기능) 실증을 함께 본다(reviewer 1단계 제안).
- 스킬에 없는 판단(S-8): 작은 초과 행을 모듈별 문서로 낼지 ARCHITECTURE에 합칠지, 주제 문서(배포 등)의 적용 범위 — 한 문서 한 주제 원칙으로 판단.
- 측정 도구를 스킬에 포함할지(현재 재는 법만) — idea 후보.
- 기존 간헐 실패 `canvas-미리보기-소유-chrome-관찰-간헐-실패`: main이 맡음. finish 전체 검사에서 이 시험만 실패하면 한 번 재실행, 그래도 막히면 코디네이터에게 묻는다.
- 함정(브레인 후보): codex p 모드는 세션 재개가 없어 reviewer 재검토가 매번 새 세션 — 이전 원문 인계 필요. 사전 검토 시점의 TASK 해시를 기록하지 않으면 PRE-REVIEW 재구성이 필요하다. 전체 검사를 동시에 두 벌 돌리면 시간 의존 시험이 실패하고 둘 다 늦어진다.
