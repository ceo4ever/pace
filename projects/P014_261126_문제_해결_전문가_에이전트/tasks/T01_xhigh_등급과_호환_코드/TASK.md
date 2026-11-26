# T01 xhigh 등급과 호환 코드

- 프로젝트: [P014](../../PROJECT.md) · 백로그: [BL261125_01_문제_해결_전문가_에이전트](../../../../backlogs/BL261125_01_문제_해결_전문가_에이전트/BACKLOG.md)
- 상태: 완료
- 사전 검토: v1
- TASK 형식: v2

## 목적

문제 해결 전문가를 명시적으로 최상위 등급으로 배정한다. 구판 CLI에서도 기존 등급·구성원·공유 생성물을 그대로 사용할 수 있게 한다.

## 재료

- BR01 범위와 완료 기준, PROJECT P-1~P-3, `docs/TEAM.md`, `docs/SECURITY.md`, `docs/TESTING.md`.
- 구판 기준 `5cddecd00c68ab61f7e31cd80984dc34517bdc46`. `src/team/store.ts`는 기존 두 위치의 모든 Markdown 역할을 읽고 `src/team/sync.ts`는 각 역할의 고정 native 경로와 관리 표지를 사용한다.
- 선례는 브레인의 ‘저장소 팀 설계와 갱신 흐름’과 TEAM의 필수 역할 표지다. 구판이 읽지 않는 파일로 정보를 분리하고 생성물의 관리 표지도 함께 대조한다.

## 증명 범위

- 판정 주체: 선언된 검사, 구판·신판 CLI 교대 실행 증거, 작업자와 분리된 테스터와 독립 리뷰어다.
- 포함: xhigh 설정·원본·native 생성물·start 인자와 시작 기록, 구판 동기화와 팀 측정, 민감 경로 거부를 증명한다.
- 범위 밖: 실제 구성원 정의·필수 역할 등록·호스트 런타임 관측은 BR06에서 입증한다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | `worker show/set/reset`이 xhigh를 지원한다. Claude는 `claude-fable-5-2/high`, Codex는 `gpt-6.2-astra/medium`이고 xhigh override가 우선한다. 기존 등급의 해석과 자동 배정은 같다(P-2). |
| T-2 | 명시적으로 승격한 역할을 새 팀 목록·동기화·`project start --role`에서 읽는다. 두 native 생성물과 start의 인자·시작 기록에 해당 설정이 일치한다(P-1, P-2). |
| T-3 | 구판이 같은 저장소와 PACE_HOME의 기존 등급·설정·채택 프로젝트 팀 측정을 처리한다. 신판의 xhigh 시작 행도 구판에서 유효한 시작으로 집계되고, 신판 판독기는 실제 원본 경로를 정확히 복원한다. 구판·신판에서 check와 sync를 교대로 반복해도 기존 생성물은 기준 바이트와 같고 xhigh 생성물은 신판이 만든 바이트를 유지한다(P-3). |
| T-4 | 등급·파일 종류·크기·UTF-8·경로를 검증한다. 중복 원본, 잘못된 값, 비관리 출력 충돌·고아 생성물은 거부하고 실패 시 기존 생성물을 보존한다. 위조된 경로·역할 이름의 시작 행과 잘못된 숫자 표지는 거부한다(P-1~P-3). |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | 임시 PACE_HOME, 일반 worker 모델과 기존 등급 override | show와 xhigh 두 필드 set/reset, 무효 등급 set | 기본 매핑·override·초기화 일치, 잘못된 등급 거부, 기존 설정 파일 바이트 유지, 기존 세 등급의 기본 effort가 등급 문자열과 일치 | `test/team.test.ts` |
| S-2 | e2e | T-2 | 명시 승격 reviewer와 일반 역할 픽스처 | list/sync, 두 호스트 project start, 원본 경로·지문 비교 | xhigh만 새 매핑 적용, 커밋 ref와 실행 worktree에서 같은 원본·인자·이벤트 | `test/team.test.ts`, `test/project-role.test.ts` |
| S-3 | e2e | T-3 | 구판·신판이 같은 격리 저장소와 PACE_HOME 사용, 팀 측정 채택과 xhigh 구성원의 조건부 역할 표지 | 구판 기준 생성, 신판에서 xhigh 추가·실제 start --role로 시작 행 기록, 구판·신판에서 list 및 check/sync 교대 2회 후 stats | 종료 0, 일반 생성물 바이트 보존, xhigh 생성물 불변, 시작 행 구판 팀 측정에 포함, 신판은 실제 xhigh 원본 경로 복원 | 고정 구판 checkout 실측과 증거 |
| S-4 | unit | T-4 | 잘못된 파일·값·관리 표지, 링크·과대 파일, 중복·고아, 다른 이름·경로·숫자 표지 위조 | show/set/list/check/sync/start 거부 경로 실행 | 실패 노출과 기존 바이트 보존, 링크 대상에 쓰지 않음 | `test/team.test.ts`, `test/project-role.test.ts` |

## 접근

- 기본안 (가). `PACE_HOME/worker-tiers-xhigh.json`을 기존 `worker-tiers.json`과 분리하고 같은 파일 검사를 적용한다. `pace worker set <host> tier.xhigh.<model|effort> <값>`과 `reset`으로 변경한다.
- 승격 원본은 `.pace/team/agents-xhigh/<name>.md`에 `tier: xhigh`로 둔다. 신판이 세 위치의 중복을 검사한다. 신판은 xhigh 생성물 첫 줄에 구판이 읽지 않는 관리 표지를 쓴다. 신판이 기존·새 표지를 검증하고 허용된 원본을 가리킬 때만 출력 경로를 갱신한다. 승격 후 신판에서 두 생성물을 동기화한 상태가 구판 호환 대상이다.
- `src/project/role-record.ts`의 정확 일치 비교에 같은 역할 이름의 xhigh 경로 한 가지를 추가한다. 독립 검토 및 S-4는 다른 이름·폴더·상위 경로·glob·링크 거부, 크기·UTF-8·파일 종류 검사와 실행 직전 지문 재확인을 포함한다.
- 시작 기록은 기존 원본 경로 슬롯과 `data.xhighRoleDefinition=1`을 같은 JSON 행에 쓴다. 지문·모델·effort는 실제 xhigh 원본과 일치한다. 숫자 표지는 유효한 start의 같은 이름 기본 경로에서만 허용하며 신판의 일반·팀 측정 판독기가 정해진 정확한 xhigh 원본 경로를 복원한다. 경로 문자열·다른 이름·다른 환경 분기에서 표지를 결합하지 않는다. 구판은 기존 경로 슬롯을 읽으므로 시작 행을 집계할 수 있다.
- 구현 후보 경로는 `src/core/worker-tiers.ts`, `src/team/model.ts`, `src/team/store.ts`, `src/team/sync.ts`, `src/project/role-record.ts`, `src/project/event-log.ts`, `src/project/team-input.ts`, `test/team.test.ts`, `test/project-role.test.ts`다.
- SECURITY 검토에서 링크·일반 파일·크기·UTF-8 검사와 원자 쓰기, 외부 입력과 오류 노출을 확인한다. 민감 경로를 독립 검토에 포함하고 선언 검사와 비밀 검사를 실행한다.

## 결정 메모

- (가) 별도 xhigh 원본·생성물 표지를 채택한다 (main 판단). 기준선 구판에서 기존 원본의 `tier: xhigh`는 check 종료 2였다. 기존 등급을 유지하고 native 모델만 바꿨을 때 check 종료 1과 sync의 구판 모델 재기록을 확인했다. `src/project/role-record.ts`의 정확 경로 허용을 BR01 범위에 추가해 호환성과 시작 기록을 함께 증명한다.
- 시작 행을 새 경로로 직접 적으면 구판 stats 종료 2와 로그 손상 오류를 재현했다. 기존 경로 슬롯과 숫자 표지의 조합은 종료 0과 역할 보존을 확인했다. R1의 지적을 반영해 같은 행의 두 판독 경로와 S-3 실제 start 검증을 승인 범위에 추가한다 (main 판단).
