# R7~R9 반복 실패 원인 진단

분류: design · PM 결정. 상위 목적/기준/PRE를 변경하지 않고, 임시/현재 제품 파서와 시험만 보완한다. 사용자 데이터·외부 전송·비밀·되돌릴 수 없는 동작에 닿지 않는다. 새 owner 명칭은 별도로 전달된 사용자 결정이며 같은 진단의 회피 근거가 아니다.

R7은 fenced 예시를 실제 표로 인정했고, R8은 주석 전처리가 fence를 닫는 문제, R9는 전체 주석 줄의 제거로 다음 절 heading을 소거하고 inline code 속 주석 문자를 실제 다중 주석 상태로 만든 문제를 재현했다. 반복 원인은 필드/표를 찾기 전에 Markdown 구조를 각자 불완전하게 변형한 중복 파서다. 경계가 지워지면 안전한 거부가 아니라 다른 절의 자료를 인정하거나 필수 적용 자체를 건너뛴다.

근본 조치: 표지와 회고가 공유할 최소 구조 투영 함수를 만들고 fence/HTML block을 먼저 구별한다. 일반 행은 inline code span을 식별해 그 안의 comment delimiter를 상태 변경에 쓰지 않고, 실제 comment만 공백 치환하여 heading 경계를 보존한다. 원문 줄 경계를 유지하고 opaque block은 sentinel로 남겨 표/heading 연결을 막는다. 제목 뒤 주석·inline delimiter·코드 예시·멀티라인 comment와 실제 양성을 고정 반례로 추가한다. 이 함수는 완전한 Markdown 렌더러나 사람 진정성 인증이 아니며 canonical header/table 계약을 유지한다.

R9 should_fix(진행 중 전체 구간의 역할 과거 관측 소실)는 과거 영수증을 현재 전체 총량으로 올리지 않는 보수적 경계다. 이번에는 수집 구간을 별도 출력하는 schema 확장을 하지 않고 한계/후속 후보로 남긴다. 닫힌 대표 업무 구간의 정상 역할 관측은 계속 제공하며 T08의 실제 수집도 고정 구간으로 한다.

재검증: 근본 수정 후 같은 target/원장의 verify를 새 기준 전체 검토로 실행하고 독립 tester 계약 대조와 관련/전체 검사로 검출한다. 과거 pass/실패/실행 중인 옛 후보 검사 원문은 보존하며 새 결과로 대체하지 않는다.

## Independent tester contract stage

The separately received stage2 judgment found reversed before/after intervals, conflicting review msg/data, coordinator answer before question, and out-of-period observed-none proof (blocking4/should_fix1). Original probes and outputs are preserved. These are implementation/design gaps within the unchanged measurement goal. Current fixes require chronological groups, canonical review parser/data consistency, answer timestamp at or after the request origin, and passing the current dashboard period to retrospective proof validation. Original 39 and new 3 tests pass42; related owner protocol tests pass78. Native tester regression22 failures also reproduce at base441c1d3 due sandbox /bin/ps denial and are not claimed as product passes. PM unrestricted-shell related tests are recorded separately.
