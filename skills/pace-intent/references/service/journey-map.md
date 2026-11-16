---
id: journey-map
title: User journey map
group: service
types: [feature, service, platform]
depth: [L1, L2, L3]
signals: [a flow across several steps or channels, "기획→생성→발행", onboarding, a process users go through, "업로드", pain points]
source: service design practice — customer journey mapping (Stickdorn & Schneider, This Is Service Design Thinking, 2010)
---

## Looks at

The steps a person goes through to get the job done, end to end — before, during, and after using the product — with their actions, touchpoints, feelings, and pain at each step.

## Key questions

- What triggers the journey, and what is the end state the user wants?
- What are the stages, and which channel or screen is used at each?
- Where does the user wait, switch tools, retry, or give up?
- What happens after "done" — sharing, measuring, coming back?

## Common gaps

- The journey starts at the app's home screen instead of the trigger.
- Steps outside the product (uploading on another platform, approval by a teammate) are missing.
- Failure moments (upload rejected, token expired) are not on the map.

## Turning gaps into questions

Draft the journey from the request and context, show it, and ask only where the user's own routine decides the shape.
Example: "발행은 어떻게 하고 싶으세요? ① 생성 후 제가 확인하고 한 번에 세 곳 발행(추천 — 승인 지점이 하나라 단순) ② 플랫폼별로 따로 확인 ③ 확인 없이 자동 발행 — 승인 지점과 화면 수가 달라져요."

## Tensions

- With **MoSCoW**: the journey shows every step, scope cutting removes some — ask which stage the first release must cover end to end so the journey is not broken.
- With **alternatives**: a stage may be done by another tool — mark it as an external step instead of building it.

## When not to use

L0 documents; single-screen changes with no multi-step journey.

## Output form

Form: a stage table — 단계 · 사용자 행동 · 접점(화면/채널) · 생각·감정 · 불편 · 기회.
Link to first layer: stages become the use case list; pains become requirements; failure moments become exception flows.
When to produce: L2 always (feeds use cases); L1 when the feature spans several steps.

## Closing

End with the top two pains the plan removes and the stage where the product must hand off to something else.

## Source

Customer journey mapping in service design (Stickdorn & Schneider, This Is Service Design Thinking, 2010). Concepts rewritten; no text copied.
