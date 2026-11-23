# main 반영과 보존

코디네이터 지시로 T02 추적 diff·미추적 파일을 별도 패치·tar·SHA256 목록으로 백업하고 stash의 고정 참조를 보존했다. main e7c7d24까지 rebase했으며 T01 커밋은 f7ed556에서 74e288b로 바뀌었다. 충돌은 메모리 INDEX와 생성 dashboard data뿐이어서 각각 pace memory index --project 및 pace backlog refresh로 파일 목록에서 재생성했다. T02 복원 뒤 dashboard 생성 자료도 같은 명령으로 재생성했다. 수동 정본/증거 충돌은 없었다. 미추적 27개 파일의 SHA256과 핵심 원장·CLI·시험 4개 파일의 바이트가 백업과 같음을 확인했다. 백업과 stash는 유지했다.

main의 Telegram S-4b·S-9g 수정 및 Orca 전체 검사 규칙을 반영했다. 새 규칙 원문은 .pace/memory/orca-안-전체-검사는-브라우저-e2e-끔.md다. P008은 브라우저 동작을 변경하지 않으므로 PACE_SKIP_BROWSER_E2E=1 npm run check를 실행한다. 이는 playbook Orca 브라우저 E2E 4개만 끄며 나머지 타입·전체 회귀와 PM의 actor CLI 실측은 유지한다. 이전 실패와 동시 실행의 인과는 미확인으로 남긴다. 시작·종료의 runner_cwds 기록을 별도로 보존한다.
