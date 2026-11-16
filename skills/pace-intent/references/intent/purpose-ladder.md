---
id: purpose-ladder
title: Purpose ladder (5 Whys)
group: intent
types: [document, feature, service, business, platform]
depth: [L0, L1, L2, L3]
signals: [any request, a solution named before a problem, "만들어 줘", "자동화", unclear success]
source: Taiichi Ohno, Toyota Production System (5 Whys); laddering from means-end theory
---

## Looks at

The chain from the thing requested (a means) up to the outcome the user actually wants (an end), and the level at which the plan should aim.

## Key questions

- What will be different for the user when this exists? Why does that matter?
- Is the requested thing the only way to get there, or one of several means?
- Who notices success first, and how would they measure it?
- Which level of the ladder is in scope for this request, and which is context only?

## Common gaps

- The request names a solution ("make an app") without the outcome it serves.
- Success is not observable — no number, event, or person who confirms it.
- The ladder stops one rung too low, so the plan optimises the wrong thing (e.g. "faster editing" when the goal is "post daily without effort").

## Turning gaps into questions

Climb at most two rungs from the request. Offer the likely purposes as options, recommend the one the context supports, and say what changes with each answer.
Example: "이 서비스로 가장 이루고 싶은 것은? ① 내 채널 운영 자동화(추천 — 요청에 '내 채널'이 있음) ② 다른 사람에게 판매 ③ 아이디어 검증 — 답에 따라 깊이(L2/L3)와 승인 지점이 달라져요."
If the context already states the purpose, record it as a fact; if a wrong guess is cheap, assume and label it.

## Tensions

- With **MoSCoW / scope cutting**: a higher purpose widens scope while cutting narrows it — ask which rung the first release must serve.
- With **JTBD**: the ladder is about the user's own goal; JTBD is about the customer's job — when they differ (seller vs. end user), ask whose outcome comes first.

## When not to use

A request that already states its outcome and success measure, or an L0 edit where any purpose leads to the same text.

## Output form

Form: one-line purpose statement — "<who> wants <outcome> so that <higher reason>; success = <observable signal>".
Link to first layer: the top rung in scope becomes the outcome, the rung above becomes the reason, the success question becomes the signal.
When to produce: always as the first line of the plan; as a separate section only from L2.

## Closing

End with the chosen rung and the success signal, not with the list of whys. The rungs above scope become context; the rungs below become requirements.

## Source

5 Whys (Taiichi Ohno, Toyota Production System, 1988) and means-end laddering (Reynolds & Gutman, 1988). Concepts rewritten; no text copied.
