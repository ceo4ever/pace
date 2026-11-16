---
id: moscow
title: MoSCoW prioritisation
group: service
types: [feature, service, business, platform]
depth: [L1, L2, L3]
signals: [too many features, a deadline, "MVP", "우선", "일단", limited time or budget]
source: Dai Clegg, Case Method Fast-Track (1994); DSDM prioritisation
---

## Looks at

Which requirements are Must (without them the release fails), Should (important, has a workaround), Could (nice to have), and Won't (explicitly not this time).

## Key questions

- If this requirement were missing, would the release fail its purpose? (Must)
- Is there a workaround for now? (Should)
- What are we explicitly not doing this time, and is that written down? (Won't)
- Do Musts fit the time or budget with room for risk?

## Common gaps

- Everything is Must.
- Won't is empty, so scope keeps creeping back.
- Musts are chosen by effort instead of by the purpose.

## Turning gaps into questions

Classify from the purpose and journey first; ask the user only about borderline items, one at a time, recommending the smaller scope.
Example: "틱톡 자동 업로드는 첫 버전에서? ① Should — 첫 버전은 파일 내려받기로 대신(추천 — 플랫폼 심사 기간이 길 수 있음) ② Must ③ Won't — 외부 서비스 연동 단계와 출시 일정이 달라져요."

## Tensions

- With **Lean Canvas / differentiation**: cutting scope can remove the very thing that makes the product different — ask which differentiator is a Must.
- With **story map**: a Must list may not form an end-to-end slice — check that the Musts complete the journey once.
- With **purpose ladder**: a higher purpose adds Musts — tie each Must to the chosen rung.

## When not to use

L0 documents; a single requirement.

## Output form

Form: four lists (Must · Should · Could · Won't) with one reason each.
Link to first layer: requirements from journey, story map, and use cases get a class; Won't becomes the out-of-scope section of the handoff.
When to produce: L1+ whenever scope is discussed; always for the handoff's scope section.

## Closing

End with the Must list checked against the purpose and the deadline, and a written Won't list.

## Source

MoSCoW (Dai Clegg, Case Method Fast-Track, 1994; DSDM). Concepts rewritten; no text copied.
