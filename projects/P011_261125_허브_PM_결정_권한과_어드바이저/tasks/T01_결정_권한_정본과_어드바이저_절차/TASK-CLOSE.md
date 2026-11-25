# T01 결정 권한 정본과 어드바이저 절차 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

달성. 결정 권한 목록으로 owner 요청을 제한하고, 허브가 장애를 조사해 결정·근거·재검증 기준을 회신하도록 운영 지침과 진입점을 정리했다. 허브와 워크트리의 분리된 행동 평가가 각각 재현·회신과 적용·재검증·재개를 보였다. 승인 원문 부재와 대상 불일치에는 입력을 보류했고, 범위가 일치하는 기존 승인과 위임은 이어서 사용했다. 실제 Orca에서의 왕복과 owner 개입 총량은 병합 후 관측 범위다.

독립 검토의 [첫 판단](evidence/review-records/R2.json)과 [계약 재검토](evidence/reviewer-stage2-final.md), tester [1단계](evidence/tester-stage1.md)·[2단계](evidence/tester-stage2.md)를 연결했다. 최종 행동은 [결정 권한 채점](evidence/eval/after-05/grade-decision.md)과 [기존 회귀 채점](evidence/eval/after-05/grade-regression.md)에 있다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | [BR01 항목별 대조](evidence/br01-matrix.md), [계약 재검토](evidence/reviewer-stage2-final.md) |
| T-2 | 통과 | BR01 대상 19개 정본 참조, 금지 문구 0건과 미실행·반복 단계 안내. [독립 시험](evidence/tester-stage2.md), [검사 결과](evidence/check-results.txt) |
| T-3 | 통과 | [결정 권한 15/15](evidence/eval/after-05/grade-decision.md), [기존 회귀 17/17](evidence/eval/after-05/grade-regression.md), [실행과 원응답 보존](evidence/eval/provenance.md) |
| T-4 | 통과 | 일반 golden과 역할 지시 전문 일치. 역할의 B 누락, 삭제 제한 약화, 테스터 수신자 변조 3건을 모두 검출했다. [독립 재검증](evidence/tester-role-recheck.md) |
| T-5 | 통과 | 계약 v1과 보충 문단 대조, [팀 목록](evidence/team-list.txt), [생성물 차이 0건](evidence/team-sync-check.json), [Claude·Codex 적재 8/8](evidence/team-verify.txt) |

## 단위 테스트

Orca 환경에서 `PACE_SKIP_BROWSER_E2E=1 npm run check`가 끝났다. TypeScript 검사 통과, Node 테스트 1,368 통과·0 실패·17 건너뜀. 브라우저 E2E 네 건에 저장소의 Orca 실행 규칙을 적용했다. 최종 문구의 표적 검사 73건과 역할 구조 보강 검사도 통과했다. [명령과 요약](evidence/check-results.txt)

## E2E

Claude Sonnet 5.5의 새 맥락에서 결정 권한 D01~D15와 S1~S6·S7 하위 11개를 실행해 모두 독립 채점에서 통과했다. 다른 차수의 첫 응답, 평가 문서 지문, 정책 보완 이유는 [실행 기록](evidence/eval/provenance.md)에 있다. [결정 권한](evidence/eval/after-05/grade-decision.md) · [회귀](evidence/eval/after-05/grade-regression.md)

## 리뷰

- 구현 전 계약은 다른 제공자의 [첫 사전 검토](review-records/R1.json)와 [수정본 사전 검토](review-records/R2.json)에서 차단 지적 없이 통과했다. 최종 기준 번호의 형식 수정은 같은 의미를 유지한 채 현재 해시를 재검토받았다. [사전 검토 이력](PRE-REVIEW.json)
- 구현 후 첫 계약 대조는 reviewer blocking 1 · should_fix 3. 기존 reviewer와 task-steps의 구현 후 배정 원칙 및 BR01 본문으로 B1 적용 범위를 대조했고 독립 재검토에서 그 지적을 철회했다. [첫 계약 대조](evidence/reviewer-stage2-first.md) · [재검토](evidence/reviewer-stage2-final.md)
- 초기 tester fail은 사후 요약·우회·검토 원장의 사례에서 발생했다. 원래 응답을 보존하고 결과가 달라지는 절차를 더 명확히 했다. [앞 차수 결정](evidence/eval/after-03/grade-decision.md) · [앞 차수 회귀](evidence/eval/after-04/grade-regression.md)
- 최종 tester pass · reviewer blocking 0. 두 층의 책임은 실행 전 원문 확인 절차와 기존 코드 게이트에 각각 남는다. 역할 지시 보강도 독립 변형 시험에서 정상본 종료 0, 세 변형 종료 1을 관측했다. [독립 재검증](evidence/tester-role-recheck.md)
- 교본: TypeScript·검증 색인. 기존 모델·실행기 Test double과 앱 진입점을 재사용하고 오류 분기, 역할 지시, 부정 사례 검출력을 확인했다.

## 남긴 것

병합·main 재설치 뒤 실제 Orca에서 한 요청의 escalation, 허브 결정 회신, 작업자 재개와 재검증을 연결해 확인하는 인수 항목을 프로젝트 메모리에 등록했다. 소통 원장이나 파일의 기록 자체로 owner 신원을 인증하는 기능은 별도 범위다.
