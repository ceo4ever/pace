# finish 절차 세부

SKILL.md §4에서 옮긴 문서다. PROJECT-CLOSE 작성, `finish`가 확인하는 것, 지표·`stats`, 남은 일 정리를 담는다.

## PROJECT-CLOSE 작성

1. 모든 태스크가 `완료`(또는 `보류`)면 PROJECT-CLOSE.md를 쓴다 — 기준 대조와 별도 **목표 달성 판정**([goal-review.md](goal-review.md)), 기준 대조 `P-n`, 태스크 결과, **보안**(`references/security.md`), **정본 반영**(바꿀 정본 목록마다 반영·해당 없음), 남은 일, 회고, 배포. 태스크 마감도 같은 구별을 지킨다. 목표 미달/미확인은 게이트 통과로 덮지 않고 해당 위 단계 보완·합의 변경 질문으로 올린다.

PROJECT-CLOSE의 `## 지표`에는 `[지표 집계](METRICS.md)` 링크와 에이전트 해석 1~3줄을 적는다. 상세 집계는 finish·merge가 METRICS.md로 다시 생성하며 손으로 고치지 않는다. 코디네이터 토큰에는 main 세션의 다른 대화가 섞일 수 있다.

## `finish`가 하는 일

태스크 check, PROJECT-CLOSE 형식, 정본 반영 ↔ diff, 비밀 노출, 브레인 lint, 보안 검사 명령, 의존성 감사(선언됐고 잠금 파일이 base 대비 바뀐 때만), 목차 재생성, main 위로 rebase, 검사 명령, 커밋 칸 해시(rebase 뒤 해시로), `병합 대기` 커밋. 실패하면 이유를 고치고 다시 돈다. rebase 충돌은 목차 외에는 멈추고 보고한다.

## 지표 확인 (`stats`)

4. `pace project stats P### [--json]`과 별도 자동 `METRICS.md`에서 시간·승인/질의 대기와 작업 경과·도구별 토큰·게이트 실패·결정/변경/리뷰 수·개선 후보를 확인한다. 반복된 이유·등급 및 TASK-CLOSE의 남긴 것 링크는 검토 후보이며 사람이 선택해 메모리·브레인으로 올린다. METRICS.md와 `projects/METRICS.md` 비교표는 finish·merge가 다시 만들므로 직접 쓰지 않는다. 이전 프로젝트와 태스크 수·작업 시간·작업자 출력·blocking을 비교하고 규모·누락 한계를 함께 본다.

## 남은 일 정리

5. 남은 일은 메모리 할 일·이슈로, 오래 남길 결정·함정은 `pace brain add`·`update`로. PROJECT-CLOSE 정본 반영 표의 브레인 행에 "반영" 또는 "해당 없음"(이유)을 적는다 — `finish`가 확인한다.

## merge 요약

`pace project merge P###`는 환경 선언 변경·제거될 무시 파일을 포함한 요약을 보여 준다(SKILL.md §4 merge 줄에서 옮김).
