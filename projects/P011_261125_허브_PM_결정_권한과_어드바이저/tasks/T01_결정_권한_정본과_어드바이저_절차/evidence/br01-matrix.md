# BR01 범위 대조

| BR01 항목 | 반영 위치 | 관찰 기준 |
|---|---|---|
| A-1 합의 변경 | `decision-rights.md` A-1, `goal-review.md` 마감 | 기준 문구와 실질 결과를 함께 대조한다. 영향 불명 시 해당 조치만 보류하고 독립 작업은 진행한다. 필수 결과 축소는 owner가 결정한다. |
| A-2 복구·외부 영향 및 S1 | 정본 A-2와 실행 전 승인 확인, B 두 번째 단계, `workerSpec` | 승인된 동일 대상과 기존 위임을 적용한다. 푸시·병합·배포의 승인과 실행을 분리하고 작업자 직접 실행 금지를 유지한다. |
| A-3 안전 기준 및 B1 | 정본 A-3·B1, `cross-verify.md`, `reviewer.md`, `task-steps.md`, `goal-review.md`, `verify.ts` | 다른 제공자 미실행, 같은 제공자 새 세션, 양쪽 미실행을 구별한다. BL04 전 blocking 수용 및 필수 증거 미확인은 owner 결정 범위다. |
| A-4 사용자 자산 | 정본 A-4, `skills/pace-team/SKILL.md` 설계 | 새 유료 비용·사용자 데이터 외부 공개는 owner에게 요청하고 기존 위임 내 읽기는 PM이 진행한다. |
| A-5 사람이 수행 | 정본 A-5와 실행 전 승인 확인 | 사람의 실기 확인을 요청한다. 이미 받은 원문은 별도 확인에서 대상과 대조한다. |
| 실행 전 승인 확인 | 정본 실행 전 승인 확인, `SKILL.md` §4, `reviewer.md` ask_user·사전 검토 기록 | 허브는 푸시·병합·배포, 워크트리 PM은 waiver·review-note의 입력 전에 원문과 대상을 확인한다. 원장 프로젝트는 decision_request/reply와 원문 지문의 영수증을 사용한다. `approved`는 위임의 basis에만 쓴다. 원장 없이 진행하는 프로젝트는 프로젝트 내부 근거 파일을, 프로젝트 밖은 로컬 `$PACE_HOME/approvals/`에 원문·출처·대상·범위·지문을 둔다. 모두 절차 문서다. |
| B 허브의 공동 장애 대응 | 정본 B, `coordinator.md` 메시지별 처리·공유 자원, `SKILL.md` §4·§6, `e2e.md`, `verification.md`, `reviewer.md` | 증거·재현, 원인, 결정·근거 회신, 적용·재검증 후 재개. 공동 시도 2회는 가정이고 BL04의 검토 회차와 구분한다. 병합 대기 중 main 커밋은 미룬다. |
| C owner 보고 | 정본 C, `coordinator.md` 기다리기 루프·결정과 근거 | 결정 요청, 특정 대상의 승인 요청, PM 결정의 사후 요약. 원장 프로젝트의 요약은 `status`다. 원장 및 project log의 수신자·기존 자원 해제 근거 규칙을 대조했다. |
| 참조와 설치본 안내 | `templates/RULES.md`, `docs/WORK-PROCESS.md`, `docs/AGENT-CALL.md`, `src/cli.ts`, `src/agent/review-log.ts`, `.pace/brain/` 두 페이지 | 정본 우선은 프로필 rule과 일반 결정 규칙 위에 적용하며 S1을 포함한다. 검토 단계·종료 코드·JSON 필드의 동작은 유지한다. |
| 팀 계약과 역할 지시 | 팀 원본 전부, `templates/team/member.md`, `skills/pace-team/SKILL.md`, `src/team/store.ts` | 계약 v1 원문 바로 뒤에서 조사, HANDOFF 수신자·호출자, 독립 작업 진행을 설명한다. workerSpec과 원본·템플릿의 워크트리 권한 경계가 일치한다. |
| 팀 호스트 동기화 | [팀 목록](team-list.txt), [동기화 검사](team-sync-check.json), [적재 관측](team-verify.txt) | 원본 4개, 생성물 차이 0건, Claude·Codex의 원본 prompt 적재 판정 8건 통과. |
| 금지 문구·정적 검사 | `test/project-dev-skill.test.ts`, `test/project-role.test.ts`, `test/agent-verify.test.ts`, `test/agent-review-log.test.ts` | BR01의 대상 파일에서 기존 문구를 거부한다. 승인 입력·워크트리 역할·도구 오류 안내의 조합을 대조한다. |

BR01은 PM 결정·사람 인증의 도구 집행을 별도 범위로 뒀다. 실제 Orca 장애 대응의 왕복 관측은 병합 후 인수에서 한다.
