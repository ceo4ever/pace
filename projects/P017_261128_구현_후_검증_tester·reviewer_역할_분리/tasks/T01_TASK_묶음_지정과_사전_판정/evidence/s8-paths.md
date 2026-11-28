# S-8 원자료 (구현 커밋 후보, 2026-11-28T02:45:31Z)

## git diff --name-only --no-renames main...HEAD
(비어 있음 — HEAD=ad7196e이 merge-base)

## 작업본 변경 경로(git status --porcelain --untracked-files=all, 커밋 때 전부 인덱스에 올림)
 M .pace/memory/status.md
 M backlogs/dashboard/data.js
 M projects/P017_261128_구현_후_검증_tester·reviewer_역할_분리/PROJECT.md
 M src/agent/review-hand.ts
 M src/agent/structured-review.ts
 M src/agent/verify-cli.ts
 M src/agent/verify.ts
 M src/project/pre-review.ts
 M templates/project/TASK-CLOSE.md
 M templates/project/TASK.md
 M test/agent-review-hand.test.ts
 M test/agent-review-log.test.ts
 M test/agent-structured-review.test.ts
 M test/pre-review.test.ts
 M test/project-harness.test.ts
 M test/project-templates.test.ts
(그 밖 projects/P017_* 미추적 54개)

## 하네스 관리 파일 diff

### backlogs/dashboard/data.js (생성 산출물, JSON 키 단위 대조)

바뀐 키 3개:

- `/catalog`: "['backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BACKLOG.md', 'backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BR01_시제품_스킬_이관.md', 'backlogs/" → "['backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BACKLOG.md', 'backlogs/BL261116_01_자율_주행_업무_스킬_생성기/BR01_시제품_스킬_이관.md', 'backlogs/"
- `/generated`: '2026-11-27T22:35:37.637Z' → '2026-11-27T22:36:40.301Z'
- `/skipped`: '1314' → '1316'

### .pace/memory/status.md

```diff
diff --git a/.pace/memory/status.md b/.pace/memory/status.md
index 1724be4..d05643f 100644
--- a/.pace/memory/status.md
+++ b/.pace/memory/status.md
@@ -3,7 +3,7 @@ name: 진행 상황
 description: 어디까지 했나 · 다음 할 일 · 막힌 것
 type: status
 created: 2026-10-22
-updated: 2026-11-27
+updated: 2026-11-28
 ---
 
-P015 xhigh 팀 원본 통합을 보존하고 Git 독립 릴리즈 설치를 P016으로 구분해 GitHub main에 반영했다. 통합 전체·보안 검사와 독립 확인 통과. 과거 설치 검증 자료는 P016/historical에 원본 보존했다. 간헐 실패 조사 근거는 브레인에 남기고 요청한 열린 이슈 두 건은 삭제했다. Windows PowerShell 5.1 실측은 후속 할 일이다.
+P017 T01 구현·시험 작업본(미커밋), 전체 검사 통과. owner 허용 전체 재검토(2차) R9 fail blocking 3(S-7 (나) 범주 개수·S-8 경로 단위 제외·S-1 회수 시각 의미), 예산 rounds 소진 — 수정 없이 허브 보고(msg_0b4299db7008), 결정 대기. T02 미착수.
```

### backlogs/**/BACKLOG.md·BR*.md

변경 없음(`git diff --name-only -- backlogs` = data.js만).
