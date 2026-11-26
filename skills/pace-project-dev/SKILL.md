---
name: pace-project-dev
description: 업무를 프로젝트(projects/P###)와 태스크로 수행한다 — 발의·규모 판단 → 분석·설계·계약 → 태스크(분석·설계·구현·테스트·마감) → finish → merge. "프로젝트로 진행해 줘", "태스크 수행", "pace project …", 백로그 단계 착수, 정리된 기획·문서의 실행 인계, 또는 Orca 작업자로 프로젝트 worktree에 띄워졌을 때 쓴다. 개발·문서 등 업무 종류가 아니라 단계로 나눈다 — 요구사항·기획을 정리하는 단계는 pace-intent, 저장소 정의서·문서 최신화는 pace-project-init이 맡고 이 스킬은 그 결과를 실행·검증하는 단계에 쓴다. 기획·목차가 이미 확정돼 작성·구현·검증만 남은 요청(예: 확정된 목차대로 PRD 작성·검증)은 문서여도 처음부터 이 스킬이다.
---

# 프로젝트 수행

PACE는 **계약**(목적·재료·기준), **게이트**(커밋·마감·병합), **기록**만 맡는다. 분석·구현·리뷰·브라우저 같은 실행은 지금 쓰는 LLM 도구의 기본 기능으로 한다.
글쓰기(PROJECT·TASK·마감 문서)는 에이전트가, 번호·폴더·worktree·형식 확인·병합은 `pace project` 명령이 한다.

템플릿은 개발 업무의 예시다. 업무별 형식 선택·최소 추적·명령용 구조와 의미 판정의 구별은 [문서 형식과 추적](references/document-shape.md)을 따른다.

| 문서·명령 | 언제 |
|---|---|
| `references/tools.md` | 프로젝트 계획 때 특수 기능 필요 여부·호스트 기능 선택 |
| `references/testing.md` · `references/e2e.md` | 테스트 설계·버그 수정 · 화면·프로세스 시나리오 |
| `references/tester.md` · `references/reviewer.md` | 태스크 사전 검토·테스트 단계 — 새 맥락에 넘길 판정 기준 |
| `references/security.md` | 설계의 보안 영향, finish 전 보안 검사 |
| `references/coordinator.md` · `references/decision-rights.md` | 코디네이터 운영, PM·owner 결정과 실행 전 승인 확인 |
| `references/html-plan.md` | 복잡한 설계를 html-plan으로 보여 줄 때 |
| `references/project-define.md` · `references/task-steps.md` | 프로젝트 분석·설계 세부 · 태스크 단계 세부·reviewer 배정 |
| `references/commands.md` | `done`·`check`가 하는 일, `pace project log` 형식 |
| `references/backlog.md` | BR 번호·BACKLOG 상태 규칙, start 작업자 도구·모델 |
| `references/verification.md` | 워크트리·허브 PM 책임 표, 재검사 |
| `references/finish.md` · `references/recovery.md` · `references/standards.md` | finish 세부·지표 · merge 뒤 복구 · 기준 문서 고르기 |
| 템플릿 | 설치본 `templates/project/` — 명령이 채우며 직접 만들 때도 같은 절 이름을 쓴다 |

## 1. 발의와 규모

백로그나 대화에서 일이 생기면 규모부터 정한다.

| 규모 | 기준 | 진행 |
|---|---|---|
| 작은 일 | 버그·문구·단발 수정 — diff를 한 문장으로 말할 수 있다 | 프로젝트 없이 바로 고치고 저장소 검사 명령 → 커밋 |
| 태스크 없는 프로젝트 | 한 번에 끝낼 수 있지만 기준·검증을 남겨야 한다 | PROJECT.md(기준 아래 테스트 표) + PROJECT-CLOSE.md, `e2e/`·`evidence/`는 프로젝트 폴더에. `start`로 worktree를 쓰거나, 작업이 짧으면 `start` 없이 main에서 바로 하고 `finish`가 `완료`로 끝낸다(merge 없음) |
| L 프로젝트 | 단계가 여럿이거나 여러 세션에 걸친다 | 태스크로 나눈다 |

## 2. 프로젝트 (main)

1. `pace project new "<이름>" [--from <BL 폴더 또는 앞부분>]` — 번호·폴더·PROJECT.md.
2. **분석**: 백로그·코드 위치·지금 동작·브레인으로 재료를 모으고 `new`가 넣은 "- 브레인:" 후보 중 관련 없는 줄은 지운다.
3. **설계**: 목표를 한 단계 위 목적에 대조한 뒤 목적, 기준 `P-n`, 설계·보안 영향, **바꿀 정본 목록**, 태스크 표를 쓴다. 세부: [project-define.md](references/project-define.md).
4. **착수 결정**: 백로그 지시나 대화에서 확정한 내용이 곧 착수 결정이다. 목적·기준·태스크와 출처를 PROJECT.md 결정 메모에 적고 바로 start한다 — 승인 답을 기다리지 않는다. 복잡한 설계는 `html-plan`으로 보여 줄 수 있다(선택). 진행 중 기준·범위 변경은 §6에 따라 묻는다. 병합·배포는 사람 승인 뒤 수행한다.
5. `pace project start P###` — 정의 커밋 + worktree(`../<저장소>.wt/P###`, 브랜치 `project/P###`) + 준비 명령. Orca 안(터미널·채팅 세션)이면 worktree 작업자 세션을 띄우고 이 세션은 코디네이터가 된다(`references/coordinator.md`). Orca 밖이면 출력의 명령으로 worktree에서 새 세션을 연다.

main에서 worktree 파일을 절대 경로로 고치지 않는다 — 프로젝트는 그 worktree의 세션이 맡는다.

백로그처럼 큰 산출물은 작성자와 **다른 제공자**의 에이전트가 상위 목적 우선으로 독립 검토한다([cross-verify.md](references/cross-verify.md)).

## 3. 태스크 (worktree, 자율)

태스크 표의 `대기` 중 맨 앞부터 아래 단계를 수행한다. 결정이나 장애의 처리 범위는 §6을 따른다.

팀이 있으면 설계 때 [pace-team](../pace-team/SKILL.md)으로 담당과 독립 검토를 정한다.

1. **분석** — `pace project task P### "<이름>"`이 TASK.md를 만들고 표 상태를 `진행`으로 둔다. 목적·재료를 쓰고 앞 태스크 TASK-CLOSE의 "남긴 것"을 읽는다.
2. **설계** — 기준 `T-n`, 테스트 표(기준마다 시나리오 한 줄 이상), 접근을 쓰고 기준 문서는 §5 규칙으로 고른다. **구현 전 검토**: 별도 reviewer(작성 PM과 다른 제공자 우선)에게 TASK.md를 `pace agent verify`로 검토받아 pass(blocking 0)이거나 사용자 결정 waiver일 때만 구현한다. 세부: [task-steps.md](references/task-steps.md).
3. **구현** — 기존 코드 스타일을 따르되, 언어 색인의 안티패턴으로 주변 코드와 변경을 대조한다. 보안·성능 문제가 있거나, 따를 주변 코드가 없거나(새 프로젝트·새 모듈), 주변이 안티패턴이면 교본을 따른다(§5). 버그는 실패하는 테스트(RED)부터.
4. **테스트** — 워크트리 PM이 저장소 검사 명령과 E2E를 수행하고 **tester ∥ reviewer**를 새 맥락으로 배정·회수·판정한다. 출력의 `escalation`을 먼저 따르고, 없으면 fail·blocking을 고쳐 **둘 다** 다시 돈다. 세부·TASK-CLOSE 리뷰 기록 형식은 [task-steps.md](references/task-steps.md).
5. **마감** — TASK-CLOSE.md를 쓰고 → `pace project check P### T0n` 통과 → `pace project done P### T0n` → 진행 상황 갱신(§7) → 커밋 `feat(P###/T0n): …`(TASK-CLOSE·상태·메모리 같은 커밋).

## 4. finish → merge

1. 모든 태스크가 `완료`(또는 `보류`)면 PROJECT-CLOSE.md를 쓴다 — 기준 대조와 별도 **목표 달성 판정**([goal-review.md](references/goal-review.md)). 목표 미달/미확인은 게이트 통과로 덮지 않고 해당 위 단계 보완·합의 변경 질문으로 올린다. 구성·보안·지표는 [finish.md](references/finish.md).
2. `pace project finish P###` — 검사 항목은 [finish.md](references/finish.md). 실패를 고치고 다시 실행한다. 목차 외 rebase 충돌은 중지하고 허브와 [A·B·C](references/decision-rights.md)에 따라 해결·보고한다.
   `finish` 직전·직후에 같은 검사를 따로 반복하지 않는다([verification.md](references/verification.md)).
3. **자체 판단 대조** — finish가 통과한 뒤 `worker_done`·완료 보고 전에 워크트리 PM이 log.jsonl의 `자체 판단` 결정을 백로그·PROJECT.md 합의(목적·기준·범위)와 대조한다. 합의를 바꾼 것이 있으면 보고 전에 §6으로 올리고, 없으면 "대조: 변경 없음"을 보고에 적는다.
4. 지표(`pace project stats`)·남은 일·브레인 정리는 [finish.md](references/finish.md).
5. 실제 merge의 FF가 성공한 뒤 완료 기록이 실패하면 [recovery.md](references/recovery.md)를 따른다.

✋ **병합 대기 중 main 커밋은 병합 뒤로 미룬다.** 메모리 파일은 갱신하되, 그 커밋과 [B의 도구 수정](references/decision-rights.md#b-허브의-장애-대응) 커밋을 미룬다. FF 뒤 완료 기록 복구는 위 5번을 따른다.

✋ **merge**는 허브가 main에서 실행한다. `pace project merge P###`의 미리보기 대상과 owner 승인 원문을 [실행 전 확인](references/decision-rights.md#실행-전-승인-확인)으로 대조한 뒤 `--yes`를 입력한다. Orca 작업자면 finish 통과 뒤 `worker_done`으로 끝낸다.
6. ✋ 배포가 있으면 같은 정본으로 배포 대상의 별도 승인을 확인한다.

## 5. 기준 문서 고르기 (D3)

[standards.md](references/standards.md)에서 이번에 바꿀 경로에 맞는 기준 문서와 우선순위(기계 설정 > `AGENTS.md` > 기준 문서 > 주변 코드 > 교본 > PACE 기본값)를 고른다. 보안·성능 문제·새 모듈이면 교본을 따른다.

## 6. 멈춤 조건

[결정 권한 정본](references/decision-rights.md)의 A와 실행 전 승인 확인을 적용한다. A에 걸리면 작업자는 `ask`로 허브에 인계하고 허브가 C의 요청을 보낸다. 해당 조치만 보류하고 독립 작업은 이어간다.

A 밖은 PM이 결정하고 C에 따라 결과를 보고한다. 재현 근거를 허브에 보내 [B](references/decision-rights.md#b-허브의-장애-대응)로 장애를 해결한다. 단독 PM은 직접 수행한다. [반복 실패](references/reviewer.md#반복-실패-진단과-사용자-결정)의 도구 상태를 확인한다. 허브 결정은 "(main 판단)"으로 기록한다.

조기 신호는 워크트리 PM이 호출한다. 소진·`upper_review`는 허브에 인계하며 상위 검토에서는 수정을 멈춘다. [호출 절차](references/reviewer.md#호출-주체와-기회)를 따른다.

## 7. 진행 기록과 인계

- 세션을 멈추거나 태스크를 끝내면 `pace memory status --project --body "<어디까지 · 다음 할 일 · 막힌 것>"`. 프로젝트 메모리(`.pace/`)는 저장소에 커밋된다 — 태스크 커밋 전에 갱신해 같은 커밋에 넣는다.
- `pace project list`로 프로젝트·태스크 상태를 확인한다. 진행 상태의 원본은 PROJECT.md 태스크 표다.

백로그·프로젝트 원본 문서를 직접 편집했다면 커밋 전에 `pace backlog refresh`를 실행한다.

