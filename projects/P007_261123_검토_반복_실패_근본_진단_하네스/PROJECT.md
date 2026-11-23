# P007 검토 반복 실패 근본 진단 하네스

- 상태: 완료
- 규모: L(태스크 2개)
- 출처: 대화 2026-11-23 — 캡틴 요청 "3번 이상 실패하면 구조·기획·설계 중 무엇이 문제인지 들여다보고 근본적으로 해결, 그 뒤에도 문제면 사용자에게 설명하고 결정을 받음", 범위 선택 "재검토 모드 + 횟수 안내 + 규칙"
- 브랜치: `project/P007` · worktree: `../pace.wt/P007/`
- 작업자:
- 시작: 2026-11-23

<!--
개발 업무의 예시 형식. 형식·추적 정본: pace-project-dev의 references/document-shape.md.
프로젝트 상태: 정의 → 진행(출처로 착수 결정 뒤) → 병합 대기(finish) → 완료(merge) · 보류.
태스크 상태(태스크 표): 대기 · 진행 · 완료 · 보류.
-->

## 목적

독립 검토(`pace agent verify`)가 같은 대상에서 거듭 fail할 때 지적을 하나씩 막는 땜질 반복을 끊는다. 재검토는 직전 지적과 바뀐 부분만 보게 하고, 연속 3회 fail이면 실패를 모아 원인 층(구조·기획·설계)을 진단해 근본적으로 고치게 하며, 진단 뒤에도 fail이면 사용자에게 상황을 설명하고 결정을 받게 한다. 규칙만이 아니라 도구가 단계를 알려 주고 멈춰 세워, 어떤 LLM 도구에서도 지켜지게 한다.

## 재료

- 실측(P005 T04, 2026-11-22~23): TASK 사전 검토가 v2 9회·v3 11회 연속 fail. 매 회 새 지적이 나왔고 같은 지적 반복은 드물었다. 원인 분석: (1) 다른 OS 기준 계획을 옮긴 설계 어긋남(진단 뒤 v3 전체 재작성으로 launchd PATH 제품 버그 등 실제 결함 발견), (2) **재검토가 매번 처음부터 전체 검토** — `reviewer.md` "두 번째 검토부터는 직전 blocking의 해소 여부와 그 수정이 만든 새 결함만 본다"가 있으나 `pace agent verify`에 재검토 입력이 없고 Codex `-p`는 세션 재개를 지원하지 않는다(프로젝트 이슈 `codex-같은-세션-재검토-불가`). 작성자는 이전 지적 원문 대신 요약만 넘겼다. (3) 검토 기록(`PRE-REVIEW.json`)에 시도를 적는 일이 작성자 수작업이라 빠졌다.
- 코드: `src/agent/verify.ts`(`buildVerifyPrompt` — 1단계 독립 대조 프롬프트, 이전 지적·대응 문서를 읽지 않게 지시, 마지막 줄 판정 한 단어 pass|fail), `src/cli.ts` `agentVerify`(`--out`에 결과 JSON, 미실행 종료 10), `src/agent/contract.ts` `errorCodes`(2~15 사용, 10은 verify 미실행), `src/project/pre-review.ts`(PRE-REVIEW.json 검사·waiver).
- 문서: `skills/pace-project-dev/SKILL.md` §3·§6(멈춤 조건 "같은 실패가 세 번"), `references/task-steps.md` 구현 전 검토, `references/reviewer.md`(재검토 범위·지적 등급·"같은 지적 두 번이면 도구 의심"·사전 검토 기록), `references/coordinator.md`(반복 지적은 도구부터 의심, P001 14회 실측), `references/tools.md`(verify 옵션), `docs/AGENT-CALL.md`(src/agent 적용 범위).
- 캡틴 개인 규칙(프로필 메모리 `검토-3회-실패-근본-진단`)으로 이미 같은 원칙을 적용 중 — 이 프로젝트는 제품 하네스로 만든다.
- 브레인: `.pace/brain/pages/flow/작업-하네스-흐름.md`(태스크 check·finish 흐름).

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | 재검토 모드: 마지막 pass·decision·diagnosis 뒤에 fail 검토가 있으면 `pace agent verify`가 원장에서 그 구간의 가장 최근 fail 검토(unknown은 건너뜀)를 스스로 찾아 직전 검토 원문과 그때→지금 대상의 바뀐 줄을 검토자에게 주고 "직전 blocking 해소 여부와 그 수정이 만든 새 결함만 본다(새 범위 지적은 note)"를 지시한다. 해소 여부를 판단할 맥락으로 현재 산출물 전체도 함께 준다 — 재검토 범위는 입력을 잘라서가 아니라 판정 범위 지시로 좁힌다. 기준점을 호출자가 고르지 않는다. 대상이 바뀌지 않았거나 기록이 맞지 않으면 거부한다 | 단위 시험(프롬프트 구성·거부), AGENT-CALL 문서 |
| P-2 | 검토 기록: verify가 실행될 때마다 대상 폴더의 검토 원장에 시각·종류·대상 해시·판정(pass·fail·unknown)·검토자·재검토 여부·기록 파일을 자동으로 덧붙인다. 작성자 수작업 없이 연속 fail 횟수를 셀 수 있다 | 단위 시험(원장 누적·판정 파싱) |
| P-3 | 단계 안내와 멈춤: 같은 대상의 연속 fail이 3회가 되면 verify 출력에 "근본 진단" 단계를 알리고, 진단을 기록하기 전에는 다음 verify를 실행하지 않는다(종료 코드와 안내). 진단 기록 뒤 다시 fail이면 "사용자 결정" 단계를 알리고, 사용자 결정을 기록하기 전에는 실행하지 않는다. pass가 나오면 연속 횟수는 초기화된다 | 단위 시험(단계 전이·거부·초기화) |
| P-4 | 진단·결정 기록: `pace agent review-note`(가칭)로 진단(원인 층: 구조·기획·설계·기타, 요약, 근거 파일)과 사용자 결정(선택·사유·근거 파일)을 원장에 남긴다. 사용자 결정은 사람이 한 결정의 원문 파일을 근거로 요구한다 | 단위 시험, 사용 예 |
| P-5 | 스킬 규칙: pace-project-dev에 재검토 모드 사용, 3회 fail 진단 절차(층별 질문표·진단 기록 형식), 진단 뒤 fail 시 사용자 보고 형식(실패 유형·고친 층·남은 지적 성격·선택지와 추천)과 PRE-REVIEW 시도 기록 연계가 들어가고 기존 "같은 실패 세 번"·"도구부터 의심" 규칙과 모순이 없다 | 문서 대조, 독립 reviewer |
| P-6 | 회귀 없음: 기존 verify 호출(옵션 없이)·종료 코드·PRE-REVIEW 검사가 그대로 동작한다 | `npm run check` |

## 설계

- **원장**: 대상 파일과 같은 폴더의 `REVIEW-LOG.jsonl`(태스크 폴더에 두어 커밋·PC 이동에도 이어진다). 줄 종류 `review`(verify 1회) · `diagnosis` · `decision`. 대상은 폴더 기준 상대 이름으로 식별, 해시는 PRE-REVIEW와 같은 정규화(`reviewHash`)를 쓴다. 비밀·세션 ID는 쓰지 않는다.
- **판정 파싱**: 결과 텍스트의 마지막 비어 있지 않은 줄이 `pass`·`fail`이면 그 값, 아니면 `unknown`(연속 횟수 계산에서 fail도 pass도 아님 — 단계 전이 없음, 출력에 경고).
- **단계**: 마지막 `pass` 또는 `decision` 이후의 연속 fail 수 n과 그 구간의 `diagnosis` 유무로 정한다. n<3 → normal. n≥3이고 진단 없음 → `diagnose`(다음 verify 거부). 진단 있음이고 진단 뒤 fail ≥1 → `ask_user`(다음 verify 거부). `decision`이 기록되면 새 구간 시작.
- **거부 종료 코드**: 새 코드 `review_escalation` = 16(verify 미실행 10과 구별). 출력 JSON에 `escalation: { stage, consecutive_fails, next }`와 사람이 읽을 안내.
- **재검토 프롬프트**: 마지막 pass·decision·diagnosis 뒤 구간에 fail 검토가 있으면 자동 재검토, 기준점은 그 구간의 가장 최근 fail 검토(unknown 건너뜀). 진단·결정 뒤 첫 검토는 새 기준 전체 검토. 실행마다 대상 폴더 `review-records/R<순번>.json`에 결과·대상 스냅숏을 저장한다(`--out`은 추가 사본, 기존 필드 유지). 바뀐 줄은 의존성 없는 줄 단위 비교로 만든다. 독립성: 재검토는 1단계가 아니라 reviewer.md의 재검토(2단계 성격)이므로 이전 지적 원문을 주는 것이 규칙과 맞다 — 프롬프트에 그 사실과 노출 범위를 적게 한다.
- **보안 영향**: 대상 원문이 `--out` 기록에 복사된다 — 대상은 TASK·문서이며 verify 자체가 이미 원문을 외부 에이전트에 보낸다. 원장에는 원문을 넣지 않는다. 민감 경로 변경 없음.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `src/agent/verify.ts`·`src/agent/verify-cli.ts`(신규)·`src/cli.ts`·`src/agent/contract.ts` | 재검토 프롬프트(원장 자동 기준점), 원장·단계, 새 종료 코드, 기록 명령(`review-note`) |
| `src/agent/review-log.ts`(신규) | 원장 읽기·쓰기·단계 계산 |
| `test/agent-review-log.test.ts`(신규)·`test/project-dev-skill.test.ts` | 위 기준 단위 시험·스킬 시나리오 구조 검사 |
| `docs/AGENT-CALL.md` | verify 재검토·원장·단계·종료 코드 |
| `skills/pace-project-dev/SKILL.md`·`skills/pace-project-dev/references/task-steps.md`·`skills/pace-project-dev/references/reviewer.md`·`skills/pace-project-dev/references/tools.md`·`skills/pace-project-dev/references/coordinator.md`·`skills/pace-project-dev/evals/scenarios.md` | 진단·사용자 결정 절차, 재검토 모드 사용, 시나리오 S7 |
| `README.md` | 사용자 명령 예시(있으면 한 줄) |

## 태스크

| T | 이름 | 상태 | 커밋 |
|---|---|---|---|
| T01 | verify 재검토 모드와 반복 실패 단계 | 완료 | 8dadbaf |
| T02 | 스킬 진단·결정 절차 | 완료 | f769173 |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-23 11:31 | 정의 작성 |
| 2026-11-23 | (사용자 결정) 범위: 재검토 모드 + 연속 fail 횟수 단계 안내·멈춤 + 스킬 규칙. 3회 fail이면 근본 진단, 진단 뒤에도 fail이면 사용자 결정 |
| 2026-11-23 13:08 | (자체 판단) T01: 재검토 기준점을 호출자 --previous 대신 원장 자동 선택으로(오래된 기록 재검토 방지), 기록은 review-records 자동 저장, 진단 뒤 첫 검토는 전체 — 사전 검토 1차 blocking 반영 |
| 2026-11-23 13:34 | (자체 판단) T01: 재검토에도 현재 산출물 전체를 맥락으로 준다 — 범위는 판정 지시로 좁힘(reviewer 1·2차 #1 불수용 이유: 해소 판단에 전체 맥락 필요); 결정 근거가 사람 원문인지는 PM 책임(T-5 합의) 유지 |
| 2026-11-23 14:13 | (사용자 결정) T01: 사용자 결정(evidence/user-decision-post-1.md)에 따라 작성자 전체 재검토로 6건 보완: 큰 변경 거친 비교(막다른 길 제거), 원장 없는 기록 자동 복구(pending=fail·interrupted, 기준점 제외), --out 대소문자 무시, 남은 잠금 PID 판정, 판정 단어 변형 인식, 임시 파일 이름 고유화 — reviewer 추가 검토 없이 tester·전체 검사로 마감 |
| 2026-11-23 17:09 | (자체 판단) 정본 목록 표기를 패턴(test/agent-verify*, references/{…})에서 실제 경로로 — finish 정본 반영 검사가 패턴을 경로로 읽지 못함 |

