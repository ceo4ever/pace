# 프로젝트

업무 단위 실행 폴더 — `P{NNN}_{YYMMDD}_{이름}/` (PACE는 `P` 접두어 폴더만 다룬다).

- 시작: `pace project new "<이름>" [--from <BL 폴더>]` → 목적·기준·태스크 작성 → `pace project start P###`
- 태스크: `pace project task` → `check` → `done` · 마감: `finish`(worktree) → `merge`(main, 사람 승인)
- 현황: `pace project list` · 지표: `pace project stats P###`
- 절차: `pace-project-dev` 스킬 · 기획(백로그): `backlogs/`
