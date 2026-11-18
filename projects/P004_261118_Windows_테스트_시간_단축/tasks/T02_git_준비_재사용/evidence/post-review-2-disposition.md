# 중첩 수정 사후 코드 리뷰 처리

`post-review-2-nested.md`는 동일 독립 anthropic reviewer의 코드 pass(blocking 0·should_fix 0·nit 4)이며 별도 증거 보완 권고 1건을 포함한다. 전체 계약은 수집 중으로 보류다. 이전 단회 전체 실패의 내부 원인을 확정하지 않는다.

## 증거 보완

`revalidate-isolation.mjs`는 실제 19개 파일의 원시 `trace/enter-*.json`, `trace/exit-*.json`, `nested.log`, `result.json`을 다시 읽는다. worker PID 목록과 exit PID 목록 일치, 공통 부모 하나, 서로 다른 19개 루트, 소유자·PACE_HOME·PROFILE, exit 후 잔존/오류 0을 검증한다. 명령은 다음과 같다.

```powershell
node projects/P004_261118_Windows_테스트_시간_단축/tasks/T02_git_준비_재사용/revalidate-isolation.mjs projects/P004_261118_Windows_테스트_시간_단축/tasks/T02_git_준비_재사용/evidence/nested-isolation-2026-11-18T12-40-06-394Z
```

결과 `nested-isolation-2026-11-18T12-40-06-394Z/revalidation-v2.json`은 verifier 경로·SHA-256, 모든 원시 파일 경로·해시 및 worker/exit 원문 목록을 연결한다. 기존 verified false의 raw result는 바꾸지 않는다. 최초 잘못된 20개 기대의 진단 소스는 별도 스냅숏/해시가 없어 사후 확정하지 않는다. main도 원시 19 enter/19 exit·PID 일치·TMP 19·부모 하나를 읽기 재대조했다(전달 판정).

진단 env는 상속 OWNER/PARENT를 지우므로 실제 wrapper가 owner 문맥을 상속한 경우의 분리까지 이 trace가 입증하지는 않는다. 현재 진행 중인 비계측 전체는 실제 wrapper의 process.env 상속을 사용하므로 별도 실행 결과로 판단한다. 그 전체 성공도 계측된 worker별 owner 분기 증명과 같다고 주장하지 않는다.

## 비차단 nit 처리

1. cwd 기반 helper 경로: 기존 19개 파일 계산과 같은 저장소 루트 cwd 계약을 따른다. 진입 계약을 확대하지 않았다.
2. 최대 stdout/stderr 실패 메시지: 16 MiB 한도를 명시하고 ENOBUFS는 실패로 구별한다. 기본 측정은 스트림을 파일로 보존하지만 무한한 출력·상위 도구에서의 무제한 보존을 주장하지 않는다.
3. wrapper 자체의 격리 단언 없음: 실제 19개 trace와 peer/own 누수 대비를 검증 증거로 남겼다. T03은 실제 동시성 비교와 선택값 5회 전체를 수행하며 이 검증을 인계받는다. 기존 wrapper의 의미 검사를 삭제하지 않았다.
4. 진단 임시 루트 미정리: 실행별 소유 루트·생성한 누수 주입 폴더는 실패 원문 확인을 위해 보존했다. 개인/다른 실행 경로를 지우지 않는다. 실제 helper 소유 루트 19개는 종료 정리가 완료됐다.

새 원문에 인증 값/비밀 원문은 발견하지 않았으며, 커밋 전 저장소 비밀 검사도 별도로 수행한다. 추가 tester 실행은 전체 성능 측정이 끝난 뒤 요청한다.
