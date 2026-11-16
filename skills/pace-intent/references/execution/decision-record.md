---
id: decision-record
title: Decision record
group: execution
types: [feature, service, business, platform]
depth: [L1, L2, L3]
signals: [a choice between options, "어떻게 할지", a decision made during the interview, a rejected alternative, handoff]
source: Michael Nygard, Documenting Architecture Decisions (2011)
---

## Looks at

Every decision the plan relies on: context, the options considered, the choice, the reason, and the consequences — so the next session does not reopen it.

## Key questions

- Which choices did the user make in this conversation, and which did the planner assume?
- What options were rejected and why?
- What does the choice make easy, and what does it make hard later?
- Who decided, and when?

## Common gaps

- Decisions live only in the chat, so the project or backlog re-asks them.
- The reason is missing, so a later reader cannot tell whether it still holds.
- Assumptions are written as if they were decisions.

## Turning gaps into questions

Decisions come from the interview — record them, do not ask again. Ask only when two earlier answers conflict.
Example: "앞에서 '자동 발행'과 '발행 전 확인'을 둘 다 말씀하셨어요. ① 발행 전 한 번 확인(추천 — 잘못 올라간 영상은 되돌리기 어려움) ② 완전 자동 ③ 플랫폼마다 다르게 — 승인 화면이 생기는지가 달라져요."

## Tensions

- With **assumption map**: an assumption must not be recorded as a decision — keep the `가정` label until the user confirms.
- With **one-pass mode**: one-pass decides many things by default — record defaults as assumptions, not decisions.

## When not to use

L0 documents with no real choices.

## Output form

Form: `D-n` rows — 결정 · 근거 · 버린 대안 · 결과 · 출처(사용자 결정/자체 판단).
Link to first layer: interview answers and the alternatives conclusion become rows; they fill the handoff's decision table (BACKLOG `## 확정된 결정`, PROJECT `## 결정·진행 메모`).
When to produce: L1+ whenever a choice was made.

## Closing

End with a decision table where every row has a reason and a source, and no row is an unconfirmed guess.

## Source

Architecture decision records (Michael Nygard, "Documenting Architecture Decisions", 2011). Concepts rewritten; no text copied.
