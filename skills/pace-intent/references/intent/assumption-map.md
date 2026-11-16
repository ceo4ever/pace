---
id: assumption-map
title: Assumption map
group: intent
types: [document, feature, service, business, platform]
depth: [L0, L1, L2, L3]
signals: [any plan with unknowns, "아마", "될 것 같", a premise about users or platforms, the user cannot decide now]
source: David Bland & Alexander Osterwalder, Testing Business Ideas (2019) — assumptions mapping
---

## Looks at

Every belief the plan relies on, placed by importance (the plan fails if it is wrong) and evidence (how much we already know).

## Key questions

- What must be true for this plan to work — about users, value, feasibility, cost, platforms, law?
- Which of these do we have evidence for (inputs, memory, brain, documentation, research)?
- Which are important and unproven? What is the cheapest way to prove them before building?
- Which are decisions the user owns rather than facts to check?

## Common gaps

- Premises about external platforms or APIs are taken for granted (e.g. "we can auto-upload to TikTok").
- Small guesses are silent instead of labelled, so readers cannot challenge them.
- Important unknowns are turned into assumptions to finish faster, instead of being kept open.

## Turning gaps into questions

- Important + unproven + user-owned → one question (recommend the safest option and say what it unblocks).
  Example: "업로드 계정은 누구 것인가요? ① 사용자 본인 계정만(추천 — 플랫폼 정책상 가장 단순) ② 대행사가 여러 고객 계정 관리 ③ 아직 모름 — 권한 위임 시퀀스와 승인 화면이 생기는지가 달라져요."
- Important + unproven + external fact → research it (official documentation, checked date) instead of asking.
- Unimportant → label as `가정:` with a reason; no question.
- Important + the user cannot decide now → keep as `미결` with impact and the condition to resolve before start.

## Tensions

- With **one-pass mode**: one-pass wants few questions, the map wants every risky premise resolved — ask only the important + unproven + user-owned ones, label the rest.
- With **pre-mortem**: the pre-mortem invents failure stories; the map ranks them — use the map to decide which story gets a question.

## When not to use

Never skip entirely; for L0 keep it to a single `가정` block.

## Output form

Form: a table — 가정 · 중요도 · 근거 · 처리(채움/질문/가정/미결) · 확인 방법.
Link to first layer: every gap from other lenses lands in one row; the 처리 column decides questions, labels, and open items.
When to produce: L1+ as the `가정`/`미결` sections of the handoff; L0 as one assumption block.

## Closing

End with three lists, not a map: what was verified, what is labelled `가정`, and what stays `미결` with its resolve condition.

## Source

Assumptions mapping (David Bland & Alexander Osterwalder, Testing Business Ideas, 2019). Concepts rewritten; no text copied.
