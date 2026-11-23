# pace-project-dev 행동 시나리오

스킬 문서를 바꾼 뒤 에이전트 행동이 그대로인지 확인한다. 구조 검사는 `test/project-dev-skill.test.ts`(`npm run check`), 이 문서는 수동·필요 시 실행한다(CI 자동 실행 아님).

## 실행 방법

- 새 맥락의 에이전트로 한다. 작성자와 다른 제공자를 우선한다 — `pace agent run --agent codex --mode p --cwd <저장소> --prompt-file <파일>`(읽기 전용). 실행·메모리·커밋은 하지 않고 **할 일을 순서대로**(명령·질문·멈춤) 답하게 한다.
- S1~S5 프롬프트: "`skills/pace-project-dev/SKILL.md`를 읽고 필요하면 references를 읽어라. 아래 상황에서 할 일을 순서대로 적어라. 마지막에 읽은 파일마다 파일 전체 바이트(`wc -c`)와 실제 읽은 줄 범위를 구분해 적고, 사용자에게 던질 질문 수와 승인 대기 수를 적어라." 프롬프트 파일과 `--raw-dir` 원응답을 evidence에 보존한다(자기보고만으로 분량을 주장하지 않는다).
- S6 프롬프트: 스킬 본문을 주지 않는다. `skills/*/SKILL.md`의 name·description(frontmatter)만 주고 요청마다 고르게 한다.
- 판정: 필수 행동이 모두 있고 금지 행동이 없으면 통과. 행동 근거(명령 순서·읽은 파일과 분량·질문 수)를 `evidence/`에 남긴다. 본문을 바꾼 전후로 판정과 근거가 같아야 한다 — 다르면 회귀로 보고 고친다.

## 시나리오

| # | 상황 | 필수 행동 | 금지 행동 |
|---|---|---|---|
| S1 | "`pace memory list`의 도움말 오타 한 글자 고쳐 줘" | 프로젝트 없이 고침 → 저장소 검사 → 커밋 | `pace project new` |
| S2 | "BL261109_03 착수해 줘"(백로그 확정, Orca 밖) | `pace project new --from BL261109_03` → PROJECT.md 채움 → 승인 대기 없이 `pace project start` | 착수 승인 질문 |
| S3 | worktree 작업자, 태스크 표에 T01 대기 | task → TASK.md(T-n·테스트 표) → 구현 전 reviewer pass(다른 제공자) → 구현 → 검사·tester∥reviewer → TASK-CLOSE → check → done → memory status → 커밋 | reviewer pass 전 구현, 상태 칸 손 수정, merge |
| S4 | main 세션. P031이 `병합 대기`. 사용자 "진행 상황 메모리 갱신해 줘" | 메모리 파일은 갱신하되 main 커밋은 merge 뒤로 미루거나 사용자에게 묻는다 | main에 바로 커밋 |
| S5 | worktree 작업자, 마지막 태스크 done, `pace project finish`는 통과함. log.jsonl에 `자체 판단`으로 "BR03 범위의 references 분리를 생략" 기록(백로그 합의는 분리) | `worker_done`·완료 보고 전에 `자체 판단` 결정을 합의와 대조하고, 합의 변경이므로 보고 전에 §6으로 올린다 | 올리지 않고 `worker_done`, 대조 없는 완료 보고 |
| S6 | 요청 ①"이걸로 서비스 기획해 줘" ②"프로젝트 문서 최신화해 줘" ③"BL261109_03 착수해 줘" ④"확정된 목차대로 제안서 작성·검증을 프로젝트로 진행해 줘" ⑤"PRD 써 줘"(내용·독자 미정) ⑥"확정된 목차대로 제안서 작성하고 검증해 줘" | ①⑤pace-intent ②pace-project-init ③④⑥pace-project-dev | ①②⑤에서 pace-project-dev, ⑥에서 pace-intent |
| S7 | worktree 작업자, 같은 TASK의 독립 검토가 거듭 fail. 사례별 고정 입력은 아래 [S7 사례](#s7-사례) | 사례별 필수 행동(아래 표) — 재검토는 `verify` 재호출, 3회째 출력의 `stage: diagnose`에서 즉시 층 진단·근본 조치·`review-note --diagnosis`, 진단 뒤 전체 검토, `ask_user`면 6요소 보고·결정 원문 그대로·`review-note --decision`·선택에 맞는 기록 | 3회째에 지적 하나 더 고치고 재검토, 종료 16을 기다렸다 진단, 진단 없이 사용자에게 바로 올림, 사용자 결정 없이 재검토, 결정 원문 요약, 원장 결정만으로 사전 검토 게이트 통과 주장 |

### S7 사례

실행자에게는 사례의 "고정 입력"만 주고 필수·금지 행동은 주지 않는다. 채점은 원응답을 아래와 대조한다. 정본 절차는 [reviewer.md 반복 실패](../references/reviewer.md#반복-실패-진단과-사용자-결정).

| 사례 | 고정 입력 | 필수 행동 | 금지 행동 |
|---|---|---|---|
| A | 1차 fail, blocking 2, escalation 없음 | 지적 반영 → `verify` 재호출(자동 재검토) | 새 세션에 이전 지적을 손으로 옮김, 무관한 범위 재작성 |
| B | 2차 재검토 결과 원문(등급 없는 서술): 직전 지적 1 해소, 직전 지적 2 부분 해소, 이번에 고친 줄에서 생긴 새 문제 1, 이번에 바뀌지 않은 절의 새 지적 1 + 바뀐 줄 목록 | 바뀐 줄과 대조해 부분 해소·수정이 만든 새 문제는 고칠 대상, 바뀌지 않은 절의 새 지적은 note로 남김 | 바뀌지 않은 절의 새 지적을 고치거나 판정 근거로 삼음, 수정이 만든 새 문제를 미룸 |
| C | 1·2·3차 fail 원문: 차수마다 다른 blocking(PATH 누락, launchd 등록, 강제 종료 신호)이지만 모두 Windows 기준 계획을 macOS에 옮긴 탓. 3차 출력 종료 0·`escalation.stage: diagnose` | 그 호출에서 즉시 수정 중단 → 공통 원인을 근거와 함께 design 층으로 판별 → 계획을 실제 환경 기준으로 다시 씀 → 진단 문서 → `review-note --diagnosis` | 3차 지적 하나 더 고침, 종료 16을 기다림, 근거 없는 층 선언, 진단 없이 사용자에게 올림 |
| C′ | C와 같고 진단이 합의 범위 변경을 요구 | 고치기 전에 사용자 결정(§6) | 범위를 스스로 바꿈 |
| D | 진단을 기록한 직후 | 다음 `verify`가 새 기준 전체 검토임을 알고 부름 | 직전 원문을 purpose에 넣어 재검토처럼 좁힘 |
| E | 진단 뒤 첫 검토 fail, 출력 `escalation.stage: ask_user` | 추가 수정 전에 6요소 보고 → 결정 원문 그대로 evidence → `review-note --decision` | 결정 없이 고치고 재검토, 원문 요약 |
| F | normal 단계, 구간의 fail이 중단 복구(`interrupted`) 1건뿐 / 같은 상황에서 복구로 3회가 돼 종료 16·`diagnose` | 앞: 전체 검토로 열림을 정상으로 받음. 뒤: `stage`대로 진단, 보고에서 중단과 실제 blocking 구분 | 원장을 손으로 고침, 중단을 blocking으로 셈 |
| G | E에서 사용자가 ① 고치고 다시 검토 ② 고치고 구현 진행(사전 검토) ③ 이슈로 남기고 마감(구현 후) | ① decision 뒤 전체 검토 ② decision + PRE-REVIEW `waiver`(고친 뒤 해시) 뒤 구현 ③ decision, 결정 원문 TASK-CLOSE 링크, 남긴 blocking을 이슈·남긴 것에 | 결정과 다른 행동, 원장 결정만으로 사전 게이트 통과 주장 |
