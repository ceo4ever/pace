# 함수 전환 계획 fail 처리

동일 anthropic 사전 reviewer의2e5ef1de 대상 fail blocking2/should_fix4를 원문/PRE-REVIEW와 실패 TASK 사본에 보존했다. 실제 구현은 하지 않았다.

- B1: 파일 전체 자식 공유를 철회했다. 블록별 scope와 그 안 fixture HOME별 새 자식으로 모듈 캐시 경계를 제한한다. 처음부터 실제 첫 fixture env/cwd로 fork해 main import 시점도 고정한다. 같은 HOME 안 main/worktree 전환의 cwd/Repo·파일/선언/설정은 호출 시점에 읽는 실제 project 경로를 정적으로 대조해 project-main-state-audit와87개 보수적 import 노드의SHA에 연결했다. 해당 그래프를 모든 runtime 전역 부재의 증명으로 쓰지 않는다. done/finish/merge의 실제 상태는 기존3블록의 파일/Git/상태 단언으로 검증한다.
- B2: 실제 bin의 main 반환과 UsageError2/기타예외1·pace stderr 한 줄 매핑을 명시했다. IPC/timeout/overflow/예상 밖 종료는 별도 도구 실패이며 제품1로 감추지 않는다. 같은 입력의 실제CLI와 직접호출에서 UsageError·기타 parseArgs 예외·HarnessError status/stdout/stderr를 대조한다.
- SF-1: JS stdout/stderr write 후킹을 선택했다. 대상 project 출력은 JS write와 pipe를 쓰는 spawnSync 반환에 모이는 실제 코드를 대조했다. 예상 밖 raw pipe 출력은 도구 실패로 드러내고 다음 요청에 섞지 않는다. 이 범위를 다른 CLI/상속출력 경로에 일반화하지 않는다.
- SF-2: 변환 때문에 달라질 실제 stack 행과, 원래 블록의 assert 번호·식/메시지·원래행 매핑을 함께 기록한다. 같은 원래 단언에 도달해야 하며 앞선 설정/컴파일 오류는 검출이 아니다. 변이 자식의 실제 cli.ts import URL/SHA가 소유 변이 사본 안인지 확인한다.
- SF-3: M3을 실제CLI 유지 경로 증거로 재분류했다. M2의 최종 BL 저장 생략 변이를 BL생명주기뿐 아니라 EIO의 복구 후 직접 merge에도 적용해 실제 전환 부분의 기존 최종상태 단언을 검증한다. M1/M2가3개 전환블록을 대표한다.
- SF-4: 정상 결과는 status/stdout/stderr/signal:null/error:undefined를 명시하고 현재 대상은 앞3개 필드만 읽음을 연결한다. 예기치 않은 process.exit/child 종료, timeout 뒤 동일scope 후속 실패도 보이게 하며 자동 재시작하지 않는다.

새 함수 계획은 코드/런타임 동작 변경이 없는 설계 보완이다. 새 해시와 같은 reviewer의 판정을 받기 전 전환 전 시험·구현·새 전체 측정을 시작하지 않는다. P-5/P-6 기준/기존 실패·진단의 보존과 제외는 그대로다.
