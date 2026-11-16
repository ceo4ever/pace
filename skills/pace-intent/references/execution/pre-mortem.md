---
id: pre-mortem
title: Pre-mortem
group: execution
types: [feature, service, business, platform]
depth: [L1, L2, L3]
signals: [external platforms or APIs, money, user data, automation that acts on the user's behalf, a deadline, "자동"]
source: Gary Klein, Performing a Project Premortem (Harvard Business Review, 2007)
---

## Looks at

Imagine the plan has already failed six months from now; list the most likely reasons, then decide which to prevent, detect, or accept.

## Key questions

- It failed — why? (platform rejected the app, costs exploded, users did not trust auto-posting, data lost)
- Which reasons are likely and severe?
- For each, what prevents it, what detects it early, or do we accept it?
- Which risk needs a decision from the user?

## Common gaps

- External dependency risks (API policy, review process, rate limits) are ignored.
- Risks are listed without an owner or a response.
- Automation that acts for the user has no approval or undo point.

## Turning gaps into questions

Generate the failure stories yourself; ask the user only about risks they must accept or pay for.
Example: "플랫폼이 자동 업로드를 막으면? ① 수동 업로드 안내로 대체(추천 — 서비스가 멈추지 않음) ② 그 플랫폼은 빼기 ③ 출시를 미룸 — 예외 흐름과 출시 조건이 정해져요."

## Tensions

- With **MoSCoW**: risk responses add work — ask whether a mitigation is Must or whether the risk is accepted for the first release.
- With **alternatives**: a risky dependency may be avoided by another option — revisit the alternatives table.

## When not to use

L0 documents; trivial reversible changes.

## Output form

Form: a risk table — 실패 이야기 · 가능성 · 심각도 · 대응(예방/감지/수용) · 담당.
Link to first layer: severe risks become exception flows and ACs; accepted risks become `가정` or `미결`; responses become tasks.
When to produce: L1+ with external dependencies, money, or user data; L2+ always.

## Closing

End with the top three risks and the concrete change each made to the plan (an exception flow, an approval point, a removed feature).

## Source

Project premortem (Gary Klein, Harvard Business Review, September 2007). Concepts rewritten; no text copied.
