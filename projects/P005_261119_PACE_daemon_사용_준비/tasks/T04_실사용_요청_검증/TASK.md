# T04 실사용 요청 검증

- 프로젝트: [P005](../../PROJECT.md) · 백로그: [BL261116_02 PACE daemon 사용 준비](../../../../backlogs/BL261116_02_PACE_daemon_사용_준비/BACKLOG.md)
- 상태: 진행
- 사전 검토: v3 (macOS 새 PC 재개에 맞춰 전체 재정리 — v2 검토 9회의 지적 반영)

<!--
개발 업무의 예시 형식. 형식·추적 정본: pace-project-dev의 references/document-shape.md.
① 분석 → 목적·재료, ② 설계 → 기준·테스트·접근. 범위는 PROJECT·백로그 절을 링크하고 다시 쓰지 않는다.
착수 뒤에는 기준을 바꿀 때만 고친다(PROJECT.md 결정 메모에 이유). 작고 분명한 태스크는 각 절을 한두 줄로.
-->

## 목적

등록된 검증용 Git 작업사본에서 Telegram 요청이 실제 default 체인 읽기·승인된 쓰기로 끝까지 실행되고, 거절·만료·이전 기동 승인·중단 쓰기 복구가 안전하게 처리됨을 확인한다(P-4). General /status 같은 결정적 응답을 실제 LLM 작업 성공으로 대체하지 않는다.

## 재료

- [BR04](../../../../backlogs/BL261116_02_PACE_daemon_사용_준비/BR04_실사용_요청_검증.md), PROJECT P-4 및 민감 경로·승인된 쓰기 한정 원칙.
- **새 PC 재개(2026-11-22 사용자 결정)**: T04는 macOS 새 PC에서 이어간다. 이전 Windows PC daemon은 캡틴이 제거했다(같은 봇 중복 수신 없음). 이전 PC의 결속·offset·작업공간 등록·작업사본은 그 PC 로컬이라 이 PC에서 새로 준비한다. 이전 PC 기록(WORKSPACE.md의 Windows 경로, EXECUTION-PREPARATION.md, evidence의 bind·observer·handoff 파일)은 이력으로만 둔다. 이 PC 상태(2026-11-22 확인): daemon·Telegram 시크릿·config 없음, claude·codex 로그인, Claude ACP 어댑터 0.81.1.
- **체인(사용자 결정)**: 이 PC default는 Claude/acp→Codex/p다. daemon은 첫 단계가 ACP일 때만 세션을 저장해 같은 토픽·workspace·access의 다음 요청을 resume하고, p는 새 세션+직전 응답 요약이다(`src/daemon/runner.ts` 이어가기). 이전 PC가 Claude/p였던 것은 ACP 어댑터 미설치 때문이었다. T01은 Claude/p·Codex/p를 검증했다.
- **ACP 격리 재검증과 수용(사용자 결정)**: [macos-acp-revalidation.json](evidence/macos-acp-revalidation.json) — 읽기 정확, 쓰기 허용 시 지정 파일만 변경, 읽기 전용에서 작업 폴더·외부 경로 무변경과 plan 이탈 거절. 도구 단계 거부 원문은 미관측(모델 미시도)이고 plan 모드는 Claude 설정 폴더 `plans/`에 계획 파일을 쓴다. 캡틴은 이를 알려진 한계로 받아들였다(현재 Claude·Codex가 읽기 전용 지시를 잘 지킴). 추가 격리 시험은 없다. Claude 설정 폴더의 계획 파일은 T-5 허용 범위 외 변경으로 보지 않는다.
- **ACP 쓰기의 도구 권한**(`src/agent/acp-executor.ts` 권한 분기): 쓰기 접근에서 편집(kind=edit) 도구는 자동 허용, 그 밖 도구(셸 등)는 daemon이 Telegram 승인 버튼으로 묻는다(`runner.ts` onPermission → requestApproval). 따라서 쓰기 작업은 작업 시작 승인(write_start) 뒤에 도구 승인 버튼이 추가로 올 수 있다. **편집 도구의 자동 허용은 경로를 대조하지 않는다**(`acp-executor.ts` 권한 분기) — 작업사본 밖 파일 편집도 승인 없이 허용될 수 있는 제품 한계이며 프로젝트 이슈로 기록한다. T04는 이를 고치지 않고 작업사본 밖 변경을 사후 감지한다(관측 공통). **캡틴 결정(2026-11-23)**: 사전 차단 없이 사후 확인으로 진행한다. T-5의 외부 파일 보존은 관측 범위(PACE_HOME 보호 파일 해시·홈 목록 스냅숏) 안의 무변경으로 판정하고, 홈 밖·제외 폴더·크기와 수정 시각이 같은 내용 변경은 미확인 제약으로 TASK-CLOSE에 남긴다. 경로 한계는 프로젝트 이슈로 따로 고친다.
- **코어 동작**(`src/daemon/core.ts`): 쓰기는 write_start 승인 전 awaiting_approval, 거절은 denied, 실제 expiresAt 경과는 expired, 이전 boot 승인은 결정 시점에 거부. running 쓰기가 비정상 종료 뒤 복구되면 needs_review·경로 quarantine이며 자동 재실행하지 않는다. 격리와 겹치는 queued 작업은 스케줄러가 건너뛰고(거절 응답 없음) 같은 작업 ID로 대기 알림을 한 번 보낸다. 정상 승인 뒤 원래 메시지의 버튼은 제거되고 `/pending`은 대기 중 승인 버튼을 다시 보낸다. 접근 모드(/read·/write)는 대화 상태에 저장된다.
- **회수**(`src/daemon/runner.ts`·`index.ts` defaultReap): 실행기가 자식 PID를 보고하지 않아 procs가 비므로 OS와 무관하게 강제 종료 뒤 회수 미확인·격리가 정상 기대다.
- **Telegram**(`src/daemon/telegram/adapter.ts`): 허용 chat → 허용 사용자 → 등록 토픽 순으로 통과한 입력만 처리한다. offset 파일이 없는 첫 기동은 Telegram이 보관 중인(최대 24시간) 이전 업데이트를 받는다. 허용 사용자의 General `/new`는 토픽 결속 검사 전에 처리되어 config에 workspace를 저장할 수 있다. `telegram init`은 시크릿(토큰·chat)만 저장하고 허용 사용자는 설정하지 않는다. 대화형 `pace daemon install`은 getUpdates(offset 없이, 확인 처리 안 함)로 chat·허용 사용자 후보를 찾아 시크릿과 `allowedUsers.telegram`을 저장한다. 이미 있는 토픽의 /bind는 등록 workspace만 결속하며 봇 관리자 승격·createForumTopic은 쓰지 않는다. 메서드별 송신 집계는 제공하지 않는다.
- **macOS 기동**(`src/daemon/autostart.ts`): `pace daemon start`는 launchd `io.pace.daemon`(RunAtLoad, KeepAlive false)을 등록·로드한다 — 캡틴이 등록을 허용했다(사용자 결정). KeepAlive가 false라 강제 종료 뒤 launchd가 자동 재기동하지 않는다. launchd는 시스템 기본 PATH만 주는데 claude·codex·claude-agent-acp는 `~/.local/bin`에 있어, 원래 plist로는 실행기를 찾지 못했다 — main에서 등록 때 PATH를 plist에 넣도록 고쳤고(사용자 결정 2026-11-23, 작은 일) T04는 그 설치본으로 진행한다. S-0s에서 서비스 환경의 명령 해석을 확인한다. POSIX 실행기는 부모 종료를 감지해 실행기 프로세스 그룹을 정리하는 감시자를 둔다(`src/agent/process.ts`).
- **설치본**: 브랜치 기준점·main·설치본(`~/.pace/app`)의 `src/daemon/**`·`src/agent/**`가 같다(2026-11-22 대조). P005는 제품 코드를 바꾸지 않는다. T04는 `test/daemon-approval.test.ts` S-7c에 늦은 승인 뒤 실행기 호출 0회 단언을 더했다(시험만).
- 이전 Windows PC의 T03 재로그온 자동 기동·콘솔 비표시 인수는 병합 후 todo다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 승인된 비민감 검증 Git 작업사본과 토픽만 결속되고, 실제 Telegram 읽기가 default 체인에서 done 및 정확한 합성 파일 응답으로 완료되고, 같은 토픽의 다음 요청이 저장된 ACP 세션을 이어간다(P-4) |
| T-2 | 동일 토픽의 쓰기가 승인 전 실행되지 않고, 허용 사용자의 실제 인라인 승인 뒤 지정 파일만 기대 바이트로 변경되어 done·결과 알림까지 완료된다(P-4) |
| T-3 | 별도 요청의 거절·실제 기한 만료·재시작 뒤 이전 승인 재사용이 실행을 막고 대상 파일을 바꾸지 않는다(P-4) |
| T-4 | 승인된 실행 중 쓰기만 비정상 중단한 뒤 needs_review·승인 무효·자동 재실행 없음·quarantine을 확인하고, 소유 자손 회수/결과 검토 전 격리를 풀지 않는다(P-4) |
| T-5 | 허용 범위 외 설정/파일·시크릿을 보존하고, 최종 정상 운영·승인 정책 복원·미해결 결함/제약 및 비밀 없는 증거·독립 판정이 남는다(P-4) |

## 테스트

<!-- 기준마다 한 줄 이상. 유형: unit(테스트 코드) · e2e(화면·프로세스 시나리오, e2e/S-n.md 또는 E2E 테스트 코드) · check(문서·설정 확인). 가장 싼 충분한 계층을 고른다 -->

모든 e2e 행에는 아래 [관측 공통](#관측-공통) 규칙(기동 식별·체인 확인·파일 대조·보조 관측의 한계)이 적용된다.

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-0 | check | T-1·T-5 | 이 PC에 daemon 설정 없음. 캡틴 확인(2026-11-23): Windows daemon 정지(11/22 15:02) 뒤 봇에 명령·요청을 보낸 적 없음 — 그 전 업데이트는 Windows가 받아 확인 처리했으므로 Telegram에 실행될 묵은 명령이 없다 | 캡틴이 별도 터미널에서 대화형 `pace daemon install` — 체인 유지, 기기 이름 기본값, 봇 토큰 입력→getMe, 그룹에 메시지 하나를 보내 기존 검증 그룹 선택, 허용 사용자로 캡틴 한 명 선택, workspace 등록 안 함 | 시크릿 파일 소유자 전용 권한, 선택한 chat이 기존 검증 그룹(제목·포럼 여부를 캡틴이 확인), 허용 사용자 1, defaultAccess read-only, approvalTtlSeconds 600, maxConcurrent 2, workspace 0, launchd 등록 | 토큰·식별자 원문은 캡틴만 입력하고 main은 읽거나 기록하지 않는다(개수·키 존재·권한만) |
| S-0s | e2e | T-1·T-5 | S-0 뒤 launchd 로드로 daemon 기동(RunAtLoad) | 첫 폴링 뒤 60초 관찰 | 작업 0·workspace 0·config 다른 키 불변, 설치 중 보낸 발견용 메시지는 실행 없이 처리, launchd 서비스 PID=daemon PID, plist PATH에 claude·codex·claude-agent-acp·node가 해석되는 폴더가 들어 있음(`launchctl print`의 환경 또는 plist로 확인) | 작업·workspace가 생기면 즉시 stop하고 이벤트·시각·건수로 보고. PATH에서 실행기를 찾지 못하면 S-1로 가지 않고 멈춘다. 캡틴에게 이전 PC의 읽기 요청 발송·응답 여부를 확인해 기록 |
| S-1 | check | T-1·T-5 | 캡틴이 작업사본 경로 승인 | 전용 합성 Git 작업사본 생성(새 무작위 fixture), config에 그 workspace 한 항목만 원자적 등록 → stop/start | 다른 설정 보존, 로더가 그 workspace만 인식, 초기 접근 read-only, 새 boot | 경로는 PACE 소스 checkout 밖·비어 있는 새 폴더·심링크 아님. 파일 해시·최초 커밋을 evidence에 남김 |
| S-1b | e2e | T-1 | S-1 뒤 | 캡틴이 검증 토픽에서 `/bind@<봇> pace-p005-t04` | 그 토픽만 workspace에 결속, 다른 토픽 무변경 | 결속 대상 이름·개수만 기록 |
| S-2 | e2e | T-1 | 결속 토픽, read-only | 캡틴이 봇 메시지에 답장해 `fixture.txt 파일을 읽고 파일 내용만 그대로 답해 주세요. 파일은 변경하지 마세요.` | done, 응답이 파일의 무작위 표식과 일치, target.chain=default·result.via가 claude/acp(또는 폴백이면 그 경로를 기록), 파일·Git 불변 | 요청에 정답 미포함 |
| S-2r | e2e | T-1 | S-2 done, 같은 토픽·workspace·access | 캡틴이 같은 토픽에서 "파일을 다시 열지 말고 직전 답을 그대로 말해 달라" | done, 응답이 직전 표식과 일치, **이어가기 분기로 실행됨** | 표식 일치만으로 판정하지 않는다(요약 폴백도 같은 표식을 답함). 이어가기 분기는 result.via를 넣지 않고 체인 분기는 항상 넣으므로 result.via 부재 + 작업 뒤 보관 세션이 claude이고 S-2 뒤 보관 ID와 같음을 boolean으로 기록. ID 원문은 기록하지 않음 |
| S-3 | e2e | T-2 | S-2r 뒤, 캡틴이 /write 전환 | 캡틴이 `approved.txt`만 지정 문자열로 바꾸는 쓰기 요청 → write_start 승인(도구 승인 버튼이 더 오면 편집 외 도구는 거절) | 승인 대기 동안 awaiting_approval·파일·Git 불변, 승인 뒤 running→done, `approved.txt`만 기대 바이트, 결과 알림, chain·via 일치 | 승인 전 미실행의 순서 보장은 단위 시험 S-7·S-22·S-8c를 S-6 전체 검사로 연결한다(사용자 결정). 실사용 상태 판독은 보조 증거로 기록 |
| S-4d | e2e | T-3 | /write 유지 | `denied.txt` 쓰기 요청 → 캡틴이 실제 거절 | denied·거절 알림, running 전이 없음, 파일 불변 | 미실행 근거는 단위 시험 S-7c(거절 뒤 실행기 호출 0회) + 보조 판독 |
| S-4e | e2e | T-3 | /write 유지 | `expired.txt` 쓰기 요청 → 승인하지 않고 실제 expiresAt(약 600초) 경과 → 늦게 승인 버튼 | expired·만료 알림, 늦은 승인 거부, running 없음, 파일 불변 | 가짜 시간·상태 편집·TTL 변경 없음. 대기 중 S-6 전체 검사 1회를 병행. 미실행 근거는 S-7c(늦은 승인 뒤 0회 단언 보강) + 보조 판독 |
| S-4r | e2e | T-3 | S-4e expired 뒤, 다른 실행 작업 없음 | `old-boot.txt` 쓰기 요청 → 승인 대기 중 정상 stop→start → 캡틴이 이전 버튼 | stop 완료 직후·start 전(TTL이 남은 상태)에 state.json에서 그 승인이 invalidated, 새 boot에서 이전 버튼이 거부되며, 자동 실행 없음·파일 불변 | 이전 boot·새 boot와 승인을 연결. 정상 정지의 무효화를 TTL 만료와 구별해 기록 |
| S-5 | e2e | T-4 | 다른 작업 없음 | `interrupted.txt` 쓰기 요청(먼저 무해한 셸 명령으로 현재 폴더 목록을 확인한 뒤 파일을 바꾸라고 지시) → 승인 직전 `/pending`으로 같은 시작 승인의 두 번째 버튼을 받아 둠 → 한쪽으로 시작 승인 → 셸 도구 승인 버튼이 오면 누르지 않고 대기 → 그동안 running·실행기 자손·프로세스 그룹 고정 → daemon PID에만 SIGKILL → 고정한 자손 소멸 확인(남으면 같은 PID·시작 시각일 때만 종료) → `pace daemon start` | 복구 뒤 그 작업 needs_review·복구 알림·경로 quarantine·자동 재실행 없음, 대기 중이던 도구 승인 무효, launchd가 저절로 재기동하지 않음, `interrupted.txt` 불변 또는 변경 여부 기록 | 도구 승인 대기로 작업을 running에 붙잡아 중단 시점을 정한다. 셸 승인이 오지 않고 먼저 끝나면 미실측으로 보고. 회수 판정은 중단 전 고정한 프로세스 그룹·자손의 중단 뒤 소멸 관측으로 하고, 불명확하면 T-4 회수는 미확인·격리 유지 |
| S-5g | e2e | T-4 | S-5 뒤 격리 유지 | ① 캡틴이 /read 전환 뒤 같은 토픽에서 안전한 읽기 요청 ② 받아 둔 두 번째 승인 버튼을 누름 | ① 접수되고 같은 작업 ID의 대기 알림을 받은 뒤에도 queued·격리 유지, running 전이·실행기 기동 없음 ② 이전 기동 승인으로 거부되고 재실행 없음(이미 approved인 시작 승인의 재사용 거부 증거) | ①은 접수부터 재판독까지 다른 preparing·running이 0일 때만 판정(실행 상한 대기와 구별), 5분 안에 대기 알림이 없으면 미확인. 대기한 시험 작업은 release 전에 /cancel로 종결 확인. 복구가 대기 중 승인(S-5의 도구 승인)을 무효화하는 것은 복구 직후 state.json 판독과 단위 시험 S-12(`test/daemon-recovery.test.ts`)로 연결 |
| S-5q | check | T-4·T-5 | S-5g 뒤 | 파일·자손 검토 결과를 캡틴에게 제시 → 별도 승인이 있을 때만 `pace daemon release <경로>` | 회수·검토 증명 전 격리 유지, release해도 needs_review는 done으로 바뀌지 않고 재실행 없음 | 회수가 불확실하면 release하지 않고 격리 유지를 보고 |
| S-6 | check | T-1~T-5 | 실측 끝(또는 정리 경로) | 작업본 `npm run check` 1회(임시 PACE_HOME), 설치본 일치 재대조, 종료 상태 복원 확인, 새 독립 tester·reviewer | 검사 종료 0, 설치본 일치, 종료 상태(아래) 충족, 독립 pass | 종료 상태: 시험 토픽 /read 복원 → 검증 workspace 등록 해제 → stop/start 새 boot → 그 boot의 `/workspaces`에 검증 등록 없음·시험 토픽 `/status` 접근 read-only, launchd 등록·서비스 PID=daemon PID |

## 접근

### 범위
- 제품 코드·이 PC의 default 체인·토큰·허용 사용자는 T04에서 바꾸지 않는다. 대상은 캡틴이 허용한 전용 합성 Git 작업사본 하나로 고정하고, 시험 뒤 검증 workspace 등록은 해제한다(2026-11-22 11:27 사용자 결정). 운영 workspace는 쓰지 않는다. 파일·토픽·메시지·작업사본은 삭제하지 않고 보존한다. 범위를 바꾸려면 사용자 결정으로 올린다.
- 작업사본: 캡틴이 승인한 macOS 경로(제안 `~/pace-validation/P005-T04-<날짜>`)에 새로 만든다. 파일은 `AGENTS.md`(시험 규칙), 새 무작위 표식의 `fixture.txt`, 쓰기 대상 `approved.txt`·`denied.txt`·`expired.txt`·`old-boot.txt`·`interrupted.txt`(기준 문자열). 쓰기는 요청마다 지정한 파일 하나만 허용하고, 나머지 파일은 시나리오 전후 해시로 보존을 확인한다. Git commit·config 변경, 네트워크, 보조 에이전트, 삭제는 요청하지 않는다.
- 토픽: 기존 검증 토픽을 재사용한다(같은 그룹·봇·허용 사용자). 없으면 캡틴이 새 토픽을 만든다.

### 순서
S-0 → S-0s → S-1 → S-1b → S-2 → S-2r → S-3 → S-4d → S-4e(대기 중 S-6 전체 검사) → S-4r → S-5 → S-5g → S-5q → S-6 종료 상태. expired 뒤에만 재시작 무효화 시험을 시작한다. 각 단계는 앞 단계 결과를 확인한 뒤 캡틴과 시점을 맞춰 진행한다. 실제 요청·버튼은 캡틴이 직접 보낸다(개인정보보호 모드에 맞춰 봇 메시지에 답장하거나 `/명령@<봇>` 형식).

### 관측 공통
- **기동 식별**: daemon을 띄울 때마다 PID·boot ID·명령줄(설치본 `bin/pace.ts` 진입점)·launchctl 서비스 PID를 기록하고, 그 기동에서 나온 결과만 그 단계 증거로 쓴다. 시험 시작 전과 S-6 직전에 설치본 `bin/**`·`src/**`·`package.json`이 S-6 검사 작업본과 바이트 동일한지 대조하고, 다르면 실측을 멈춘다.
- **체인 확인**: S-0에서 설치 로더가 default를 Claude/acp→Codex/p로 해석함을 확인하고, 각 작업의 target.chain=default와 result.via를 기록한다. 다른 체인이면 토픽 설정을 바꾸지 않고 미달로 기록한다.
- **상태·파일**: state.json·로그는 읽기만 한다(편집해서 결과를 만들지 않는다). 작업사본은 시나리오 전후 파일 목록·해시·Git 상태로 대조한다.
- **작업사본 밖 변경 감지**: 각 쓰기 시나리오(S-3·S-4·S-5) 전후로 (a) PACE_HOME의 config·secrets·profiles 파일 해시(값은 기록 안 함), (b) 홈 폴더 전체 파일 목록(경로·크기·수정 시각)을 스냅숏해 추가·삭제·이름 변경·수정을 대조한다. 예상 밖 변경이 있으면 T-5 미달로 기록하고 멈춘다. 정상 갱신이 예상되는 경로는 허용 변화로 미리 기록한다: PACE_HOME `daemon/**`(state.json·telegram.json·status.json·로그), `agent-cooldowns.json`, 캐시·로그 폴더, Claude/Codex 세션·plans 폴더. config.json·secrets·profiles는 허용 변화에 넣지 않고 해시로 무변경을 본다. 홈 밖 경로와 허용 변화 경로의 내용은 관측하지 않으므로 그 범위의 외부 변경 부재는 미확인으로 기록한다(편집 경로 미대조 제품 이슈와 연결).
- **보조 관측의 한계**: 외부 상태 판독·프로세스 샘플은 짧은 실행을 전수 포착하지 못한다. 승인 전 미실행·거절/만료 뒤 미실행의 순서 보장은 단위 시험(S-7·S-7c·S-22·S-8c)이 맡고, 실사용 판독은 보조 증거로 TASK-CLOSE에 그렇게 적는다(사용자 결정). 송신 메서드별 건수는 집계 경로가 없어 미확인으로 두고, 전달은 캡틴의 토픽 수신 확인으로 판정한다.
- **비밀**: 토큰·세션 ID·사용자/그룹/토픽 식별자·메시지 원문은 기록하지 않는다. 별칭·일치 여부·건수·해시만 남긴다.

### 중단 복구
- 승인한 쓰기가 실제 running이고 실행기 자손이 생긴 때만 강제 중단한다. 정상 stop으로 대체하지 않는다. 강제 종료는 daemon PID에만 SIGKILL로 하고, 고아가 된 자손은 고정한 PID·시작 시각이 같을 때만 종료한다.
- 제품은 OS와 무관하게 회수 미확인·quarantine을 내는 것이 정상 기대이며 기본 reaper를 바꾸지 않는다. 회수·파일 검토를 제시하고 캡틴이 별도로 승인할 때만 release한다. release해도 needs_review를 done으로 바꾸지 않고 재실행하지 않는다.

### 정리 경로
S-0·S-0s·S-1에서 멈추면 daemon stop과 workspace 0(S-1이면 검증 등록 해제)만 확인하고 끝낸다(토픽 결속 전이라 토픽 명령 복원은 해당 없음). S-1b 이후 어느 단계에서 실패·시간 초과로 멈추더라도, daemon이 내려가 있으면(예: S-5 강제 종료 뒤) 먼저 고정한 자손 소멸과 격리 상태를 state.json으로 확인하고 `pace daemon start`로 새 boot를 띄운다 — 재기동이 불가능하면 운영 복원 미달로 기록하고 멈춘다. 그다음 ① 활성·대기 시험 작업을 확인해 /cancel로 종결하고 ② 시험 토픽을 /read로 복원하고 응답과 state.json의 대화 접근 모드가 read-only인지 확인한 뒤 ③ 검증 workspace 등록 해제와 stop/start를 S-6 종료 상태 방식으로 확인한다. 회수 미확인 격리는 유지한다. 복원 실패는 이벤트·시각·건수와 오류 문구(비밀 제거)로 main에 올린다. 접근 모드는 대화 상태에 저장되므로 재기동·등록 해제만으로 read-only 복원을 가정하지 않는다.

### 기준 문서
AGENTS.md·docs/README.md 보안/환경·`docs/DAEMON.md`·PROJECT P-4·BR04. 독립 사전 검토 pass 전에는 workspace·config·토픽 변경, 실제 요청·버튼, 모델 실행, 기동 중단·재시작을 하지 않는다(S-0의 Telegram 설정과 S-0s 첫 기동도 사전 pass 뒤).
