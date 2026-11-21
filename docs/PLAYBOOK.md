# 플레이북 생성기

정의서 [`docs/README.md`](README.md)에서 옮긴 상세다. 정의서에는 한 줄 요약과 이 문서 링크만 남는다.

이 문서가 다루는 경로 중 `skills/pace-playbook-maker/tools/`는 민감 경로다 — 고치기 전에 [SECURITY](SECURITY.md)의 민감 경로 표와 체크리스트를 본다.

## 플레이북 생성기

- 경로: `skills/pace-playbook-maker/`(`SKILL.md`, `references/{schema,adapter,playbook-making,driving,healing}.md`, `tools/*.mjs`)
- 스택·형식: Markdown + Node `.mjs` 도구(무빌드·런타임 의존성 없음)

목표 하나를 받아 인터뷰 → 실제 수행·가림 캡처(사람이 확인한 해시로만 승인) → **플레이북**(업무 스킬 한 벌: `SKILL.md` + 에이전트 지도 `agent/` + 학습 이력) 생성(`interview`·`scaffold`·`orca-adapter`·`playbook`·`build`). 주행 라이브러리 `driver`(승인 관문·지도 최신 확인·결과 불명 처리·재개·값은 `sink`로만)와 자가 복구·학습 `healer`·`heal-web`(허용 경로만 고치고 검증·회귀·사용자 확인 뒤 원자적 반영·되돌리기). 규약 문서는 주행 규약 v1(`driving.md`)·복구 규약 v1(`healing.md`) — 플레이북은 규약을 복사하지 않고 경로·버전만 적는다. 테스트는 `test/playbook/`(래퍼 `test/playbook-maker.test.ts`, Orca 실제 브라우저 e2e 포함). 설치되는 스킬은 `pace-playbook-maker` 하나이고 만든 플레이북은 업무 저장소에 둔다
