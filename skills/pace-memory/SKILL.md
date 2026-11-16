---
name: pace-memory
description: Write and tidy PACE profile and project memory — where information belongs, memory writing principles, closing and stale items, graduating rules to AGENTS.md or the brain, and summarizing settled user facts into USER.md. Use when the user asks to clean up memory ("메모리 정리"), when boot shows many ⚠ stale items or more than 15 rules, or when unsure where or how to record something.
---

# PACE Memory — writing and tidying

**Language:** this skill is written in English, but memory entries, tables shown to the user, and replies are in the user's language (for example, Korean when the user speaks Korean). Boot RULES carry the short version; this skill holds the details.

## Where information belongs

| | Always loaded (short) | Searched when needed (long) |
|---|---|---|
| Profile | `USER.md`, profile memory — the user, personal rules, personal todos | (planned) profile brain |
| Project | `AGENTS.md` (+`docs/`) official rules, project memory — status, rules, issues, todos | project brain — decisions and reasons, components, flows, pitfalls |

Decide in order: ① about the user or your own work habits → profile ② true only in this project → project ③ short fact/rule/state → memory, long explanation → brain, settled rule the team shares → `AGENTS.md`. When unsure, prefer the project. Never record what code or git history already shows.

## Writing principles

Boot RULES state these in one line; they are also the cleanup criteria below.

- **No secrets.** Keys, tokens, passwords, and private keys never go into memory — project memory is committed to the repo and every memory is injected at boot. Record where the secret lives (an environment variable name, a vault entry), not its value.
- **No duplicates.** Search `pace memory list [--project]` first; if an entry covers it, `pace memory update <slug>` instead of adding.
- **Right scope.** Project IDs (`P###`, `BL######`, `BR##`), file paths with lines, or repo-specific facts go to `--project`, not the profile.
- **No volatile values.** Terminal handles (`term_…`), session IDs, UUIDs, full 40-char hashes, temporary paths, and counts that change are not memory. Keep the stable fact, drop the value. A short commit hash as an issue's evidence is allowed.
- **Compressed, agent-only style.** Write for the agent, not for a reader: drop particles and filler, use `·`/`→`/`=`. The one-line description is an instruction ("Ask GitHub account before gh work"), not a story. The body holds only **why** (one line, with date) and **how to apply**. Description ≤ 160 chars, body ≤ 400 chars (`status` is exempt — it is the handoff note).
- `pace memory add|update` rejects violations with the reason and the fix: `term_…` handles, UUIDs, 40-char hashes; the same title or a nearly identical description in the same scope and type; `P###`/`BL######`/`BR##`/`file:line` in the profile; over-long description or body. `update` checks only the fields it changes. Session IDs, temporary paths, and changing counts are not detected — judge them yourself. Known false positives: product names like `P100` and `host:port` such as `proxy.corp.com:8080`; rewrite them, or ask the user before `--force`. `--force` overrides only when the user confirms the exception — except secrets: `add`, `update`, `status`, and `done --result` reject a secret-looking value even with `--force`, naming only the field, never the value. Slugs must be exactly what `pace memory list` shows; paths, upper case, and the reserved names `index`/`history` are rejected.

## Types

`pace memory add [--project] --type <type> --name "<title>" --description "<one-line instruction>" --body "<why · how>"`

| Type | When | Scope |
|---|---|---|
| `rule` | the user corrects or forbids something, or a mistake teaches a lesson. Body: why + how to apply | personal habit → profile; this project only → `--project` |
| `user` | a fact about the user (work, preferred tools) | profile |
| `todo` | a promise or follow-up (`--due` optional) | personal → profile; project work → `--project` |
| `issue` | a project problem, risk, or bug. Body: evidence (`file:line`, commit, log path) | `--project` |
| `note` | a short fact or decision | `--project` |
| `idea` | an improvement not done now | `--project` |

- **Status**: when stopping work or finishing a big step in a project, `pace memory status --project --body "<where · next · blocked>"`. It is the handoff note for any LLM tool.
- **Close**: when an issue, todo, or idea is handled, `pace memory done <slug> [--project] --result "<result>"` — it goes to history.
- **Stale (⚠)**: handle it, or propose closing it if no longer valid. Re-check an issue's evidence before calling it valid.
- **Graduate**: a settled project `rule` the team must know → `AGENTS.md`; one needing long explanation → brain. The same rule in two projects → profile `rule`.
- Record corrections and preferences here, not in the LLM tool's own memory; let the tool manage its own.

## Cleanup procedure

1. Scope: inside a project, both project (`--project`) and profile; outside, profile only.
2. `pace memory list [--project]` for everything; `pace memory show <slug> [--project]` for bodies.
3. Build a candidate table:

   | Candidate | Check | Action |
   |---|---|---|
   | Long-open issue | re-verify evidence (`file:line`, commit, log) | resolved → `done --result`; valid → propose next step |
   | Long-open todo | still needed? | do it, or `done --result "취소: <reason>"` |
   | Duplicate or contradiction | confirm the latest fact | merge into one with `update`, `remove` the rest |
   | Wrong scope | project facts in profile, or the reverse | re-add in the right scope, `remove` the old one |
   | Volatile value or verbose text | violates the writing principles | rewrite in compressed style with `update`; drop the value |
   | Settled project rule | must the team know it, does it need long explanation | move to `AGENTS.md` or the brain, then `remove` |
   | Same rule in two projects | is it a personal habit | promote to profile `rule` |
   | Long-held user fact | — | summarize into `USER.md` (`pace profile path`), then `remove` |
   | Status differs from reality | compare with git and history | `status --project --body` |

4. Show the table to the user and run only the approved actions.
