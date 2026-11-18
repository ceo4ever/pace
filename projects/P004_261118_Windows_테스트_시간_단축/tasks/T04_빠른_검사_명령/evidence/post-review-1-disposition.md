# 사후 1차 지적 처리

새 anthropic Claude Opus 5.5 reviewer와 새 openai Codex tester의 최초 불통과는 원문·출처/SHA와 함께 보존했다. reviewer B1/SF3/nit3, tester T1/T2 미달 및 초기 소스의 T3 증거 충족이다. main은 숨김 인덱스 누락도 별도 차단으로 판단했다. 초기991건 전체 통과를 제품 목표 달성으로 갈음하지 않고 마감/커밋을 보류했다.

## 차단 지적

- B1: status의 X/Y 삭제와 raw D를 경로 집합과 별도로 보존한다. 같은 경로의 tracked/untracked 상태 공존도 불확실로 처리한다. `git rm --cached` 뒤 파일이 남는 실제 회귀는 기존의 부분0/전체 미실행을 RED로 검출했고, 수정 뒤 실제 full marker와 인덱스 byte 불변을 확인했다.
- main B2(리뷰 SF1): 읽기 전용 `git ls-files -v -z`에서 소문자 태그와 S를 확인하고, assume-unchanged/skip-worktree가 하나라도 있으면 전체 전환한다. core.sparseCheckout/index.sparse도 확인해 전체 전환한다. 플래그를 해제하거나 인덱스를 갱신하지 않는다. 관련 B의 실제 단위 실패1과 기존 changed의 A만 실행한 부분0을 재현했다. 수정 뒤 실제 전체 명령이 B까지 실행해 실패1을 반환하며 flags/index byte는 그대로다. 실제 cone sparse checkout 및 설정만 켠 sparse/sparse-index도 검증했다.

`post-review-red-index-exception.tap`은 수정 전 세 회귀의 실패 원문이다. 삭제·숨김 플래그·예외 분류를 수정한 `post-review-focused-index-exception-2.tap`은4건 통과했다. 최초 수정 후 관측은 full marker는 실행했으나 Node test 내부 환경이 자식 전체 명령에 상속되어 실제 Node 시험이 재귀 실행으로 생략됐다. 그 원문은 `post-review-focused-index-exception.tap`이다. fixture의 CLI 환경에서 NODE_TEST_CONTEXT를 제거해 일반 사용자 경로와 맞췄다. 제품의 기존 전체 명령 환경 의미는 바꾸지 않았다.

## 다른 지적

- SF2: changed 전체 실행 경계에 예외 처리를 두고, 실제 실패/중단을 관측한 상태는 단조롭게 유지한다. 실행 결과를 받는 즉시 기록하여 이후 예외나 전체 성공으로1이 사라지지 않게 했다. 예기치 않은 미확인 예외는3이며 성공 재시도를 하지 않는다. 사전 검사 뒤 선택 파일이 사라지는 실제 시나리오의 이전1/새3과 후속 미실행을 검증했다.
- SF3: 초기 runtime JSON 전체 객체는 동일하지 않다. `runtime-v1-comparison.json`은607개 files 배열의 SHA 동등성=true, 전체객체동등성=false, 다른 키는 captured 시각 하나뿐임을 별도로 기록했다. 초기 소스 tree digest도 저장했다. 수정된 파일의 초기 원문은 남겨 둔 최초 app/사본 또는 현재의 불변 파일에서 복사했고, 매번 초기607개 manifest의 byte SHA와 일치함을 단언했다. `v1-source-provenance.json`과 v1-source 아래에 보존했으며 추정 복원하지 않았다.
- SF3 TAP 차수: `focused-final.tap`은 초기 개발 중30건이며, 초기 전체991건 시점보다도 앞선 소스다. 이후 fixture 수명/driver 경계 관측과 초기 전체21개 새 시험을 구별한다. 새 `post-review-focused-all.tap`은 수정 후 새25개와 기존11개, 총36건이 실제 실행되어 전부 통과한 자료다. 초기 관측을 새 소스 통과로 재사용하지 않는다.
- nit1: scope 출력에 실제 전체 명령과 기존 main 기준의 pace test all/finish 안내를 추가했다.
- nit2: 공유 helper가 common과 단위 sources에 겹치는 것은 의도적이다. common이 우선해 공유 helper 변경을 부분 실행하지 않고, 명시 unit 선택은 그대로 가능하다. harness는 이전에도 미분류였으므로 legacy file의3은 유지되며 새 shell-result에는 과거 파일 계약이 없다.
- nit3: 실제 Python이 필요하며 Windows Store 별칭이 시작된 뒤 실패하면1이라는 기존 경계를 README에 명시했다. 별칭 설치/전환을 자동 수행하지 않는다.

## 새 검증 경계

초기 전체991건/710.587초와 raw·원래 runtime JSON·초기 비교 결과는 덮지 않는다. 초기 회귀 비교는 당시21개 원문 소스를 명시해 `runtime-v1-regression-revalidated.json`으로 별도 재검증했다. 새607개 스냅샷은 v2 라벨과 별도 전체 폴더로 저장하며 최종 제품 소스에서 전체1회를 다시 수행한다. 이 단계 이후 tester와 같은 사후 reviewer에게 수정분·새 관측으로 둘 다 재검토를 요청한다.

v2 실행 완료: `t04-fixed-full-2026-11-18T18-29-13-627Z`는710.7117803초·995건(986통과·실패/취소0·기존skip9)·종료0이다. 기존970건/skip사유·95개시험byte와새25건을원본으로대조했다. v2 전후607개files SHA배열은같고captured만다르다. 전체환경/결과SHA와tree digest는 `runtime-v2-run-binding.json`에연결했다. 이전판정과새결과를구별해둘다재검토한다.
