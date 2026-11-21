너는 PACE의 독립 reviewer다(구현 세션과 다른 제공자, 새 맥락). 이번은 goal-review 2단계 — 아래 1단계 첫 판단 원문을 보존한 채 작업 문서와 대조한다. 같은 세션 재개가 불가능해(codex p 모드) 1단계를 낸 검토자와 다른 세션이다 — 이 한계를 결과에 적어라. 파일을 고치지 마라.

저장소: 이 작업 폴더(읽기 전용). 작업 문서:
- TASK: projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/TASK.md (기준 T-1~T-6, 테스트 표 S-1~S-8)
- diff: projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/evidence/t01.diff (스킬·테스트·측정 도구 — 1단계 뒤 수정 포함)
- 1단계 첫 판단 원문: projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/evidence/reviewer-stage1.txt
- 사전 검토 원문(참고): projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/evidence/pre-review-1.md ~ pre-review-3.md, 게이트 예외 evidence/user-waiver.md
- 판정 기준: C:/Users/root-user/.claude/skills/pace-project-dev/references/reviewer.md (관점 1~6, 등급, 반환 형식), 보안은 같은 폴더 security.md
- 교본: skills/pace-tech-handbook/references/typescript/INDEX.md (바뀐 코드: test/project-init-skill.test.ts, evidence/measure*.ts)

1단계 뒤 작성자가 한 수정(검증해서 판정하라, 그대로 믿지 마라):
1) blocking 절차: SKILL §3-1은 초안 측정·분리·등록, §3-4에서 등록을 마친 정의서를 다시 측정해 확정(넘으면 1로). §4-4 경미 조건에 "반영 예정본도 기준 안", §4-5에 분리 한 단위(원문 이동·대상 파일·문서 표 행·링크)와 반영 뒤 실제 반영본 재측정·일부 승인 시 미확정 재보고.
2) blocking 템플릿 링크: 기준 절에 "링크는 실제로 있거나 함께 만들기로 승인된 문서만, 상세 없으면 —", 템플릿 예시에 링크 행과 — 행.
3) should_fix 측정: docs 하위 폴더 포함, 링크는 대상만(글자 무시), 폴더 등록은 그 아래 전체. 자체 시험 사례 추가.
4) note: 150자 근거를 기준 절 근거 문단에 추가. 지도 기능 실증(처음 보는 에이전트가 상세·명령·보안 기준을 찾는지)은 T02 몫으로 남긴다.

검사 명령: npm run check (전체는 오래 걸림 — node --test test/project-init-skill.test.ts 와 node <evidence>/measure-selftest.ts 로 충분히 판단 가능). 반환은 reviewer.md "반환" 형식, 한국어, 800단어 이내. 마지막 줄에 pass 또는 fail.
