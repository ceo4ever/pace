# BR01 main 착수 기록과 시작 커밋

- 상태: 대기
- 백로그: [허브 PM main 직접 프로젝트 하네스 정비](BACKLOG.md)

## 목적

main 직접 프로젝트에도 worktree의 `start`와 같은 착수 기록을 남겨, 이후 관문(BR02·BR03·BR05)이 "이 프로젝트의 변경"을 판정할 기준(시작 커밋)을 갖게 한다.

## 범위

- `pace project start P### --main`(이름은 설계 때 확정): worktree·브랜치 없이 상태 `정의` → `진행`, 정의 커밋, 착수 결정 log.jsonl(출처), **시작 커밋**을 PROJECT.md 또는 기록 파일에 남긴다.
- `start` 없이 main에서 진행 중인 프로젝트를 찾으면 `list`·`finish`가 착수 기록 누락을 알린다.
- 스킬 SKILL.md §1·§2의 main 직접 절차를 이 명령으로 바꾼다.
- 제외: worktree `start`의 기존 동작 변경.

## 완료 기준

- `start --main` 뒤 상태 `진행`, log.jsonl 착수 결정, 시작 커밋이 기록된다(시험).
- 시작 커밋 기록이 없는 main 직접 프로젝트의 finish는 안내와 함께 멈추고, `list`가 착수 기록 누락을 표시한다(시험).
- worktree start 시험이 그대로 통과한다.
