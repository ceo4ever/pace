# T04 실행 준비 보완

사전 검토 pass의 TASK 기준은 유지한다. 아래는 독립 검토의 비차단 권고를 반영한 실행 세부이며, 운영 실행 결과가 아니다. 경로·파일·토픽·실제 요청·중단 및 복구에 대한 캡틴 승인 전에는 운영 설정, 메시지, 모델 작업, 프로세스를 변경하지 않는다.

- 명령은 `/bind@<봇이름> <승인된 workspace>`, `/write@<봇이름>`, `/read@<봇이름>` 형식으로 보낸다. 자연어 요청은 해당 토픽의 봇 메시지에 답장해 개인정보보호 모드의 수신 경로를 확보한다. 실제 요청과 버튼 조작은 캡틴이 수행한다.
- 운영 설정 메타데이터에서 approvalTtlSeconds=600, defaultAccess=read-only, maxConcurrent=2, workspaceCount=0을 확인했다. 설정을 바꾸지 않고 개별 승인의 실제 expiresAt 경과와 expired 전이를 관측한다. 만료 전에 재기동하지 않는다.
- 정상 stop에 의한 pending 승인 무효화/expired와 새 boot 뒤 이전 버튼의 boot 불일치 거부를 별개 증거로 남긴다. 실제 TTL 만료와도 구별한다.
- 비정상 중단은 정상 stop으로 대체하지 않는다. 대상 작업의 running과 실제 소유 실행기 자손을 모두 확인한 뒤 승인된 daemon만 강제 종료한다. 고정한 PID·시작 시각·명령/부모 관계로 자손을 재확인한다. 이미 없으면 부재를, 남아 있으면 동일 소유임을 재확인한 회수 결과를 기록한다. PID만 같다는 이유로 종료하지 않는다.
- 설치본의 Windows Run 런처 소스는 로그인 실행용 단발 wscript 호출이며 반복 감시 루프를 만들지 않는다. 이것만으로 외부 감시 부재를 실측했다고 주장하지 않는다. 중단 전 실제 프로세스 트리와 등록 경로를 다시 확인하고, 중단 뒤 예상하지 않은 새 daemon이 보이면 수동 재기동에 앞서 원인을 확인한다.
- release CLI와 core.release를 소스에서 확인했다. 실행 중에는 gateway로, 정지 중에는 인스턴스 소유권을 잡고 quarantine만 해제하며 needs_review 작업을 완료로 바꾸지 않는다. release는 가용성 확인 목적으로 호출하지 않는다. 실제 격리가 생기면 자손 회수와 파일 결과를 검토한 증거를 전달하고 별도 승인을 받은 뒤 실행한다. 회수 미확인 시 격리를 유지하며 정상 완료로 숨기지 않는다.
- 시험 끝에는 `/read@<봇이름>`으로 접근 정책을 되돌리고 실제 상태를 확인한다. 정상 기동·기존 자동 시작 등록을 보존한다. 전용 작업사본과 workspace 등록의 보존/해제는 캡틴 결정에 따르며 임의 삭제하지 않는다.
- local-preparation.json의 초기 gateway 토큰 존재 여부 false는 잘못 추정한 파일명을 조회한 값이었다. exported gatewayTokenFile 경로의 존재 여부로 정정했으며 토큰 내용은 읽거나 기록하지 않았다.

근거: evidence/local-preparation.json, evidence/pre-review-1-phase1.md, evidence/pre-review-1-phase2.md, 설치본과 대응하는 src/daemon/{config,cli,core,gateway,autostart}.ts. TASK 및 사전 검토 스냅샷은 변경하지 않았다.
