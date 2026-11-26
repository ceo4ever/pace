---
type: synthesis
title: ACP 어댑터 실측 (스파이크)
summary: "claude-agent-acp 0.81.1 실측 — 읽기 전용·권한 거부, resume, effort, mcpServers, 훅, 이벤트. codex-acp·한도 문구·약관은 미확인"
tags: [agent, acp, claude, codex, security, daemon]
sources: [실측:2026-11-12, code:src/agent/acp-executor.ts]
related: [pace-agent-호출-함정-실측]
created: 2026-11-12
updated: 2026-11-27
status: active
---

환경: Windows 11, claude-agent-acp 0.81.1, Claude Code 2.1.322, codex-cli 0.167.1. 임시 최소 ACP 클라이언트로 직접 구동(권한 요청은 reject_once 또는 allow_once 선택). 판정: 됨/안 됨/조건부, 근거 구분은 **실측**(이 PC에서 관찰) · **가정**(문서·기억, 미관찰).

| 항목 | 판정 | 구분 | 근거·요지 |
|---|---|---|---|
| Claude ACP 읽기 전용(plan 모드)·권한 거부 | 조건부 됨(관찰 범위: 작업 폴더 + 이벤트가 드러낸 경로, 홈·설정 전체 쓰기 없음은 미확인) | 실측 | plan에서 Write·git commit 요청 → 작업 폴더에 파일·커밋 없음, 권한 요청은 `switch_mode`("Approve Plan")뿐이고 거부하자 stopReason `cancelled`. 단 plan 모드는 **작업 폴더 밖 `~/.claude/plans/*.md`에 계획 파일을 쓴다**(권한 요청 없이 tool_call kind=edit). 이번 시나리오에서 작업 폴더 변경이 없었다는 관찰일 뿐 읽기 전용 보장이 아니며, 홈·설정 쓰기 부재는 탐지하지 못했다 |
| Claude ACP plan 모드의 작업 폴더 밖 읽기 | **무승인 실행 — 읽기 전용에 쓰지 않는다** | 실측(2026-11-24, macOS, 0.81.1) | plan에서 Read 도구(절대 경로)·셸 `cat ../파일`·grep이 권한 요청 없이 작업 폴더 밖 파일을 읽어 답에 실었다. 그래서 읽기 전용은 `default` 모드로 바꿨다(P005 T04 발견) |
| Claude ACP default 모드 읽기 전용(PACE 강제 거절) | 됨(관찰 범위: 아래 명령) | 실측(2026-11-24, macOS, 0.81.1) | 밖 읽기(Read 절대 경로·밖을 가리키는 심볼릭 링크·`cd .. && cat`·`$HOME` 절대 경로 cat·`cat 안; cat 밖`·`find .. -exec head`·`git -C ..`)와 쓰기(Write·Edit·`echo > 파일`)·서브에이전트의 밖 읽기·쓰기가 모두 `session/request_permission`으로 와 거절, 파일 변경 없음. 작업 폴더 안 Read는 권한 요청 없이 됨. 핵심 4종은 2회 반복 같은 결과 |
| Claude ACP default·acceptEdits 모드에서 쓰기 거부 | 됨 | 실측 | Write(kind=edit)·Bash(kind=execute)가 모두 `session/request_permission`으로 와서 reject_once → 파일 생성 없음(시험한 두 요청의 거부 효과이며 모든 변경 경로의 통제를 뜻하지 않는다). acceptEdits도 이 실측에서는 Write·Bash 모두 요청이 왔다(모드 전환 동작은 불명 — 쓰지 않음) |
| codex-acp 읽기 전용·권한 거부 | 안 됨(기존) | 실측(기존) | 1.13.1 read-only 모드에서도 touch 성공. `codex-acp`는 이 PC에 없어 이번에 재측정 못 함 — 최신 버전 재확인 필요 → 가정 |
| codex exec -p 읽기 전용 | 조건부 됨 | 실측(기존) | `--sandbox read-only --ignore-user-config` + approval_policy=never 함께(0.166.0). 0.167.1 재측정은 안 함 |
| 세션 이어가기 | 됨 | 실측 | initialize `loadSession:true`·`sessionCapabilities.resume`. 새 프로세스에서 `session/resume`(sessionId, cwd, mcpServers)로 앞 대화(codeword) 기억. `session/load`도 되나 **이전 대화를 `agent_message_chunk`·`user_message_chunk`로 재전송**한다 — 클라이언트가 응답 본문에 섞지 않게 resume을 쓰거나 load 응답 전 이벤트를 버려야 함. 이어가기 뒤에도 effort·mode 설정은 다시 지정해야 하는지 미확인 |
| effort 전달 | 설정 수락 확인 | 실측 | `session/new` 응답 `configOptions`에 `effort`(default·low·medium·high·xhigh·max)·`model`·`mode`·`fast`. `session/set_config_option {configId:"effort", value:"low"}` 수락. 실제 추론량 변화는 미측정(수락만 확인) |
| 모델 선택 | 옵션 노출 확인(전환 성공은 미검증) | 실측 | `configOptions.model` 값 default·opus[1m]·claude-fable-5-1[1m]·sonnet·haiku(기존 `session/set_model`도 유효) |
| `mcpServers` stdio MCP 도구 노출 | 됨 | 실측 | stdio MCP(initialize·tools/list·tools/call 확인됨)를 넣자 에이전트가 ToolSearch로 찾아 호출, 비밀 값 회신. 호출 때 `session/request_permission`이 오고 kind=`other`, `_meta.claudeCode.toolName`=`mcp__<서버>__<도구>`. `env`는 `[{name,value}]` 배열 |
| ACP Claude의 SessionStart 훅(pace boot) | 조건부 됨(모델 자기보고 기반 간접 증거 — 훅 실행·전달 직접 관찰은 미확인) | 실측 | `settingSources: []`(현재 설정)에서는 모델이 훅 출력을 묻는 질문에 NO, `["user","project"]`에서는 YES라고 응답했다(자기보고, 훅 실행·전달 직접 관찰 없음). 따라서 정체성 주입은 설정 격리를 풀거나(훅 부작용·사용자 설정 노출) 프롬프트 앞 맥락으로 대체. 격리해도 `available_commands_update`에 사용자 스킬이, 에이전트에게 claude.ai 커넥터(Gmail 등) 안내가 보인다 — 설정 격리가 완전하지 않음 |
| `session/update` 이벤트 형태 | 됨 | 실측 | 관찰된 종류: `agent_message_chunk`·`agent_thought_chunk`·`tool_call`(name·kind·status·rawInput·locations)·`tool_call_update`·`usage_update`(used·size)·`available_commands_update`·`config_option_update`·`user_message_chunk`(load 재전송). plan 항목·서브에이전트 이벤트는 이번 시나리오에서 안 나왔다(어댑터는 `subagents` 능력을 광고) → 가정 |
| 취소·자손 회수 | 부분 확인 | 실측+가정 | 권한 거부로 turn이 `cancelled`로 끝남(실측). `session/cancel`·강제 종료 시 자손 회수는 기존 구현(`proc-group`·`windows-job`) 테스트로만 확인 — 실제 어댑터의 긴 작업 취소는 이번에 재측정하지 않음 → 가정 |
| 한도·rate limit 문구·종료 코드 | 미확인 | 가정 | 재현하지 않음(구독 한도를 일부러 소진하지 않는다). 알려진 형태: Claude `usage limit reached`/`resets …`, Codex 429·`usage_limit_reached` — 분류는 **문구에 의존하지 말고 stderr·stopReason·종료 코드 원문을 보존**하고 첫 실제 사례를 기록 |
| Claude 구독으로 상시 자동 실행의 약관 범위 | 미확인 | 가정 | 확인 못 함 — 사람(캡틴)의 판단 필요. 위험: 약관·사용 정책이 자동화·상시 실행을 제한할 수 있고 구독 계정 정지 가능. 완화: 한도 체인·기본 읽기 전용·낮은 동시 실행 상한, 필요하면 API 키 방식 대안 |

부가 실측: 한 번의 짧은 질문이 cache write 16k·read 60k 토큰 규모 — 상시 실행의 한도 소모는 시스템 프롬프트·스킬 목록 때문에 작지 않다. 빈 `cwd` 인자는 `Invalid params`.

관련: [[pace-agent-호출-함정-실측]]

## 미확인이 막는 결정과 임시 대안

| 미확인 | 영향받는 결정 | 임시 대안 | 확인 조건 |
|---|---|---|---|
| codex-acp 최신 읽기 전용·이어가기 | 읽기 전용 단계 적격, codex 이어가기 | codex `-p`를 읽기 전용 단계 후보로(현재 버전 검증이 해제 조건, 그 전까지 미활성), ACP 이어가기는 요약 주입 | codex-acp 설치 가능한 환경에서 재측정 |
| 실제 한도 오류 문구 | `rate_limited` 분류, 쿨다운 | 종료 코드·stderr 원문 보존 + 설정 가능한 패턴, reset 시각 못 읽으면 기본 대기. 분류 오류 시 불필요한 전환·재시도가 남음(모사 입력 시험 3종으로만 분기 확인) | 실제 한도 발생 사례 수집 |
| 긴 작업 취소 때 자손 회수 | 취소·강제 종료 복구 | 기존 proc-group·windows-job 테스트에 의존 | 실제 어댑터 취소 시험 |
| 승인 무응답·연결 종료 동작 | 권한 위임, 승인 만료 | 무응답은 만료 시 거절로 처리 | 통합 시험에서 관찰 |
| plan·서브에이전트 이벤트 | 이벤트 전달 | 모르는 종류는 원본 저장 | plan 요청 시나리오 |
| MCP 도구 이름 기반 거부가 실제 호출을 막는지 | 권한 위임 | 서버 측 강제를 주 통제로 두고 권한 콜백은 보조 | reject 시 호출 차단 시험 |
| 약관 범위 | 상시 실행 전체 | 임시 운영 수단일 뿐 약관 허용을 해소하지 못한다 — 낮은 동시 실행 상한·읽기 전용 기본은 위험 완화 | **상시 실행 착수 전 캡틴 확인이 필요한 결정 차단 조건** |

## 추가 실측 (2026-11-12, claude-agent-acp 0.81.1, 실제 어댑터)

| 항목 | 판정 | 근거 |
|---|---|---|
| 권한 요청의 도구 이름 위치 | 도구마다 다름 | MCP 도구는 `toolCall._meta.claudeCode.toolName`(=`toolCall.name`), 내장 Write는 `_meta.claudeCode`가 없고 `toolCall.name`만 있다. 이름을 `_meta`에서만 읽으면 쓰기 접근의 정상 편집 요청도 전부 거절된다(실측으로 발견·수정) |
| `session/resume` + `paceMcp` 재적용 | 됨 | 2턴을 MCP 서버 항목 없이 resume하면 에이전트가 pace 도구가 없다고 보고, 1턴 승인이 남지 않고, 남은 `pace mcp` 프로세스 없음. 읽기 전용 모드 재설정 뒤 Write 시도는 실패(파일 미생성) |
| 콜백 reject → 쓰기 차단 | 됨 | 쓰기 접근에서 `onPermission`이 Write를 reject하면 파일 미생성, allow하면 생성 |
| 정체성 맥락 주입 | 됨 | 첫 프롬프트 앞 맥락으로 에이전트가 프로필 이름(알투)과 프로젝트 정의 표식을 답함 |
| plan 이벤트 | 미관찰 | 이벤트 종류: tool_call(name·status)·tool_call_update·agent_message_chunk·usage_update·available_commands_update·config_option_update |
| codex-acp | 미확인 | 이 환경에 설치돼 있지 않아 이어가기·요약 주입 실측 불가 |

