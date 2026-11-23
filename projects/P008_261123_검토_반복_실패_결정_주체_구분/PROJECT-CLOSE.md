# P008 검토 반복 실패 결정 주체 구분 — 마감

- 프로젝트: [PROJECT.md](PROJECT.md) · 마감: 2026-11-24

## 목표 달성 판정

합의된 목표는 상위 목적과 맞고 달성했다. T01은 새 TASK의 증명 범위·판정주체를 기준 앞에 두고 구조 관문과 다른 제공자의 목적·안전 판정을 연결한다. T02는 단계 계산/종료 계약을 보존하면서 PM·사용자·옛 unknown을 구별한다. T03은 조치마다 실제영향을 분류해 일반갭 근본조치·재검증·사후보고와 중대한 영향의 사용자 사전결정을 연결한다. 태스크별 독립 첫판단과 작업문서 대조를 TASK-CLOSE에 연결했다. T03의 최초 실행상 미확인은 행동계획·소스CLI 증거와 독립 재실행 뒤 해소했다.

증명 범위는 worktree 소스·정본의 동작, 실제 다른 제공자의 판정/읽기전용 행동계획, 합성 CLI 승인·수정 순서다. 실제 사용자 승인 진위·운영 모델 일반효과·설치본은 별도다. H 입력은 합의자료가 없어 합의확인 자체 검출력은 없으나 영향 확인 후 PM 분류는 관측했다. 자동부트 일부 노출도 원문에 남겼다. 이것은 계약 밖 일반효과의 한계이며 필수 계약을 축소하지 않았다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| P-1 | 통과 | [T01 마감](tasks/T01_TASK_증명_범위와_판정_주체/TASK-CLOSE.md): 신규/옛형식·구조누락·협소범위·안전/사람대체 판정 실측·전체 회귀 |
| P-2 | 통과 | [T02 마감](tasks/T02_verify_결정_단계와_결정_주체_기록/TASK-CLOSE.md): pm/user/legacy unknown·종료0/16·전체리셋·사용자전용 waiver·결함주입 |
| P-3 | 통과 | [T03 마감](tasks/T03_스킬_절차와_사후_보고/TASK-CLOSE.md): 정본분류·실제 Anthropic 여섯 행동계획·합성 소스CLI 네 경로·승인전후 해시·독립 재실행 |

## 태스크 결과

T01·T02·T03 모두 완료. 각 TASK-CLOSE의 기준·명령·원문·독립 판단·남긴 한계를 함께 인계한다.

## 보안

선언 명령 node scripts/secret-scan.ts 통과; finish에서도 선언검사를 실행한다. 전체 프로젝트 diff를 별도 Anthropic 읽기전용 맥락으로 검토했고 기록은 T03 evidence/security-review.md 및 security-final.md다. blocking0, should_fix는 합성 실행파일의 로컬 홈 shebang 노출1건으로 portable shebang·문서화 가림·네경로 재실행으로 처리했다. 증거의 session_id는 null로 저장했고 합성 승인은 실제 승인 아님을 표시했다.

waiver는 사용자만 가능, 옛 by 미기재를 user로 추정하지 않으며 잘못된 by는 원장손상으로 중단한다. 근거 파일과 조치/승인 진위는 기계검사가 대신하지 않는다. TASK 표지 제거/원장 위조 가능성은 실수예방 관문의 알려진 한계다. 제품의 인증·전송·설치·사용자 데이터 접근은 추가하지 않았다. 실제 프로필은 BR03의 지정 규칙 하나만 정본참조로 갱신했다.

## 정본 반영

| 정본 | 반영 | 비고 |
|---|---|---|
| `templates/project/TASK.md`, `src/project/pre-review.ts`, `src/agent/verify.ts` | 반영 | v2 형식·구조관문·의미판정·기존형식 호환 |
| `src/agent/review-log.ts`, `src/agent/verify-cli.ts`, `docs/AGENT-CALL.md`, `docs/WORK-PROCESS.md` | 반영 | actor·원장·종료·사전검토 계약; `src/cli.ts` 도움말 포함 |
| `skills/pace-project-dev/` | 반영 | reviewer 반복실패 정본과 관련문서·S7 사례·v2 작성지침 |
| `.pace/brain/pages/concept/검토-반복-실패-하네스.md` | 반영 | pace brain update로 proof경계·pm/user/unknown·사전/사후·합성증거 한계 반영 |
| 브레인(`.pace/brain/`) | 반영 | 위 concept 및 `.pace/brain/pages/flow/작업-하네스-흐름.md`에 게이트·책임축 추가. lint 오류0, 기존 stale-source 경고20은 T03 evidence/brain-lint.txt에 원문 보존. 해당 두 페이지 경고없음. 나머지 근거 후보는 이전 날짜와 광범위 sources에 걸린 기존 흐름/설치/부트/검사/지표 주장으로 이번 변경이 그 계약을 바꾸지 않음; 기존 경고를 지우려고 날짜만 갱신하지 않았다. |
| 기본 프로필의 검토-3회-실패-근본-진단 규칙 | 반영 | source CLI memory update 및 PM/tester 지정파일 readback. 상세분류 대신 정본 참조만 유지 |

## 남은 일

병합은 main에서 사람이 승인한다. 승인·병합 뒤 main 담당이 scripts/install.sh로 재설치하고 코디네이터가 설치 CLI의 정상 검토 흐름 하나를 확인한다. worktree에서는 설치·푸시·병합·배포하지 않았다. bubble-catch 두 회차 이내 통과 같은 운영효과는 설치 뒤 측정할 지표로 남긴다.

기존 Orca 메뉴 E2E·전체검사 불안정 이슈는 메모리에 유지한다. main의 S4b·S9g 시험 수정과 Orca 전체검사 browser E2E 제외 규칙을 반영했으며 제외범위를 숨기지 않았다. PACE_SKIP_BROWSER_E2E=1은 중첩 playbook E2E4개를 제외하고 집계 skip17과 구별한다. T02 rebase 전 백업·stash는 유지했다.

## 회고

구조 누락 뒤 제한재검토가 미평가 안전을 숨길 수 있음을 실제 검토로 발견해 전체 검토로 열었다. full 회귀 불안정은 원문과 격리 실행창을 보존해 제품 실패·환경 추정·검사 계약을 구별했다. 행동계획과 synthetic 기계증거를 따로 남긴 덕분에 운영 효과를 과장하지 않았다.

## 지표

[지표 집계](METRICS.md)

세 태스크의 반복 검토·검사 재시도는 지표에서 비용으로 드러난다. 초기 full 회귀 불안정과 독립 검토의 추가 확인을 포함하므로 순수 구현 시간이나 설치뒤 개선 성과로 해석하지 않는다.

## 배포

해당 없음. 병합·설치는 main의 사람 승인 뒤 수행한다.
