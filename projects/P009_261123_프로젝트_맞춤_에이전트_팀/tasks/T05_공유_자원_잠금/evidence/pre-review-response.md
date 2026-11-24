# T05 사전 검토 처리

R1 fail/blocking1: 래퍼 종료만 보던 소유자 정의를 자식 그룹까지 확장하고 START 전 영속 기록 bridge를 계획했다. R2 fail/blocking1: 정상 완료도 같은 그룹 부재 조건을 직접 접근5/S-4에 반영했다. R3 pass/blocking0. 두 반복은 계획의 종료 경로 누락이며 목표·범위 변경 없이 전 경로 공통 종료 확인으로 보완했다.

R3 S8: machine 정의 지문은 PACE_HOME machine guard 아래 영속 상태에 최초 기록하고 released 뒤에도 유지한다. repo name binding은 scope 전환 우회를 막고 machine 상태 지문은 다른 저장소의 정의 불일치를 보류한다. 최초 승자는 machine guard로 직렬화한다. probe argv는 문자열 배열을 정확히 비교하며 상대 인자는 최초 소유 작업 루트에서 실행한다; 서로 다른 절대 실행 파일은 다른 확인 방법이므로 자동 동등성으로 간주하지 않는다. machine 공유 사용자는 공통 절대 확인기 또는 같은 portable argv를 합의한다. T08 실제 자원 확인기가 이 계약을 갖춘다.

R3 S9: S-1은 binding 불일치 및 승인된 임시 binding 교체 절차를, S-3은 pre-start+래퍼 종료와 START 영속 기록 순서를 포함한다. 독립 tester 인계에 이 보완 문서를 명시한다. pre-start 회수도 자원 free 또는 수동 확인을 생략하지 않는다. 전경 모드는 정상 신호 종료에도 잠금을 보존하고 래퍼 종료 뒤 수동 확인으로만 회수한다. 그룹 SIGTERM 후 유한 대기에도 살아 있으면 hold하고, 종료 성공을 추정하지 않는다.

R1~R3 기타 should_fix: guard 중단·binding 변경은 안전 확인과 별도 승인 후 운영자가 수동 보관/교체하는 문서 절차로 두고 강제 자동 삭제 API를 만들지 않는다. 확인기 없는 명령도 종료 후 잠금이 남는 의도된 흐름이며 명시 시험한다. outcome·childExitCode·signal로 CLI 종료코드 중첩을 구별하고 수동 확인의 호출 환경 식별은 안전 형식으로만 기록한다; 주체 인증이라고 주장하지 않는다. ps 초 단위 시작 식별과 PGID 재사용은 보수적 hold 한계다.

2단계 SF 처리: PACE_HOME 이름별 scope registry를 repo 요청도 먼저 대조하므로 다른 저장소의 machine/repo 선언 분기도 거부한다. 모든 등록은 machine registry guard 안에서 직렬화하며 machine 상태 정의도 machine guard로 대조한다. source가 만든 신호 경로는 메모리 bridge와 OS 시작 식별 확인에 한정하고 외부 명령은 신호를 보내지 않는다. PGID 0/1과 손상은 거부하고 ESRCH만 gone, EPERM/기타는 unknown으로 별도 구현·시험한다. 알려진 --by 구성원은 원본 resources 선언을 대조한다. 임의 담당 표지/프로젝트 번호는 인증이 아니며 선언 신뢰 경계를 문서화했다. 교본 색인은 React/Vite·AI 회귀 중심임을 인정하고 보안 상세는 SECURITY 체크리스트와 주변 프로세스/파일 코드, 타이밍은 e2e Flaky 절로 대조한다.

최종 구현 reviewer SF1의 acquire/status 일반 신호 지연은 가용성 후속으로 남긴다. SIGKILL·I/O 예외를 포함하는 중단 guard 복구는 어차피 소유자/그룹/자원 확인과 별도 승인으로 다루며, 일반 신호만 특별 처리한 자동 회수 보장을 만들지 않는다. 작업 수명 동안 SIGINT/SIGTERM/SIGHUP과 START 전 중단은 처리·실제 시험하며, 획득/status 중 중단의 수동 guard 복구 한계는 문서와 메모리 idea에 공개했다. busy 대기는 BR05의 거부 허용과 outcome 구별로 충족하고 확장하지 않는다. 최종 tester의 안전 회수 성공 권고는 실제 래퍼·그룹 종료 뒤 다음 source CLI 획득과 reclaim 감사로 시험에 보완했다.
