# P003 검사 기록 (2026-11-18, Windows 11, 이 PC)

## 전체 검사 1차 — `npm run check` (legacy script 시험 수정 전)

- ℹ tests 960
- ℹ pass 883
- ℹ fail 53
- ℹ skipped 24
- ℹ duration_ms 2066525.326

실패 53개 분류:

| 원인 | 수 | 이 변경 때문인가 | 근거 |
|---|---|---|---|
| symlink 생성 권한 없음(EPERM, Windows 개발자 모드 꺼짐) | 50 | 아님 | 오류가 시험 준비의 `symlinkSync` EPERM. 그중 dashboard-init 4개는 변경 전 HEAD 임시 worktree에서도 같은 4개 실패 확인 |
| Python 미탐지(세션 PATH가 Store 별칭을 먼저 찾음 — Python 3.14는 설치돼 있음) | 1 | 아님 | test-runner 시험 출력 "Python was not found" |
| telegram S-9f (status.md ENOENT) | 1 | 아님 | 변경 전 HEAD 임시 worktree에서 같은 실패 |
| backlog-dashboard "legacy script remains usable" | 1 | **맞음** | 시험이 손으로 복사하는 의존 목록에 새 import `src/core/fsutil.ts`가 없어 ERR_MODULE_NOT_FOUND → 목록에 추가, 단독 재실행 통과 |

## 변경 관련 시험 재실행

- `test/dashboard-init.test.ts`·`test/adopt-opal.test.ts` 변경 관련 11개 통과(1개 skip — POSIX 전용).
- legacy script 시험 단독 통과.
- 타입 검사(`tsc`) 통과.

전체 재실행은 `pace project finish`의 `검사`가 맡는다(중복 실행 피함).

## 전체 검사 2차 — 개발자 모드(symlink) 켠 뒤, Python PATH 우선 (2026-11-18)

- ℹ tests 963
- ℹ pass 956
- ℹ fail 1
- ℹ skipped 6
- ℹ duration_ms 1846876.2573

| 실패 | 이 변경 때문인가 | 근거 |
|---|---|---|
| playbook-maker 묶음 중 `playbook-guard` "저장 경계…"(임시 폴더가 남았다) | 아님 | 단독 실행은 P003 이전 커밋(4602130) 임시 worktree와 현재 모두 통과 — 공용 tmpdir 증가로 판정하는 시험의 병렬 경합. 이슈로 기록 |

1차의 symlink 50개·Python 1개·legacy script 1개는 모두 통과. telegram S-9f도 통과(1차 실패는 symlink 권한 관련으로 보임 [추정]).
