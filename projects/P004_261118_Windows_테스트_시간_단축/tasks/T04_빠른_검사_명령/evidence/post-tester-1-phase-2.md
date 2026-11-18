# T04 독립 tester 2단계

**판정 fail.** 독립 목표 대조는 맞음, 목표 달성은 미달이다. 1단계에 확인한 관련 시험 누락을 재현했다. 2단계의 TASK, PROJECT, BR04 및 PRE-REVIEW에는 Git ignore와 이미 커밋된 변경을 제외한다고 명시되어 있다. assume-unchanged는 제외 범위에 없으며, 추적 불확실성은 T-2와 P-4의 전체 전환 대상이다.

| 기준 | 판정 | 근거 |
|---|---|---|
| T-1 | fail | 정상 staged·unstaged·untracked, 다른 cwd 선택과 설치형 Node/Python 실행은 확인했다. 추적 중인 B가 assume-unchanged로 가려진 상태에서 A와 B를 편집하니 `changed`는 A만 실행하고 부분 통과 0, `unit b`는 실제 실패 1이었다. |
| T-2 | fail | `git rm --cached -- src/a.mjs` 뒤 작업본 파일을 남겼다. NUL status는 `D  src/a.mjs\0?? src/a.mjs\0`, cached raw는 `:100644 000000 … D\0src/a.mjs\0`였다. 출력은 A만 실행한 부분 통과 0이며 실제 선언 전체 검사의 `FULL_SENTINEL`이 없었다. 일반 경로 삭제·rename 등의 전환과 기존 finish 회귀는 통과했다. |
| T-3 | pass | 현재 소스 스냅샷의 검증과 기록은 충족한다. 소유 설치 APP_PARTS와 Windows .cmd, 참조 README 예제를 독립 Git에서 직접 재현했다. 기존 실제 전체 검사 원문은 종료 0, 991건 중 982 통과·9 skip, 710.587초다. 607개 현재 파일의 SHA-256이 당시 시작 스냅샷과 모두 일치했다. T03 기본 4의 전체 5회는 970건, 실패 0, skip 9, 중앙 680.918초다. 비교 기록의 970건 제거/판정차이 0 및 신규 21건과 실제 대표 빠른 실행 3회 중앙 14.687초를 확인했다. 이 판정은 수정후 스냅샷에 이어지지 않는다. |

집중 재실행은 `node --test --test-name-pattern='changed includes staged|changed common, unknown|Windows entry|user README map' test/changed-test.test.ts`였다. 종료 0, 선택 4건 모두 통과, skip 0, 21.034초. 실제 출력은 focused.log, 별도 실패 재현의 NUL Git 자료와 CLI 출력은 index-observations.jsonl이다. 기존 시험 파일은 수정되지 않고 changed 시험 파일만 추가된 상태다. TypeScript 및 verification 교본의 경로 일치, 선택 누락, 오류 성공 누출을 대조했다.

올릴 단계는 구현·검증이다. Git이 보고한 삭제 상태를 경로 집합이나 작업본 존재 여부와 별개로 보존하고, Git의 추적 가시성을 제한하는 인덱스 상태는 부분 성공을 허용하기 전에 판정해야 한다. 두 재현을 실제 전체 명령 마커까지 단언하는 회귀에 추가하고 필요한 결정과 증거를 갱신한 뒤 재검토한다. 전체 검사를 독립 세션에서 반복하지 않았다. 실제 설치기·POSIX shim 및 외부 프로젝트의 폭넓은 성능은 미측정이다.