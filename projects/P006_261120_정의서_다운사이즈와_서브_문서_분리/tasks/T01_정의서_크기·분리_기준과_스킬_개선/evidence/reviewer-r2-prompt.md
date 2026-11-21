너는 PACE의 독립 reviewer다(작성자와 다른 제공자). 이번은 구현 후 검토의 재검토(2차)다. 직전 검토(같은 Codex, 다른 세션 — codex p 모드가 세션 재개를 지원하지 않아 새 세션으로 인계)의 지적 원문: projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/evidence/reviewer-stage2.txt (1단계 원문은 projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/evidence/reviewer-stage1.txt). 범위는 reviewer.md 규칙대로 "직전 blocking의 해소 여부와 그 수정이 만든 새 결함"뿐이다. 파일을 고치지 마라. 연속성 한계를 결과에 적어라.

직전 지적과 작성자 수정(검증해서 판정 — 그대로 믿지 마라):
- F1 [blocking] §4-5 분리 단위 부분 승인 → SKILL.md §4-5: 네 가지(원문 이동·대상 서브 문서·문서 표 행·링크 갱신)를 한 단위로 함께 승인·반영, 일부만 승인 불가, 실제 반영본 재측정, 기준 초과나 단위 갈림은 승인 범위와 관계없이 미확정·재보고, 끝내 거부하면 원문 유지 + 프로젝트 메모리 issue. 테스트 S-2 문구·변이에 반영.
- F2 [should_fix] 링크 표시명 백틱 → measure.ts가 링크를 뺀 나머지의 백틱과 링크 대상만 봄, 자체 시험 사례 추가. 순회는 심볼릭 링크를 따라가지 않음(보안 메모).
- F3 [should_fix] S-7 분리 사본 → 서브 문서 파일에 원문을 쓰고 문서 표에 등록한 사본에서 하네스 네 명령과 resolveAgent(codex·저장소 기본값) 비교.
- F4 [blocking] S-8·S-6 증거 → S-8: projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/evidence/s8-walkthrough.md (바뀐 스킬만 받은 새 맥락 에이전트의 진행 원문 + PM 판정). S-6: 저장소 전체 검사(npm run check)는 실행 중 — 결과는 마감 기록(TASK-CLOSE)에 남긴다. 너는 tsc·node --test test/project-init-skill.test.ts·measure-selftest로 확인 가능한 것만 판정하고, 전체 검사는 '미확인'으로 적어라.
- 그 밖 tester 지적 반영: 기준 절 서브 문서 근거 문장을 실측(외부 서브 문서 3개 초과)으로 정정, 서브 문서 크기 재는 법을 analysis.md §7·SKILL §4-1에 추가. 기준 조정 결정은 PROJECT 결정 메모(자체 판단, 계약 v2가 T01 조정 허용).

작업 문서: projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/TASK.md, diff projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/evidence/t01.diff, 기준 C:/Users/root-user/.claude/skills/pace-project-dev/references/reviewer.md. 반환은 reviewer.md 반환 형식, 한국어 500단어 이내, 마지막 줄 pass 또는 fail.
