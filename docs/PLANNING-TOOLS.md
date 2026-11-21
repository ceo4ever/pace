# 기획 도구 — 기회 탐색·의도 파악 기획·화면 기획

정의서 [`docs/README.md`](README.md)에서 옮긴 상세다. 정의서에는 한 줄 요약과 이 문서 링크만 남는다.

이 문서가 다루는 경로 중 `src/scout/**`·`src/intent/**`는 민감 경로다 — 고치기 전에 [SECURITY](SECURITY.md)의 민감 경로 표와 체크리스트를 본다.

## 기회 탐색

- 경로: `src/scout/`
- 스택·형식: TypeScript

`pace scout` — 탐색 실행 폴더(main이면 `backlogs/`, 아니면 `$PACE_HOME/scout/`), 출처 수집(`fetch`·`add`), 보고서 렌더(`render`, schema·템플릿은 `templates/scout/`), 아이디어 카드(`card`), 증명 검사(`verify`), 브라우저 자막 추출(`transcript` — `orca`·`agent-browser`를 인자 배열로 실행). 스킬 pace-scout의 기계적 일

## 의도 파악 기획

- 경로: `src/intent/`
- 스택·형식: TypeScript

`pace intent` — 렌즈 형식 검사(`lint`)와 렌즈 머리말에서 `references/INDEX.md` 다시 만들기(`index`). 인계 문서(BACKLOG·BR·PROJECT) 빈 칸·필수 절 검사(`check`). 기능·화면 설계 문서: `docs/plan.json` → 연결 계산·증명 검사·HTML(`render`·`verify`, 템플릿은 `skills/pace-intent/templates/<종류>/` 폴더 — 추가는 폴더만), Canvas 제품 프레임 이미지 미리보기 생성·출처 검사(`preview`·`preview --verify`), 템플릿 예시 다시 만들기(`examples`). 스킬 pace-intent의 기계적 일

## 화면 기획과 Canvas

화면이 필요한 백로그는 pace-intent가 IA와 화면 ID를 정리해 canvas-wireframe에 맥락을 전달하고 BR과 `docs/canvas/` 산출물을 연결한다. 화면이 없으면 BACKLOG의 `## 확정된 결정`에 생략 이유를 남긴다. `docs/plan.json`의 IA·흐름·상태와 명시적 연결은 의미 정본, Canvas는 시각 정본이며 HTML은 렌더된 뷰다. 자동 왕복 동기화는 없으며 변경 시 화면 ID로 대조해 동기화한다. 기존 Canvas 덮어쓰기는 해당 파일에 대한 명시적 허가가 필요하다. 기존 문서의 소급 이전은 요구하지 않는다.
