# S-1·S-3 옛 문구 대조 (2026-11-23)

## 최대 2회

## 반영 확인

## 같은 세션 재개를 보장하지 않는다

## 새 세션에 이전 지적
skills/pace-project-dev/evals/scenarios.md:30:| A | 1차 fail, blocking 2, escalation 없음 | 지적 반영 → `verify` 재호출(자동 재검토) | 새 세션에 이전 지적을 손으로 옮김, 무관한 범위 재작성 |

## 새 세션에 전달
skills/pace-project-dev/references/reviewer.md:17:**재검토와 반복 실패는 도구가 단계를 정한다.** fail이면 지적을 반영하고 `pace agent verify`를 다시 부른다 — 도구가 원장의 직전 fail을 기준점으로 골라 그 원문과 바뀐 줄을 주는 **자동 재검토**다(아래 [반복 실패](#반복-실패-진단과-사용자-결정)). 같은 대상이 연속 

## 같은 실패가 세 번
skills/pace-project-dev/SKILL.md:86:- 같은 실패가 세 번 이어진다 — 검토 fail이면 먼저 근본 진단, 진단 뒤에도 fail이면 사용자 결정([반복 실패](references/reviewer.md#반복-실패-진단과-사용자-결정))
skills/pace-project-dev/references/coordinator.md:46:- 같은 실패가 세 번 이어짐(검토 fail은 진단 뒤에도 fail일 때 — [반복 실패](reviewer.md#반복-실패-진단과-사용자-결정))

## 두 번 이어지고
skills/pace-project-dev/references/reviewer.md:52:같은 reviewer 지적이 두 번 이어지고 실질 결함이 아니라 절차·열람 지적이면 structure 층(검토 도구·방식) 문제로 보고 3회를 기다리지 않는다 — 재검토를 더 돌리지 않고 증거 원문(노출 범위·오류 문구)과 함께 코디네이터나 사용자에게 올려 도구를 먼저 고친다.

## 구현 후 검토는 예외 대상이 아니다

## 자동 재검토
skills/pace-project-dev/evals/scenarios.md:30:| A | 1차 fail, blocking 2, escalation 없음 | 지적 반영 → `verify` 재호출(자동 재검토) | 새 세션에 이전 지적을 손으로 옮김, 무관한 범위 재작성 |
skills/pace-project-dev/references/reviewer.md:17:**재검토와 반복 실패는 도구가 단계를 정한다.** fail이면 지적을 반영하고 `pace agent verify`를 다시 부른다 — 도구가 원장의 직전 fail을 기준점으로 골라 그 원문과 바뀐 줄을 주는 **자동 재검토**다(아래 [반복 실패](#반복-실패-진단과-사용자-결정)). 같은 대상이 연속 
skills/pace-project-dev/references/reviewer.md:39:두 번째 검토부터는 직전 blocking의 해소 여부와 그 수정이 만든 새 결함만 본다. 현재 산출물 전체는 해소 판단의 맥락이고, 바뀌지 않은 부분의 새 지적은 note로 남기며 이번 판정·수정 대상이 아니다(`verify`의 자동 재검토가 이 범위를 지시한다).
skills/pace-project-dev/references/reviewer.md:100:**원장에서 옮겨 적기.** `verify`가 쌓은 원장(`REVIEW-LOG.jsonl`)의 review 항목을 차례로 시도로 옮긴다: `hash`=원장 hash(같은 정규화), `status`=verdict(`unknown`은 옮기지 않고 원문을 확인해 다시 검토), `blocking`=원문의 bl
skills/pace-project-dev/references/task-steps.md:8:   **구현 전 검토** — [reviewer.md](reviewer.md)의 구현 전 TASK 검토 절을 따른다. 워크트리 PM이 작성한 TASK.md를 별도 reviewer에 맡겨 상위 목적·브리프와의 정합, 범위·완료 기준·테스트 계획·접근과 위험을 검토받는다. blocking은 수정하고 `ve
skills/pace-project-dev/references/tools.md:36:- `pace agent verify`는 `--model`을 받지만 `--effort`는 받지 않는다 (`src/cli.ts`, `src/agent/verify.ts`). 생략 시 모델은 실행 도구 기본값이며 effort는 지정할 수 없다. 같은 세션 재개는 하지 않는 대신, 대상 폴더 원장(`REVIEW-L

## 반복-실패-진단과-사용자-결정
skills/pace-project-dev/SKILL.md:86:- 같은 실패가 세 번 이어진다 — 검토 fail이면 먼저 근본 진단, 진단 뒤에도 fail이면 사용자 결정([반복 실패](references/reviewer.md#반복-실패-진단과-사용자-결정))
skills/pace-project-dev/evals/scenarios.md:26:실행자에게는 사례의 "고정 입력"만 주고 필수·금지 행동은 주지 않는다. 채점은 원응답을 아래와 대조한다. 정본 절차는 [reviewer.md 반복 실패](../references/reviewer.md#반복-실패-진단과-사용자-결정).
skills/pace-project-dev/references/reviewer.md:17:**재검토와 반복 실패는 도구가 단계를 정한다.** fail이면 지적을 반영하고 `pace agent verify`를 다시 부른다 — 도구가 원장의 직전 fail을 기준점으로 골라 그 원문과 바뀐 줄을 주는 **자동 재검토**다(아래 [반복 실패](#반복-실패-진단과-사용자-결정)). 같은 대상이 연속 
skills/pace-project-dev/references/reviewer.md:98:제공자는 실제 제공자를 일관되게 식별하는 소문자 영문으로 시작하는 64자 이내 영문·숫자·밑줄·하이픈 식별자(예: `openai`, `anthropic`, `google`)다. 도구명이 아닌 모델 회사명을 사용하고 같은 회사는 동일한 식별자로 기록한다. 별칭의 동등성과 제공자 진위는 기계가 검증하지 않는
skills/pace-project-dev/references/coordinator.md:24:- **반복되는 검토·검사 지적은 도구부터 의심한다**: 같은 지적(특히 독립성·열람 불가·형식 같은 절차 지적)이 두 번 이어졌다는 보고를 받으면, 우회 지시(대체 검토자·본문 첨부·재시도)를 내리기 전에 증거 원문의 노출 범위·오류 문구를 읽고 그 도구(`pace agent verify` 프롬프
skills/pace-project-dev/references/coordinator.md:46:- 같은 실패가 세 번 이어짐(검토 fail은 진단 뒤에도 fail일 때 — [반복 실패](reviewer.md#반복-실패-진단과-사용자-결정))
skills/pace-project-dev/references/task-steps.md:8:   **구현 전 검토** — [reviewer.md](reviewer.md)의 구현 전 TASK 검토 절을 따른다. 워크트리 PM이 작성한 TASK.md를 별도 reviewer에 맡겨 상위 목적·브리프와의 정합, 범위·완료 기준·테스트 계획·접근과 위험을 검토받는다. blocking은 수정하고 `ve
skills/pace-project-dev/references/task-steps.md:11:4. **테스트** — 워크트리 PM이 저장소 검사 명령(`docs/README.md` 환경의 "검사")과 E2E를 수행하고, **tester ∥ reviewer**를 새 맥락으로 직접 배정·회수·판정한다(`references/tester.md`·`reviewer.md`, 방법은 `references
skills/pace-project-dev/references/tools.md:36:- `pace agent verify`는 `--model`을 받지만 `--effort`는 받지 않는다 (`src/cli.ts`, `src/agent/verify.ts`). 생략 시 모델은 실행 도구 기본값이며 effort는 지정할 수 없다. 같은 세션 재개는 하지 않는 대신, 대상 폴더 원장(`REVIEW-L
