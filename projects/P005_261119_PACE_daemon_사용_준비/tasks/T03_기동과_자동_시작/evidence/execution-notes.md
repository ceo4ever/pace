# T03 자동 시작과 병행 검사 실측

## 현재 승인과 대상

캡틴의 최신 자동 실행·지금 기동 선택을 사용자 결정으로 기록했다. Windows 사용자 로그인 시작 항목과 설치본 런처를 등록하고 기존 운영 device를 유지한다. 기존 이름 유지 해석은 main 판단으로 구분했다. T02 시크릿·허용자 한 명·workspace 없음·운영 config를 그대로 두며, 기동의 그룹 메뉴·General 연결/재기동 알림은 T03 승인 범위다. 로그오프/로그온은 도구로 실행하지 않는다.

설치본 0.1.1의 daemon 소스 트리 및 명시 CLI/도우미 26모듈을 사전 해시와 대조했다. 시작 항목이 다른 명령을 가리키거나 런처가 다르거나 legacy 항목이 있으면 중단하는 경로를 두었다. 시험에 앞서 단일 인스턴스 포트를 잡았다가 반환해 기존 daemon이 없음을 확인했다. 레지스트리 조회는 현재 사용자 PACE Daemon 값과 그 키 조회만 사용했고 다른 시작 항목을 출력하지 않았다.

## 최초 준비 확인의 실패와 회복

첫 설치 호출 뒤 제어 스크립트가 즉시 소유자 확인을 통과하지 못해 registration-start 단계에서 중단됐다. 이때 자동 시작 등록과 실제 기동은 성공한 상태였다. 최초 실패의 세부 predicate는 별도로 보존하지 않았고, getOwner 직후라는 코드 흐름과 이후 정상 상태만 확인할 수 있다. 설치본은 인스턴스 포트를 먼저 잡고 이후 lock/status를 초기화하므로 준비 확인 경합 가능성은 추정이다. 이를 제품 기동 실패나 확정 원인으로 단정하지 않는다.

초기 감독은 소유자를 아직 확보하지 못해 다른 프로세스를 정지하지 않았고 실제 daemon이 살아 있었다. 후속 확인에서 해당 프로세스의 시작 시각이 이번 승인된 호출 범위 안이며 실제 포트 소유자이고 설치본 Node/CLI daemon run 명령임을 로컬 대조했다. 이 프로세스만 시험 소유자로 명시 인계했다. 이후 제어에는 제한된 준비 완료 polling과 실패 시 동일 소유자 정상 정지 fallback을 추가하고 독립 감독을 다시 준비했다. 근거 initial-owner-verification-gap.json 및 execution-failure.json. 새 제품 코드나 설치본은 수정하지 않았다.

## 정식 CLI 수명주기

승인된 설치 CLI install --yes --start로 정확히 이 홈의 숨김 VBS와 HKCU Run 값을 확인했다. 두 번째 start는 exit 0·동일 PID/boot를 유지했고 직접 run 중복은 exit 2·기존 소유자 유지였다. 이어 stop exit 0, 정지 status exit 3, stopped·lock 없음·포트 해제를 확인하고 다시 start/status로 새 boot의 정상 기동을 확인했다. 근거 lifecycle-observations.json.

중복 경로에서 새 어댑터/연결 알림이 생기지 않는다는 것은 동일 소유자 관측과 설치본 start/run의 선행 분기 소스로 뒷받침한다. T02처럼 API params를 계측해 실제 알림 건수를 직접 세지는 않았다. Windows 숨김 VBS 내용과 UTF-16LE BOM·Run 값의 정확한 일치는 확인했으나 실제 재로그온 자동 실행/콘솔 비표시는 아직 사람 실측 전이다.

## 병행 검사·메모리

현재 worktree 작업자 세션과 실제 운영 daemon 대기 상태에서 태스크 전체 검사 npm run check 한 회를 임시 PACE_HOME으로 실행한다. 시작 전부터 종료 후까지 5초 목표의 가용 물리 메모리·daemon WorkingSet64·프로세스 시작 시각·소유자/heartbeat를 관측한다. 수치 합격선이나 기동 권한 게이트는 없고 샘플 사이 순간 최저·모든 시스템 OOM 부재를 보장하지 않는다. 실제 daemon 모델 두 작업의 부하는 T04 범위다.

해당 한 회는 exit 0·991 pass·0 fail·9 skipped(총 1,000건)로 끝났다. 검사 구간은 UTC 04:48:19.924~05:00:51.371이며, 실제 샘플은 한국 시간 13:48:19.863~14:00:52.284의 152건이다. 조회 오류·간격 중첩 누락은 0이고 관측 최저 가용 물리 메모리 12,530,608 KiB(약 11.95GiB), 최대 daemon WorkingSet64 97,116,160 bytes(약 92.62MiB)였다. 실제 관측 간격은 종료 직후 최종 샘플을 포함해 658~5,864ms다. 모든 샘플에서 같은 daemon이 유지됐다. 출력의 OOM 오류 신호 0, 같은 검사 구간의 Resource-Exhaustion-Detector 조회 가능·이벤트 0이었다. 이 범위 밖 OOM이나 순간 최저를 단정하지 않는다. 근거 repository-check-result.json, memory-samples.json, memory-summary.json, system-memory-events.json.

비밀 없는 별도 감독과 제어 프로세스에 최대 30분 기한이 있다. 실패·기한·제어 소멸 때는 기록된 소유 PID/boot/start/실제 포트가 맞는 경우만 정상 정지를 요청한다. 전체 검사와 최종 무결성이 통과한 뒤에는 캡틴이 고른 최종 등록+정상 기동 상태를 위해 감독을 명시 해제한다. 사용자가 승인한 상시 기동을 자동 시험 정지와 혼동하지 않는다.

전체 검사 후 같은 인스턴스와 Run/런처 정확 일치·config/device·시크릿 불변을 확인해 감독을 해제했다. 현재 상태는 승인된 자동 시작 등록+정상 기동이다. 재로그온 기준점은 human-relogon-baseline.json에 원문 식별자 대신 이전 boot/소유자 해시·기동시각·설정/시크릿 해시로 보존했다. lifecycle-observations의 priorRunValueExisted=true는 최초 준비 확인 실패 때 이 작업자가 이미 등록한 값을 재사용한 시점의 기록이며, 다른 미확인 기존 등록을 덮어썼다는 뜻이 아니다.

## 실제 재로그온 대기

실제 로그인 자동 실행과 콘솔 창 없음은 등록·현재 CLI 기동·VBS의 창 스타일만으로 통과하지 않는다. 검사와 기준점 보존 뒤 main에 절차를 전달했으나, 2026-11-21 캡틴이 현재 로그아웃하기 어려워 해당 실측을 병합 후로 이관하도록 결정했다. PROJECT P-3·T03 T-4/S-5a·BR03/BACKLOG를 같은 합의로 수정했고 미실측은 프로젝트 todo로 유지한다. 지금 재로그온을 요청하거나 강제 실행하지 않는다. 로그온 전에는 HKCU Run이 실행되지 않는다는 한계도 남는다. 병합 후 최신 기준점을 확보하고 수동 start 없이 새 기동·단일 인스턴스·등록/설치본/설정 일치와 사람의 콘솔 비표시 확인을 별도로 남겨야 한다.

## 감사 소스

execution-common.mjs·execution-run.mjs·execution-guardian.mjs·execution-memory.ps1·execution-adopt.mjs는 실제 실행한 비밀 없는 소스의 감사 사본이며 원문/LF 정규화 해시는 execution-source-hashes.json에 있다. 상대 import는 실제 임시 실행 당시 파일명을 유지하며 그대로 운영 실행하는 배포 도구가 아니다. 입력 비교 함수는 T02의 실제 로컬 helper를 import했으며 토큰을 출력·argv·환경변수로 전달하지 않는다. 당시 helper의 감사 사본과 원본/공백 서식 해시 차이는 T02 마감 증거에 남아 있다.
