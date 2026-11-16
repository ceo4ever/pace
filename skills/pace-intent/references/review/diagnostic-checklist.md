---
id: diagnostic-checklist
title: Diagnostic checklist for briefs and prompts
group: review
types: [document, feature, service, business, platform]
depth: [L0, L1, L2, L3]
signals: [final self-review, a prompt or brief for another AI, a pasted prompt to plan from, handoff route A]
source: nidhinjs/prompt-master references/patterns.md (MIT) — condensed and adapted, see SOURCES.md
---

## Looks at

A finished result (plan, brief, prompt, handoff document) before it leaves the skill: the failure patterns that make the next reader — a person or another AI — guess, re-ask, or overreach.

## Key questions

Task

- Is the task a concrete verb on a concrete object, one outcome per brief (unrelated outcomes split)?
- Is success stated as a binary check, not "make it better"?
- Is the size workable — a whole product broken into ordered steps?
- Is every reference self-contained (no "the thing we discussed")?

Context

- Are prior decisions, the established stack, and earlier failures written in, not assumed from memory?
- Is the audience or user defined?
- Are facts grounded — sources required, uncertainty stated rather than guessed?

Format and scope

- Are output format and length explicit?
- Are scope boundaries explicit — what to touch, what not to touch (files, paths, sections)?
- Are stack or style constraints stated as measurable values instead of adjectives ("professional")?
- Is only the relevant context included, not everything?

Agentic work

- Are the starting state and target state both described?
- Are allowed actions, forbidden actions, and stop-and-ask triggers (delete, new dependency, schema change, external write) listed?
- Are progress milestones and verification evidence required, without asking for hidden reasoning?

## Common gaps

- Success criteria missing or subjective.
- Decisions made in this conversation are not written into the handoff, so the next session contradicts them.
- No stop conditions or forbidden actions for an agent.
- Scope not bounded ("fix the app").

## Turning gaps into questions

Most gaps here are filled from the plan itself — copy the decisions, criteria, and boundaries in. Ask only when the user owns the boundary (e.g. "may the agent add dependencies?"), with the safer option recommended.
Example: "작업 에이전트가 새 라이브러리를 추가해도 될까요? ① 묻고 추가(추천 — 되돌리기 어려움) ② 자유롭게 ③ 금지 — 작업 지시서의 멈춤 조건에 들어가요."

## Tensions

- With **one-pass mode**: the checklist can generate many small questions — fill from the plan and label assumptions; ask at most one.
- With **audience**: a human reader may find agent boundaries noise — keep them in the brief for an AI, drop them from a document for a person.

## When not to use

Never as a question generator at the start; use it at ⑦ (self-review) and when the input itself is a prompt to plan from.

## Output form

Form: a pass/fix list per group (Task · Context · Format and scope · Agentic) with the fix applied.
Link to first layer: every failed item is fixed in the result or recorded as `가정`/`미결`.
When to produce: shown only when the user asks why the result changed; otherwise applied silently.

## Closing

End with the corrected result and zero open checklist items — each item fixed, labelled, or explicitly not applicable.

## Source

Adapted from nidhinjs/prompt-master `references/patterns.md` (MIT License, commit 49b3a72469b1e7287d66387004ccfcca90e5968a): 37 patterns condensed into four groups of questions; image-model, Midjourney, and tool-routing patterns (#18, #19, #24) dropped; examples replaced. License: [licenses/prompt-master-MIT.txt](../licenses/prompt-master-MIT.txt). Details in [SOURCES.md](../SOURCES.md).
