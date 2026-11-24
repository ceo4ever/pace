# P-5 실제 자동 생성과 첫 조회

- 실행과 판정은 코디네이터(main)가 맡았다. 사용자가 승인한 시험 포럼과 새 미등록 Git 저장소, 새 격리 PACE_HOME에서 현재 P010 작업본을 사용했다.
- 이 Mac의 Node 기본 연결에서 시간 초과(`ETIMEDOUT`)와 IPv6 도달 불가(`EHOSTUNREACH`)를 관측했다. curl의 IPv4 TCP 연결은 283ms였다. 시험 CLI와 daemon 프로세스에만 `NODE_OPTIONS=--dns-result-order=ipv4first --no-network-family-autoselection`을 설정했다. 기본 설정으로는 자동 생성 성공을 확인하지 못했다. 이전 시험의 결과 불명 원인도 확정할 수 없다.
- CLI는 Git 하위 폴더에서 경로를 생략한 add 계획에 승인된 포럼과 읽기 전용 기본값을 표시했다. 한 번 승인한 뒤 Git 루트가 활성 등록되고, AGENT와 등록 ID가 일치하며 daemon 설정과 토픽 결속이 반영됐다.
- Telegram 웹에 자동으로 토픽 한 개가 생겼다. 수동 결속 없이, 같은 토픽에서 보낸 첫 표식 조회를 Claude ACP가 읽기 전용으로 수행해 정확한 표식으로 답했다.
- 같은 add를 다시 요청하자 기존 결속을 표시했다. 토픽 한 개, 등록 ID 일치, 빈 outbox를 확인했다. CLI 결과, 시험 로그와 첫 응답에는 로컬 경로·토큰·채팅과 토픽 식별자가 없었다.
- 임시 시크릿을 제거한 뒤 기존 운영 daemon의 정상 복구를 확인했다. 시험 환경 조건과 기본 연결 문제는 main의 설치·운영 인계에 포함한다.
