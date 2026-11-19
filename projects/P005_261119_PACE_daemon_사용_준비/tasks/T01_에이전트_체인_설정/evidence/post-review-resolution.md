# T01 독립 마감 검토 지적과 처리

## 출처·독립성·판정 범위

main이 작성자·사전 검토와 분리된 두 Claude 세션에서 tester와 reviewer를 각각 수행했다. 실제 제공자 anthropic, 보고 모델 claude-opus-5-5. 각 세션에서 1단계 관측 판단을 먼저 기록한 다음, 같은 세션에 TASK·PROJECT·BR01 및 소스 발췌를 주어 2단계 대조했다. 원문 네 개는 post-tester-phase1/2.md, post-reviewer-phase1/2.md에 보존했다.

tester·reviewer 모두 명령을 직접 실행하지 않았고 관측 요약과 코디네이터의 직접 확인 및 제공된 소스 발췌에 근거했다. 전체 검사와 증거 원문 전체를 직접 검증한 것으로 과장하지 않는다. 최초 최종 상태는 tester 보류, reviewer pass blocking 0(S-5 보류)이며 양쪽 T-1~T-3과 T01 목표 달성은 확인했다. 전체 검사 종료 원문 수신 후 같은 두 세션의 최종 판정을 요청한다.

후속 최종 판정은 같은 두 세션에서 모두 pass blocking 0으로 회수했다. 원문 post-tester-final.md, post-reviewer-final.md. 전체 검사 원문 발췌·skip 9·사전 pass 연결·지적 처리를 대조했고 main이 로그 SHA-256·최종 집계 및 현재 TASK 해시 일치를 직접 확인했다. 관측 한계와 handoff는 그대로 유지한다.

## should_fix 처리

1. **모듈 연결(tester):** readonly-observations.json의 각 실행기에 S-0 moduleHash와 확인 범위를 연결했다. 초기 CLI 시험은 spawn 직전 동일 해시를 확인했고, Claude 긴 경로 재시험은 같은 설치본을 재사용했다. 긴 경로 재시험 직전의 별도 해시 출력은 없으며 이후 운영 반영 전후·실체인 호출에서 같은 해시를 확인했다는 한계를 명시했다. 기록하지 않은 과거 시점의 새 실측을 만들어 쓰지 않는다.
2. **사전 pass 연결(tester):** PRE-REVIEW.json의 마지막 anthropic pass·blocking 0·continuity same과 현재 TASK 정규화 해시 일치는 main이 직접 확인했다. 원본은 pre-review-2.md, pre-review-2-task.md이고 프로젝트 review 로그가 운영 반영보다 앞선다. TASK는 검토 대상 해시 보존을 위해 사후 경과 문구로 고치지 않는다.
3. **Claude 외부 경로 양성(tester/reviewer F3):** 양성 raw 결과는 작업 폴더 밖 파일에 쓰기 권한이 부여되지 않았다고 보고했고 실제 outsideProbeExists=false였다. acceptEdits의 작업 폴더 밖 권한 경계에 걸렸다는 것은 추정이며 일반적인 외부 쓰기 불가를 단정하지 않는다. 읽기 전용 차단의 근거는 모든 쓰기·셸 도구가 CLI init 목록에서 빠진 사실이다. 외부 경로 양성 성공으로 판정하지 않는다.
4. **Git 양성 관측 불일치(reviewer F1):** 음성은 local Git 변경 부재 및 Codex 실제 permission denied를, 양성은 임시 GIT_CONFIG_GLOBAL 주입 및 기존 전역 파일 보존을 측정했다. 같은 대상을 양성에서 허용했다고 입증하지 못했다. 양성 raw에서도 두 실행기의 local git config는 승인 또는 권한 오류로 실패했다. local Git 허용 대조는 미확인으로 유지한다. 대체 차단 근거는 Claude 셸 도구 미노출·Codex gitDenied 원문이다. 동일 시험을 반복하지 않는다.
5. **적용 전 계획(reviewer F2):** 승인 전 질문·TASK와 기존 resume-checklist.md에 설치본·기본 프로필·명령·순서·신규 어댑터 제외 계획을 명시했고, main의 캡틴 승인 전달 직후 answer·decision 로그를 적용보다 먼저 기록했다. 실제 적용 스크립트는 대상 기본 프로필·기존 파일·모듈 해시 확인 → detectAgents로 설치·로그인·ACP 모드 확인 → 파일 동시 변경 및 해시 재확인 → setup 실행 순서였다. 별도 'setup 계획 출력' 원문은 이 CLI가 제공하지 않아 없으며 적용 후 결과를 적용 전 출력으로 주장하지 않는다. 근거는 기존 계획·승인 로그 및 operational-chain-apply.json의 before/감지 상태다.
6. **ancestry 의미(reviewer F4):** s0-installation.json에 실제 명령 `git merge-base --is-ancestor f385e03b v0.1.1`과 exit 0 의미를 추가했다.

## handoff

- T03·T04: Windows 8.3 짧은 경로에서 Claude 읽기 승인 요구가 발생했으므로 daemon 환경의 실제 경로·PATH·인증·설치본 동일성을 확인한다. 긴 경로 성공을 짧은 경로 성공으로 대신하지 않는다.
- 실제 Codex fallback 전환은 유도하지 않았다. 개별 Codex 읽기·차단 및 모사 체인 회귀와 실제 default 첫 단계 성공을 구분한다. 합의 기준 밖의 개선 검증이므로 이후 필요 시 별도 선택한다.
- Claude 사용자 hook·설정은 이 시험에서 완전 격리하지 않았다. 도구 제한·strict MCP 설정을 전체 OS 쓰기 금지 보장으로 넓히지 않는다.
- READ_ONLY_PROVEN의 기존 실측 버전 주석과 현재 검증 버전 차이, 버전 변경 시 자동 재시험이 없는 점은 코드 변경 제외 범위다. T01에서는 현재 버전 실측 기록을 남겼고 개선은 별도 메모리로 발의한다.
