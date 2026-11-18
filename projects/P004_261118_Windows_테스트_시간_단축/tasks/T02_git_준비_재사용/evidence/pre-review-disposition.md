# 사전 검토 처리

별도 anthropic 1·2단계의 pass(blocking 0·should_fix 4)를 원문과 PRE-REVIEW에 보존했다. 목표/기준은 그대로이며 다음 세부를 구현·검증으로 구체화했다.

1. SF-1: 원본을 첫 대상 HOME과 분리한 전용 private HOME/bin으로 만들었다. gitRun은 정확 키와 자손 접두사를 모두 검사하고 원본 정확 키만 등록한다. 모든 복사본은 기존 parent 키에 자기 HOME/bin을 등록한다. 원본 및 두 복사본에 각기 다른 global config 태그를 두고 실제 Git이 자기 태그를 읽는 시험이 통과했다.
2. SF-2: fixture-audit.md에 SHA/시각/index/다른 fixture 비교의 정합 대조를 남겼다. 초기 준비만 전환하고 이후 실제 Git 검증은 남겼다. 새 helper 시험은 HEAD/ref/object·작업 파일/config·원본 불변을 직접 확인한다.
3. SF-3: agent-chain initializer는 기존 git helper와 환경을 그대로 사용한다. helper의 readonly HEAD 확인은 초기화 동작을 변경하지 않는다.
4. SF-4: harness는 새 부모/app, agent-chain은 tempDir 자체로 유지한다. 호출마다 HOME과 .git 포함 복사본은 독립이다.

초기 준비/최초 복사 실패를 캐시하지 않는 실패 주입과 소유/빈 경로·연결형 원본 거부도 통과했다. 새 시험 5개(공용 helper 4·HOME 문맥 1)를 추가했고 기존 tests를 줄이지 않았다. 이후 전체 1회는 종료 1이며, 독립 구현 후 reviewer는 코드 통과·tester는 집중 검증 통과이나 S-5 실패다. `post-review-1-disposition.md`에 최신 판정과 제한을 기록한다.

## TASK 접근과 실제 구현의 차이

사전 TASK 접근은 prepare의 두 번째 인자 firstDestination을 받아 첫 대상의 HOME/bin을 원본에 등록하는 설계였다. SF-1을 반영하며 원본이 첫 대상 HOME에도 의존하지 않도록 전용 private HOME/bin을 따로 만들고 **원본 정확 경로**에만 등록했다. 대상별 HOME/bin과 app 경로는 유지한다. 세 HOME의 실제 global config 분리 시험으로 이 차이를 확인했다. 첫 대상 HOME을 원본에 빌려 주는 접근은 채택하지 않았으며 firstDestination 인자는 현재 두 소비자에서 쓰지 않는다.

이는 동일 파일 프로세스 안의 독립 복사본·기존 Git/CLI 경계라는 기준을 유지하는 세부 구현 결정이다. 사전 검토 당시 TASK 정본과 해시는 바꾸지 않고 이 문서에 차이를 공개한다. 독립 사후 reviewer/tester도 이 차이를 확인했으며 코드 차단 사유로 판정하지 않았다.
