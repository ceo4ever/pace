# 전용 시험 작업공간

> **이전 Windows PC 기록(이력).** 2026-11-22 macOS 새 PC로 재개하면서 이 PC에는 적용하지 않는다. 현재 준비·실행 기준은 [TASK.md](TASK.md) 접근 절(v3)이다.

- 경로: `D:/LucasStudio/pace-validation/P005-T04-20261122`, workspace 이름 `pace-p005-t04`. PACE 소스 checkout과 분리한 신규 합성 Git 저장소다.
- 생성 파일: `AGENTS.md`, 무작위 challenge를 담은 `fixture.txt`, 기준 문자열을 담은 `approved.txt`, `denied.txt`, `expired.txt`, `old-boot.txt`, `interrupted.txt`. 생성 바이트의 해시와 최초 Git commit은 evidence/workspace-preparation.json에 있다.
- 모델 쓰기는 해당 요청에서 지정하고 승인한 결과 파일 하나에만 허용한다. fixture·AGENTS·Git 데이터·외부 파일·네트워크·보조 에이전트·삭제·Git 변경 명령은 금지한다. 나머지 파일은 각 시나리오 전후 해시로 보존을 확인한다.
- 복구 사본은 전용 저장소 최초 commit과 보호된 기존 비밀 설정 디렉터리의 운영 config 사본이다. config 사본 내용과 Telegram 식별자는 저장소에 복사하지 않는다. 정상 복원은 최신 운영 config에서 이 시험 workspace 항목만 해제하는 방식이며, 다른 운영 변경을 과거 사본으로 덮지 않는다.
- 캡틴은 전체 복구 시험과 시험 뒤 workspace 등록 해제를 승인했다. 실제 격리 해제는 회수·파일 검토 증거를 제시해 별도 확인한다. 시험 뒤 파일/Git/토픽/메시지는 보존한다. read-only·정상 기동·Windows 자동 실행 등록을 최종 확인한다. 병합 및 실제 재로그인은 이번 승인이 아니다.
- 등록 뒤 정상 stop/start로 새 boot와 설치본 프로세스 소유자를 확인했다. bind 준비 근거는 evidence/bind-readiness.json이다. 이후 검증 토픽 결속을 확인했다. 실제 모델 작업은 미관측이며, 다른 PC 인계 상태는 HANDOFF.md를 참조한다.
