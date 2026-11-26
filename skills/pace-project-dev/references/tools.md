# 필요에 맞는 호스트 기능 선택

프로젝트 계획 단계에서 특수 기능이 필요한지 먼저 판단한다. 필요하면 **현재 구동 중인 호스트**와 이 세션에 실제로 노출된 도구·스킬·에이전트 기능을 확인한다. 이 목록과 현재 설정이 사용 가능 여부의 정본이다. 아래 제품명·기능명은 발견을 돕는 **예시**이며 PACE의 지원 목록이나 호출 계약이 아니다. 목적에 맞는 호스트 기능이면 PACE 대체 절차보다 우선 선택하고, 불필요하면 쓰지 않는다. 기능이 없거나 꺼져 있으면 필요한 일에 맞는 대체 방법을 고른다. 설정·실험 기능 플래그는 PACE이 자동으로 켜지 않는다.

| 필요 | 현재 호스트에서 기능이 보이고 적합하면 | 없거나 비활성화되었으면 |
|---|---|---|
| 독립적인 새 맥락의 tester·reviewer | 호스트의 서브에이전트·팀·새 세션 기능으로 각각 판정을 받는다. 단 같은 대상의 reviewer 판정(사전 검토·구현 후 reviewer)은 반복 실패 원장이 이어지도록 처음부터 `pace agent verify`로 받는다(호스트 reviewer는 원장에 남지 않는다). `goal-review.md` 1단계 회수 뒤 `tester.md`·`reviewer.md`의 작업 문서를 전달한다 | 별도 세션에서 목표/결과의 첫 판단을 회수한 뒤 TASK.md·diff·판정 기준을 준다 |
| 코드·보안 리뷰 | 호스트의 리뷰 기능 또는 독립 에이전트에 `reviewer.md`·`security.md` 기준을 준다 | 별도 세션에 해당 기준을 주고 판정받는다 |
| 계획·작업 분할 | 호스트의 계획·태스크·병렬 작업 기능을 필요와 독립성에 맞춰 쓴다 | PROJECT.md·TASK.md에 직접 계획하고 순차 작업한다. 복잡한 화면·구조는 `html-plan`을 쓸 수 있다 |
| E2E 브라우저 | 현재 세션의 브라우저 도구로 실제 사용자 흐름을 확인한다 | HTTP·CLI로 검증 가능한 부분을 확인하고, 브라우저 확인이 남으면 `e2e.md`에 한계를 기록한다 |
| 사용자·코디네이터에게 질문 | Orca 작업자는 주입된 `orca orchestration ask`, 그 밖에는 호스트가 제공한 선택지 UI나 대화를 쓴다 | 대화로 질문한다 |

호스트별 기능을 찾을 때 참고할 **예시**다. 문서에 있어도 이 세션의 도구 목록이나 설정에 없으면 사용할 수 있다고 가정하지 않는다.

| 호스트 | 살펴볼 기능의 예시(사용 보장 아님) |
|---|---|
| Claude Code | [서브에이전트·Agent Teams](https://code.claude.com/docs/en/agent-teams) |
| Codex | [계획·리뷰·세션 명령](https://learn.chatgpt.com/docs/developer-commands?surface=cli) |
| Cursor | [서브에이전트·브라우저](https://cursor.com/docs/subagents) |
| Gemini CLI | [서브에이전트](https://geminicli.com/docs/core/subagents/)·[스킬](https://geminicli.com/docs/cli/skills/) |
| Antigravity | [서브에이전트](https://antigravity.google/docs/subagents)·[브라우저](https://antigravity.google/docs/commands/browser) |

## 판정과 기록

- [goal-review.md](goal-review.md)의 입력 순서를 먼저 지킨다. TASK/diff 같은 작업 문서는 첫 판단 회수 뒤 2단계에 전달한다.
- tester·reviewer에게는 **판정 기준과 재료만** 넘기고 구현자의 결론("잘 됐다")을 넘기지 않는다.
- 역할 에이전트 파일을 PACE이 설치하지 않는다. 역할은 이 references의 프롬프트로만 정의한다.
- 호스트 리뷰 결과도 `reviewer.md` 등급(blocking·should_fix·note)으로 옮겨 TASK-CLOSE에 적는다.
- 새 맥락 결과를 그대로 믿지 않는다. blocking 지적은 코드에서 확인하고 고친다. 사실이 아니면 이유를 적는다.
- TASK-CLOSE에는 사용한 호스트 기능과 선택 이유를 짧게 기록한다. 설정이 필요한 기능은 사용 가능 여부와 수동 활성화 필요 여부를 기록하고, 꺼진 기능을 임의로 켜지 않는다.

## reviewer 호출 옵션과 한계

- 호스트의 새 세션·Orca 호출은 해당 호스트가 노출한 모델·effort 옵션과 기본값을 따른다. `pace worker` 설정이나 `project start`의 작업자 설정이 reviewer에 자동 적용된다고 가정하지 않는다. 실제 사용한 도구·설정·보고된 제공자를 확인한다.
- `pace agent run --mode p`는 Claude와 Codex에 `--model`, `--effort`를 전달한다. 생략하면 PACE은 값을 지정하지 않고 실행 도구의 기본값을 쓴다. Codex p는 사용자 설정을 무시한다. Claude p의 `--resume`은 지원하지만 Codex p의 resume는 지원하지 않아 오류다. 호스트 세션 재개 가능 여부는 별도로 확인한다.
- `pace agent verify`는 `--model`을 받지만 `--effort`는 받지 않는다 (`src/cli.ts`, `src/agent/verify.ts`). 생략 시 모델은 실행 도구 기본값이다. 원장의 직전 fail 원문·바뀐 줄로 자동 재검토한다. escalation 신호·종료 16의 단계와 기록은 [반복 실패](reviewer.md#반복-실패-진단과-사용자-결정), 결정 주체와 미실행 안내는 [결정 권한 정본](decision-rights.md)을 따른다. 교차 제공자는 결과의 실제 제공자 또는 보고된 모델로 확인한다. B1의 `--allow-same-provider` 대체 결과는 `cross: false`다. 양쪽 모두 미실행이면 관문을 보류하고 허브와 검토를 복구한다. 생략·완화나 증거 공백을 안고 진행하는 조치는 A-3으로 owner에게 묻는다.

## SKILL.md에서 옮긴 문장

프로젝트 계획 때 `references/tools.md`에 따라 특수 기능이 필요한지 판단하고, 필요할 때 현재 세션의 도구·스킬·에이전트 목록에서 적합한 호스트 기능을 고른다.
