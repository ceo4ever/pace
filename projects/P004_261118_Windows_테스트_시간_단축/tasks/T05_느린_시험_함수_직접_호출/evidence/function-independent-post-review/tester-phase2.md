# T05 독립 테스터 2단계

## 기준 대조

- BR05/P-5의 시험 전환 및 T-1의 구현과 선택 범위 검증은 통과로 판단한다. 3개 시험이 제품의 실제 `main`을 호출하고 대표 CLI와 NODE_OPTIONS EIO 주입을 보존한다. 전환 전후 시간은 121.918초→107.391초로 기록됐으며 효과 추정 범위는 같은 3개 샘플의 전후 각 한 번이다.
- T-2의 코드·검출력 항목은 통과로 판단한다. 원래 단언·이름·분기·실제 Git·장애 주입을 diff와 감사 기록으로 대조했고 S-1~S-5 원문은 이를 뒷받침한다. T-2의 전체 987통과/실패취소 0 항목은 마지막 회차에서 충족하지 못했다. T-2 전체를 통과 처리할 수 없다.
- T-3/P-6은 미달이다. 새 연속 3회 벽시계의 관측 중앙값은 704.630초로 기준 712.732초 이하였으나, 세 번째 회차에서 Windows Git Bash wrapper 경로 비교가 1건 실패했다. 3회 유효성·무실패와 중앙값이 모두 필요하다는 TASK와 PROJECT 기준상 T05 마감 판정은 보류한다.
- PRE-REVIEW.json 마지막 판정은 교차 제공자의 pass, blocking 0, 기존 검토 연속성 same이다. 저장소의 CRLF 및 상태 행 정규화 규칙을 적용한 현재 TASK.md의 해시는 마지막 시도와 일치했다. 사전 검토는 구현 진입을 승인한 기록이다.

## 코드 경계와 검출력

부모의 `run`은 최초 fork/ready를 포함해 60초 제한을 감시한다. 요청은 1개만 진행하고, ready/result의 PID·세대·CLI URL을 대조하며 result의 cwd/HOME/PACE_HOME도 확인한다. 자식은 실행 상태와 출력 경계를 finally에서 복원한 뒤만 응답한다. 제품 반환과 예외의 결과 매핑은 bin의 상태 및 stderr 표현을 따른다. 별도 인프라 오류 메시지, 비정상 종료, IPC 오류, 출력 1MiB 초과, 예상 밖 raw output은 정상 제품 상태 1로 변환되지 않는다. 부모가 scope를 오염 상태로 표시하고 대기 요청을 reject하며, 응답 처리 뒤 발생한 오류도 teardown의 close가 실패로 올린다. before-ready/during-request/outside-request 구분과 실제 CLI stderr 무정규화 비교는 사전 검토 SF-A에 대응한다. 타임아웃, 강제 종료, 인프라 출력 실패 경로는 이번 독립 검토에서 소스만 대조했다. 기록된 도우미 사례는 일반·제품 예외 경로를 동적으로 확인한다. 닫기 제한은 종료를 요청한 뒤 실제 close 이벤트를 기다리며 자손 전체 강제 회수를 보장하지 않는다.

변이 검증은 전후의 실제 스택과 단언을 대조했다. M1은 `assert.equal(bad.status, 1)`에서 검출됐다. M2의 생명주기와 EIO 복구는 각각 실제 BL 완료 단언에서 검출됐다. EIO 복구 변이의 원문은 retained CLI merge status 1 뒤에 직접 finish와 직접 merge status 0을 남기고, 직접 merge가 마지막 호출인 상태에서 원래 `assert.match(readFileSync(bl, "utf8"), /상태: 완료/)`가 실패했음을 보여 준다. 사전 검토 SF-B의 귀속 근거다. M3는 retained CLI EIO 뒤 소유 임시 파일 목록이 비어야 한다는 원래 단언에서 검출됐으며, M3 원문의 `RETAINED_EIO_CLI` 표식은 집계 파일의 `originalCalls`와 별도다.

이 단계에서는 TASK.md, PRE-REVIEW.json과 사전 검토 원문 및 disposition, PROJECT.md, BR05와 실제 코드/실행 증거를 대조했다. 추가 테스트나 도우미 실행은 하지 않았다. Windows wrapper 진단과 제품/시험 변경은 수행하지 않았다.
