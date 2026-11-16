# opal-auto-flow-maker 이관 인계 (fin-link P008/T07 → OPAL)

- 작성: 2026-11-14 · 보내는 쪽: fin-link `project/P008` (기준 커밋 `2eedddc`) · 받는 쪽: OPAL 저장소(`C:\Users\storelink\opal`, origin `ceo4ever/opal`)
- 루카스 결정(2026-11-14): OPAL 저장소 작업은 OPAL 세션(알투)이 그 저장소 규칙·프로젝트 절차로 한다. fin-link 쪽 연결·동일성 확인은 fin-link 세션이 이관 뒤에 한다. 푸시·병합은 각 저장소에서 루카스 승인 뒤.

## 1. 무엇을 옮기나

| fin-link 위치 | 내용 | 비고 |
|---|---|---|
| `.claude/skills/opal-auto-flow-maker/SKILL.md` | 스킬 본문(서비스 비의존, CRLF 기준 8192바이트 이하) | "도구 위치" 절만 저장소별 경로 |
| `.claude/skills/opal-auto-flow-maker/references/schema.md` | steps.json 필드 사전(`run`·`toolNote`·`events` 포함) | "정본은 코드" 원칙 |
| `.claude/skills/opal-auto-flow-maker/references/adapter.md` | 서비스 캡처 어댑터 계약·함정 | |
| `tools/flow/build.mjs` | 생성기: steps.json → flow.html·flow/overview.md·S0n.md | Node ESM, 외부 의존 없음 |
| `tools/flow/capture-core.mjs` | 캡처 코어: 가림·번호 태그·사후 검사(fail-closed) | 서비스 어댑터가 import |
| `tools/flow/tests/build.test.mjs` · `capture-core.test.mjs` · `dom-stub.mjs` · `skill-doc.test.mjs` | 테스트(`node --test`) | 일부는 사례 의존 — 3절 |
| `tools/flow/package.json` | `"type":"module"`, `npm test` | |

옮기지 않는 것(fin-link에 남음): 업무 스킬 `hometax-invoice`·`amaranth-read`와 그 흐름 명세(steps.json·shots·생성물), 서비스 어댑터 `tools/hometax/capture.mjs`·`tools/amaranth/packages/flowdoc/capture.mjs`.

## 2. 바꿔야 할 경로 지점 (SKILL.md "도구 위치" 절에 정의)

1. SKILL.md "도구 위치" 표 — 생성기·코어·테스트의 새 위치와 실행 명령.
2. 생성기 `GEN` 상수(`build.mjs` 생성 머리말) — 지금 `node tools/flow/build.mjs --dir <흐름 폴더>`를 적는다. 새 실행 방법(예: `opal flow build --dir …` 같은 CLI 또는 새 경로)으로.
3. `skill-doc.test.mjs`의 `SKILL` 상수(스킬 경로, 지금 저장소 루트 + `.claude/skills/opal-auto-flow-maker`)와 금지어·경로 검사(`tools/` 경로는 도구 위치 절에만 허용 — 새 경로 규칙에 맞게).
4. 업무 저장소에 남는 어댑터의 코어 import 경로(fin-link: `tools/hometax/capture.mjs:9`, `tools/amaranth/packages/flowdoc/capture.mjs:17`, 테스트 3곳) — fin-link 세션이 이관 뒤 고친다.

## 3. 사례 의존 테스트 → 비식별 fixture

| 테스트 | 지금 읽는 것 | 할 일 |
|---|---|---|
| `build.test.mjs` "S-6 실제 hometax steps.json" | fin-link 홈택스 명세 | OPAL에서는 가상 fixture(gate 1개·위험 등급 3개 구조만)로 바꾸거나 빼고, fin-link에 사례 검사로 남김 |
| `skill-doc.test.mjs` `CASES`(필드 사전 완전성) | 홈택스 + amaranth-read 흐름 5개 | OPAL: 사전의 모든 필드를 쓰는 가상 fixture 하나(최상위·단계·요소·`run[]`·`events[]`·`frames.*`·`risks.*`·`revealInputs[]`·`screen.*` 전부). fin-link: 실제 사례로 같은 검사를 계속 |

fixture 규칙: 실값 금지 — 이름·회사·주소·번호·계정·도메인 없음, 가상 표본(`900101-1234567` 같은 표준 예시)만. `capture-core.mjs:234`와 `capture-core.test.mjs`의 합성 표본, 각 테스트의 서비스 금지어 목록은 검사 도구라 그대로 둔다.

## 4. 결정이 필요한 것 (OPAL 세션 판단)

- **언어**: OPAL은 TypeScript(빌드 없이 Node 24, `.ts` import, `erasableSyntaxOnly`). 생성기·코어를 그대로 `.mjs`로 둘지, `.ts`로 옮길지.
- **배포 방식**: 설치본(`~/.opal/app`)에 생성기를 넣고 업무 저장소가 `opal` 명령이나 설치 경로로 부를지, 업무 저장소에 복사(vendoring)할지. 캡처 코어는 업무 저장소 어댑터가 import하므로 import 가능한 경로가 필요하다.
- **스킬 위치**: OPAL `skills/opal-auto-flow-maker/`(다른 opal-* 스킬과 같은 자리).

## 5. 같은지 확인 (이관 성공 기준 — fin-link T07 T-6)

- 기준선: fin-link 커밋 `2eedddc`의 생성물 — `.claude/skills/hometax-invoice/references/{flow.html,flow/}`와 `.claude/skills/amaranth-read/references/flows/{company-switch,card,income,accounts,expense}/{flow.html,flow/}`.
- 방법: 기준은 커밋 `2eedddc`에 저장된 git blob(생성기 출력 그대로 LF — Windows 작업 사본의 CRLF는 체크아웃 변환이라 기준으로 쓰지 않는다). 이관본 생성기로 같은 steps.json을 저장소 밖 빈 폴더에 다시 만들고(흐름 폴더를 복사해 생성), 흐름마다 ① 생성 파일 목록(`flow.html`, `flow/overview.md`, `flow/S*.md`)이 기준과 같고 ② 각 파일을 `git show 2eedddc:<경로>`와 **바이트 단위로 비교**한다. **허용 차이는 `.md` 머리말의 생성 명령 줄 하나**(`> 생성 파일 — \`steps.json\`에서 \`<생성 명령>\`로 만든다. 직접 고치지 않는다.`)뿐 — 양쪽에서 그 줄의 `<생성 명령>` 부분만 같은 자리표시로 바꾼 뒤 바이트 동일이어야 한다. 줄 끝·공백·그 밖의 어떤 차이도 실패.
- 테스트: OPAL 쪽 `npm run check` 통과(생성기·코어·스킬 문서 검사), fin-link 쪽 `cd tools/flow && npm test`(남은 사례 검사)·`cd tools/amaranth && npm test`·`cd tools/hometax && npm test` 통과.

## 6. 보안

- OPAL로 가는 파일에 fin-link 실값·서비스 이름이 없어야 한다. fin-link T07 S-8 검사 결과: 스킬 폴더 금지어 0, `tools/flow`는 합성 표본·금지어 목록·사례 경로뿐([evidence/security.md](evidence/security.md)). 사례 경로는 3절대로 fixture로 바뀐다.
- 흐름 명세(steps.json)는 옮기지 않는다. 홈택스 명세의 기존 거래처 상호 리터럴(fin-link 열린 이슈)은 OPAL로 가지 않는다.

## 7. 이번에 드러나 스킬에 반영한 것 (변경 이력 참고)

`run`(여러 단계를 수행하는 운영 명령), `toolNote`(도구 칸 설명 분리 — `tool`에 괄호·`—`·` + ` 있으면 생성 실패), `events`(비결정 화면 이벤트), 절차 9 "재구성 검증", 중간 정지 화면 캡처 지침, 실행 관찰로 계약이 바뀔 때 멈춤. 근거: fin-link P008 T01~T05 TASK-CLOSE "남긴 것", T07 [evidence/regen.md](evidence/regen.md)·[evidence/spec-replay.md](evidence/spec-replay.md).

남은 개선 후보(이관 뒤 OPAL 백로그로): `tool` 검사를 허용 목록 방식으로(지금은 공백 없는 `a+b`·en dash 설명 통과, 괄호 있는 경로 오탐 가능), html 단계 카드의 "운영:" 줄 테스트, 흐름 공통 앞 단계(S01~S03 탭·로그인·공지)를 흐름마다 중복하지 않고 참조하는 방법, 카드·소득자 흐름에도 `events`.

## OPAL 세션에 줄 첫 요청(예)

> fin-link의 `projects/P008_…/tasks/T07_…/HANDOFF-OPAL.md`를 읽고 opal-auto-flow-maker 스킬과 흐름 생성기·캡처 코어를 OPAL로 이관하는 일을 OPAL 프로젝트로 진행해 줘. 4절 결정은 설계 때 나에게 확인하고, 5절 동일성 비교는 fin-link 쪽 생성물로 해 줘. 푸시·병합 전에 확인받아.
