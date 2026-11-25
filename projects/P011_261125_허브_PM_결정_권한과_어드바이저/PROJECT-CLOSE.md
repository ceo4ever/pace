# P011 허브 PM 결정 권한과 어드바이저 — 마감

- 프로젝트: [PROJECT.md](PROJECT.md) · 마감: 2026-11-25

## 목표 달성 판정

달성. 허브와 워크트리 모두 하나의 정본을 적용한다. owner 요청을 다섯 항목에 묶고, 허브의 장애 조사·결정 회신과 워크트리의 적용·재검증 경로를 이어 붙였다. 새 맥락에서 각각의 경로와 사람 승인 입력의 올바른 진행·보류를 관측했다. [T01의 독립 검증과 원응답](tasks/T01_결정_권한_정본과_어드바이저_절차/TASK-CLOSE.md)

공동 시도 2회는 초기값이다. 실제 Orca에서 한 요청이 왕복해 재검증·재개로 닫히는지와 owner 개입 총량은 현장 인수 범위다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| P-1 | 통과 | [정본](../../skills/pace-project-dev/references/decision-rights.md), [BR01 대조표](tasks/T01_결정_권한_정본과_어드바이저_절차/evidence/br01-matrix.md) |
| P-2 | 통과 | 정본 연결 대상 19개, 기존 올림 문구 0건, 미실행·반복 검토 안내 시험. [T01](tasks/T01_결정_권한_정본과_어드바이저_절차/TASK-CLOSE.md) |
| P-3 | 통과 | 결정 권한 15/15, 기존 S1~S7 하위 사례 포함 회귀 17/17. [T01 행동 평가](tasks/T01_결정_권한_정본과_어드바이저_절차/TASK-CLOSE.md#e2e) |
| P-4 | 통과 | 일반·역할 workerSpec, golden과 팀 원본 대조, 구조 시험에서 역할 지시 변형 3건 검출. [T01](tasks/T01_결정_권한_정본과_어드바이저_절차/TASK-CLOSE.md) |
| P-5 | 통과 | 팀 계약 v1 보존, 원본 4개, 생성물 차이 0, Claude·Codex prompt 적재 8/8. [T01](tasks/T01_결정_권한_정본과_어드바이저_절차/TASK-CLOSE.md) |

## 태스크 결과

[T01](tasks/T01_결정_권한_정본과_어드바이저_절차/TASK-CLOSE.md) 완료. 태스크 검사와 커밋 게이트에서 기준 다섯 개와 증거 파일 16개를 확인했다.

## 보안

`node scripts/secret-scan.ts`가 통과했다. 독립 판단 검토에서 최종 차단 지적은 0건이다. 민감 경로 두 곳은 작업자·역할 지시 문자열만 바꿨고, 승인 입력·검토 원장·팀 계약의 기계 관문은 기존 거부 조건을 유지했다. 승인 원문 진위는 입력자가 확인한다. 합성 행동 시나리오와 원응답에서 자동 첨부 계정 값 한 건을 가린 뒤 커밋 사본을 대조했다. [T01 리뷰](tasks/T01_결정_권한_정본과_어드바이저_절차/TASK-CLOSE.md#리뷰)

## 정본 반영

| 정본 | 반영 | 비고 |
|---|---|---|
| `skills/pace-project-dev/references/decision-rights.md` | 반영 | A·두 층·B·C |
| `skills/pace-project-dev/` | 반영 | SKILL·참조·행동 회귀 |
| `src/project/harness.ts`·workerSpec golden | 반영 | 결정·장애 지시와 역할별 시험 |
| `src/agent/verify.ts`·`src/agent/review-log.ts`·CLI 도움말 | 반영 | B1, A-3, 원장 단계 안내 |
| `.pace/team/agents/`·`templates/team/member.md`·`skills/pace-team/SKILL.md`·`src/team/store.ts` | 반영 | 계약 v1 보충과 Claude·Codex 생성물 동기화 |
| `templates/RULES.md` | 반영 | 하네스에서 정본 우선 |
| `docs/WORK-PROCESS.md`·`docs/AGENT-CALL.md` | 반영 | 영향 분류와 도구 안내 |
| 브레인(`.pace/brain/`) | 반영 | 결정 분류 정본과 공동 시도 단위의 이유를 두 페이지에 반영 |

## 남은 일

main에서 owner의 병합 승인을 확인한다. 병합·main 재설치 후 실제 Orca 장애 대응 1건을 [프로젝트 메모리의 인수 항목](../../.pace/memory/p011-병합-후-orca-장애-대응-인수.md)으로 이어간다.

## 회고

독립 응답에서 빠진 사후 요약, 병합 대기 우회, 반복 검토 단계의 경계를 앞 차수와 대조해 문구를 보완했다. 역할 지시의 전체 본문과 인계 대상을 변형 시험으로 확인했다.

| 구분 | 입력 | 요약 |
|---|---|---|
| 팀 | [팀 회고](TEAM-RETROSPECTIVE.json) | 로컬 검토·시험 관측과 실제 역할 참여 집계의 범위가 다르다. 관측되지 않은 역할은 미확인으로 두고 독립 판정의 반복 지적을 연결한다. |

## 지표

[지표 집계](METRICS.md)

태스크 1개와 현재 관측된 작업자 기록이다. 지표의 지적·실패는 이전 회차를 포함하고 최종 독립 판정은 통과했다. 팀 참여 총량과 실제 owner 개입 효과는 미확인이라 다른 프로젝트와 효과 크기를 비교하지 않는다.

## 배포

해당 없음.
