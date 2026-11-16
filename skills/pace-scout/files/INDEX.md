# pace-scout 툴박스

필요한 순서 단계에서 해당 파일만 읽는다. 툴박스는 처음에 최소로 두고, 실행하며 다시 만들어지는 것을 여기에 더한다(D7).

| 파일 | 종류 | 순서 | 쓰는 때 |
|---|---|---|---|
| [rules/source-collection.md](rules/source-collection.md) | 규칙 | ③ | 출처 형식, 링크 수집·실패 대체, 유튜브 자막 단계(fetch → `scout transcript`(Orca·agent-browser) → LLM 브라우저 → yt-dlp → 붙여넣기), 주제 검색 기준·질의 틀·상한 |
| [rules/source-credibility.md](rules/source-credibility.md) | 규칙 | ③ | 출처 신뢰도 높음·중간·낮음 |
| [prompts/extract-claims.md](prompts/extract-claims.md) | 하위 프롬프트 | ③ | 출처에서 사실·의견·수치·인용 뽑기(인용은 원문 그대로) |
| [rules/signal-taxonomy.md](rules/signal-taxonomy.md) | 규칙 | ④ | 신호 종류 5가지, 묶는 법, 일치·충돌 |
| [prompts/generate-ideas.md](prompts/generate-ideas.md) | 하위 프롬프트 | ⑤ | 신호 → 후보 3~5개, 후보 칸 |
| [prompts/critique-ideas.md](prompts/critique-ideas.md) | 하위 프롬프트 | ⑤ | 후보마다 탈락시킬 가정 1~2개, 추천의 1주 실험 |
| [rules/scoring-rubric.md](rules/scoring-rubric.md) | 규칙 | ⑤ | 평가 기준 6개·1·3·5점·가중치(사용자 확인) |
| [rules/writing-rules.md](rules/writing-rules.md) | 규칙 | ⑤~⑨ | 문체·금지 표현 |
| `pace scout card <폴더> <I#>` (틀: 앱 `templates/scout/idea-card.md`) | 명령·카드 틀 | ⑨ | 고른 후보를 혼자 읽히는 아이디어 카드 `idea-{n}.md`로 — 칸은 D1(문제·대상 고객·해결 방식·근거 출처·수익 가설·핵심 가정·미결·검증 실험) |
| [rules/idea-patterns.md](rules/idea-patterns.md) | 규칙 | ⑤ | 발상 패턴(반복·후보 상태) — 돈이 흐르는 길목(반복)·다투는 시장의 제3자·새 행동의 빈자리(후보) |
