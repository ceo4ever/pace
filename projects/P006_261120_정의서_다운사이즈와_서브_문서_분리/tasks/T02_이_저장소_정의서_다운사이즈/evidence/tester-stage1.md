# tester 1단계 (호스트 새 맥락 서브에이전트 · anthropic) — PM이 옮긴 판정·지적

- 판단: 측정 기준 P-3~P-7은 직접 실행으로 충족(measure 15,281B·위반 0, src/*/ 12개 등록, declaredCommand 네 라벨 전후 동일, 기준선 126행 중 98행 동일 행·나머지 다시 쓴 표 행의 60자 이상 칸 모두 원문 그대로, 서브 문서 11개 등록·링크·brain lint 0, secret-scan 통과, 집중 테스트 8/8, verify --self-test 6종 검출). 전체 검사는 지시대로 미실행.
- 대용 지표 위험: "읽힌다"를 16KB로 대신 잰다 — 부트는 정의서를 주입하지 않고 AGENTS.md 더 보기 안내가 읽힘을 좌우. 새 세션 실측 제안.
- 여유: 15,281B는 한도의 93% — 유지 지속성 모름(기준 운영은 사람 결정 → 남긴 것).
- 결함: 워크스페이스 등록부 행 `[구조](ARCHITECTURE.md)`가 등록부 언급 없는 문서로 이어지는 막다른 링크 → `—`로 수정(반영).
- `../ai-framework.wt` → `../pace.wt`가 원문 보존 범위 밖 수정 — 대응표 예외(계약 덤)로 기록돼 있음.
- 노출: docs/README 전체, ARCHITECTURE·AGENTS·브레인 diff, boot.ts grep, harness reader, project-docs 기준 표. TASK·evidence 미열람. 부트 주입: CLAUDE.md→AGENTS.md, MEMORY.md.
