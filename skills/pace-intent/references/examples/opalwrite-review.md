# Existing product — opalwrite agent-suggestion review screen

## Request

Inside `/Volumes/Data/AIStudio/workspace/opalwrite`: "에이전트가 낸 수정 제안을 검토·승인하는 화면 기획해 줘. 참고: https://tiptap.dev/docs/content-ai/capabilities/changes/overview"

## Lenses

purpose-ladder, assumption-map, journey-map (review → approve/reject → undo), gwt, pre-mortem (editor autosave overwriting applied AI changes). Planning documents: usecase, ia, flow, wireframe, spec — screens marked 기존 · 변경 · 신규.

## Gaps that must surface

- review unit (one suggestion vs. batch) — the user's call
- the open issue "에디터 저장이 AI 반영을 덮을 수 있음" (project memory) — must appear as a risk / 미결 / exception flow, not be rediscovered by a question
- the URL's status (the referenced Tiptap page is deprecated, replaced by AI Toolkit) — from the fetch, as a fact with date

## Good and bad questions

- Good: "제안을 어떤 단위로 검토할까요? ① 제안 하나씩 승인·거절(추천 — propose_edit가 한 번에 하나라 맞음) ② 문서 전체 한 번에 ③ 묶음 · 직접 입력 — 패널 구성과 승인 흐름이 달라져요."
- Bad: "에디터는 무엇을 쓰나요?", "되돌리기가 필요한가요?", "제안은 어떻게 저장되나요?" — TipTap, undo-anytime, and the propose_edit rules (one at a time, hash conflict, expiry, statuses) are already decided in docs/README.md, the brain, and `proposals.ts`.

## Expected route

Planning documents in a scratch `docs/`; a backlog in opalwrite only after the user confirms writing to that repository (it was declined in the run).

## Judgment

- collection ladder used: AGENTS.md, docs/README.md, project memory, brain search, backlog decisions, code names/lines only
- decided items asked: **0**; the open overwrite issue carried in as 미결 with its fix direction
- one URL fetched (`pace scout fetch`) and one external search, each with source and checked date
- `pace intent verify docs --root <opalwrite>` passes; 기존·변경 screens have real `path:line` evidence; a 기존 screen without evidence fails (unit test)
- opalwrite unchanged (`git status` empty)

## Recorded run

Validation run r5: 1 question; screens SCR-01 문서 편집 (변경, `workspace/frontend/src/editor/DocumentEditor.tsx:19`), SCR-02 바인더 (변경, `workspace/frontend/src/App.tsx:62`), SCR-03 AI 제안 검토 패널 (신규), SCR-04 승인 이력·되돌리기 (신규); verify 13/13 with `--root` opalwrite (re-run by the implementer). Friction found: `pace scout fetch` needs a folder with BACKLOG.md — SKILL.md Inputs now says so.
