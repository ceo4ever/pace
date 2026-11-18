# 실제 worktree 흐름 확인 (2026-11-18, Windows, 소스 CLI `node bin/pace.ts`)

임시 저장소에서: `git init -b main` → 첫 커밋 → `backlog init`(v2 진입점·.gitignore·local.js) → 커밋 → `project new` → 커밋 → `project start P001 --no-launch`.

| 확인 | 결과 |
|---|---|
| worktree `backlogs/dashboard/` | `.gitignore`·`data.js`·`local.js` — start 뒤 자동 갱신이 local.js를 만듦 |
| worktree `git status --porcelain --untracked-files=all` | ` M backlogs/dashboard/data.js`, `?? projects/P001…/log.jsonl` — 둘 다 하네스 소유(finish 미커밋 검사 예외·하네스 기록). local.js·.gitignore 변경 없음 |
| main `git status` | 빈 출력 |
