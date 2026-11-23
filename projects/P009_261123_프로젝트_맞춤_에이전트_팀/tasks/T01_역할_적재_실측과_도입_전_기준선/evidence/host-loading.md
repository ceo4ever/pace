# 호스트 역할 적재 실측

실측 2026-11-23, Claude Code 2.1.330 · codex-cli 0.171.0. 적용 대상 저장소와 별개인 임시 Git 저장소 3곳에서 Orca orchestration worker-start를 사용했다. 원본과 설정은 host-fixture-source, 위치·실행 spec·receipt·턴별 기록은 host-*.json 및 *-observations.json에 보존했다.

## 호스트 × 적재 경로

| 호스트/경로 | 적재 결과 | 정의·요청값 → 실제 model/effort | 실제 도구 제한 | 역할 유지·역할 밖 인계 |
|---|---|---|---|---|
| Claude native | 가능: .claude/agents/fixture-qa.md와 프로젝트 settings의 agent=fixture-qa, Orca의 새 세션에 자동 적용 | model=sonnet → claude-sonnet-5-5(세션 assistant.message.model); effort=high → 실제 medium(API 요청 params.output_config.effort, 정의값 미반영); tier standard 문자열 자체는 기계적 선택값 아님 | 선언 Read/Grep/Glob/Bash → 자기 보고 Read/Bash, Edit/Write/Agent 없음(실호출은 Bash 확인, 미호출 도구의 비노출은 요청 목록 미확보로 독립 확인 못 함). Bash는 쓰기 가능하므로 읽기 전용 보증 아님 | 3턴 모두 식별어 유지, 3턴에서 HANDOFF: lead로 수정·배포 인계 |
| Claude prompt | 가능: worker spec에서 ROLE.md를 읽도록 전달 | tier standard → 별도 model 인자 없음, 실제 claude-opus-5-5(세션 model); 실제 effort medium(API 요청 output_config) | 역할 원문은 권한 설정으로 적용되지 않음. 자기 보고 Edit/Write/Agent 등 노출(요청 목록은 미확보) | 3턴 식별어 유지·정상 문서 모순 검토·리드 인계 |
| Codex native 탐색 | .codex/agents/fixture-qa.toml을 두어도 Orca 최상위 작업자 역할로 자동 선택되지 않음. 현재 worker-start에 custom role 인자 없음 | 기본 gpt-6.2-sol / medium(3턴 turn_context 메타); QA 정의 미선택 | 역할 제한 미적용, 기본 도구 유지 | 3턴 일반 비서 알투, QA 식별어·HANDOFF 형식 없음. QA 역할 적재 실패가 관찰 결과 |
| Codex prompt | 가능: worker spec에서 ROLE.md를 읽도록 전달 | tier standard → 별도 model/effort 인자 없음, 실제 gpt-6.2-sol / medium(3턴 turn_context) | 역할 원문은 권한 설정으로 적용되지 않음. apply_patch·exec_command 등 노출 | 3턴 식별어 유지·정상 모순 검토·리드 인계 |

후속 2·3턴은 모두 Orca ask/reply로 같은 세션에 전달했다. 관측 도구 목록은 자기 보고와 실호출 기록을 구분한다. Claude의 request_tool_sets는 비어 있어 전체 노출 목록은 자기 보고이며, 실호출은 Bash까지 확인했다. 미호출 도구 비노출을 독립 검증하거나 각 권한을 전부 검증한 것은 아니다. 소스 model/effort 메타는 host-model-metadata.json에 값과 원본 경로·시각만 추출했다. 사용자 인증 파일은 열거나 복사하지 않았다.

## 대조와 한계

Codex 역할 없는 저장소의 대조 1회도 같은 3턴을 받았다. 일반 비서로 시작했고 모순 판정은 했지만 QA 식별어나 HANDOFF를 출력하지 않았다(codex-control-observations.json). 따라서 '수정·배포를 하지 않음'만으로 역할 적재를 판정하지 않는다. 관측 작업 자체에 쓰기·배포 금지가 있어 대조군도 이를 지켰다. 판별 근거는 역할의 식별어·담당 범위·형식에 맞는 인계의 세 턴 유지다. 한 칸당 한 번의 표본이며 의미상 역할 유지 관측이지 악성 요청에 대한 강제 격리 증명은 아니다.

모든 작업자는 worker_done succeeded로 정착했다. 처음 네 시작은 /var 별칭 selector_not_found로 작업자 생성 전에 실패했고, CLI가 안내한 worktree ps의 /private 실경로·정확한 ID를 사용해 원래 mutation request ID로 복구했다. 임시 저장소는 삭제하지 않았고 사용자 저장소를 바꾸지 않았다.

Claude native는 설정의 agent 값으로 가능했으나 이 설정은 같은 worktree의 모든 새 세션에 영향을 준다. 호출별 역할을 고르는 T03에서 공유 settings를 수시로 바꾸는 방식은 동시 실행 간 간섭이 있으므로 사용하지 않는다.

## T02 필드와 T03 방식

원본은 역할 ID·이름·업무 설명, 맡는 일/하지 않는 일, 인계 대상·형식, tier, tools, 제공자별 model/effort 매핑을 별도로 가진다. tier·tools를 본문에 적는 것만으로 실행 설정이 적용된다고 표시하지 않는다. 생성물은 저장소 원본 한 벌에서 Claude의 native frontmatter와 Codex의 custom subagent TOML을 만들되 Codex의 subagent 정의와 최상위 Orca worker 선택은 구별한다.

T03의 공통 기본은 prompt 적재(역할 원본을 명시적으로 읽히기)와 model/effort 실행 인자 전달이다. --role 생략은 현재 경로를 보존한다. 기존 작업자 권한을 확대하지 않으며 prompt 방식의 tools는 행동 지시이고 호스트 권한 제한이 아님을 기록한다. Claude 수동 native 선택은 생성된 정의와 --agent 또는 프로젝트 agent 설정으로 가능하지만 호출별 공유 설정 교체는 하지 않는다.

공식 근거(조회 2026-11-23): [Claude custom subagents](https://code.claude.com/docs/en/sub-agents)는 --agent 및 settings의 agent로 main session을 고르는 방법을 설명한다. [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)는 프로젝트 .codex/agents TOML을 서브에이전트 정의로 설명한다. 위 표의 완료 판단은 이 문서만이 아니라 실제 Orca 관측과 세션 메타에 근거한다.

## Codex Studio MCP 설정·연결

기존 Codex 설정에는 Roblox Studio 서버가 없었다. 사용자 설정을 바꾸지 않고 한 실행의 -c mcp_servers.p009_studio.command로 StudioMCP stdio를 지정했다. codex mcp get 출력은 활성 stdio 설정을 확인했고, 실제 Codex 세션이 get_studio_state·list_roblox_studios·script_read·inspect_instance 도구 이름을 보고했다. 연결 근거는 codex-studio-config.json 및 codex-studio-connection.json이다.

Studio 도구를 하나도 호출하지 않았으며 플레이스 목록 조회·상태 조회·실제 Studio 조작은 하지 않았다. 증명 범위는 Codex 설정 판독과 MCP 도구 메타데이터 노출까지다. 실사용·잠금·Studio 조작 증명은 T08에 남긴다. 직접 중첩 CLI의 종료가 부모 Orca 작업 중단으로 오인된 보고가 있어 원래 dispatch가 live임을 확인했고 프로젝트 이슈로 남겼다.

부가 행동 지시 위반: 두 Claude 세션의 sample.md 읽기는 Bash로 수행되어 fixture의 Bash 통신 전용 문구를 지키지 않았다. QA의 문서 검토·수정/배포 금지·인계 역할은 유지했지만 도구별 행동 규율까지 완전 준수했다고 판정하지 않는다. 이 관측은 prompt의 tools가 권한 강제가 아니고 native의 Bash 노출도 읽기 전용을 보증하지 않는다는 한계와 함께 T02·T03에 넘긴다.

추가 메타데이터 대조: Claude 세션 원장에는 assistant.message.model뿐 아니라 params.output_config.effort가 있어 두 세션의 실제 요청값 medium을 확인했다. native 정의의 high와 달랐으므로 선언된 effort가 main-session Orca 실행에 반영됐다고 보지 않는다. 원인은 확정하지 않았고 T03은 model·effort 실행 인자를 별도로 전달해야 한다.

## 관측 경계 보완

Claude native의 복구 영수증은 최초 호출 때 도구 출력으로만 남았던 실제 CLI stdout을 이 세션 기록에서 claude-native-receipt-recovery.json으로 옮겼다. 원문을 추정해 만든 값이 아니다. native의 Bash sample.md 읽기는 host-model-metadata.json의 file_read_shell_calls에 원장 행과 명령을 보존했다. 실제 API 요청의 tools 이름도 request_tool_sets에 추출해 자기 보고와 구별한다. params.tools가 없는 세션에서는 자기 보고 이상으로 강제 권한을 주장하지 않는다.

도구 행동 규칙은 세 경로에 같은 잣대를 쓴다. Claude native·prompt의 Bash 읽기와 Codex prompt의 exec_command 읽기는 모두 '셸은 통신 전용'이라는 부가 행동 지시를 준수한 근거가 아니다. QA의 검토 업무·수정/배포 금지·인계는 유지됐으나 도구 행동 규율의 완전 준수는 실패/미보장으로 기록한다.

Codex prompt는 ROLE.md를 읽기 전에 개인 비서 이름 '알투'로 짧게 인사했다. 원본은 개인 이름을 금지하지 않고 QA 업무 역할과 식별어를 정의한다. 따라서 개인 프로필 인사를 제작자 역할로 바꾼 자칭과 구별하며, 역할 적재 후 1턴 업무 응답부터 3턴까지 QA 식별어와 인계를 판정했다. 로딩 이전부터 역할이 적용됐다고 주장하지 않는다.

host-model-metadata.json의 file_read_shell_calls는 역사적 필드명이며 파일 읽기와 통신 명령을 함께 담은 Bash 실호출 기록이다. 명령별로 구분하며 통신 호출을 역할 도구 규칙 위반으로 세지 않는다.
