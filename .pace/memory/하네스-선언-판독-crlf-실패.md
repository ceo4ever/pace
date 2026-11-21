---
name: 하네스 선언 판독 CRLF 실패
description: declaredCommand가 CRLF 정의서에서 null — commandInDocument가 줄을 \r?\n으로 나누게 고친다
type: issue
created: 2026-11-21
updated: 2026-11-21
---

src/project/harness.ts:356이 text.split("\n")로 나눠 줄 끝 \r이 남고, :355 정규식 (.*)$의 .이 \r과 맞지 않아 라벨 행을 못 찾는다. 2026-11-21 재현: 같은 표를 LF로 쓰면 'npm run check', CRLF면 null. core.autocrlf=true인 Windows worktree 작업본에서 발생(P006에서 발견). finish·merge는 커밋된 main 선언을 읽어 영향이 없었지만, 작업본 선언을 읽는 경로(pace test changed·worktree 선언 비교)는 선언 없음으로 오인할 수 있다.
