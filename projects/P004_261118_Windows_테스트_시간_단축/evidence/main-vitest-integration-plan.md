# main Vitest 변경과 P004 최소 통합안 — 실행 전

현재 HEAD는7b3a926, main은35d0da6, merge-base는e27ef7c다. 양쪽 git show/diff를 읽었으며 실제 rebase/충돌 수정/검사/설치는 수행하지 않았다. 기존 스냅숏의 계약/전체 보안 독립 검토는 blocking0·should_fix2·handoff2다. `independent-project-review/`에 두 단계 원문·출처/SHA·PACE 부트/메모리 자동 노출과 한계를 보존했다. 이 판정은 통합 전이다.

## 코드의 최소 합성

| 대상 | 보존/통합 방법 |
|---|---|
| src/test-runner/runner.ts | P004의 map/execute/changed 분리와 changed 분기를 유지한다. 양쪽 file/unit/all의 선택·결과 집계는 같으므로 main의 모놀리식 파일을 덮어써 changed를 없애지 않는다. |
| src/test-runner/execute.ts | main의 fileResults에 추가된 kind=vitest 지원, 단위 파일을 한 batch로 실행, Node 직접 driver argv/root/config, unavailable 처리, Windows Vitest 소유 트리 taskkill을 이 분리 함수로 옮긴다. P004의 stopEarly 기본false/시작확인/실패 우선과 changed의 중단·미실행 구분을 함께 유지한다. Node/Python 기존 동작도 보존한다. |
| src/test-runner/vitest-driver.mjs | main 최종35d0da6의 드라이버를 그대로 보존한다. 로컬 vitest 조회, 설정 전달, 보고서 누락/해석 확인 불가, 0건/전체skip/누락파일 실패, 실패 테스트 중복 집계 방지와 파일/이름/첫줄 출력을 유지한다. 이번 통합에서 별도 Vitest 제품 개선을 덧붙이지 않는다. |
| test/test-runner.test.ts | P004는 이 파일을 수정하지 않았으므로 main의14건을 보존한다(기존11건에서3개 추가·기존1개 이름/의미 수정). 로컬 Vitest 없음3·config 허용·단위1프로세스·file1파일·실패1/가져오기오류·0건/skip/누락파일·보고서없음3을 유지한다. |
| src/test-runner/map.ts | 기존 공통 스키마가 kind 문자열과 안전한 config/cwd를 이미 보존한다. main에만 있는 중복 스키마를 되살리지 않는다. |
| all/finish | 양쪽의 runDeclaredCheck(root) 경로를 그대로 유지한다. changed 전용 검증 revision/실행 메타데이터가 기존 all/finish의 의미를 바꾸지 않도록 한다. |

## changed의 Vitest는 별도 지원으로 넓히지 않는 안을 권한다

file/unit은 main처럼 Vitest를 지원하되 changed의 계획 단계는 기존 node-test/python-unittest만 부분 실행한다. Vitest/config/전제 단위가 관련되면 사전 검사/부분 시험 전에 이유를 표시하고 실제 전체 명령으로 전환한다. 전체 선언 확인 불가는3, 실제 전체 실패/중단은1이며 성공과 구별한다. 이는 P-4의 불확실할 때 전체 전환 계약을 지키고 main의 file/unit 기능을 보존하는 최소안이다.

단순히 changed의 kind guard만 풀면 충분하지 않다. main Vitest 드라이버는 내부 Vitest가1로 끝나고 보고서가 없어도 부모에 unavailable을 보고하고 file/unit은3으로 처리하는 계약이다. changed는 실행 후 관측된 실제 실패를 전체 성공 재시도로 숨기면 안 되므로, 이를 직접 지원하려면 내부 실행 시작/실패 메타데이터와 실패 우선·실제 설치형 Vitest 경계의 추가 설계/검토가 필요하다. 그 확장은 이번 통합에서 하지 않는다.

## 문서·기록 충돌과 should_fix2

- docs/README.md는 main의 Vitest/file-unit batch·로컬 의존성 신뢰 설명과 P004의 changed·checks/기준/전체 전환 설명을 함께 유지한다. 검사·보안 검사·worktree 준비 라벨은 바꾸지 않는다.
- 초기화 스킬 test-map.md는 main의3개 kind·Vitest config/file-unit 설명과 P004의 checks 신뢰/기준 commit/작업본 범위 설명을 함께 둔다. changed Vitest는 전체 전환이라는 구분을 명시한다.
- README의 SF1은 “전체 선언은 검증한 기준 commit 우선이며 실제 선언 부재일 때만 작업본 선언을 사용한다. Git 조회 오류는 부재로 보지 않고 작업본으로 대체하지 않는다. 신뢰하는 저장소에서만 실행한다”로 보완한다. 구현을 바꿀 필요는 없다.
- README의 SF2는 “사전 검사 이후 예상 밖 실행 경계 예외는 전체를 다시 실행하지 않고 확인 불가3으로 끝날 수 있다”는 가용성 경계를 명시한다. 일반적인 계획/결과 불확실성의 실제 전체 전환과 구별한다.
- 브레인 log.md는 양쪽의 추가 기록을 보존한다. main의 BL261118_02도 유지하며 지우거나 덮어쓰지 않는다. 생성 대시보드 data.js와 공유 목차는 어느 쪽을 통째로 고르지 않고 파일 목록/정본에서 CLI로 재생성한다(`pace backlog refresh`, 브레인/메모리 목차 명령 또는 기존 하네스 재생성). 실제 충돌 해결은 main 승인 뒤에만 한다.
- handoff는 기존 Windows 직접 자식/임의 자손 회수 한계와 원시 로컬 경로 메타데이터 공개 경계다. 원문을 고치거나 익명 공개본으로 주장하지 않고 기존 회수 이슈·마감 한계로 남긴다.

## 통합 후 필요한 검증

1. main의14건 test-runner 파일 전체와 P004의25건 changed 파일 전체, 타입 검사를 우선 수행한다. 두 기능이 공유하는 실행기 이동과 종료 코드·타임아웃/중단·원래 all 경계를 확인한다. 새 승인 검증은 기존 성공 검사의 중복 수집이 아니라 실행 소스 합성이 달라진 부분에 대한 재검증이다.
2. 의미 있는 통합 sentinel1건을 changed 시험에 추가하는 안을 권한다. 신뢰 map/checks와 실제 로컬 fake Vitest가 있어 file/unit은 실행 가능하지만 changed는 부분 Vitest를 실행하지 않고 실제 전체를1회 호출하는지 확인한다. 전체 성공0/실패1/확인불가3 및 config 유무를 같은 사례의 표로 검증하고 Vitest 호출 로그가 비어 있음을 확인한다. 기존 requires/config/미지원 시험은 그대로 둔다. 새 사례1건을 추가하면 전체 예상은1000/991통과/실패취소0/skip9다. 추가하지 않고 main 변경만 합치면999/990/0/9다.
3. main의 기존 이름1건 변경(미지원 Vitest→로컬 Vitest 없음)은 허용한 명시 쌍으로 대조한다. 추가3개와 sentinel1개를 정확히 더하고 나머지 기존 시험 이름/판정/skip사유를 보존한다. 기존 T05 판독기를 덮어쓰지 않고 별도의 통합 비교 도구/새 label로 검증한다.
4. 통합 후 runtime은 최소610개(새 Vitest driver1개)이며 execute.ts·test-runner.test.ts·두 문서·README도 바뀐다. 실제 tree에서 다시 계수하고 SHA를 고정한다. main드라이버/시험의 정확한 보존과 공유 실행기 합성 diff는 독립 검토받고, 전체 diff 보안의 통합 증가분도 다시 대조한다.
5. 최종 계약 P-6은 통합한 고정 소스의 원래 비계측 check 새3회가 필요하다. 같은 T01 기준선 원값/기본4/회차 격리·실패취소0·기존skip사유/범위를 보존하고 첫 실패/범위/SHA 차이면 중단한다. 기존5회 선택 기록의 동시성 결정이나 이미 통과한 좁은 변이8개를 이유 없이 전부 다시 실행하지 않는다. 변경 영향과 관측 누락이 있는 범위부터 검증한다.
6. 통합후3회 수락/독립 양쪽 재판정 뒤 finish 필수 전체 검사는 별도로 유지한다. finish를 P-6의 세 번째 표본으로 쓰지 않고 그 직전/직후 동일 전체를 별도로 중복 실행하지 않는다. 새로운 작업 범위/태스크 및 rebase·충돌 처리 시점은 main이 지정하기 전 시작하지 않는다.

## 609-SHA/50.509% 결과가 대표하는 범위

705472.9278ms 및50.5092543% 감소는7b3a926의609개 소스,996건에 대한 유효한 통합 전 관측이다. 잘못된 결과로 바꾸거나 버리지 않는다. 그러나 새 Vitest driver와3개 시험 및 실제 실행기가 달라지는610개 이상/999건 이상 통합 소스를 대표하지 않는다. README SF보완도 동결 소스 집합의 변경이다. 기존 절반 여유7.259초에 새 시험 비용을 추정해 통합 P-6을 합격시킬 수 없다. 좁은 통합 회귀와 finish1회만으로 최종3회 시간 계약을 대체할 수도 없다. 새 소스의 계약 목표는 재관측 전 미확인으로 둔다.
