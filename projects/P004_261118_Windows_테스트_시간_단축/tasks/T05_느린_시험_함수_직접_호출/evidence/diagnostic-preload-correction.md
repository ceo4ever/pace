# 진단기 오류 정정 — 이전 설명보다 이 정정이 우선

6자식 stderr 수집1회에서 모든 자식이 `ERR_UNSUPPORTED_ESM_URL_SCHEME`, received protocol c:로 종료했다. 실제 argv에는 올바른 dashboard file URL 앞에 `--import C:\...\lock-trace-preload.mjs`가 있었다. Git 문맥 오류가 아니므로 Git 사본 대조는 실행하지 않았다.

원인은 PM이 작성한 진단기의 두 오류다.

1. diagnose-dashboard.mjs의 trace 확장은 대상 블록을 재조립하지 않고 전체 파일의 첫 `['--input-type=module', '-e'`를 replace했다. 그 첫 구문은262행의6자식 시험이었다. 그래서6자식에 preload를 붙이고,388행의 대상8자식에는 붙이지 않았다.
2. preload를 Windows 절대 경로 문자열로 전달했다. 이 Node ESM --import 경계에는 file URL이 필요하다. 실제6자식은 dashboard를 실행하기 전에 loader 오류로 실패했다.

영향은 다음과 같이 정정한다.

- 첫5회 stdout 수집 비재현은 preload를 사용하지 않은 원래 설명 그대로다.
- 다음20회는 대상8자식/원래 단언이 통과했지만 preload가 그 자식에 적용되지 않았다. 따라서 '256단계 계측20회 비재현'이라고 한 주장은 철회하고 '추가 비계측 stdout 수집20회 비재현'으로만 유지한다. manifest의 preload SHA는 실제 파일의 SHA이지 해당8자식이 로드했다는 증명이 아니다.
- 전체 부하 진단에서6자식 전부1은 잘못 삽입된 --import가 만든 진단기 실패다. 제품의 동시 갱신 결함이나 Git 메타데이터 부재 탓이라는 근거가 아니다.
- 전체 부하의 대상8자식은 stdout 수집만으로 통과했으며 fs preload 관측은 적용되지 않았다. 원래 비계측 stale-lock 실패는 계속 원인 미확정이다.
- 같은 전체 진단의 중첩 healer viewport 실패는 별도 실제 관측이지만 원인 미확정이다. 이 preload 오류와 연관성을 주장하지 않는다.
- diagnostic-test-block.txt는 블록 내부만 replace한 내용으로 저장돼 실제 실행 전체 파일의 preload 위치와 불일치했다. 이 발췌본을 실행 소스 증거로 사용하지 않는다. 실제 실행 전체 파일은 보존 사본의 SHA가 manifest와 일치하는지 확인한 뒤 actual-traced-dashboard-test.ts.txt로 별도 보존했다.

기존 원문·manifest·발췌본·보고서는 오류 이력으로 덮어쓰지 않고 이 정정에 연결한다. 실제 제품/시험 원본은 추가 변경하지 않았다. 잘못된 관측을 목표 통과로 쓰거나 원래 전체 실패를 무효화하지 않는다. 추가 반복·전체부하·Git 대조는 실행하지 않았다.

진단기 수정안은 정확한 대상 블록 내부에서만 --import를 삽입하고 pathToFileURL(preload).href를 환경으로 전달하며,6자식 블록에는 --import 없음/8자식 블록에만1개 있음을 실행 전 기계적으로 단언한다. 수정안은 새 실행 승인 전에는 실행하지 않는다.
