---
type: synthesis
title: pace-intent 의도 파악 기획 구조와 함정
summary: "프로세스·렌즈/템플릿·pace intent 증명 3레이어, B는 지금 착수 신호일 때만, 렌더 보안(JSON 블록·텍스트 노드·CSP·블록 schema), 근거 경로 realpath, 에이전트 기록의 한계는 두 사람 방식으로"
tags: [pace-intent, intent, planning, pitfalls]
sources: [code:src/intent/, doc:skills/pace-intent/SKILL.md, doc:skills/pace-intent/references/handoff.md, doc:skills/pace-canvas-skills/canvas-wireframe/SKILL.md, doc:skills/pace-project-dev/references/document-shape.md, doc:skills/pace-intent/references/preview.md, code:src/intent/preview.ts]
related: [pace-scout-기회-탐색-구조와-함정, 작업-하네스-실측-함정]
created: 2026-10-29
updated: 2026-11-24
status: active
---

## 구조

pace-intent는 pace-scout와 같은 세 레이어다. 프로세스(`skills/pace-intent/SKILL.md`, 본문 영어·출력 한국어), 툴박스(렌즈 `references/<group>/*.md` 20개 + 기능·화면 템플릿 `templates/<종류>/`), 증명(`pace intent` 명령 — 외부 증거만).

- 렌즈 형식은 `references/LENS-FORMAT.md`, `pace intent lint`가 검사하고 `pace intent index`가 머리말에서 `INDEX.md`를 다시 만든다(손으로 고치지 않음).
- 인계 계약은 `references/handoff.md` — 렌즈 id마다 A·B·C 칸 매핑 행이 있어야 테스트가 통과한다. 새 렌즈는 매핑 행부터.
- 기능·화면 문서: AI는 의미 자료를 `docs/plan.json`에 쓰고 `pace intent render`가 연결 계산·검사 13종·HTML을 만든다. 템플릿 종류·탭·ID 경로는 `schema.json`의 `x-pace`에서 — 명령 코드에 종류 목록 없음. 새 데이터가 필요한 문서는 `plan.schema.json`과 연결 계산도 고친다.
- 기억: 확인받은 지속 선호만 `pace memory`, 스킬 개선 후보는 스킬을 고치지 않고 idea(원인 레이어·횟수, 같은 원인은 update) — `references/feedback.md`.

## 결정과 이유

- 기계적 일은 명령(`src/intent/`) — 검사 범위(`npm run check`)·설치·어느 프로젝트에서나 실행. 스킬 안 스크립트가 아님.
- B(바로 실행)는 사용자가 "지금 착수"를 말하거나 확인할 때만. 신호가 없으면 L2+는 C — 같은 요청 두 세션이 B/C로 갈린 재현성 실험에서 나온 규칙.
- 첫 실행에서 증명 검사가 2개를 넘게 실패하면 땜질하지 않고 원인 단계를 알리고 멈춘다 — "글쓰기 누락이면 지금 고침 추천"으로 바꿨다가 계약과 달라 되돌림.
- 외부 업체를 아직 정하지 못하면 URL을 지어내지 않고 `docs.open`으로 미결 항목을 가리킨다 — 검사는 통과하되 "미결 표시(증명 아님)"로 출력.
- L3 렌즈는 예시가 쓴 5개만. 쓰지 않은 후보·지운 초안은 프로젝트 메모리 idea.

## 함정

- 렌더 보안: 데이터는 `<script type="application/json">`에만(`<`·U+2028/9 이스케이프), 화면은 텍스트 노드로만, 문서 사이 링크는 `hrefFor(id)`, 외부 링크는 `safeUrl`(http/https). 와이어프레임 블록 값이 `style`·`class`·반복 횟수로 들어가 CSS 주입·멈춤이 가능했다 → 블록 종류별 schema(추가 칸 금지·범위) + 템플릿 clamp + CSP.
- 근거 경로 검사: `relative()` 문자열만 보면 root 안의 디렉터리 링크로 밖을 읽는다 → realpath 포함 확인. 끝 줄바꿈 뒤 빈 조각을 줄로 세지 않는다.
- 자리 표시 치환을 순서대로 하면 제목에 넣은 `@DATA@`가 다시 바뀐다 → 한 번에 정규식 치환.
- 최소 JSON Schema 검사기는 `Object.hasOwn`으로 — `__proto__`·`constructor` 키가 `additionalProperties:false`를 우회한다. 모르는 키워드는 오류로.
- 예시 실행 기록은 에이전트가 쓴 것이라 "확인 전 생성 안 함"을 스스로 고쳐 적을 수 있다. 쓰기 전 확인 같은 규칙은 두 사람 방식(구현자가 답하고 질문 뒤 저장소 상태를 직접 확인)으로 증명한다.
- `pace project check`가 증거 경로 뒤 문장부호를 파일명으로 읽던 문제는 2026-10-31 수정했다. 현재 `checkEvidencePaths`는 끝의 쉼표·마침표·콜론·세미콜론을 제거한다.
- 같은 세션 안 iframe으로 다른 문서를 여는 브라우저 점검은 CSP(`default-src 'none'`)가 막는다 — 문서마다 직접 열어 본다.

## 인계 전 교차 검토 (2026-11-06 확인)

SKILL의 ⑧은 백로그·큰 문서를 다른 제공자 에이전트에게 목적 중심으로 읽기 전용 교차 검토시키는 단계이며 인계는 ⑨다. 적합한 호스트 기본 호출이 있으면 쓰고 없으면 `pace agent verify`를 사용한다. 다른 제공자가 없으면 미실행을 기록하고 사용자에게 확인하며 동일 제공자의 새 맥락 검토를 교차 검토로 표시하지 않는다. 기존 프로세스·렌즈·증명 레이어와 파일 쓰기 전 인계 확인 원칙은 유지한다.

## Canvas와 기획 정본

plan.json은 화면·상태·추적 및 명시적 요소 이동의 의미 정본, Canvas는 시각 정본이다. 신규 기획은 wireframes 중복 입력 없이 작성하고 기존 wireframe.html은 기본 렌더에서 보존한다. 명시적인 `--legacy-wireframe`은 구 입력을 다시 렌더한다. 생성 이후 실제 프레임·요소 ID를 plan에 기록하고 ID 교체 시 이름으로 추정하지 않는다. 미리보기 출처·소유권 계약은 skills/pace-intent/references/preview.md에 있다.

## 업무별 형식과 최소 추적

문서 템플릿은 개발 업무의 예시이며 업무/독자에 맞는 메모·비교표 등을 고른다. 목표/상위 목적→선택한 전략과 이유→이번 단계/결정→관측 결과를 기존 목적·접근·결정 메모의 링크와 짧은 관계 설명으로 연결한다. 새 고정 칸이나 전략 문서를 매번 강제하지 않는다. 명령용 필수 절/기준 ID/상태 표는 유지하며, 하네스를 안 쓰는 작은 일에는 해당 구조도 요구하지 않는다. 필수 구조를 삭제하는 대안은 파서·이력·상태 호환 비용 때문에 채택하지 않고 본문/산출물 형식 선택으로 해결했다. 정본은 skills/pace-project-dev/references/document-shape.md다. intent check/하네스 형식 통과는 구조 호환일 뿐 목표 타당성·달성 판정이 아니다. 실제 비개발 성과는 예시/가상 CLI 호환 실험과 구별한다.

## 이미지 미리보기와 브라우저 해시

pace intent preview는 명시한 제품 프레임·요소 ID를 읽어 이미지와 클릭 경계를 만들고 plan·Canvas·PNG·도구·HTML 출처를 확인한다. 소유 확인된 파생물만 갱신하고 미연결·충돌·stale을 구분한다. Windows에서 미설치 글꼴 fallback 경고는 보존·표시하며 잘림과 배치는 별도 눈 확인이 필요하다. HTML 파서는 줄바꿈을 LF로 정규화하므로 인라인 스크립트 CSP 해시도 정규화한 값으로 계산하고 도구 파일의 checkout 바이트를 고정한다. [근거: src/intent/preview.ts, skills/pace-intent/references/preview.md]

화면 보드의 영역 표지와 note는 설명 레이어이며 plan.links의 명시적 이동과 자동 동기화되지 않는다. 둘이 같은 행동을 기술하면 작성자가 서로 대조해야 하고, 검증 통과가 설명 문구까지 일치함을 뜻하지 않는다. [근거: skills/pace-canvas-skills/canvas-wireframe/SKILL.md, skills/pace-intent/references/preview.md]

기존·변경 화면의 근거 경로는 생성 때의 `--root` 또는 현재 폴더를 기준으로 한다. 출력 폴더가 제품 루트라는 보장은 없다. preview `--verify`는 기록된 plan·Canvas·출력·도구 해시를 확인하며 외부 근거 파일 자체는 다시 검사하지 않는다. [근거: src/intent/preview.ts, skills/pace-intent/references/preview.md]

## 근거 변경 대조 (2026-11-24)

현재 document-shape.md의 최소 추적/명령용 필수 구조/업무별 본문 선택과 말미 TASK 파서 한계 설명을 대조했다. 구조 파서는 전체 Markdown renderer가 아니라는 설명이 추가돼도 기획 정본/인계 확인/실제 성과 구분을 유지한다. T06 팀 표의 구조 검증도 별도이며 intent의 의미 판정을 대신하지 않는다.
