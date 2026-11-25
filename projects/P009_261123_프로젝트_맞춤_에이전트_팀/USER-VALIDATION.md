# 설치 후 사용자 현장 검증 — T08 인계

- 현재 상태: **미실행·보류**. 이 문서는 실행 절차이며 현장 통과 증거가 아니다.
- 결정: 2026-11-24 사용자 결정(코디네이터 전달). P009 기능/시험/인계 마감 → main 코디네이터 병합 → main에서 로컬 설치 → 사용자가 실제 두 저장소에 적용하고 결과를 보고한다.
- 원 기준: [BR08](../../backlogs/BL261123_01_프로젝트_맞춤_에이전트_팀/BR08_첫_적용(roblox-studio_이전·새_저장소).md). 기준은 보존하며 이 인계로 완료 처리하지 않는다.
- 기준선: [T01 마감](tasks/T01_역할_적재_실측과_도입_전_기준선/TASK-CLOSE.md), 같은 태스크의 evidence에 있는 baseline-roblox.json·baseline-ai-sql-client.json·baseline-roblox-reachability-v2.json. 원본을 덮어쓰지 않는다.

## 실행 전

병합된 main의 소스를 설치한 뒤 새 세션을 연다. worktree에서 설치하지 않는다. 실제 앱의 설치·테스트·커밋·배포 권한은 각 저장소 AGENTS.md와 계약을 따른다. P009의 병합 사전 승인은 두 앱의 변경·배포 승인으로 재사용하지 않는다.

| 저장소 | 분석 자료와 첫 적용 |
|---|---|
| roblox-studio | /Volumes/Data/AiStudio/workspace/roblox-studio. AGENTS.md·docs/README.md·기존9역할 정의를 먼저 대조한다. 기존 의미를 보존하는 이전 계획을 검토하고 bubble-catch의 새 프로젝트에서 athena 역할 시작을 관측한다. |
| ai-sql-client | /Volumes/Data/AiStudio/workspace/ai-sql-client. AGENTS.md·docs/PROJECT.md·docs/DESIGN.md를 읽는다. 개발 코드는 workspace/ 아래이고 실제 Claude 통합 시험은 별도 비용 확인 항목이다. T01과 같은 종류/크기의 내부 검토 문서 업무로 먼저 적용한다. |

T07 마감에 연결된 두 설계·업무/검토 담당 대응표와 검증 기록을 사용한다. 저장소나 요구가 바뀌었다면 설치된 pace-team 스킬로 분석·인터뷰부터 다시 대조한다. 프로필 비서와 저장소 팀을 섞지 않는다.

## 팀 이전과 준비

1. 실제 저장소 HEAD·정의서·AGENTS·현재 native 역할 파일의 지문을 먼저 남긴다. 기존 native 원본과 .pace/team 원본/생성물 대응표를 만든다.
2. roblox의9역할은 기존 책임·금지·인계·owner 결정 경계를 보존한다. 차이가 있다면 어떤 의미가 달라지는지 사용자에게 확인하고 근거를 남긴다. 의미 차이0은 실제 원본 대조로만 보고한다.
3. 기존 파일이 foreign로 판정되면 sync의 거부를 우회하지 않는다. 보존/백업 및 전환 대상·설정 diff를 검토한 뒤 승인된 범위만 이전한다. 불필요 파일/도구의 삭제는 **제안 목록**으로만 남긴다.
4. AI SQL은 [T07의 업무 맞춤 설계](<tasks/T07_pace-team_스킬(분석·인터뷰·설계)/team-designs.md>)를 적용한다. 같은 문서에서 Roblox 역할과 권한을 대조한다. 필수 업무 담당 누락0·필요한 독립 검토 누락0을 대응표로 확인한다. 역할 수 자체를 합격 기준으로 쓰지 않는다.
5. 두 저장소에서 `pace team sync` 후 `pace team sync --check --json`의 exit와 전체 diff를 남긴다. `pace team verify <역할> --agent claude`·`--agent codex`는 [TEAM](../../docs/TEAM.md)의 prompt 적재 검증이며 실제 업무의 native 역할 유지 증거와 구별한다. 실행 범위/등급과 호출 수를 정해 비용을 기록한다.

## 첫 설치본 사용 시험

사용자와 제우스는 한 저장소부터 시작한다. 첫 대조는 AI SQL의 대표 문서 업무를 기본으로 잡았으며, 사용자가 Roblox를 선택할 수 있다. main 코디네이터의 병합·설치 뒤 실제 설치본에서 `pace-team`의 진입, 업무 판정, 독립 제공자와 승인 질문을 함께 확인한다. 적용이 정해질 때까지 원본 저장소는 읽기만 한다. 실제 앱의 유료 호출, 데이터 쓰기, Studio 자원과 배포는 각 승인 범위를 확인한 뒤 T08에서 관측한다.

## 실제 업무 순서

각 저장소에서 대표 업무의 목적·작업 크기·시작/끝과 판정자를 먼저 정하고 새 프로젝트/작업 계약으로 수행한다. 아래 네 칸을 각각 새 호스트 맥락에서 관측한다.

| 저장소 × 호스트 | 현재 결과 | 필요한 증거 |
|---|---|---|
| roblox × Claude | 미실행·보류 | 역할 실제 적재·새 요청·인계/독립 검토·owner 관문·Studio 직렬화 |
| roblox × Codex | 미실행·보류 | 역할 실제 적재·새 요청·인계/독립 검토·owner 관문. Studio N/A는 실제 도구/권한 근거가 있을 때만 |
| AI SQL × Claude | 미실행·보류 | 실제 역할·대표 문서 업무·인계/독립 검토·owner 관문 |
| AI SQL × Codex | 미실행·보류 | 실제 역할·대표 문서 업무·인계/독립 검토·owner 관문 |

- 역할 지정 자동화: 새 프로젝트에서 `pace project start P### --agent <claude|codex> --role <역할>`을 사용한다. 시작 인자·요청 model/effort와 호스트가 실제 보고/사용한 값은 별도 열로 기록한다. 재지시·파일 보정이 필요하면 원래 실패를 지우지 않는다.
- 기본 템플릿 또는 실제 팀에 새로운 업무 요청을 준다. T04의 기존6응답 재평가를 최종 생성기의 새 정상 호출로 재사용하지 않는다. CRLF/새 요청의 동작과 제한은 실제 관측대로 남긴다.
- 작성자와 다른 역할·필요한 다른 제공자가 검토한다. 역할명만 다른 같은 실행을 독립 검토로 세지 않는다. 사용할 수 없는 제공자는 미실행으로 보고한다.
- owner의 결정/승인 전에는 해당 범위의 실행이 시작되지 않았다는 증거를 남긴다. 결정 주체가 다른 worker의 done만으로 종결하지 않는다.
- 각 저장소에서 한 번은 범위 밖 또는 근거가 불명확한 위임을 넣고 **실행 전 hold·결정 요청**을 관측한다. 실제 파괴적 동작을 수행해 시험하지 않는다.
- 대표 위임1개가 원문/해석 확인 → delegate → scope_check → result → decisionOwner의 close로 같은 원장에서 추적되어야 한다. partial/blocked를 완료로 바꾸지 않는다.
- roblox Claude의 실제 Studio MCP 작업을 참여 잠금으로 직렬화한다. 임시 fake 통과나 오래됐다는 이유의 잠금 회수를 실제 자원 종료 확인으로 대체하지 않는다. 직접 잠금을 우회한 작업까지 시스템이 막았다고 보고하지 않는다.

## 기록 위치와 원문 경계

실제 실행 증거는 **각 적용 저장소의 새 작업/검증 기록** 아래 evidence/p009-adoption/처럼 구분해 둔다. 기록의 실제 경로·HEAD·파일 지문을 보고서에 적는다. 끝난 T01 기준선과 원 BR08에 실적을 덧붙여 원본을 바꾸지 않는다. 결과를 코디네이터에게 보고하고 원 보류 항목의 후속 처리는 그 기록과 연결한다.

[HANDOFF](../../docs/HANDOFF.md)의 원문 보존·등록·승인·전송·종결 계약을 따른다. 사람 원문·상세 답/결과·전송 payload는 Git common dir의 pace/handoffs/<project-key>/bodies/<SHA256>.md에만 두고, 버전 관리 원장에는 ID·지문·출처 metadata만 남긴다. 다른 clone에 원문이 없으면 원문 재감사 불가를 표시한다.

| 묶음 | 남길 내용 |
|---|---|
| source/ | 저장소·HEAD·실제 원본/생성물/설정의 지문과 의미 diff. 비밀 설정 본문은 복사하지 않음 |
| cells/ | 네 칸의 실제 실행기/host·역할·모델 출처·도구/권한·새 요청/범위 보류·완료/실패/미확인과 증거 위치 |
| communication/ | 원장/요청/승인/위임/종결 ID 및 지문. 실제 Orca 메시지·서브에이전트 호출과 대조한 누락 수 및 수집 범위 |
| measurement/ | 원 stats JSON·관측/신고 total·TEAM-MEASUREMENT metadata·typed 영수증·기간별 로그 수집 확인·추가 표본 계획 |
| comparison/ | 원본 지문 고정 입력·별도 맥락/감사 자료·compare-team 출력/exit·미확인 사유 |
| retrospective/ | PROJECT-CLOSE 회고의 팀 행·TEAM-RETROSPECTIVE.json과 pace-team 회고 실행/사용자 결정·실제 반영 diff |

## 비교와 회고

roblox의 T01 조건은 이미 팀이 있는 **message-role → start-role** 비교다. 이를 팀 도입 전 자료로 바꾸지 않는다. AI SQL은 **no-team → team** 비교이며 T01의 문서 범위·Codex prompt 맥락과 새 native 실행 맥락의 차이를 드러낸다. Claude의 같은 조건 기준선이 없으면 없는 것으로 표시한다.

`pace project stats P### --json` 원본과 [TEAM-METRICS](../../docs/TEAM-METRICS.md)의 비교 계약을 사용한다. 원본 v1 기준선의 captain_* 키는 그대로 보존하고 새 출력은 owner_*다. 근거 없는 null을0으로 채우지 않는다. 새 수집 완료와 품질은 요청/로그 각각 같은 기간 확인 근거가 필요하다. 영수증 purposes는 completion·request-coverage·log-coverage·quality-audit·각 손작업 키를 구분한다. 전체 수집 영수증에는 requestId/decisionReplyId를 넣지 않는다. 개별 답은 같은 requestId의 owner-answer/coordinator-answer 근거를 별도로 둔다. 대표 업무는 완료 영수증의 representative-scope 출처로 단독 업무 수집 범위를 확인한다. 타 태스크나 미귀속 자료가 섞이면 관측과 사유를 남기고 총량·방향은 미확인으로 둔다. 같은 요청의 질문 로그와 원장이 모두 있으면 로그 ref의 team-evidence에서 실제 handoff 행 ID·requestId·bodyHash를 대조한다. 명시 태스크와 시각이 맞는 거울만 연결하고, 같은 ID뿐인 질문이 있으면 도달 관측과 비교 총량을 구별한다. 목적 없는 영수증은 총량 권한이 없다. 전체 기간의 실제 성공 start/merge와 비교용 완료 영수증도 구별한다. 비교용 JSON을 옮길 때 snapshot의 completionProofSha256과 같은 영수증을 함께 옮긴다. 지문이 없거나 영수증이 누락·교체되면 관측을 보존하고 그 표본의 총량과 비교 방향을 보류한다. stats 표본은 snapshot.requestCoverage의 확인·지원 영수증과 deliveryClaims도 보존한다. 비교는 같은 저장소의 제공 표본에 걸쳐 외부 전송 증빙의 재사용을 대조한다.

```sh
pace project compare-team --before <before.json> --after <after.json> --kind role-automation --json
pace project compare-team --before <before.json> --after <after.json> --kind team-adoption --json
```

두 저장소·호스트·정의 수정 표본을 하나의 N으로 합치지 않는다. N은 같은 조건에서 실제 서로 겹치지 않는 표본 기록 수다. 한 사례, 업무 크기/단위/host 차이, 품질/수집 누락은 unknown 사유와 같은 조건의 추가 표본 계획을 남긴다. 기계 출력 unknown은 실제 네 칸의 미실행을 통과로 바꾸는 근거가 아니다. 관측 부담 감소를 팀의 인과 효과나 사람/에이전트 순위로 표현하지 않는다.

요청 수집 확인자는 실제 닫힌 구간 입력을 대조한 후 `stats --json`의 `team.requestCoverageInputHash`를 읽고, 별도의 `request-coverage:audit:work-log-approval` 같은 출처 영수증에 그 지문과 구간을 기록한다. 입력이 바뀌면 해당 구간을 다시 대조해 확인한다. 옛 확인으로 집계되지 않는 총량은 미확인으로 기록한다.

최소 한 프로젝트에서 설치된 pace-team 스킬의 회고 단계로 미사용 **후보**·반복 지적을 읽고 정의 변경1~3개 또는 무변경 이유를 사용자에게 제시한다. 실제 결정과 반영/미반영을 기록한다. 형식 통과를 실제 회고 실행이나 수정 승인으로 바꾸지 않는다. 새 기계 회고 구간은 템플릿 ATX 제목/3열 팀 행을 사용한다.

## 사용자 보고 양식

| 항목 | 실제 결과·증거 경로 |
|---|---|
| 설치 소스/버전과 두 저장소 HEAD | 미실행 |
| 팀 이전 의미 차이0 또는 승인된 차이 | 미실행 |
| sync/verify 범위·exit·모델 보고 출처 | 미실행 |
| 네 칸 실제 실행·독립 검토·승인 전 미실행 | 미실행 |
| 두 저장소의 범위 밖 위임 실행 전 hold | 미실행 |
| 위임→결과→판정 주체 종결과 누락 수/수집 범위 | 미실행 |
| 역할 재지시·파일/명령 보정·정상 배정/승인·자체 답 | 미실행, 미수집은 null |
| Studio 실제 직렬화·Codex N/A의 실제 근거 | 미실행 |
| 저장소별 비교 목적·동일성·N·결과/unknown 사유·추가 계획 | 미실행 |
| 스킬 회고 실행·owner 결정·실제 정의 반영 | 미실행 |
| 미해결 결함/미확인·후속 처리 | T08 보류 유지 |

보고는 요약과 지문/위치만 공유한다. 원문·비밀을 표나 Git 문서에 복사하지 않는다.

팀을 명시 채택한 프로젝트의 소통 요약·팀 측정에는 중계 전체의 시각 검사가 적용된다. 미채택 프로젝트의 기존 소통 요약은 기존 신고 집계이므로 팀 비교 입력과 구별해 읽는다.
