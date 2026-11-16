---
id: gwt
title: Acceptance criteria (Given-When-Then)
group: execution
types: [feature, service, platform]
depth: [L1, L2, L3]
signals: [a feature to build, handoff route B or C, "완료", "됐는지", exception flows, test scenarios]
source: Dan North, Introducing BDD (2006); Gherkin Given-When-Then
---

## Looks at

Whether every requirement and every exception flow has an observable done condition: given a state, when an action happens, then a visible result.

## Key questions

- For each requirement, what does the user see when it works?
- For each exception (network fails, quota exceeded, permission denied), what does the user see?
- Can a tester or an E2E script check it without asking the planner?
- Are numbers, limits, and timeouts explicit?

## Common gaps

- Criteria only for the happy path.
- "Then it works" — no observable result.
- Hidden numbers (how long, how many, which message).

## Turning gaps into questions

Write criteria from use cases yourself; ask only for thresholds the user owns, recommending a sensible default.
Example: "영상 생성이 오래 걸리면? ① 3분 넘으면 알림으로 완료 알려 주기(추천 — 화면을 붙잡지 않음) ② 끝날 때까지 화면 대기 ③ 실패 처리 — 완료 기준과 오래 걸릴 때의 흐름이 정해져요."

## Tensions

- With **one-pass mode**: full GWT for every case is long — write criteria for Musts and every exception flow; Could items get one line.
- With **MoSCoW**: Won't items need no criteria, but the boundary ("업로드 버튼이 없다") may need one so nobody builds it.

## When not to use

L0 documents (use the document's must-haves instead).

## Output form

Form: `AC-n` lines — Given … / When … / Then … — linked to the feature and use case IDs.
Link to first layer: each use case exception flow gives at least one AC; spec features list their ACs; handoff `## 기준` rows come from ACs.
When to produce: L1+ always; it becomes the handoff's criteria and the E2E scenarios.

## Closing

End when every Must and every exception flow has an AC that someone else can check; list any requirement still without one as `미결`.

## Source

Behaviour-driven development and Given-When-Then (Dan North, "Introducing BDD", 2006). Concepts rewritten; no text copied.
