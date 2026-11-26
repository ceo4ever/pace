# BR06 문제 해결자 요건 대조

필수 역할 점검의 등록 및 정의 대조 형식을 적용했다. 정본 담당은 BL261125_01 BR06이며 이 표의 모든 행은 버전 1의 고정 요건이다. 선행 T01의 등급 호환과 T03·T07의 호출 증거를 현재 저장소 CLI와 두 호스트에서 확인했다. TS-01~06과 호출 절차 요건의 최종 병합 대조는 PROJECT-CLOSE에서 한다. [정본](../../../../../skills/pace-team/references/required-roles.md#문제-해결자-요건)

## 등록 대조

| 원형 | BR06 합의 항목 | 요건 ID·버전 | 등록 상태 |
|---|---|---|---|
| 문제 해결자 | 정의·결정 수신자 | TS-07 v1 | 등록 |
| 문제 해결자 | 구성원 이름·역할 종류 | TS-08 v1 | 등록 |
| 문제 해결자 | 등급·owner 지정 모델과 effort | TS-09 v1 | 등록 |
| 문제 해결자 | 지침의 판단 기준 | TS-10 v1 | 등록 |
| 문제 해결자 | 반환 계약 | TS-11 v1 | 등록 |
| 문제 해결자 | 수정·결정·판정의 금지와 독립 관문 | TS-12 v1 | 등록 |
| 문제 해결자 | 모델 거부 처리 | TS-13 v1 | 등록 |
| 문제 해결자 | 두 호스트의 실제 적용 관문 | TS-14 v1 | 등록 |
| 문제 해결자 | 호출 위치·수단과 조건부 필수 표지 | TS-15 v1 | 등록 |

## 정의 대조

아래 역할은 모두 [.pace/team/agents-xhigh/pace-troubleshooter.md](../../../../../.pace/team/agents-xhigh/pace-troubleshooter.md)다.

| 원형 | 역할 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 문제 해결자 | `pace-troubleshooter` | TS-07 v1 | 충족 | 원본 `맡는 일`·`인계·결정 요청·완료 보고`의 해결안·검증·호출 PM·정본 A |
| 문제 해결자 | `pace-troubleshooter` | TS-08 v1 | 충족 | 원본 frontmatter, [팀 목록](team-list.md), [두 생성물 대조](team-contract.json) |
| 문제 해결자 | `pace-troubleshooter` | TS-09 v1 | 충족 | 원본 xhigh·생성물 매핑, [T01 원장 근거](../../T01_xhigh_등급과_호환_코드/TASK-CLOSE.md), [호스트 관문](runtime-gate.json) |
| 문제 해결자 | `pace-troubleshooter` | TS-10 v1 | 충족 | 원본 `맡는 일`의 목표·원문·재현과 반증·층·부류 대조 |
| 문제 해결자 | `pace-troubleshooter` | TS-11 v1 | 충족 | 원본의 반환 계약, [독립 사례 판정 및 응답](eval-results.md) |
| 문제 해결자 | `pace-troubleshooter` | TS-12 v1 | 충족 | 원본 `하지 않는 일`·`실행 전 대조`, [템플릿·검증 표지 대조](team-contract.json) |
| 문제 해결자 | `pace-troubleshooter` | TS-13 v1 | 충족 | [호스트 거부 및 시간 초과 대조](model-availability.json), [호출 절과 PM 보류](../../../../../docs/TEAM.md#문제-해결자-호출과-실제-적용) |
| 문제 해결자 | `pace-troubleshooter` | TS-14 v1 | 충족 | [호스트 관문](runtime-gate.json)의 실제 모델과 실제 effort, [수단 설계 실측](route-probes.md) |
| 문제 해결자 | `pace-troubleshooter` | TS-15 v1 | 충족 | [조건부 표지](../../../../../.pace/team/required-roles.json)와 [위치·제공자 표](../../../../../docs/TEAM.md#문제-해결자-호출과-실제-적용) |
