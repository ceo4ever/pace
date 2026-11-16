# 명령 동작과 기록 규칙

SKILL.md에서 옮긴 문서다. `done`·`check` 등 태스크 마감 명령이 하는 일과 `pace project log` 기록 형식.

## 태스크 마감 명령의 동작

   start가 Git 내부 commit-msg 훅을 멱등 설치한다. 프로젝트 브랜치의 태스크 태그는 check 실패 시 커밋을 막는다. 사용자 훅·링크·외부 또는 상대 hooksPath는 보존하고 pace가 없으면 경고 후 통과한다. 훅 check는 로그를 쓰지 않는다. finish는 완료 태스크의 태그 커밋 존재도 확인한다.
   선언 명령(`검사`·`보안 검사`·`worktree 준비`)은 실행 전 출력하며 worktree 선언이 base와 다르면 base 선언을 사용한다(base 선언이 없으면 worktree 선언). 명령이 호출하는 스크립트는 작업본에서 실행된다.
   `done`은 check를 다시 돌려 통과할 때만 TASK.md 상태·태스크 표 상태를 `완료`로, 같은 번호 BR 파일·BACKLOG.md 표를 `완료`로, 다른 완료 태스크의 빈·낡은 커밋 칸을 git 이력의 가장 최근 `(P###/T0n)` 커밋 해시로 맞춘다. 커밋은 하지 않는다. check가 실패하거나, 같은 번호 BR 파일·`- 상태:` 줄·BACKLOG.md의 `## 진행 현황` 행이 없으면 아무것도 바꾸지 않고 멈춘다. 상태·커밋 칸은 손으로 고치지 않는다 — 자기 커밋 해시는 다음 태스크의 `done`이나 `finish`가 채운다.
   `check`가 보는 것: TASK-CLOSE의 `판정: 통과`, TASK.md 기준 `T-n`이 모두 기준 대조에 `통과`로 있음, 단위 테스트·E2E·리뷰·남긴 것 절이 비지 않음(해당 없으면 "해당 없음"), 적힌 `evidence/…` 파일이 있음. 상태 칸은 보지 않는다.

## 결정·리뷰 기록 (`pace project log`)

계획에 없던 결정·변경은 `pace project log P### [T##] --type decision|change --msg "짧은 한 줄" --src "사용자 결정|main 판단|자체 판단" [--ref 프로젝트의_상대파일]`로 남긴다. log.jsonl과 PROJECT.md 결정·진행 메모 표에 자동 반영하므로 표를 손으로 중복 작성하지 않는다.
리뷰는 `--type review --msg "tester pass blocking 0 should_fix 0"` 또는 `"reviewer fail blocking 1 should_fix 2"`로 판정·수를 남기고, 질의·답변·에스컬레이션도 해당 type으로 같은 태스크 번호에 기록한다. 원문 출력·세션·diff·비밀은 복제하지 않는다.
