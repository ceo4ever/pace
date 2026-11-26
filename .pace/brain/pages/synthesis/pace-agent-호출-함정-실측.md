---
type: synthesis
title: pace agent 호출 함정 (실측)
summary: "codex exec·codex-acp 읽기 전용 미강제, codex-acp 기본 모델 오류 text, ACP 빈 응답, 설치본이 낡으면 자식에 부트가 실림"
tags: [agent, codex, claude, acp, security]
sources: [실측:2026-11-06, code:src/agent/p-executor.ts, code:src/agent/acp-executor.ts, code:src/agent/windows-job.ts, code:src/agent/windows-job.cs, code:src/agent/win-command.ts, code:src/agent/windows-supervisor.ts]
related: []
created: 2026-11-06
updated: 2026-11-27
status: active
---

1. codex exec --sandbox read-only만으로는 사용자 config의 approvals_reviewer=auto_review가 쓰기를 승인해 막지 못한다 — --ignore-user-config와 approval_policy=never를 함께 준다(실측, codex-cli 0.166.0).
2. codex-acp 1.13.1은 read-only 모드·-c sandbox_mode·approval 설정으로도 touch가 성공한다 — 읽기 전용 요청은 실행 전 거부, 읽기 전용은 -p를 쓴다(readOnlyVerified=false).
3. codex-acp 기본 모델(사용자 config)이 계정 미지원이면 오류 문구가 정상 agent_message와 end_turn으로 온다 — --model로 광고된 모델을 session/set_model로 지정.
4. 이전 Claude ACP plan 모드 실측에서는 모델이 거절된 도구 호출로 턴을 끝내면 본문이 빈 채 end_turn이 올 수 있다 — 실행기는 빈 본문을 agent_failed로 올린다.
5. 설치본(~/.pace)이 낡으면 자식 에이전트 세션에 부트가 그대로 실린다 — PACE_AGENT_CHILD=1 차단은 재설치(main) 뒤 유효, 임시 --settings 훅으로 worktree 코드 실측 가능.

관련: [[platform-hook-behavior]] (도구별 훅 동작), [[작업-하네스-흐름]] (교차 검증 단계).
## Windows 독립 감시와 실행 경계

2026-11-11 Windows 실측: 에이전트와 자손은 생성 시 이름 없는 Job Object에 포함되고 독립 감시자가 부모 핸들·기한을 확인한다. 부모 또는 감시자가 종료되면 잡 소속 자손을 회수하며 무관 프로세스는 보존한다. 외부 서비스·COM 등이 별도로 생성한 프로세스는 잡 밖이므로 회수 대상으로 보장하지 않는다. 생성 시각이 동률이면 PID 재사용을 구분할 수 없어 안전하게 거부한다.

Windows에서는 PowerShell 5.1의 Add-Type과 스크립트 실행이 허용돼야 한다. 감시자 PowerShell에 프로세스 한정 실행 정책 Bypass를 지정해 기본 Restricted 환경에서도 준비한다. MachinePolicy·UserPolicy 그룹 정책 또는 제한 언어 모드로 감시자를 준비할 수 없으면 에이전트를 실행하지 않고 원인과 공식 환경 확인을 안내한다. npm 명령의 표준 .cmd shim은 내용과 실제 경계를 검증한 뒤 Node로 실행하고 임의 배치는 거부한다. 인증 채널은 로컬 루프백을 사용하며 인증값은 에이전트 환경에 전달하지 않는다.

## Claude ACP 읽기 전용 모드 변경

main의 a3dfdbd는 읽기 전용 모드를 default로 바꿨다. macOS의 어댑터 0.81.1 실측에서 작업 폴더 밖 읽기와 쓰기가 권한 요청으로 도착했고 PACE가 거절했다. 이 관측은 어댑터의 권한 요청 경계에 한정된다. 위 plan 행은 초기 구현의 관측이다.
