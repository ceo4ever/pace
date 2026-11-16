# Examples — judging the skill

Each example states the request, the lenses that should be picked, the gaps that must surface, good and bad questions, the expected route, and the **judgment criteria**. Judge a run with the proof checks first; "good question" style criteria are for comparison only (D8).

## Proof checks (external evidence only)

| Check | How |
|---|---|
| Handoff documents pass the harness | `pace intent check <BACKLOG.md|BR…|PROJECT.md>`; C also `pace project new "<이름>" --from <BL>` in a `cp -R` copy |
| No empty cells; assumptions and open items labelled | same `pace intent check`; `## 가정` / `## 미결` rows have 영향·해결 조건 |
| No question whose answer was in the inputs or memory | list every question; compare with the collection summary (`읽은 것 · 확정 사실`) and the attached document — count must be 0 |
| External premises carry official URL and checked date | sequences: `pace intent verify` (`sequence-docs`); otherwise the `가정`/collection rows show URL + date. An unknown provider points to a `미결` item — shown as "미결 표시(증명 아님)", not proof |
| Planning documents | `pace intent verify <docs> [--root <product repo>]` — all checks pass |
| No secret anywhere | `grep` the transcript and every written file for the credential; `node scripts/secret-scan.ts` before committing evidence |

## Reproducibility

The same request in two fresh sessions must reach the same depth (L0–L3) and the same route (A/B/C). Questions and wording may differ.

## Examples

| File | Depth | Route |
|---|---|---|
| [l0-weekly-report.md](l0-weekly-report.md) | L0 | A |
| [l1-restock-alert.md](l1-restock-alert.md) | L1 | B (L project) |
| [l2-shorts.md](l2-shorts.md) | L2 | C |
| [card-banchan.md](card-banchan.md) | L2 | C (proposal) |
| [opalwrite-review.md](opalwrite-review.md) | L1 (existing product) | docs only, backlog after confirmation |
| [security-pasted.md](security-pasted.md) | L0 | A |
| [routing.md](routing.md) | — | which skill (U1) |
