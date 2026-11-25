# R23 이후 처분

| 판단 | 결과 | 처분·근거 |
|---|---|---|
| R23 | fail3/SF1 | 실패만 남은 요청은 비교 미해결 및 별도 총량으로 분리, 응답 영수증의 선언 ID/기간 대조, finish tree 결합 추가. 실제 역할 존재도 대조. pm-r23-impact.md |
| tester16 | fail1/SF0 | 잘못된 URI 말미의 HTML을 제목으로 숨기지 않도록 실제 목적지/선택 제목 문법 대조. quoted title·nested URI·실제 이름의 정상 대조 유지 |
| R24 | fail1/SF2 | ignored 회고/근거가 빠지는 경로를 최종 인덱스 입력 대조로 차단. 기존 동명 링크는 팀 채택 때만 관리. 제안 의미/역할 내용의 사람 대조는 한계로 남김. pm-r24-impact.md |
| tester17 | fail3/SF1 | 호출 간 승인 SHA 고정, 검사 후 staged/unstaged 변경 보류, 기존 동명 링크 호환, 소유 worktree 없는 FF 전 거부의 main 오염 방지. FF 뒤 복구 로그는 유지 |
| R25 / tester18 | 회수 중 | 동일 대상 impl-diff.patch와 원장. 목표 미달 상태에서 done하지 않음 |

R24 소스35개 지문 불변의 전체1227개(1210통과/17보류), 집중97은 과거 후보다. R25 집중101 및 추가 응답 선후1개가 통과했고 타입 검사도 통과했다. 첫 집중100/101 실패는 base의 true 검사 선언을 사용하는데 worktree 선언만 바꾼 합성 fixture 오류였으며 base 선언을 설정하도록 고쳤다. 첫 실패 출력은 focused-r25-fixture-base-mismatch.txt에 남겼다.

SF: 정의 변경의 role은 실제 원본/참여 기록의 이름만 허용한다. 변경/이유 영수증의 실제 제안 의미를 자동 판정하지 않으며 BR07에서 사람이 역할·제안을 함께 검토한다. 범용 영수증을 제안 의미의 인증으로 표시하지 않는다. 새 role-bound metadata 계약은 이번 범위를 확장하지 않고 후속 후보로 남긴다.
