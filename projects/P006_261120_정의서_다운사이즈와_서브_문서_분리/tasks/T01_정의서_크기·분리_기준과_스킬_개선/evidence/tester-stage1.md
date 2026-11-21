# tester 1단계 (호스트 서브에이전트, anthropic, 새 맥락) — 요약 보존

판정: 조건부 미달. (원문은 호스트 대화에 반환됨 — 아래는 PM이 옮긴 지적 전부)
- 대용 지표 위험: P-1·P-2는 문구 존재 위주 — 실제 효과는 T02 실증에 달림.
- 1/4 규칙 변경은 사용자 기준 변경 — 승인 기록 확인 필요(→ 계약 v2가 T01 조정 허용, 결정 메모로 기록).
- 직접 실행: project-init-skill 테스트 4/4, measure-selftest 13/13, measure 외부 측정(PACE 40,703B 위반 13건 등), secret-scan 통과, tsc 오류 없음, npm run check 전체는 미완료(미확인).
- 근거 문장이 사실과 다름: 서브 문서 24KB "근접 사례 없음" — canvas ARCHITECTURE 32,303B·CAPTURE 26,494B, git-studio SECURITY 34,251B가 넘음 → 근거 문장 수정.
- 재는 법 누락: 서브 문서 크기 측정이 analysis.md §7·SKILL §4-1에 없음 → 추가.
- 측정 도구가 스킬 밖(증거 폴더)에 있음 — 에이전트가 설명만 보고 직접 재야 함, 값 일치 미확인 → T02/남긴 것.
- 노출: 부트(CLAUDE.md→AGENTS.md, MEMORY 목차, git status), git diff -- skills, 테스트 assert, measure.ts·verify.ts 일부, PROJECT.md 36·46행, docs/README 보안 검사 줄, 프로젝트 폴더 목록(TASK 등은 이름만 보임, 내용 미열람).
