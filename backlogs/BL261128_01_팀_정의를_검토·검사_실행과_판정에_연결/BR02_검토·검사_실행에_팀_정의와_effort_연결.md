# BR02 검토·검사 실행에 팀 정의와 effort 연결

- 상태: 대기
- 백로그: [BL261128_01_팀_정의를_검토·검사_실행과_판정에_연결](BACKLOG.md)

<!-- 개발 업무의 예시. 형식·추적 정본: pace-project-dev의 references/document-shape.md. -->

## 목적

검토·검사·상위 검토가 팀이 정한 역할과 effort로 실행되고, 호출 원장이 그 사실을 보이게 한다([설계 G1~G5](BACKLOG.md#설계--공백별-선택), 근거 E1~E8·E13).

## 범위

**코드**(민감 경로 아님 — `src/agent/verify*.ts`, `src/cli.ts`의 `agent run`, `src/agent/call-context.ts`, 정의 적재가 기록된 호출 원장 행만 참여 근거로 읽는 `src/project/team-metrics.ts`. 팀 계산은 `src/core/worker-tiers.ts`의 `resolveTeamSettings`와 팀 원본 판독을 **가져다 쓰기만** 하고 고치지 않는다):

- `--call-agent <구성원>`이 라벨에서 적용으로 바뀐다.
  - `agent run`과 `agent verify` 모두 그 구성원 등급의 model·effort를 실행에 싣는다.
    - `agent run`은 이미 있는 `--model`·`--effort`가 필드별로 우선한다.
    - `agent verify`는 effort 옵션이 없고 새로 만들지 않는다. 그래서 effort는 등급에서만 오고, model은 기존 `--model`이 우선한다.
  - `agent run`은 정의 본문(frontmatter 다음)도 싣는다. Claude는 system prompt로, Codex는 프롬프트 앞에 붙인다(`docs/TEAM.md:182` 방식).
  - `verify`는 그 구성원의 정의 본문을 도구 프롬프트 앞에 붙인다. 검토 질문·형식은 뒤의 도구 프롬프트가 정본이다(G2).
  - **새 동작**: 저장소 팀 원본에 없는 이름은 실행 전에 거부한다. 지금 `requireCallAgent`(`call-context.ts:71-75`)는 이름 형식과 범위만 본다. 라벨로만 쓰던 호출자는 실패한다(BACKLOG 위험 절, E14).
- `--ignore-user-config`와 sandbox 인자는 바꾸지 않는다(`p-executor.ts:110`).

**문서 정렬**(줄이는 쪽 우선):

- `docs/AGENT-CALL.md:39`: `--call-agent` 의미를 고친다.
- `docs/TEAM.md`
  - 문제 해결자 예시(`:182-190`)를 `--call-agent` 한 줄로 줄인다(본문 파일·model·effort 손 지시 삭제).
  - 상위 검토 표(`:173-180`)는 허브도 이 직접 p를 쓴다고 적는다. `call_ref`는 그 원장 행이다.
  - `:155`에 BR01의 `new` 채움 한 문장을 더한다. `docs/WORK-PROCESS.md:19`도 같다.
- `skills/pace-project-dev/references/coordinator.md:34-36`: 상위 검토 호출을 같은 한 줄로 고친다.
- `references/tester.md`·`task-steps.md`: tester 실행 예시를 `pace agent run --agent <다른 제공자> --write --call-agent <tester> --call-scope …`로 적는다. `--write`가 필요한 이유는 시험의 임시 폴더 생성이다(E6).
- `references/reviewer.md`: verify에 `--call-agent <reviewer>`를 넘긴다고 적는다.
- `docs/TEAM-METRICS.md`: 허브가 main에서 부른 native 호출은 호출 원장 밖이라 사용·미사용 근거로 쓰지 않는다고 한 줄 적는다.

**제외**:

- 호스트 훅(`src/agent/call-hook.ts`, 민감 경로)의 main 범위 추정.
- 새 CLI 옵션.

## 완료 기준

- **`none` 관측(먼저 수행, 판정 없이 보고)**: 같은 고정 프롬프트로 Codex p를 두 번 실행한다(effort 미지정 1회, 등급 effort 1회). 각 실행의 머리글 `reasoning effort`, 총 토큰, 소요 시간을 `evidence/effort-none-probe.md`에 원문 발췌와 함께 남긴다. 허브가 owner에게 그대로 보고한다. 결과는 이 BR의 설계를 바꾸지 않는다. 명시 effort는 어느 경우든 의도를 고정한다.
- 가짜 실행기 시험(`test/`의 agent run·verify 시험)으로 다음을 확인한다:
  - `verify --call-agent pace-reviewer` → Codex 인자에 `model_reasoning_effort="high"`와 `--ignore-user-config`가 있다. 원장 행의 `effort.requested`가 `high`다. 프롬프트가 reviewer 정의 본문으로 시작한다.
  - `run --call-agent pace-tester --agent codex` → stdin 프롬프트가 정의 본문으로 시작한다.
  - `--agent claude` → `--system-prompt-file`로 본문이 넘어간다.
  - `run`에 명시한 `--effort low` → `low`가 이긴다. `verify --model <값>` → model은 그 값이고 effort는 등급 값이다.
  - `--call-agent` 없이 → 지금과 같은 인자다(회귀).
  - 형식은 맞지만 팀에 없는 이름(예: `claude`) → 실행 전 거부, 실행기 호출 0, 원장 행 없음.
- 실제 호출 1회씩(verify, tester run)의 원장 행에서 effort 요청값과 실제값(host)을 확인해 `evidence/`에 남긴다. 실제값이 `none`이거나 다르면 TEAM.md 실제 적용 절차(`:192`)를 따른다. 그 프로젝트의 팀 마감 지표가 두 역할을 사용으로 센다(거짓 미사용 없음). 사용으로 세는 행은 호출 때 실은 정의의 지문이 기록된 행뿐이다. 지문 없는 옛 라벨 행은 완료여도 사용으로 세지 않는다(음성 관측).
- 문서 대조(check)
  - `grep -n "system-prompt-file\|--effort medium" docs/TEAM.md`에 문제 해결자 손 지시가 남지 않는다.
  - `pace team sync --check`에 차이가 없다.
  - `pace intent check`에 해당 원본 오류가 없다.
- 고정 문구 시험(예: `test/project-dev-skill.test.ts`의 skill 문구 단언)을 바꿨다면 바꾼 줄과 이유를 TASK-CLOSE에 적는다.
- `npm run check` 통과.
