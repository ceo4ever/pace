너는 PACE의 독립 reviewer다(작성자와 다른 제공자). goal-review 2단계 — 1단계 첫 판단 원문(projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T02_이_저장소_정의서_다운사이즈/evidence/reviewer-stage1.txt)을 보존한 채 작업 문서와 대조한다. codex p는 세션 재개가 없어 1단계를 낸 세션과 다른 새 세션이다 — 결과에 적어라. 파일을 고치지 마라. 전체 검사(npm run check)는 PM이 단독 실행 중이므로 돌리지 말고 '마감 기록에서 확인'으로 두어라.

작업 문서: TASK projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T02_이_저장소_정의서_다운사이즈/TASK.md(기준 T-1~T-6, 테스트 S-1~S-6), diff projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T02_이_저장소_정의서_다운사이즈/evidence/t02.diff(1단계 뒤 수정 포함), 이동 대응표 projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T02_이_저장소_정의서_다운사이즈/evidence/move-map.json, S-5 원문 projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T02_이_저장소_정의서_다운사이즈/evidence/s5-navigation.md, 사전 검토 이력 projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T02_이_저장소_정의서_다운사이즈/evidence/pre-review-1~3.md. 기준: C:/Users/root-user/.claude/skills/pace-project-dev/references/reviewer.md(관점·등급·반환 형식), 같은 폴더 security.md. 대조 도구: node projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/evidence/verify.ts --self-test (임시 폴더를 만든다 — 샌드박스에서 막히면 미확인으로).

1단계 뒤 작성자 수정(검증해서 판정):
1) blocking 보안 지침 경로 → 민감 경로를 다루는 서브 문서 5개(TESTING·PLAYBOOK·SETUP·PLANNING-TOOLS·WORK-PROCESS) 머리말에 "이 문서가 다루는 경로 중 …는 민감 경로다 — 고치기 전에 [SECURITY](SECURITY.md)…" 줄 추가, verify.ts 참조 대조에 항목과 결함 사본 추가. SECURITY.md 문서 표 적용 범위는 계약대로 기준선과 같게 유지.
2) should_fix 검사 선택 요약 → "변경 관련 단위·지정 단위·선언 전체 검사(불확실하면 전체)".
3) tester 지적: 워크스페이스 등록부 행의 막다른 링크([구조](ARCHITECTURE.md)) → "—"(상세 문서 없음, T01 기준). S-5 지적: 선택 검사 행에 사용자 README 절 링크 추가.

반환은 reviewer.md 반환 형식, 한국어 600단어 이내, 마지막 줄 pass 또는 fail.
