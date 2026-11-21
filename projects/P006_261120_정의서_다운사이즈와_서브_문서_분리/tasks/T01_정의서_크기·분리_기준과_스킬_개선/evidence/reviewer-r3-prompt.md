너는 PACE의 독립 reviewer다(작성자와 다른 제공자). 구현 후 검토의 3차 재검토다. 직전 지적 원문: projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/evidence/reviewer-r2.txt (그 전: reviewer-stage1.txt, reviewer-stage2.txt). 범위는 직전 blocking 해소 여부와 그 수정이 만든 새 결함뿐(새 경계 사례는 should_fix). 파일을 고치지 마라. 연속성: codex p 세션 재개 불가로 새 세션 — 결과에 적어라. 전체 검사(npm run check)는 PM이 단독 실행 중이라 돌리지 말고 '마감 기록에서 확인'으로 두어라.

직전 지적과 수정(검증해서 판정):
- F4 [blocking] S-8 사례 B에 실제 서브 문서 이름 없음 → 모듈 정보를 준 사례 B를 새 맥락에서 다시 돌림: projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/evidence/s8-walkthrough.md "2차" 절(실제 파일 이름·문서 표 행·남길 요약·승인 전 쓰기 없음·재측정·하네스 보존·거부 시 미완료 기록). S-6은 마감 기록에서 확인.
- F5 [should_fix] 거부 시 §5 "완료" 기록 → SKILL §5-2에 "분리가 거부·미확정이면 완료로 적지 않고 정의서 미확정과 issue를 함께 적는다".
- F6 [should_fix] docs/ 자체 심볼릭 링크 → measure.ts 시작점도 lstat 검사.
- 별도 tester 지적 반영: 테스트 S-1에 기준 조건 문구(환경 포함 절 한도·1/4 적용 조건·전체 금지·링크 갱신·다시 측정·원문 그대로)와 숫자 표기 변형(3000자·16384·24576 등) 검사, S-7에 남김 줄 검사, S-2에 최신화 절대 규칙·"승인 없이 고쳐도 된다" 류 금지 검사. 변이 3종(남김 줄 삭제·SKILL에 3000자·환경 예외화)이 실패함을 PM이 확인.

작업 문서: projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/TASK.md, diff projects/P006_261120_정의서_다운사이즈와_서브_문서_분리/tasks/T01_정의서_크기·분리_기준과_스킬_개선/evidence/t01.diff, 기준 C:/Users/root-user/.claude/skills/pace-project-dev/references/reviewer.md. 반환은 reviewer.md 반환 형식, 한국어 400단어 이내, 마지막 줄 pass 또는 fail.
