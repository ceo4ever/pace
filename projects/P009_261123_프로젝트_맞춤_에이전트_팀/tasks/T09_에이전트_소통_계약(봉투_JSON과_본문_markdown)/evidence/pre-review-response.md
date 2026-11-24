# T09 사전 검토 보완

R1 blocking1은 approved만 시험하던 우회 basis 검출 누락이었다. R2 TASK에 네 basis의 정확 코드/행수 반례와 고정 계획 계약 대조를 추가해 R2 pass/blocking0를 받았다. 이 문서는 should_fix 상세 선택이며 기준을 바꾸지 않는다.

R2 SF1/2: Orca route.actor=captain 입력은 경로 설정/검사에서2로 거부한다. 정상 coordinator route 성공은 기록하되 captain 의도만으로 도달로 세지 않고 미확인이다. 기존 사람 채널은 prepare-external로 원장/시도 선기록 후 기존 호스트 도구를 쓰고, receipt에 주체·출처·성공 응답 지문/ID를 보완한다. 원장 실패면 기존 도구 호출을 진행하지 않는 참여 규칙이다. source 없는 수동 receipt는2이고 실제 캡틴 답 또는 source 있는 사람 채널 성공만 BR01 도달 분류의 첫 두 경우다. 같은 전송 hop의 started/unknown/sent는 재발송하지 않고, 전달은 별도 relay 메시지로 같은 requestId에 연결한다. 실제 사람 채널은 새 서비스/전송 수단을 만들지 않으며 T09에서는 대역으로만 검증한다.

R2 SF3: 계획 계약은 프로젝트의 handoff-plans.json metadata이며 상세 본문은 instructionHash로 로컬 자료를 가리킨다. 작성 신고와 계약 지문/planId를 위임 metadata에 남기고 scope_check의 instruction/decisionOwner/proofScope 대조 세 항목을 필수로 기록한다. 사람 권한 인증을 주장하지 않으며 계약의 실제 합의와 의미는 수신자 및 T08 감사가 대조한다.

R2 SF4: hook 실패 lease를 이어받아 재실행하지 않는다. actual 적용 사건을 reconcile한 뒤 T05의 소유자/그룹/자원 확인·별도 승인 수동 guard 복구를 따른다. 옛 소유자 살아 있음은 busy, 종료+free면 새 획득 ID로 회수한다. 자동 guard 삭제/자동 명령 재실행은 없다. 옛 전이 ID 없는 상태 파일도 읽고 --project 없는 기존 경로를 유지하는 시험을 둔다.

보존 결정은 사용자에게서 확인된 log 요약 보존과 코디네이터의 보수적 B 설계를 구별하며 storage-decision-summary.md와 PROJECT 메모에 요약만 남겼다. 신문/비밀 원문이나 실제 메시지 상세를 검토 자료에 Git 복제하지 않는다. 지문은 짧은 내용의 추측 가능성을 완전히 없애지 않고, 참여 경로 밖 임의 Git 파일/직접 전송까지 가로채지 못하는 한계를 문서화한다.
