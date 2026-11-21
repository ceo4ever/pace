# T02 이 저장소 정의서 다운사이즈 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

- 상위 목적 정합: 맞음 — 정의서를 하네스 정본이자 한 번에 읽히는 지도로 만들고 T01 기준을 실증한다(tester·reviewer 독립 1단계 모두 "맞음": [tester-stage1](evidence/tester-stage1.md), [reviewer-stage1](evidence/reviewer-stage1.txt)).
- 목표 달성: 달성 — 정의서 40,703B → 15,370B(LF, 기준 위반 0), 하네스 선언 4개·작업자 선택 전후 동일, 옮긴 상세는 대응표의 대상 절에 원문 그대로. 지도 기능은 새 맥락 에이전트 실측으로 관찰: 정의서 출발 6문항(TASK 문항 그대로) 6/6 정답·링크 2번 이내, AGENTS.md 출발 3과제 3/3 정답([s5-navigation](evidence/s5-navigation.md)).
- 미확인·한계(주장하지 않음): 기준선 40.7KB가 세션에서 안 읽힌 원인이 크기였는지 안내 문구였는지는 분리하지 않았다 — "크기 기준이 원인을 고쳤다"는 검증 안 된 가설이다(비교하려면 기준선 정의서로 같은 탐색을 돌려야 함). 결과 크기는 한도의 94%로 여유가 작다.
- 번복: tester 1단계 "지도로 읽히는지 미확인" → S-5·S-5b 실측 뒤 달성. reviewer 1단계 "미달"(민감 경로 탐색 끊김) → SECURITY 링크 반영 뒤 재검토 pass.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1 [measure](evidence/measure.txt) 15,370B·절/비고/미등록/서브 문서 위반 0, [verify-selftest](evidence/verify-selftest.txt) 고정 절 8개(삭제 사본 실패) |
| T-2 | 통과 | S-2 verify — 라벨 4개 전후 동일·각 1행·`resolveAgent` 전후 동일, 중복 라벨 사본 실패 |
| T-3 | 통과 | S-3 verify — 이동 대응표 [move-map.json](evidence/move-map.json)의 대상 절에서 원문 대조, 예외 3건(전후 값: worktree 예시 경로·문서 표 security 행 대상·구성 요소 머리글 — 결정 메모), 대상 문단 이동 사본 실패 |
| T-4 | 통과 | S-4 verify — 문서 표 머리글 기반 용도·범위(glob 실재, 전체·`**` 거부)·참조 시점, 링크·앵커, 참조 대조(AGENTS 더 보기·ARCHITECTURE 24·29행·브레인 두 페이지·민감 경로 서브 문서 5개 → SECURITY), 결함 사본 9종 모두 실패. [brain-lint](evidence/brain-lint.txt) 오류 0·경고 0 |
| T-5 | 통과 | S-5 [s5-navigation](evidence/s5-navigation.md) — 정의서 출발 6/6(1차·2차), AGENTS 출발 3/3, 답·경로·도착 절 채점과 원문 |
| T-6 | 통과 | S-6 저장소 검사: 1004 중 997 pass·1 fail·6 skip — 실패 1건 `changed check timeout and parent OS termination never continue into tests or full fallback`은 부하에서만 실패하는 시간 의존 시험으로 단독 재실행 26/26 통과([check-changed-alone](evidence/check-changed-alone.txt)). 기존 간헐 실패 `canvas-미리보기-소유-chrome-관찰-간헐-실패` 시험은 이번 실행에서 통과. 보안 검사 통과 2686개 파일([check-full](evidence/check-full.txt)) |

## 단위 테스트

- `npm run check`(단독): tests 1004 · pass 997 · fail 1 · skipped 6 — 실패는 위 시간 의존 시험 1건(단독 재실행 `node --test test/changed-test.test.ts` 26/26 통과).
- `node --test test/adopt-opal-docs.test.ts test/project-init-skill.test.ts`: 8 pass / 0 fail([test-focused](evidence/test-focused.txt)) — 정의서 S-3(OPAL 행·README 링크·문서 표 README 행·라벨 행) 포함.
- 프로젝트 증거 폴더의 대조 도구 `verify.ts --self-test`: 대조 항목 7개 PASS, 결함 사본 9종 모두 검출.
- `node scripts/secret-scan.ts`: 통과(2686개 파일).

## E2E

해당 없음 — 화면·프로세스 변경 없음. 문서 탐색 실측은 S-5(새 맥락 에이전트, 읽기만·검색 금지)로 했다.

## 리뷰

- 사전 검토(Codex): 1차 fail blocking 3 → 2차 fail blocking 3(PM 수정 스크립트 오류로 본문이 바뀌지 않은 채 재검토 — 해시 동일, [pre-review-hashes](evidence/pre-review-hashes.txt)) → 반영 확인 pass blocking 0(should_fix: 전체 덮는 glob 거부 — 반영). 이번에는 검토 시점마다 TASK 해시를 기록했다.
- 1차: tester(호스트 새 맥락) 1단계 — 막다른 링크(워크스페이스 등록부 → ARCHITECTURE)·지도 실측 필요 → 반영(`—`, S-5b). reviewer(Codex) 1단계 fail blocking 1(민감 경로 서브 문서가 SECURITY로 안 이어짐)·should_fix 1(검사 선택 요약) → 반영.
- 2차: tester 2단계 pass(T-6은 마감 기록 확인 조건, signals: S-5 원문·문항 변경 기록 → 반영) · reviewer 2단계 fail blocking 2(S-5 문항·원문, ARCHITECTURE 24행 미검사) → S-5 TASK 문항 그대로 재실행·원문 첨부, 24행 검사·결함 사본 추가.
- 3차: reviewer pass blocking 0([reviewer-r2](evidence/reviewer-r2.txt)) — should_fix F3(되돌린 24행 + 문서 끝 안내 문장) 반영: 줄 단위 검사와 결함 사본.
- 호스트 기능: reviewer는 다른 제공자 `pace agent verify`/`pace agent run --agent codex --mode p`(read-only, 세션 재개 없어 차수마다 원문 인계 — 연속성 changed). tester·S-5는 호스트 새 맥락 서브에이전트(명령 실행·검색 금지 조건 통제가 필요).
- 교본: 해당 없음(제품 코드 변경 없음 — 바뀐 코드는 프로젝트 증거 도구 verify.ts뿐, Git 호출은 인자 배열).

## 남긴 것

- 문서 표 `docs/SECURITY.md` 적용 범위가 SECURITY 민감 경로 표와 다르다(`src/test-runner/`·`skills/pace-playbook-maker/tools/`·`src/project/situation.ts` 없음) — 계약대로 기준선 범위를 유지하고 서브 문서 머리말 링크로 보완. 범위를 표에 맞출지는 사람 결정(idea 후보).
- 옮긴 상세의 문서 안 구조: DAEMON.md는 한 문단, DASHBOARD.md는 하위 절 없음, TESTING "검사 선택"은 한 문장 — "원문 그대로 옮김" 때문. 상세 문서 정리는 별도 일.
- 정의서 크기 여유 6%(15,370B/16,384B) — 다음 구성 요소 몇 행이면 다시 넘는다. 기준 운영(여유 목표)은 사람 결정.
- 크기 기준이 "안 읽힘"의 원인을 고쳤는지는 미검증 가설 — 기준선 정의서로 같은 탐색을 돌린 비교가 없다.
- 전체 검사에서 `changed check timeout …` 시험이 부하 때마다 실패(T01·T02 모두, 단독은 통과) — finish 전체 검사에서 막히면 코디네이터에게 묻는다.
- `docs/ARCHITECTURE.md` 자체 구성 표와 정의서 구성 요소 표의 중복은 계약상 범위 밖(idea).
