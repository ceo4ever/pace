# Feedback and memory (SKILL.md ⑨)

Two layers (D6): what the skill learns about the **user** is saved to memory after the user confirms; what it learns about **itself** (process, lenses, proof) is never applied by the skill — it becomes an improvement idea that a project fixes later.

## Read first (①)

At the start of every request, before the collection summary:

- profile: `USER.md` and profile memory — the session boot context already contains them; otherwise `pace memory list`
- project (inside a project): `pace memory list --project`

Apply every stated preference as a default and say so in the collection summary (`기억한 선호: 단계마다 진행 — 프로필 메모리`). Never ask a question a saved preference answers. If the user's words in this request contradict a saved preference, the words win for this request; offer to update the memory.

## Save lasting preferences (⑨)

Lasting = it would apply to the next request too: output form (HTML documents or text only), mode (한 번에 · 단계마다), stack, approval policy (what needs confirmation), document language or tone. Not lasting: anything about this one plan.

1. Spot it when the user corrects a default or states a habit ("앞으로는…", "늘 …", a repeated correction).
2. Show, in one message: the refined sentence (no raw request text, no names of customers, no secrets), the destination, and the type — then end the turn.

   | Scope | When | Command |
   |---|---|---|
   | profile | about the user in general | `pace memory add --type rule --name "<제목>" --description "<한 줄>" --body "<문장. 왜·어떻게 적용>"` |
   | project | true only in this repository (project memory is committed — teammates see it) | `pace memory add --project --type rule …` |

3. Save only after the user says yes. If a memory with the same subject exists, update it instead of adding — `pace memory update <slug>` for a profile item, `pace memory update <slug> --project` for a project item. If the user declines, save nothing and do not ask again in this request.

## Improvement ideas for the skill

When a run shows a gap in the skill itself (a missing step or rule, a missing or stale lens or template, a mistake no proof check catches), do not edit the skill. Record it as an idea until a feedback loop (such as GitHub issues) exists:

- **Where:** the PACE repository's project memory (`pace memory add --project --type idea` with the PACE repository as the working directory). If the session is in another repository and the PACE repository is not reachable, add a profile `todo` ("pace-intent 개선 후보 — PACE 저장소 idea로 옮기기") with the same body.
- **Name:** `pace-intent <layer>: <short cause>` — layer is `process` (a step or rule missing), `toolbox` (a lens or template missing or stale), or `proof` (no check catches this mistake).
- **Body:** cause layer · what happened (date, request type, the step — no raw request, no secrets) · the smallest fix · `횟수: 1`.
- **Same cause again:** search first (`pace memory list --project`, or `pace memory list` for the profile `todo` fallback — same layer and cause). Do not add a second item: read the current body (`pace memory show <slug> --project`), then `pace memory update <slug> --project --body "<whole body>"` — `--body` replaces the body, so keep the earlier cases, raise `횟수` by one, append the new case, and from the second case on add "명시 규칙으로 바꿀 것을 제안". Keep the body within the 400-char memory limit: keep `횟수`, the cause, the smallest fix, and the two most recent cases; fold older cases into one line ("이전 사례 N건: …"). Do not use `--force` for this. For the profile `todo` fallback use the same steps without `--project`.
- **Count honestly:** say where each case came from (real use vs. a test run); test runs count as cases but are labelled.
