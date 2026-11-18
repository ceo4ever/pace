# T03 사전 지적 처리 방침

독립 anthropic 1·2단계의 pass(blocking 0·should_fix 5)를 원문과 PRE-REVIEW에 보존했다. 기준과 TASK 정본은 유지하며 아래 세부를 구현·검증으로 구체화한다.

1. SF-1: 옵션과 위치 인자를 분리해 Node 옵션→선택적 `--`→전체 glob→추가 파일 순서로 전달한다. 알려진 값 옵션(concurrency/name-pattern/skip-pattern/reporter/reporter-destination/timeout/shard/isolation/import/require 등)은 `=값` 및 두 토큰 형태를 지원한다. 알려진 boolean 옵션과 `--key=value`도 전달한다. 모호한 미지원 bare 옵션은 `=값`을 사용하라는 오류로 거부한다. `--` 뒤는 파일만이다. 명시 concurrency는 유일해야 하고 양의 안전 정수만 허용하며 Windows 기본값을 대체한다. T01의 testArguments(platform, extra) 호출은 유지한다.
2. SF-2: 같은 두-worker marker/release 배리어 표본을 N=1에서 비정상 종료, N=2에서 성공으로 확인한다. 각 worker는 실제 상대 marker 관측 후에만 통과한다. 실제 npm check 경계에서 typecheck sentinel·이름 필터 제외·실패 sentinel도 확인한다.
3. SF-3: 기본 spec은 이름·판정·skip 사유 다중집합을 순서와 무관하게 비교한다. 중복 이름의 파일 귀속은 기본 출력으로 확정하지 않고 별도 이벤트 프로파일의 entryFile+이름+발생 수로 보완하며 줄 정보도 기록한다.
4. SF-4: 실패·수정·중단으로 무효가 된 비교는 양쪽 새 4회 묶음, 기본 검증은 새 연속 5회 묶음으로 구분한다. 원래 실패는 남긴다. 다른 검사·진단을 겹치지 않고 읽기/외부 부하 한계도 기록한다. 적합한 값이 없으면 기본값 1을 유지하고 main에 판단을 요청하며 순차 필요 파일 분리도 후보로 올린다. 5%는 이 PC의 소표본 운영 선택 규칙으로만 사용한다.
5. SF-5: `.gitattributes`는 P004 프로젝트 내부 evidence에만 `-text`를 적용한다. 도구/다른 프로젝트에는 영향이 없는지 check-attr로 확인하고 CRLF 원문의 check-in·LF의 checkout 필터 양쪽에서 byte 보존을 검사한다. 기존 T02 blob/원문/해시를 재작성하지 않고 이미 존재하는 차이는 별도 보고한다.

아직 구현/반복 측정 결과를 뜻하지 않는다. 좁은 검증과 실제 전체 관측, 사후 독립 판정이 끝난 뒤 결과를 채운다.
