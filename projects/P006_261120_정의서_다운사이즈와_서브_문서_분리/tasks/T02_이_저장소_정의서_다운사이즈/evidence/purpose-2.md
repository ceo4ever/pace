상위 목적: PACE의 정의서(`docs/README.md`)는 하네스가 읽는 정본이자 에이전트가 프로젝트 구조·도구·환경을 아는 지도다. 기준이 없어 상세가 쌓이고(40.7KB) 세션에서 읽히지 않는다. 사용자 결정: 정의서 크기·분리 기준을 pace-project-init 스킬에 넣고(T01 완료 — skills/pace-project-init/references/project-docs.md "정의서 크기와 분리 기준"), 그 스킬 절차로 이 저장소 정의서를 다운사이즈해 기준을 실증한다(T02, 이번 태스크).
프로젝트 기준 중 T02 해당: P-3 정의서가 스킬 기준 만족(16KB 이하, 절·행 한도, 최상위 코드 폴더 전부 등록 — src/dashboard/ 포함). P-4 하네스 선언 4개 전후 동일. P-5 빠진 상세는 서브 문서에 원문 그대로. P-6 새 서브 문서 모두 문서 표 등록, 상대 링크가 실제 파일, AGENTS.md·ARCHITECTURE.md·브레인 근거가 새 위치, pace brain lint 오류·경고 0. P-7 저장소 검사·보안 검사 통과. opi 최신화의 절 단위 승인은 계약 승인으로 갈음(사용자 결정). 기존 간헐 실패 시험(intent-preview 소유 Chrome)은 main이 처리, 재실행으로 판정(사용자 결정).
저장소: 이 작업 폴더(읽기 전용으로 살펴볼 수 있다).

재검토(2차): codex p는 세션 재개가 없어 새 세션으로 맡긴다. 범위는 1차 blocking 3건(S-3 대상 문서 대조 / S-4 문서 표 의미·옛 참조 제거 / S-1·S-2 고정 절·라벨 유일성·resolveAgent 조건)과 should_fix 1건(S-5 경로 채점)이 TASK.md에서 해소됐는지와 그 수정이 만든 새 결함뿐이다. 1차 원문: 같은 태스크 폴더 evidence/pre-review-1.md. 새 경계 사례는 should_fix로 적는다.
