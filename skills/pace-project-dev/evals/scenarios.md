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
