# OPAL 가져오기

정의서 [`docs/README.md`](README.md)에서 옮긴 상세다. 정의서에는 한 줄 요약과 이 문서 링크만 남는다.

## OPAL 가져오기

- 경로: `src/project/adopt-opal.ts`
- 스택·형식: TypeScript

`pace adopt opal [--cwd <폴더>] [--apply]` — 기본 미리보기, `--apply`는 계획을 다시 만들어 같을 때만 `.opal/`→`.pace/` `git mv`·AGENT 표지 변환(`opal_agent_version`→`pace_agent_version`, 본문 `.opal/`→`.pace/`)·`workspace_id` 승계 등록, 알려진 OPAL 커밋 게이트 훅 교체(원본 `commit-msg.opal-backup`)·OPAL 공용 대시보드 진입점의 PACE 공용 참조 전환, `AGENTS.md`·`CLAUDE.md`·`docs/**`의 `opal` 참조는 `파일:줄`로 보고만 한다. 저장소 안 경로만 다루며(링크 거부) 실패하면 이번에 바꾼 것만 되돌린다. OPAL 홈 프로필은 옮기지 않는다. 사용자 절차는 README.md의 "OPAL에서 넘어올 때"
