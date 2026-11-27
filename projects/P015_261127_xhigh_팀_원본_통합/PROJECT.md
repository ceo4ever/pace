# P015 xhigh 팀 원본 통합

- 상태: 정의
- 규모: 작은 프로젝트(태스크 없음)
- 출처: 대화 2026-11-27
- 브랜치: `project/P015` · worktree: `../pace.wt/P015/`
- 작업자:
- 작업자 역할:
- 팀 측정:
- 시작: 2026-11-27

## 목적

P014는 구판 CLI가 `tier: xhigh`를 거부한다는 이유로 xhigh 원본을 `.pace/team/agents-xhigh/`에, 등급 설정을 `worker-tiers-xhigh.json`에 따로 두고 생성물·시작 기록에 별도 표지를 썼다. 사용자는 한 명이고 설치본은 재설치로 맞추므로 구판 호환 장치는 필요 없다(캡틴 2026-11-27). 역할 원본을 한 폴더·한 설정 파일로 합쳐 경로 예외와 표지 코드를 없앤다.

## 재료

- 대화 2026-11-27 — "구판이 현재 없다, 있어도 수정하면 된다". 프로젝트 메모리 `구판-호환-설계-금지`.
- 분리 결정 근거: [P014 T01 TASK](../P014_261126_문제_해결_전문가_에이전트/tasks/T01_xhigh_등급과_호환_코드/TASK.md) 결정 (가)·시작 기록 호환.
- 코드: `src/team/model.ts:8-15,103`, `src/team/store.ts:64,78`, `src/team/sync.ts:11-13,34-36,58-60`, `src/project/event-log.ts:36-53`, `src/project/role-record.ts:28`, `src/core/worker-tiers.ts:12,54,65-80`.
- 실제 프로젝트 사건 로그에 `xhighRoleDefinition` 표지 행 없음(`grep -rl xhighRoleDefinition projects backlogs` — P014 T01 증거 파일만) → 판독 호환 불필요.
- 브레인: `.pace/brain/pages/flow/저장소-팀-설계와-갱신-흐름.md`

## 기준

| # | 합격 기준 | 확인 방법 |
|---|---|---|
| P-1 | 모든 등급(high·medium·low·xhigh)의 원본이 `.pace/team/agents/<name>.md` 한 곳이며 `pace-troubleshooter`가 그 위치에서 읽힌다. 소스에 `agents-xhigh`·`XHIGH_AGENTS_DIR`·`xhighTeamSourcePath` 참조가 없다 | `pace team list`·`pace team sync --check` 종료 0, `grep -rn "agents-xhigh\|xhighTeamSourcePath" src` 0건 |
| P-2 | 생성물은 등급과 관계없이 `# pace-team-generated:` 표지 하나를 쓴다 | 재생성한 `.claude/agents/pace-troubleshooter.md`·`.codex/agents/pace-troubleshooter.toml` 첫 표지, team 테스트 |
| P-3 | 시작 기록은 실제 원본 경로를 그대로 쓰고 `xhighRoleDefinition` 표지 인코딩·디코딩이 없다 | project-role 테스트(xhigh 역할 start 행의 definition·data) |
| P-4 | xhigh override는 `worker-tiers.json`에 다른 등급과 함께 저장·판독되고 기본값(Claude fable/high·Codex astra/medium)은 유지된다 | team 테스트의 worker set/show/reset |
| P-5 | 문서(`docs/TEAM.md`·`skills/pace-team`)가 단일 위치·단일 설정 파일을 설명한다 | 문서 grep, `npm run check` 통과 |

## 설계

- `model.ts`: `XHIGH_AGENTS_DIR`·`xhighTeamSourcePath`와 "xhigh↔경로 일치" 검사 삭제 — `isWorkerTier`면 어느 등급이든 `agents/`에서 허용.
- `store.ts`: 원본 탐색·목록에서 xhigh 폴더 제외. 옛 경로 `.pace/team/<name>.md`는 이번 범위 밖(다른 저장소의 기존 원본 데이터 이전 문제라 별도 판단).
- `sync.ts`: `XHIGH_MARKER`·`markerFor` 삭제, 이전 원본 후보 목록에서 xhigh 경로 제거.
- `event-log.ts`: `encodeEvent`/`decodeEvent`의 표지 변환 삭제 — `decodeEvent`는 검증만.
- `role-record.ts`: definition 허용 경로에서 xhigh 경로 제거.
- `worker-tiers.ts`: 단일 `worker-tiers.json`, 등급별 파일 분기 삭제.
- 원본 이동: `git mv .pace/team/agents-xhigh/pace-troubleshooter.md .pace/team/agents/` 후 `pace team sync`.
- 등급은 위치와 무관한 설정 값이다 — 옛 경로 원본에서도 xhigh를 허용한다(옛 경로는 판독 범위 밖 결정과 함께 정리).
- 보안 영향: 원본 경로 허용 집합이 줄어든다(확장 없음). 민감 경로 변경 없음.

**바꿀 정본 목록**

| 정본 | 바뀌는 것 |
|---|---|
| `src/team/model.ts`·`store.ts`·`sync.ts` | xhigh 별도 경로·표지 삭제 |
| `src/project/event-log.ts`·`role-record.ts` | 시작 기록 표지·경로 예외 삭제 |
| `src/core/worker-tiers.ts` | 단일 등급 설정 파일 |
| `test/team.test.ts`·`test/project-role.test.ts` | 통합 동작으로 시험 교체 |
| `.pace/team/agents/pace-troubleshooter.md`, `.claude/agents/`·`.codex/agents/` 생성물 | 원본 이동·재생성 |
| `docs/TEAM.md`·`skills/pace-team/SKILL.md` | 단일 위치 설명 |

## 결정·진행 메모

| 작성일시 | 내용 |
|---|---|
| 2026-11-27 10:16 | 정의 작성 |
| 2026-11-27 10:30 | 착수 결정(대화 2026-11-27 캡틴): 구판 호환 분리를 제거하고 xhigh 원본을 agents/로 통합. 태스크 없는 프로젝트로 main에서 수행. 옛 경로 `.pace/team/<name>.md` 판독은 범위 밖 |
| 2026-11-27 11:20 | 독립 검토(pace-reviewer) pass·blocking 0. should_fix 1(HANDOFF 정규식을 해결안 반환 역할에만 한정)·nit(문서 모호·0.1.5 저장소 이전 안내·TS-09 선행 문구·양성 대조) 반영. 옛 경로 xhigh 허용은 의도로 기록 |
