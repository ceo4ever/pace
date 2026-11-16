# Handoff (SKILL.md ⑧)

Hand the result off by size (D5) so that writing or implementation starts right away. Lens results map into document fields by the table below — every lens follows the same contract, including lenses added later.

## Form and reasoning trace

Follow the canonical [document-shape.md](../../pace-project-dev/references/document-shape.md) for job-specific forms and trace. The mapping below tells where lens reasoning can land, not which fields every output must copy. Keep the contract's purpose/criteria summary when linking a deliverable. `intent check` accepts BACKLOG/BR/PROJECT; TASK/CLOSE use `project check`.

## Order

1. **Propose** a route with a one-line reason (and, for B, the size from `pace-project-dev` §1).
2. **Wait for confirmation.** Nothing is created before the user confirms — no folder, no file, no command that writes.
3. **Create** with the commands below, fill the fields from the mapping, then run the proof checks (SKILL.md ⑦), including `pace intent check <files>` (no empty cells, no section left as a bare template comment).

Writing into another repository (e.g. a backlog in a different project) needs an explicit confirmation of that repository too.

## Routes

| Route | When | What is created |
|---|---|---|
| A — conversation | a prompt or small document used outside PACE; nothing to track | the text in the reply. For another AI: the work brief ([handoff/work-brief.md](handoff/work-brief.md)) |
| B — run now | the user wants to start now (said so, or confirmed when asked), at most one project, no open decision blocks the start. Without a start-now signal an L2+ plan goes to C; an L1 plan asks once whether to start now (yes → B, later → C); an L0 document stays A | apply `pace-project-dev` §1 first (do not redefine it): small job → do it now without a project · project without tasks → `pace project new` with criteria and test table · L project → `pace project new` with a task table |
| C — backlog | large, several projects, later start, or human decisions remain | `pace backlog new` as soon as purpose and scope are fixed; work inside it; briefs only when the brief conditions hold |

Important decisions the user cannot make now are never turned into assumptions to fit B: keep them as `미결` and go to C.

## C — the planning backlog (D16)

`pace backlog new "<이름>"` runs only on the main checkout of the repository. If the session is in a worktree or another branch, say so and ask whether to switch, or keep the plan in the conversation (A) for now.

Restructure the created `BACKLOG.md` (keep `# BL… 이름`, `- 상태:`, `## 목표`, `## 진행 현황` exactly — commands read them):

```md
## 목표
<purpose statement and scope, in the user's language>

## 진행 현황
| 브리프 | 상태 | 선행 | 프로젝트 | 비고 |
|---|---|---|---|---|

## 확정된 결정
| # | 결정 | 근거 |
|---|---|---|
| D1 | … | 사용자 결정 YYYY-MM-DD / 자체 판단 / 조사(출처·확인일) |

## 가정
| # | 가정 | 이유 | 틀리면 |
|---|---|---|---|

## 미결
| # | 미결 | 영향 | 해결 조건 |
|---|---|---|---|

## 진행 기록
| 날짜 | 내용 |
|---|---|
| YYYY-MM-DD | 단계 확인: 수집 요약 (staged mode records every confirmed stage) |
```

Folder contents:

| Path | Content | Git |
|---|---|---|
| `BACKLOG.md` | goal, decisions, assumptions, open items, progress | committed |
| `docs/collection.md` | the collection summary (sources, facts, assumptions, unknowns) — secrets removed; for B the same file goes to `projects/P###_…/docs/collection.md` | committed |
| `docs/plan.json` + generated HTML | planning documents (`pace intent render docs`) | committed |
| `docs/canvas/*.canvas.json` | editable screen designs when needed, linked by BR and screen ID | committed |
| `docs/<lens-id>.md` | other second-layer outputs (e.g. `docs/alternatives.md`, `docs/lean-canvas.md`) | committed |
| `sources/` | fetched originals (`pace scout fetch` output, pasted text) | ignored (`backlogs/*/sources/` in `.gitignore`) |

## Screen planning and Canvas handoff

When the backlog needs a user interface, organize the IA in `docs/plan.json` using stable screen IDs and invoke `canvas-wireframe` after the IA is confirmed, without requiring a separate user invocation. Pass purpose, users, IA hierarchy, screen IDs and names, states, elements, actions, transitions, exceptions, main flow and variants, applicable BRs, and kit context. Represent a variant's relation to its parent in IA children or a flow branch; do not invent schema fields. Record assumptions and unresolved conflicts. If no UI is needed, record the reason in `BACKLOG.md` under `## 확정된 결정`; do not create a Canvas merely to satisfy the workflow.

For L1, Canvas covers changed screens; for L2 all planned screens; for L3 the core screen when useful. Record states, UC/AC/F/BR references and explicit element transitions in plan.json canvas entries according to [preview.md](preview.md); Canvas is the visual source. Create Canvas first, inspect its IDs, and record them explicitly.

Save new Canvas files under `docs/canvas/`. In `BACKLOG.md` keep a `## 화면 설계` table with columns `BR | 화면 ID | Canvas 파일 | 화면 이름`; use a pending label until a BR or Canvas exists, and update it when each is created. Each BR's `## 범위` names its screen IDs and links to the table. A BR may map to multiple screens and a screen to multiple BRs. The table screen name is `screens[].name`; Canvas screen names use `<ID> <same name>`, not BR mappings or invented metadata; the separate Canvas report also records the mapping. Existing Canvas requires the exact-file authorization in `canvas-wireframe` before revision; otherwise preserve it and use a separately named document when appropriate.

`plan.json` is the semantic source for screens, requirements, flows, state references and explicit transitions. Canvas is the visual source. After editing Canvas inspect IDs and explicitly reconnect changed IDs in plan.json; do not infer replacements. Existing wireframe HTML is preserved by default and can be regenerated only with `--legacy-wireframe`.

After Canvas and plan IDs are ready, run `pace intent preview <docs> [--root <product-repository>]` and `pace intent preview <docs> --verify`. The root resolves evidence for existing or changed screens and defaults to the current directory; preview verification checks recorded source and output hashes. Hand off separate links to planning documents, editable Canvas and `preview.html`; the PNGs and map are generated outputs. Inspect any font fallback notice and review text clipping and layout. A byte-changing Git checkout can make hashed outputs stale; preserve source/output bytes or regenerate in the destination. User-modified outputs and existing Canvas are not overwritten automatically.

Update `## 진행 기록` at every confirmed stage so another session or tool can resume (SKILL.md, Modes).

**Brief conditions** — create a brief with `pace backlog brief <BL> "<이름>"` only when all hold; show each condition with ✔/✘ before creating:

1. purpose, scope, and main decisions are fixed (`## 확정된 결정`)
2. the depth's planning chain is confirmed (D10: L1 use cases and changed screens · L2 full chain · L3 IA top level and core flows)
3. no `미결` row blocks the start of this brief

`pace backlog brief` adds the brief's row to `## 진행 현황` itself — never write that row by hand; edit the added row's 선행·비고 cells instead.

If a condition fails because of an open item, do not create the brief; ask that open item as one question (SKILL.md ④). Each brief gets `## 목적`, `## 범위` (in/out), `## 완료 기준` (observable, from GWT), and is later started as `pace project new "<이름>" --from <BL>` (BR01 = T01).

**Splitting into several backlogs** — one backlog becomes one project. Split when parts have different first users or jobs, can start and ship independently, need different repositories, or would exceed about eight briefs. Keep a short parent note in each `## 목표` naming the sibling backlogs.

## B — the project

`pace project new "<이름>"` (main checkout) creates `projects/P###_…/PROJECT.md`; fill `## 목적`, `## 재료` (link the conversation date, `docs/`), `## 기준` (P-n with how to check), `## 설계` when L, `## 태스크` (L only), and the decision memo. Planning documents for B go to `projects/P###_…/docs/`. A small job writes no files — do it and run the repository's check command.

## Mapping — lens results to document fields

Every lens's output form lands in one of these fields. A new lens adds a row here; `test/intent.test.ts` fails if a lens id is missing.

| Lens | A (prompt or document) | B (PROJECT.md) | C (BACKLOG.md · BR) |
|---|---|---|---|
| purpose-ladder | first line: objective and why | `## 목적` | `## 목표` · BR `## 목적` |
| jtbd | context: who and situation | `## 목적` (who) · `## 재료` | `## 목표` · `docs/jtbd.md` |
| assumption-map | `가정` block; open items as questions | decision memo (가정) · `## 설계` risks | `## 가정` · `## 미결` (영향 · 해결 조건) |
| audience | reader, tone, length | — (n/a: no reader document) | BR `## 범위` when the result is a document |
| pyramid-scqa | the document's opening and outline | — (n/a) | BR `## 범위` when the result is a document |
| doc-skeletons | the document's sections | `## 기준` (must-haves present) | BR `## 완료 기준` |
| diagnostic-checklist | self-review of the prompt or brief | self-review before creation | self-review before creation |
| alternatives | constraints (what not to build) | decision memo · `## 설계` | `## 확정된 결정` (버린 대안) · `docs/alternatives.md` |
| lean-canvas | — (n/a) | `## 재료` link | `## 목표` (value, customers) · `docs/lean-canvas.md` |
| journey-map | context | `## 재료` · `## 설계` | `docs/journey-map.md` · BR `## 범위` |
| story-map | ordered steps (prompt 1, 2, 3) | `## 태스크` | brief split (one slice → briefs) · `## 진행 현황` |
| moscow | scope: do / do not | `## 설계` scope · out of scope | BR `## 범위` (in/out) · `## 목표` scope |
| gwt | acceptance criteria | `## 기준` (P-n) · task `T-n` | BR `## 완료 기준` |
| decision-record | constraints | `## 결정·진행 메모` | `## 확정된 결정` |
| pre-mortem | stop-and-ask triggers | `## 설계` 보안·위험 · exception criteria | `## 미결` (accepted risks) · BR `## 범위` |
| unit-economics | — (n/a) | `## 설계` (pricing constraints) | `## 확정된 결정` (price/take rate) or `## 미결` · `docs/unit-economics.md` |
| multi-sided-market | — (n/a) | `## 설계` (sides, trust) | backlog split (one per side or core interaction) · `docs/multi-sided-market.md` |
| network-effects | — (n/a) | `## 설계` (seeding) | `## 목표` (atomic network) · first backlog scope |
| north-star-okr | success line of the document | `## 기준` (measurement events) | each backlog's `## 목표` points to one key result |
| now-next-later | ordered prompts (now → later) | — (n/a: one project) | the list of backlogs to create (Now first) · parent note in each `## 목표` |

Planning documents (`templates/`, D10):

| Document | Goes to |
|---|---|
| use case exception flows | `## 기준` / BR `## 완료 기준` (GWT per exception) |
| use case groups | task split (B) or brief split (C) |
| user flows and sequences | E2E scenarios (`e2e/S-n.md` in the task) |
| `docs/` folder | `## 재료` link (B) or the backlog folder itself (C) — the evidence for the plan |

## Proof for handoff documents

- `pace intent check <BACKLOG.md|BR*.md|PROJECT.md>` — required sections present, no section that is only a template comment, no empty or missing table cells (except `비고`, `커밋`), no `{{…}}` outside code fences. It checks documents made by this skill; older backlogs used other section names. It does not judge content or count rows — the `미결` 영향·해결 조건 are guaranteed only as non-empty cells, and duplicate rows are not detected.
- C: `pace project new "<이름>" --from <BL>` succeeds in a scratch copy of the repository (the harness accepts the backlog and its briefs).
- Labels: every assumption is under `가정`, every open item under `미결` with 영향 and 해결 조건.
