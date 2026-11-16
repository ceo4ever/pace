# L2 — shorts planning, generation, and multi-platform publishing service

## Request

"쇼츠를 기획→생성·편집→발행하고 인스타·틱톡에도 업로드하는 서비스를 만들어줘." — one-pass variant adds "한 번에 끝까지 정리해 줘"; the staged variant does not name a mode.

## Lenses

purpose-ladder, jtbd, assumption-map, alternatives (build vs. existing editors), pre-mortem (platform rejection, unaudited apps), journey-map, moscow; lean-canvas only if selling becomes a goal (it did not). Full planning chain (D10) with sequences only for publish and channel connection (D13).

## Gaps that must surface

- **purpose**: own-channel automation vs. selling vs. validation — decides depth (L2 vs. L3) and approval points
- **alternatives conclusion**: do not build an editor; integrate or import
- **platform premises from official docs** with URL and checked date: Instagram (professional accounts, Reels via Content Publishing), TikTok (`video.publish`, unaudited apps post privately), YouTube quota — conflicts or doubts stay `미결`
- **approval point** before publishing (pre-mortem: wrong post is hard to undo)
- revenue model — the user cannot decide → `미결`, never assumed

## Good and bad questions

- Good: "이 서비스로 가장 먼저 이루고 싶은 것은? ① 내 채널 운영 자동화(추천 — 요청이 내 발행 흐름 중심) ② 다른 사람에게 판매 ③ 아이디어 검증 · 직접 입력 — 깊이와 승인 지점이 달라져요."
- Bad: "인스타그램 API로 업로드할 수 있나요?" (an external fact — research it); asking the revenue model again after "나중에".

## Expected route

C — planning backlog created after confirmation, `docs/` (plan.json + HTML + collection), briefs only for slices whose conditions hold; platform-blocked briefs wait for their `미결`.

## Judgment

- `pace intent verify` passes; sequences exist only for the D13 use cases
- `pace intent check` passes on BACKLOG and every BR; `pace project new --from` succeeds in a copy
- raw `plan.json` is smaller than the rendered HTML total (D12)
- staged: after a session break a new session resumes from `## 진행 기록` without re-asking
- the same request in two sessions → L2 and C

## Recorded runs

Validation run r2 (one-pass: 3 questions, verify 13/13 first run, 3 briefs, plan.json 29,214 B vs HTML 130,309 B) and r3 (staged: session A stopped after use cases and IA; session B found the backlog, named the last confirmed stage, re-asked nothing, added flows/sequences/wireframes/spec, 13/13, 1 brief; plan.json 42,095 B vs HTML 132,715 B). Session A created the backlog folder before the user's reply: SKILL.md ⑧ now says to end the turn first. Reproducibility: an independent one-pass session (run r8) proposed B without any start-now signal; after B was limited to "the user wants to start now", the same request again (run r8b) gave L2 · C like run r2.
