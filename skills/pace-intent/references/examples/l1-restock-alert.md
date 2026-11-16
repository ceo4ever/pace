# L1 — restock alert feature

## Request

"우리 의류 쇼핑몰 모바일 웹에 '재입고 알림 받기' 기능 기획해 줘." (no project docs, no code in the repository)

## Lenses

purpose-ladder, jtbd, assumption-map, gwt, pre-mortem (SMS failure, consent); alternatives only to confirm the existing SMS vendor. Planning documents for L1: usecase (1–2), ia (changed/new screens), sequence (external SMS provider — D13), wireframe, spec.

## Gaps that must surface

- alert channel (SMS vs. push) — the user's call
- who may subscribe (members only?) — the user's call
- the SMS provider — external; if the user cannot name it, it stays `미결` and the sequence actor points to it (`docs.open`), never an invented URL
- consent wording for informational vs. advertising messages — `미결` or research

## Good and bad questions

- Good: "알림은 어떤 수단으로 보낼까요? ① 문자(SMS)(추천 — 앱이 없는 모바일 웹이라 바로 닿아요) ② 이메일 ③ 카카오 알림톡 · 직접 입력 — 외부 연동 시퀀스와 동의 문구가 달라져요."
- Bad: "어떤 화면이 필요한가요?" (the planner proposes screens); asking purpose when the request already implies it.

## Expected route

B — L project (several tasks: subscribe UI, restock trigger, SMS integration, admin view), confirmed before `pace project new`; open items gate only the last task.

## Judgment

- `pace intent verify docs` passes (unknown provider via `docs.open` → a `미결` item)
- `pace intent check PROJECT.md` passes; nothing written before the route and creation were confirmed
- one question per turn; collection summary first

## Recorded runs

Validation run r1 (first run) and r1b (re-run after fixes). First run: verify 3 failures on the first pass, patched without telling the user (against ⑦), and the unknown vendor could not pass `sequence-docs` → fixes: `docs.open` for undecided providers, ⑦ now says "more than two failures: do not patch: tell the user the checks and the cause step, and stop until the user replies", B keeps the collection summary in the project `docs/`. Re-run: 12/13 → 13/13 (one writing slip), PROJECT.md 0 problems, route and size the same as the first run.
