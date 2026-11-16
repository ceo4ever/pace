---
id: alternatives
title: Alternatives and build/buy
group: strategy
types: [feature, service, business, platform]
depth: [L1, L2, L3]
signals: ["만들어 줘", "개발", a new tool or service, an existing product might already do it, external platforms, cost or time pressure]
source: decision analysis practice (alternatives including a do-nothing baseline); common build-vs-buy analysis practice
---

## Looks at

Whether the outcome needs to be built at all: doing nothing, changing a process, buying or subscribing, configuring an existing tool, combining services, or building — and what each costs over time.

## Key questions

- What do people use today for this job, and what exactly is missing?
- Which existing products, APIs, or open-source tools cover most of it? What do they not cover?
- What is the full cost of each option — money, setup time, maintenance, lock-in, data ownership?
- Which part is the real differentiator worth building, and which part is commodity?

## Common gaps

- "Build" is the only option considered.
- Maintenance and platform-policy risk are left out of the cost.
- A paid tool is rejected without checking its official limits (API, export, terms).

## Turning gaps into questions

Research the alternatives first (external search with sources and checked dates), then ask the user only for the trade-off they own.
Example: "편집 기능은 어떻게 할까요? ① 기존 편집 도구(예: CapCut) 연동·내보내기만 하고 기획·발행 자동화에 집중(추천 — 편집은 이미 좋은 도구가 많아 차별점이 아님) ② 간단한 자체 편집기 ③ 전부 자체 개발 — 범위와 개발 기간이 크게 달라져요."

## Tensions

- With **JTBD**: the job may be fully done by an existing tool — then the plan shrinks to integration; ask whether the user wants a product or just the outcome.
- With **MoSCoW**: buying covers many Musts quickly but limits differentiation — ask which Must is the reason to exist and must be built.

## When not to use

L0 documents; requests where the build decision is already made and recorded with reasons.

## Output form

Form: an options table — 대안 · 해결하는 것 · 못 하는 것 · 비용(초기/유지) · 위험 · 결론, ending with the chosen option.
Link to first layer: each researched alternative becomes a row; the user's trade-off answer selects the conclusion; the rejected options go to the decision record.
When to produce: L2+ always; L1 when a credible existing tool exists.

## Closing

End with one recommended option per part (build / buy / integrate / drop) and the reason; never with a feature comparison alone.

## Source

Decision analysis with explicit alternatives against a do-nothing baseline, and common build-vs-buy practice in software strategy (no single source). Concepts rewritten; no text copied.
