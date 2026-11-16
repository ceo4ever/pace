---
name: pace-brain
description: Query and maintain the project brain as an LLM Wiki. Search when asked why something was done, whether a problem happened before, how components or flows work, or what terms mean, and before changing architecture. After answering from code or docs outside the wiki, file reusable answers back.
---

# Project Brain — LLM Wiki

Keep the wiki as a persistent, compounding artifact. Load only relevant sections when needed; do not preload it at boot. Read `<project>/.pace/brain/SCHEMA.md` for the local schema. Raw sources are evidence; wiki pages capture reasons, connections, and lessons rather than copying those sources.

**Language:** this skill is written in English, but everything the wiki produces is in the project's language as the schema says — Korean in PACE repositories. Write page titles, summaries, bodies, and section headings in Korean; write `log.md` summaries and query notes in Korean; answer the user from search results in Korean. Search with Korean keywords plus English synonyms. Use LLM Wiki terms (ingest, query, lint, file back) only as command or section labels.

## Query → file back

```sh
pace brain search "<keywords and synonyms in the project's language and English>"
```

- Search returns relevant sections with `file#heading` provenance, at most two sections per page, with a default 2,400-character text budget. Whitespace differences are normalized.
- If needed, use `--list` to find one page to open, or narrow with `--type concept|entity|flow|synthesis|term` and `--tag <tag>`.
- If nothing answers the question, say so and inspect code, documents, or other raw sources. Keep observed facts separate from inference.
- **File back** when the answer is likely to be asked again, or when it is a useful **synthesis** across several raw sources. This matters especially when the query sent you outside the wiki. Search for an existing page first; update it rather than creating a duplicate. Save the finding, evidence, and reasoning, not the conversation transcript.
- Skip facts already obvious from code or git history, one-off status, unresolved plans, and personal data. Route status/issues/plans to project memory, personal facts to profile memory, and established shared rules to `AGENTS.md`.
- Search is read-only. Record a useful query explicitly; the log entry does not replace filing the answer back into a page:
  ```sh
  pace brain log --op query --summary '<question, finding, and page reference if filed back>'
  ```

## Ingest and maintain

Keep decisions and rejected alternatives, component relationships, flows, investigations, measured results, pitfalls, and domain terms. Types are `concept`, `entity`, `flow`, `synthesis`, and `term`.

```sh
pace brain search "<topic>" --list
pace brain update <page> --body-file <body-file> --append-sources "code:src/example.ts,doc:docs/example.md"
# If no page covers the topic:
pace brain add --type concept --title "<title>" --summary "<one-line finding>" \
  --body-file <body-file> --sources "doc:docs/example.md" --related "<existing-page-slug>"
```

- Use `##` sections so query can retrieve focused passages. Add `[[page-slug]]` cross-references or `related` links to existing pages. Preserve useful context and evidence when updating; `created` is retained and `updated` advances automatically.
- Record source paths and verification dates. Repository paths may use `code:`, `doc:`, `backlog:`, `file:`, or `test:`, or be bare relative paths. Line references such as `src/example.ts:12` or `:10-20` are supported; directory sources should include a slash, e.g. `src/project/`. Opaque provenance such as URLs or project IDs is not a repository path.
- Add/update validates the page before writing, then refreshes lint, the index, and the log. Fix errors and retry; warnings do not prevent writes. After direct edits, run `pace brain index` and fix errors. Never edit the generated index by hand.
- `pace brain ingest-scan` lists documents in `docs/`, `skills/`, and `backlogs/` that are not yet mentioned in page sources. Ingest missing reasons, context, and pitfalls, not a copy of the document.
- After substantial work, check whether anything should be filed back and briefly report what was saved. Stay within the task's authorization for external actions.

## Lint and reconcile

```sh
pace brain lint
```

- Lint finds missing structure (`structure_missing`), schema errors, broken cross-references, orphan pages, missing links or sources, missing summaries, manual `stale` markers, and `stale-source` candidates. `--fix` only converts block lists to inline lists.
- Speculative markers such as TODO or TBD in page titles or headings are errors (`speculative`); add/update rejects these pages. Keep unresolved plans in memory.
- `stale-source` warns when a repository source is missing or its latest relevant git commit's author day is later than the page's `updated` day. Directory sources include descendant changes. Git dates are read in one history walk; a non-repository skips date checks, and other git failures are reported. Same-day or uncommitted changes are not dated by this check.
- Candidates are **stale claims to review**, not proof of **contradictions**. Compare the claim with raw sources; update the page and evidence, explain why it still holds, or mark it `stale`. Assess contradictions and data gaps yourself; lint cannot decide semantic truth.
- **Reconcile routinely, not as a project.** Run `pace brain lint` after committing changes outside a project (small work on main), and before ending a session that changed code or docs. Reconcile every `stale-source` warning right away: if the claim still holds, `pace brain update` the page so `updated` records the review; if not, fix the section. Then `pace brain log --op lint --summary '<what was reconciled>'` (in Korean).
- At project finish, inspect the announced pages whose sources intersect changed files. If the brain row says no update is needed, mention each candidate's full relative page path and the reason in that row. This records review without forcing meaningless rewrites.

## Project gates and promotion

Moved here from boot RULES; boot keeps only "search, don't preload".

- The project harness touches the brain at two points: `pace project new` puts candidate pages into the contract's materials, and `finish` checks the PROJECT-CLOSE brain row (반영 or 해당 없음) and pages whose sources changed. Keeping the brain current is otherwise routine work, not a project (see Lint and reconcile).
- Write durable knowledge (decisions and reasons, investigations and measurements, pitfalls) only with `pace brain add`/`update`; never create page files by hand. The tool must pass lint to write.
- When a brain fact settles, propose to the user promoting it to `AGENTS.md` or `docs/`.
- When serious work starts in a project without project docs or a brain, propose creating them with the `pace-project-init` skill.
