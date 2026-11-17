# T06 구현 후 검토 대상

작업 위치: 이 저장소(worktree, 브랜치 project/P001). 마지막 커밋(T05) 대비 작업 중 변경이 대상이다 — `git diff HEAD -- skills test docs`와 새 파일.

## 1. 제품 변경(스킬 `skills/pace-playbook-maker/`)

| 파일 | 변경 | 이유 |
|---|---|---|
| `tools/capture-core.mjs` | `leakScript`·`leakProblems` — 추출 대상 값이 대상 요소 밖 다른 위치에 가려지지 않고 보이는지 센다(이름·개수만) | 시범 캡처 반려(같은 값이 파일 목록 등 다른 곳에 보임) |
| `tools/orca-adapter.mjs` | `captureStep`이 캡처 전에 값 노출 검사, 실패·결과 없음은 거부(fail-closed). 관찰 `filled` 판정이 입력칸만 value를 읽음 | 위와 같음 / button 값 버그 |
| `tools/driver.mjs` | 웹 실행기: 읽기 값이 말줄임(`…`·`...`)으로 끝나면 넘기지 않고 `truncated`로 멈춤. 읽기·상태 판정에서 value는 INPUT·SELECT·TEXTAREA만, 그 밖은 글자 | 실제 GitHub 화면이 긴 커밋 제목을 줄임(1라운드 실패) / 실제 `<button>`(기본 브랜치)이 빈 value로 읽혀 expect-failed |
| `tools/build.mjs` | `buildFlow(dir,{dirLabel})` — 머리말 `--dir`이 실행 위치 밖이면 절대 경로 대신 `<흐름 폴더>` 자리표시 | 플레이북 머리말에 사용자 이름이 든 임시 경로가 들어감(유출 검사에서 발견) |
| `tools/playbook.mjs` | SKILL.md 흐름 색인에 단계 지도 파일 경로를 모두 적음, 임시 복사본 빌드 때 머리말을 `<플레이북 폴더>/references/flows/<흐름>`으로 | 측정 2라운드에서 플레이북 세션이 파일 위치 탐색(ls)에 호출을 씀 / 위 경로 |
| `references/driving.md` | 추출 절에 말줄임 규칙 한 문장 | 위 |
| `SKILL.md` | 도구 위치 표의 깨진 행(열 수) 수정 | 문서 결함 |
| 시험 | `capture-core.test.mjs`(값 노출), `orca-adapter.test.mjs`(노출·결과 없음 거부), `driver-runtime.test.mjs`(T06 S-11 말줄임, S-12 button 글자), `build.test.mjs`(T06 S-13 머리말), `playbook.test.mjs`(색인 경로 실재·머리말 임시 경로 없음), 래퍼 `test/playbook-pilot-harness.test.ts`(측정 도구 단위 시험 13건) | |
| 문서 | `docs/README.md`·`docs/ARCHITECTURE.md` 구성 요소 표에 플레이북 생성기 행·민감 경로 행 | T-8 |

## 2. 시범·측정 도구(프로젝트 폴더, 설치되지 않음)

`tasks/T06…/pilot/harness/`: `build-pilot`(인터뷰→캡처→사람 확인 해시 승인→생성, `round2.mjs` 지도 보완: 열기 단계 접기·읽기 식·orca 명령 형태), `run-session`·`run-measure`(헤드리스 세션 측정), `truth`·`score`·`analyze`(정답·판정·기록 해석), `scrub`·`rescrub`(기록 가리기 — 사용자 경로·단축 이름·`orca tab list` 결과), `check-read`(긴 제목 실페이지), `heal-check`(S-4), `case-impact`(S-6), `coexist-session`(S-6b), `handoff-check`(S-7), `leak-check`(S-5), `build-check`(S-1), `group-compare`(S-3).

## 3. 결과 증거(`evidence/`)

- 측정: 1·2·3라운드(`sessions-round1/`, `sessions-round2/`, `sessions/` + `score.txt`·`sessions-*.json`), 조건 비교 `groups.txt` — 3라운드 P-6 충족(플레이북 3/3·24.0s·7회 vs 지도 없음 2/3·36.1s·8회)
- `pilot-build.txt`(S-1) · `pilot-heal.txt`(S-4, T-4 미충족 — 가림 요소는 복구 후보 제외) · `leak-check.txt`(S-5) · `case-impact.txt`(S-6) · `coexist-session.json`(S-6b, 로드 확인·답변 구별 미확인) · `handoff-check.txt`(S-7) · `round2-longtitle*.jsonl`(긴 제목 실페이지) · `pilot-rebuild.txt`
- 인계 문서는 저장소 밖(비공개) — 검사 요약만 `handoff-check.txt`

## 4. 제품 변경 diff 전문 (git diff HEAD -- skills test/playbook docs)
```diff
diff --git a/docs/ARCHITECTURE.md b/docs/ARCHITECTURE.md
index 23cfa46a..2f8d1b3f 100644
--- a/docs/ARCHITECTURE.md
+++ b/docs/ARCHITECTURE.md
@@ -19,6 +19,7 @@
 | 기획 도구 | `src/intent/`, `src/scout/` | plan의 의미 연결 검사·비와이어프레임 HTML 렌더와 보고서 처리; Canvas 제품 프레임을 이미지 미리보기로 생성하고 출처·해시를 검증하며 예전 wireframe HTML은 명시적 호환 렌더 |
 | 설치 | `src/setup/`, `scripts/` | 훅·스킬 설치와 환경 작업 — 스킬 묶음(`skills/pace-canvas-skills/`, 본문·해시는 Canvas Studio 배포본 그대로)은 manifest 해시 대조 뒤 app에 통째로 올리고 도구 폴더에는 하위 스킬 입구만 둔다. 설치·제거는 `.pace-managed` 표지가 있는 스킬, PACE 부트 명령을 가리키는 훅, PACE 표지 블록만 바꾼다 |
 | 지침·템플릿 | `skills/`, `templates/` | 에이전트 절차와 생성 문서 원본 |
+| 플레이북 | `skills/pace-playbook-maker/` | 목표 → 인터뷰 → 수행·기록 → 플레이북 생성, 지도(`agent/`)를 읽고 도는 자율 주행 라이브러리, 변경을 진단·검증·반영하는 자가 복구·학습 — 무빌드 `.mjs` 도구와 규약 문서(주행 v1·복구 v1). 설치 스킬은 하나이고 만든 플레이북은 업무 저장소가 갖는다 |
 
 근거: `docs/README.md` 구성 요소, 각 경로 및 `src/cli.ts` import.
 
diff --git a/docs/README.md b/docs/README.md
index 968f6231..3a6c6da0 100644
--- a/docs/README.md
+++ b/docs/README.md
@@ -45,6 +45,7 @@
 | 워크스페이스 등록부 | `src/project/workspace-registry.ts`, `src/project/agent-definition.ts` | TypeScript | `PACE_HOME/projects/` 후보·활성 워크스페이스와 `.pace/AGENT.md` 정의(`pace_agent_version: 2`) 연결. Git worktree 관리는 기존 작업 하네스 책임 |
 | 설치 | `src/setup/`, `scripts/install.sh`, `scripts/install.ps1`·`install.cmd` | TypeScript·sh·PowerShell | 훅·대체 규칙·스킬 등록, `pace onboard`. 데이터는 `PACE_HOME`, 설치본·명령·`install.json`은 사용자 홈 `~/.pace`. 스킬은 `.pace-managed` 표지가 있는 것만, 훅·블록은 PACE 부트 명령·PACE 표지가 있는 것만 바꾸고 다른 사용자 훅·스킬은 그대로 둔다. 고친 설정 원본은 `~/.pace-install-backup-<시각>-<임의값>/`에 둔다. Antigravity IDE의 공식 전역 훅은 CLI와 공유하는 설정 경로에 있어 CLI에서도 로드될 수 있으며 CLI 지원 검증을 뜻하지 않음 |
 | 스킬 | `skills/` | Markdown (Agent Skills) | pace-onboarding · pace-memory · pace-brain · pace-project-init · pace-project-dev(프로젝트·태스크 워크플로우) · pace-prompt · pace-scout(링크·주제에서 사업 아이디어 탐색 보고서) · pace-intent(요청의 목적 파악·인터뷰·기획·인계, 본문 영어·출력 한국어) · pace-tech-handbook(언어별 교본, 라이선스 확인된 원문만) · pace-canvas-skills(Canvas Studio 배포 묶음 2.0.1, 본문·해시 봉인 — canvas-read·canvas-wireframe 두 스킬, 묶음 통째 설치) · html-plan(대화형 HTML 계획, 외부 원본) |
+| 플레이북 생성기 | `skills/pace-playbook-maker/`(`SKILL.md`, `references/{schema,adapter,playbook-making,driving,healing}.md`, `tools/*.mjs`) | Markdown + Node `.mjs` 도구(무빌드·런타임 의존성 없음) | 목표 하나를 받아 인터뷰 → 실제 수행·가림 캡처(사람이 확인한 해시로만 승인) → **플레이북**(업무 스킬 한 벌: `SKILL.md` + 에이전트 지도 `agent/` + 학습 이력) 생성(`interview`·`scaffold`·`orca-adapter`·`playbook`·`build`). 주행 라이브러리 `driver`(승인 관문·지도 최신 확인·결과 불명 처리·재개·값은 `sink`로만)와 자가 복구·학습 `healer`·`heal-web`(허용 경로만 고치고 검증·회귀·사용자 확인 뒤 원자적 반영·되돌리기). 규약 문서는 주행 규약 v1(`driving.md`)·복구 규약 v1(`healing.md`) — 플레이북은 규약을 복사하지 않고 경로·버전만 적는다. 테스트는 `test/playbook/`(래퍼 `test/playbook-maker.test.ts`, Orca 실제 브라우저 e2e 포함). 설치되는 스킬은 `pace-playbook-maker` 하나이고 만든 플레이북은 업무 저장소에 둔다 |
 | 템플릿 | `templates/RULES.md`, `templates/profile/`, `templates/brain/`, `templates/project/`, `templates/backlog/`, `templates/scout/` | Markdown·YAML·JSON·HTML | 시스템 운영 규칙(부트가 직접 읽음), 프로필·브레인·프로젝트(PROJECT·TASK·마감·E2E 시나리오) 원본 |
 | 테스트 | `test/` | `node:test` | 단위·CLI. E2E 프레임워크 없음 — 실측은 태스크 `evidence/` |
 | 비밀 탐지 | `scripts/secret-scan.ts` | TypeScript | 커밋될 파일의 비밀 원문 탐지 |
@@ -133,6 +134,7 @@ refresh는 기존 완성 대시보드만 갱신한다. 완전 부재는 init 안
 | `src/scout/**` | 외부 URL 읽기(사용자가 준 링크·검색 결과, GET·시간 제한·크기 상한), 받은 콘텐츠를 HTML로 렌더(모두 이스케이프, 스크립트 실행 경로 없음), 실행 폴더 안에만 쓰기 |
 | `src/intent/**` | 스킬 폴더 안 파일 읽기·`INDEX.md` 쓰기(references·렌즈 폴더 심볼릭 링크 거부, 렌즈는 일반 파일만 읽음, 형식 문제가 있으면 쓰지 않음). `render`는 사용자 데이터(plan.json)를 HTML로 — 데이터는 JSON 블록에만(`<`·U+2028/9 이스케이프), 화면은 텍스트 노드로만, 링크는 문서 ID와 http(s)만, 외부 스크립트·폰트 없음. `verify --root`는 근거 경로가 root 밖이면 실패로 본다. `preview`는 OUT 안의 Canvas를 스냅숏으로 읽고 묶음 도구를 인자 배열로 실행하며 소유·해시를 확인한 결과만 교체하고 실패 시 복원한다; `preview --verify`는 원본·파생물 해시를 확인한다. 경로의 동시 교체에 대한 원자성은 보장하지 않는다. |
 | `src/memory/`, `src/profile/`, `src/project/brain.ts` | 사용자 파일 쓰기(`PACE_HOME` 프로필·메모리, 저장소 `.pace/` 메모리·브레인) — 경로가 해당 폴더 밖으로 나가지 않게 |
+| `skills/pace-playbook-maker/tools/` | 실제 서비스 화면·응답의 값을 읽고 캡처·승인·지도·실행 기록·이력을 쓴다 — 값 비기록(쓰기 전 민감 형식 검사), 가림 fail-closed(추출 값의 다른 노출 위치 검사 포함), 승인은 단계·행동·원본 해시와 계정·업무에 결속, 되돌릴 수 없는 행동은 수행 전 기록·조회로 판정(중복 0), 복구 반영은 저널로 원자적 |
 
 체크리스트: `pace-project-dev` 스킬 `references/security.md`의 기본 체크리스트 + 위 민감 경로. 셸 실행은 인자 배열(`spawnSync`) — 예외는 정의서에 선언한 명령의 `sh -c` 실행과 Windows 온보딩의 LLM CLI 실행(`src/setup/onboard.ts`, `shell: win32`), 비밀 값은 환경 변수 이름만, 테스트는 실제 사용자 홈·Orca·도구 설정을 건드리지 않는다.
 
diff --git a/skills/pace-playbook-maker/SKILL.md b/skills/pace-playbook-maker/SKILL.md
index df3047a7..1e3a0cae 100644
--- a/skills/pace-playbook-maker/SKILL.md
+++ b/skills/pace-playbook-maker/SKILL.md
@@ -23,8 +23,8 @@ description: 브라우저 자동화 업무 흐름의 실행 명세를 만들고
 | 이름 | 지금 위치 | 역할 |
 |---|---|---|
 | 생성기 | `node <스킬>/tools/build.mjs --dir <흐름 폴더>` | steps.json → flow.html·flow/*.md |
-| 캡처 코어·지도 | `<스킬>/tools/capture-core.mjs`·`agent-map.mjs` |
-| 플레이북 | `<스킬>/tools/{interview,scaffold,orca-adapter,playbook}.mjs` | 인터뷰·뼈대·어댑터·생성 | 가림·번호 태그·사후 검사(fail-closed)·캡처 기록·승인 / `agent/` 지도 계산 |
+| 캡처 코어·지도 | `<스킬>/tools/capture-core.mjs`·`agent-map.mjs` | 가림·번호 태그·사후 검사(fail-closed)·캡처 기록·승인 / `agent/` 지도 계산 |
+| 플레이북 | `<스킬>/tools/{interview,scaffold,orca-adapter,playbook}.mjs` | 인터뷰·뼈대·어댑터·생성 |
 | 주행·복구 | `<스킬>/tools/{driver,healer,heal-web}.mjs` | 관문·재개·진단·반영 |
 | 테스트 | PACE 저장소 `test/playbook/` (`npm run check`가 실행) | 생성기·코어·이 스킬 문서 검사 |
 | 서비스 어댑터 | 각 서비스 도구 폴더의 캡처 모듈 | 탭 범위·화면 판정·대기·승인 |
diff --git a/skills/pace-playbook-maker/references/driving.md b/skills/pace-playbook-maker/references/driving.md
index e0640a5c..b0f8b3ea 100644
--- a/skills/pace-playbook-maker/references/driving.md
+++ b/skills/pace-playbook-maker/references/driving.md
@@ -20,7 +20,7 @@
 - **요소 찾기**: `find` 선택자가 1차, 기록된 `box`는 보조다. 둘이 어긋나면(겹침 부족) **멈춘다** — 위치를 추측해 누르지 않는다.
 - **동작 첫 낱말 규칙**: `elements[].action`의 첫 낱말이 동작 종류다 — `클릭`·`입력`·`읽기`·`누르지 않음`. 이 밖의 동작은 거부한다(수행 전에 모든 요소를 검사해 하나라도 밖이면 아무것도 하지 않는다). 입력 값은 호출자가 넘기는 자리표시 값(`params`)에서만 온다.
 - **기대·대기**: 읽기 대상이 보이고 비어 있지 않으며 **액션 전 상태와 달라질 때까지** 정해진 시간 안에서 폴링한다. 이전 결과가 그대로 남아 있는 것은 통과가 아니다. 지연된 정상 결과는 성공, 끝내 오지 않으면 `expect-failed`로 멈추고 다음 단계는 부르지 않는다. 결과 값이 같아도 새로 읽은 것으로 인정해야 하는 업무는 지문 비교를 끈다.
-- **추출**: `extract`에 선언된 이름·위치의 값만 읽어 `deliverTo`(없으면 `resultTo`)로 보낸다. 선언 밖 값은 버린다. 위치가 없으면 멈춘다(`no-destination`).
+- **추출**: `extract`에 선언된 이름·위치의 값만 읽어 `deliverTo`(없으면 `resultTo`)로 보낸다. 선언 밖 값은 버린다. 위치가 없으면 멈춘다(`no-destination`). 화면이 줄여 보인 글자(끝이 `…`·`...`)는 값 전체가 아니다 — 넘기지 않고 `step-failed`(`truncated`)로 멈춘다. 전체 값을 읽는 방법(펼침 단추·속성)은 지도의 단계 `command`·`extract.verify`에 적고 그 방법으로 읽는다.
 - **성공 판정**: 단계 `success`·`extract.verify`를 대조한다. 판정할 수 없으면 성공으로 보지 않는다.
 
 ## 3. 브라우저와 API
diff --git a/skills/pace-playbook-maker/tools/build.mjs b/skills/pace-playbook-maker/tools/build.mjs
index abb11d5a..09e9adb2 100644
--- a/skills/pace-playbook-maker/tools/build.mjs
+++ b/skills/pace-playbook-maker/tools/build.mjs
@@ -2,7 +2,7 @@
 // 사용: node <pace-playbook-maker 스킬 폴더>/tools/build.mjs --dir <흐름 폴더>
 // 서비스 비의존 — 위험 등급(risks)·승인 관문(단계 gate)·대상 칸(lanes)·안내 경로(base)는 모두 steps.json에서 읽는다.
 import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync,unlinkSync} from 'node:fs';
-import {join,resolve,relative,sep} from 'node:path';
+import {join,resolve,relative,sep,isAbsolute} from 'node:path';
 import {fileURLToPath} from 'node:url';
 import {validateMask} from './capture-core.mjs';
 import {scanSensitive,computeAgent,contentHash,sourceHashOf,MANAGED} from './agent-map.mjs';
@@ -105,7 +105,8 @@ export function checkAgentFresh(dir){
 }
 export function reviewHash(dir){return contentHash(JSON.parse(readFileSync(join(resolve(dir),'steps.json'),'utf8')));}
 
-export function buildFlow(dir){
+// opts.dirLabel: 머리말 --dir 표기를 정한다(플레이북 생성처럼 임시 폴더에서 만들 때 최종 위치로 적는다)
+export function buildFlow(dir,{dirLabel}={}){
   const here=resolve(dir);
   const sourceText=readFileSync(join(here,'steps.json'),'utf8');
   const d=JSON.parse(sourceText);
@@ -154,7 +155,9 @@ table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid
   // 에이전트용 분할 명세 — 시작 시 overview.md 1회, 각 단계 실행 직전 S0n.md만 읽는다(대화가 길어지거나 요약돼도 실행 시점에 정확한 명세를 다시 읽게)
   const outDir=join(here,'flow');mkdirSync(outDir,{recursive:true});
   // 머리말에는 실제 --dir(실행한 위치 기준 상대 경로 — 저장소 루트에서 실행하는 것이 기준)을 적는다
-  const dirArg=relative(process.cwd(),here).split(sep).join('/')||'.';
+  // 실행 위치 밖(상위 폴더·다른 드라이브)이면 절대 경로(사용자 이름이 든 임시 경로 등)를 남기지 않고 자리표시로 적는다
+  const relDir=relative(process.cwd(),here);
+  const dirArg=dirLabel??(relDir.startsWith('..')||isAbsolute(relDir)?'<흐름 폴더>':relDir.split(sep).join('/')||'.');
   const GEN=`> 생성 파일 — \`steps.json\`에서 \`node <PACE 설치본 app>/skills/pace-playbook-maker/tools/build.mjs --dir ${dirArg}\`로 만든다(\`<PACE 설치본 app>\`은 PACE 데이터 폴더의 \`app\`, 기본 \`~/.pace/app\`). 직접 고치지 않는다.`;
   const ids=new Set(d.steps.map(s=>s.id));
   for(const f of readdirSync(outDir))if(/^S\d+\.md$/.test(f)&&!ids.has(f.slice(0,-3)))unlinkSync(join(outDir,f));   // 없어진 단계 파일 정리
diff --git a/skills/pace-playbook-maker/tools/capture-core.mjs b/skills/pace-playbook-maker/tools/capture-core.mjs
index 5f401569..4d7cc633 100644
--- a/skills/pace-playbook-maker/tools/capture-core.mjs
+++ b/skills/pace-playbook-maker/tools/capture-core.mjs
@@ -31,6 +31,38 @@ export function validateMask(mask){
   return true;
 }
 
+// 값 노출 검사 — 추출 대상 요소가 가려져도 **같은 값이 화면의 다른 곳**(예: 파일 목록의 커밋 제목·About의 별 개수)에 가려지지 않은 채 보이면 캡처 이미지에 값이 남는다.
+// 화면에서 각 추출 대상의 현재 값(3자 이상)을 읽어, 대상 요소 밖의 보이는 글자 노드 중 mask 규칙(CSS 선택자 안·정규식 일치)에 덮이지 않은 곳에 그 값이 있는지 센다.
+// 결과에는 추출 이름과 노출 곳 개수만 있다(값 없음).
+export function leakScript({mask,step}){
+  const css=(mask||[]).filter(m=>typeof m==='string'&&!m.startsWith('re:'));
+  const res=(mask||[]).filter(m=>typeof m==='string'&&m.startsWith('re:')).map(m=>m.slice(3));
+  const targets=((step&&step.extract)||[]).filter(x=>x&&x.where&&typeof x.where.selector==='string').map(x=>({n:x.name,f:x.where.selector}));
+  return `(()=>{
+const CSS=${JSON.stringify(css)},RES=${JSON.stringify(res)},TG=${JSON.stringify(targets)};
+const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
+const closest=(el,sel)=>{for(let p=el;p;p=p.parentElement){try{if(p.matches&&p.matches(sel))return true;}catch(e){return false;}}return false;};
+const covered=nd=>{const el=nd.parentElement;if(!el)return true;for(const m of CSS)if(closest(el,m))return true;for(const r of RES){try{if(new RegExp(r).test(nd.nodeValue))return true;}catch(e){}}return false;};
+const out=[];
+for(const t of TG){
+  let el=null;try{el=document.querySelector(t.f);}catch(e){}
+  if(!el)continue;
+  const v=String(/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)?(el.value??''):(el.textContent||'')).trim();
+  if(v.length<3)continue;
+  let n=0,nd;const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
+  const inside=(a,b)=>{for(let q=b;q;q=q.parentElement)if(q===a)return true;return false;};
+  while((nd=w.nextNode())){if(!String(nd.nodeValue).includes(v))continue;const p=nd.parentElement;if(!p||inside(el,p))continue;if(!vis(p))continue;if(!covered(nd))n++;}
+  out.push({name:t.n,exposed:n});
+}
+return out;
+})()`;
+}
+// 노출 곳이 있으면 문제 문구 배열(이름·개수만, 값 없음)
+export function leakProblems(res){
+  if(!Array.isArray(res))return ['값 노출 검사 결과를 읽지 못했다'];
+  return res.filter(x=>x&&x.exposed>0).map(x=>`추출 '${String(x.name).slice(0,40)}'의 값이 대상 밖 ${x.exposed}곳에 가려지지 않고 보인다`);
+}
+
 // 단계·흐름 설정이 캡처를 허용하는지 — 아니면 CaptureRefused
 export function assertCapturable(step,doc){
   if(!step||typeof step!=='object')throw new CaptureRefused('단계를 찾지 못했다','step');
diff --git a/skills/pace-playbook-maker/tools/driver.mjs b/skills/pace-playbook-maker/tools/driver.mjs
index e66b2939..ad83fd43 100644
--- a/skills/pace-playbook-maker/tools/driver.mjs
+++ b/skills/pace-playbook-maker/tools/driver.mjs
@@ -12,7 +12,7 @@ import {sensitiveKinds} from './sensitive.mjs';
 const HEX64=/^[0-9a-f]{64}$/;
 const nonEmpty=v=>typeof v==='string'&&v.trim().length>0;
 // 값이 섞일 수 있는 문자열(이유·예외 메시지·오류 본문)은 허용 어휘 목록에 있을 때만 남긴다 — 모양만 맞는 문자열은 통과시키지 않는다
-const REASONS=new Set(['needs-approval','no-map-rule','screen-mismatch','expect-failed','conflict','step-failed','param-missing','action-unsupported','find-unsupported','access-denied','undeclared-key','not-api-step','redirect-refused','status-mismatch','schema-mismatch','missing-value','no-destination','sink-failed','unknown-outcome','in-flight','undelivered','moved','missing','unknown','timeout']);
+const REASONS=new Set(['needs-approval','no-map-rule','screen-mismatch','expect-failed','conflict','step-failed','param-missing','action-unsupported','find-unsupported','access-denied','undeclared-key','not-api-step','redirect-refused','status-mismatch','schema-mismatch','missing-value','no-destination','sink-failed','unknown-outcome','in-flight','undelivered','moved','missing','unknown','timeout','truncated']);
 const safeCode=x=>typeof x==='string'&&REASONS.has(x)?x:'<가려짐>';
 const errCode=e=>safeCode(e&&typeof e==='object'&&typeof e.code==='string'?e.code:'');
 // 중단 보고(locate.report)는 지도에서 단계 정보를 만들고 runtime이 준 것은 요소 번호·이유 코드만 받는다 — 임의 필드는 버린다
@@ -301,7 +301,7 @@ export function createWebRuntime({browser,params={},waitMs=3000,pollMs=100,sleep
   const q=JSON.stringify;
   const cssOnly=f=>typeof f==='string'&&!/^text:/.test(f)&&!/^[A-Za-z_][\w-]*:(?!:)/.test(f.replace(/\[[^\]]*\]/g,''))||false;
   const rectOf=find=>ev(`(()=>{const e=document.querySelector(${q(find)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight};})()`);
-  const state=find=>ev(`(()=>{const e=document.querySelector(${q(find)});if(!e)return {exists:false};const r=e.getBoundingClientRect();const vis=!e.hidden&&r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';const t=String(e.value??e.textContent??'');let h=0;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;return {exists:true,vis,filled:vis&&t.trim().length>0,h};})()`);
+  const state=find=>ev(`(()=>{const e=document.querySelector(${q(find)});if(!e)return {exists:false};const r=e.getBoundingClientRect();const vis=!e.hidden&&r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';const t=String(/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)?(e.value??''):(e.textContent??''));let h=0;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;return {exists:true,vis,filled:vis&&t.trim().length>0,h};})()`);
   const visible=sel=>{const s=state(sel);return s.exists&&s.vis;};
   return {
     async judgeScreen(step){
@@ -353,8 +353,10 @@ export function createWebRuntime({browser,params={},waitMs=3000,pollMs=100,sleep
       if(!ok)return {ok:false,reason:'expect-failed',executed:undefined};
       const values={};
       for(const x of step.extract||[]){
-        if(x.where&&x.where.selector)values[x.name]=ev(`(()=>{const e=document.querySelector(${q(x.where.selector)});return e?String(e.value??e.textContent??''):null;})()`);
+        if(x.where&&x.where.selector)values[x.name]=ev(`(()=>{const e=document.querySelector(${q(x.where.selector)});return e?String(/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)?(e.value??''):(e.textContent??'')):null;})()`);
       }
+      // 말줄임 검사: 화면이 줄여 보인 글자('…'로 끝남)는 값 전체가 아니다 — 잘린 값을 넘기지 않고 멈춘다(fail-closed). 전체 값을 읽는 방법은 지도(단계 command·verify)에 적는다
+      for(const v of Object.values(values))if(typeof v==='string'&&/(?:…|\.\.\.)\s*$/.test(v))return {ok:false,reason:'truncated'};
       return {ok:true,values,expectChecked:readers.length>0};   // 읽기 대상이 있어 기대 결과를 실제로 관찰했을 때만 true — 복구 검증이 요구한다
     }
   };
diff --git a/skills/pace-playbook-maker/tools/orca-adapter.mjs b/skills/pace-playbook-maker/tools/orca-adapter.mjs
index 84f14679..09c3211d 100644
--- a/skills/pace-playbook-maker/tools/orca-adapter.mjs
+++ b/skills/pace-playbook-maker/tools/orca-adapter.mjs
@@ -5,7 +5,7 @@ import {spawnSync} from 'node:child_process';
 import {existsSync,mkdirSync,readFileSync,readdirSync,rmSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
 import {homedir} from 'node:os';
 import {dirname,join,resolve,relative,sep} from 'node:path';
-import {runCapture,captureRecord,approveStep,sha256Hex,CaptureRefused} from './capture-core.mjs';
+import {runCapture,captureRecord,approveStep,sha256Hex,CaptureRefused,leakScript,leakProblems} from './capture-core.mjs';
 import {scanSensitive} from './sensitive.mjs';
 
 const refuse=(msg,code)=>{throw new CaptureRefused(msg,code);};
@@ -71,7 +71,7 @@ export function observeStep({browser,actions=[],expects=[]}){
   const act=JSON.stringify(actions.map(a=>({type:a.type,find:a.find,value:a.value??''})));
   const exp=JSON.stringify(expects.map(e=>({find:e.find,state:e.state})));
   const expr=`(()=>{const A=${act},E=${exp};const ar=A.map(a=>{try{const el=document.querySelector(a.find);if(!el)return false;if(a.type==='click'){el.click();return true;}if(a.type==='fill'){el.focus&&el.focus();el.value=a.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}return false;}catch(e){return false;}});
-const er=E.map(e=>{try{const el=document.querySelector(e.find);if(!el)return false;const r=el.getBoundingClientRect();const vis=!el.hidden&&r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';if(e.state==='visible')return vis;if(e.state==='filled')return vis&&String(el.value??el.textContent??'').trim().length>0;return false;}catch(e){return false;}});
+const er=E.map(e=>{try{const el=document.querySelector(e.find);if(!el)return false;const r=el.getBoundingClientRect();const vis=!el.hidden&&r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';if(e.state==='visible')return vis;if(e.state==='filled')return vis&&String(/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)?(el.value??''):(el.textContent??'')).trim().length>0;return false;}catch(e){return false;}});
 return {ar,er};})()`;
   let res;
   try{res=browser.evalJs(expr);}catch{return {ok:false,failed:[{kind:'browser',index:0}]};}
@@ -90,6 +90,12 @@ export function captureStep({browser,pending,doc,step,frames={},actions,expects,
     const obs=observeStep({browser,actions,expects});
     if(!obs.ok)refuse(`수행·관찰 실패(${obs.failed.map(f=>f.kind+':'+f.index).join(',')}) — 기록하지 않는다`,'observe_failed');
   }
+  // 값 노출 검사: 추출 대상 값이 대상 밖 다른 곳에 가려지지 않은 채 보이면 캡처하지 않는다(대상 요소만 가려서는 부족하다)
+  if((step.extract||[]).length){
+    let leak;try{leak=browser.evalJs(leakScript({mask:doc&&doc.mask,step}));}catch{leak=null;}
+    const probs=leakProblems(leak);
+    if(probs.length)refuse(`캡처하지 않는다 — ${probs.join('; ')}. mask에 그 위치를 더하거나 값이 같은 곳을 가린다`,'value_exposed');
+  }
   let rawPath=null,stored=false;
   try{
     const cap=runCapture({doc,step,frames,browser,...(delayMs!==undefined?{delayMs}:{})});
diff --git a/skills/pace-playbook-maker/tools/playbook.mjs b/skills/pace-playbook-maker/tools/playbook.mjs
index 455e3d15..1d05a6d8 100644
--- a/skills/pace-playbook-maker/tools/playbook.mjs
+++ b/skills/pace-playbook-maker/tools/playbook.mjs
@@ -33,13 +33,15 @@ function sections(iv){
   };
 }
 
-function skillText({name,iv,flows,full}){
+function skillText({name,iv,flows,full,stepsOf}){
   const S=sections(iv);
   const desc=oneLine(`${iv.goal} — ${iv.scope}`).slice(0,300)+' 이 업무를 자율 주행으로 수행할 때 쓴다.';
   const head=`---\nname: ${name}\ndescription: ${desc}\n---\n\n# ${oneLine(iv.goal)} (${name})\n\n이 스킬은 \`pace-playbook-maker\`가 만든 플레이북(업무 스킬)이다. 지도(\`references/flows/*/agent/\`)를 읽고 주행한다.\n\n`;
   const core=`## 범위\n${S.scope}\n\n## 성공 기준\n${S.success}\n\n## 안전 규칙\n${S.safety}\n- 읽기는 자율이다. 밖으로 나가는 행동은 지도에 승인 규칙이 있을 때만 자율이고 없으면 사용자에게 확인한다.\n- 지도와 화면이 다르면 멈추고 보고한다.\n\n`;
   const detail=`## 시작 조건(서비스·인증)\n${S.start}\n\n## 입력\n${S.inputs}\n\n## 결과와 저장 위치\n${S.outputs}\n\n## 개인정보 처리\n${S.privacy}\n\n## 예외와 빈도\n${S.exceptions}\n\n## 사람과 함께하는 지점\n${S.human}\n\n`;
-  const idx=`## 흐름 색인\n| 흐름 | 지도 | 사람용 |\n|---|---|---|\n${flows.map(f=>`| ${f} | [index.json](references/flows/${f}/agent/index.json) | [flow.html](references/flows/${f}/flow.html) |`).join('\n')}\n\n`;
+  // 지도 파일 경로를 모두 적는다 — 주행하는 에이전트가 폴더를 탐색(ls·glob)하지 않고 바로 읽게(T06 측정에서 탐색 호출이 드러남)
+  const steps=f=>((stepsOf&&stepsOf[f])||[]).map(id=>`[${id}.json](references/flows/${f}/agent/${id}.json)`).join(' · ')||'-';
+  const idx=`## 흐름 색인\n경로는 이 스킬 폴더 기준이다. 폴더를 탐색하지 않고 아래 파일을 바로 읽는다 — 개요 \`index.json\` 한 번, 각 단계 직전에 그 단계 파일.\n\n| 흐름 | 지도 개요 | 단계 지도 | 사람용 |\n|---|---|---|---|\n${flows.map(f=>`| ${f} | [index.json](references/flows/${f}/agent/index.json) | ${steps(f)} | [flow.html](references/flows/${f}/flow.html) |`).join('\n')}\n\n`;
   const tail=`## 주행 규약\n\`pace-playbook-maker\` 스킬의 \`references/driving.md\`(규약 버전 ${DRIVING_VERSION})를 따른다. 규약은 이 스킬에 복사하지 않는다.\n\n## 학습 이력\n[references/history.md](references/history.md)\n`;
   if(full)return head+core+detail+idx+tail;
   return head+core+`## 그 밖의 합의\n서비스·인증, 입력, 결과 저장 위치, 개인정보 처리, 예외·빈도, 사람과 함께하는 지점은 [references/agreements.md](references/agreements.md)에 있다.\n\n`+idx+tail;
@@ -175,7 +177,7 @@ export function generatePlaybook({workDir,outDir,name}){
         const sp=join(src,'shots',s.id+'.jpg');
         if(existsSync(sp)&&createHash('sha256').update(readFileSync(sp)).digest('hex')===s.shotHash){mkdirSync(join(copy,'shots'),{recursive:true});cpSync(sp,join(copy,'shots',s.id+'.jpg'));}
       }
-      buildFlow(copy);   // 승인·증거가 무효면 여기서 던진다. 파생물만 낡은 것은 이 재생성으로 해소된다.
+      buildFlow(copy,{dirLabel:`<플레이북 폴더>/references/flows/${f}`});   // 임시 복사본에서 만들므로 머리말은 최종 위치로 적는다. 승인·증거가 무효면 여기서 던진다. 파생물만 낡은 것은 이 재생성으로 해소된다.
       const fresh=checkAgentFresh(copy);
       if(!fresh.ok)throw new Error(`${f}: 지도 최신성 검사 실패`);
       const dest=join(out,'references','flows',f);
@@ -183,11 +185,12 @@ export function generatePlaybook({workDir,outDir,name}){
       for(const item of ['steps.json','shots','agent','flow.html','flow'])if(existsSync(join(copy,item)))cpSync(join(copy,item),join(dest,item),{recursive:true});
     }
     writeFileSync(join(out,'references','history.md'),`# 학습 이력\n\n주행 규약 버전 ${DRIVING_VERSION}. 아직 학습한 변경이 없다.\n`);
-    let text=skillText({name,iv,flows,full:true});
+    const stepsOf=Object.fromEntries(flows.map(f=>[f,(sources.get(f).steps||[]).map(x=>x.id)]));
+    let text=skillText({name,iv,flows,full:true,stepsOf});
     if(crlfSize(Buffer.from(text,'utf8'))>SKILL_LIMIT-400){
       const S=sections(iv);
       writeFileSync(join(out,'references','agreements.md'),`# 합의 사항\n\n## 시작 조건(서비스·인증)\n${S.start}\n\n## 입력\n${S.inputs}\n\n## 결과와 저장 위치\n${S.outputs}\n\n## 개인정보 처리\n${S.privacy}\n\n## 예외와 빈도\n${S.exceptions}\n\n## 사람과 함께하는 지점\n${S.human}\n`);
-      text=skillText({name,iv,flows,full:false});
+      text=skillText({name,iv,flows,full:false,stepsOf});
     }
     writeFileSync(join(out,'SKILL.md'),text);
     const res=checkPlaybook(out,{name});
diff --git a/test/playbook/build.test.mjs b/test/playbook/build.test.mjs
index 3c312f9a..61d01ff0 100644
--- a/test/playbook/build.test.mjs
+++ b/test/playbook/build.test.mjs
@@ -142,4 +142,14 @@ test('T-3 events: 개요·html 절, 지정 단계 파일에만, 없는 단계 id
   assert.throws(()=>buildFlow(mk({title:'T',updated:'d',events:[{when:'x',then:'y',steps:['S09']}],steps:steps3()})),/events/);
   assert.throws(()=>buildFlow(mk({title:'T',updated:'d',events:[{when:'',then:'y'}],steps:steps3()})),/events/);
   const none=mk({title:'T',updated:'d',steps:steps3()});buildFlow(none);assert.doesNotMatch(read(none,'flow/overview.md'),/비결정 이벤트/);
-});
\ No newline at end of file
+});
+test('T06 S-13 머리말 --dir: 실행 위치 밖 흐름 폴더면 절대 경로 대신 자리표시, dirLabel이 있으면 그 표기', ()=>{
+  const dir=mk({title:'T',updated:'2026-01-01',base:'references/x',steps:[step('S01')]});   // 임시 폴더 — 저장소(실행 위치) 밖
+  buildFlow(dir);
+  const ov=read(dir,'flow/overview.md');
+  assert.match(ov,/--dir <흐름 폴더>`/);
+  const slash=s=>s.split('\\').join('/');
+  assert.ok(!ov.includes(dir)&&!ov.includes(slash(dir))&&!ov.includes(slash(tmpdir())),'임시 절대 경로가 남았다');
+  buildFlow(dir,{dirLabel:'<플레이북 폴더>/references/flows/x'});
+  assert.match(read(dir,'flow/S01.md'),/--dir <플레이북 폴더>\/references\/flows\/x`/);
+});
diff --git a/test/playbook/capture-core.test.mjs b/test/playbook/capture-core.test.mjs
index 5b8b0a49..491b2916 100644
--- a/test/playbook/capture-core.test.mjs
+++ b/test/playbook/capture-core.test.mjs
@@ -389,3 +389,27 @@ test('S-5b+ ignore 하위 요소의 childList·attributes는 실패, frame은 
   const sc=withDom(d2,()=>{overlay({elements:[],css:['td'],res:[],frames:{cert:'#c'},ignore:[]});a.doc.defaultView.scrollY=50;return globalThis.__flowcap.post();});
   assert.deepEqual(sc.reasons,['scroll_changed']);
 });
+
+// ---- 값 노출 검사(T06 검토 반영): 추출 대상 밖의 같은 값 노출 위치 ----
+import {leakScript,leakProblems} from '../../skills/pace-playbook-maker/tools/capture-core.mjs';
+const runLeak=(doc,mask,step)=>new Function('document','NodeFilter','getComputedStyle','return '+leakScript({mask,step}))(doc,{SHOW_TEXT:4},()=>({visibility:'visible'}));
+
+test('값 노출 S-1 같은 값이 가림 밖 다른 곳에 보이면 개수로 잡고, 가려진 곳·대상 자신·짧은 값은 세지 않는다', ()=>{
+  const d=new Doc();
+  const mk=(tag,text,attrs={})=>{const e=new El(tag,{attrs,rect:{left:0,top:0,width:100,height:20},text});d.body.appendChild(e);return e;};
+  mk('span','124k',{class:'stars'});           // 추출 대상
+  mk('p','About: 124k stars',{class:'about'});  // 같은 값이 다른 곳(가려지지 않음)
+  mk('td','124k',{class:'row'});               // 같은 값이 다른 곳(가려짐)
+  mk('i','ab');                                // 짧은 값은 검사 대상이 아니다(다른 요소 'ab'가 있어도 무관)
+  const step={extract:[{name:'별',where:{selector:'span.stars'}},{name:'짧음',where:{selector:'i'}}]};
+  let r=runLeak(d,['td.row'],step);
+  assert.deepEqual(r,[{name:'별',exposed:1}]);   // about의 124k만(td는 가려짐, 대상 자신 제외, 'ab'는 3자 미만)
+  assert.deepEqual(leakProblems(r),["추출 '별'의 값이 대상 밖 1곳에 가려지지 않고 보인다"]);
+  // 정규식 가림 규칙이 덮으면 세지 않는다
+  const covered=runLeak(d,['td.row','re:\\d+k stars'],step);
+  assert.deepEqual(covered,[{name:'별',exposed:0}]);assert.deepEqual(leakProblems(covered),[]);
+  // 결과는 이름·개수뿐(값 없음)
+  assert.ok(!JSON.stringify(r).includes('124k'));
+  // 결과를 읽지 못하면 문제로 본다(fail-closed)
+  assert.ok(leakProblems(undefined).length===1);
+});
diff --git a/test/playbook/driver-runtime.test.mjs b/test/playbook/driver-runtime.test.mjs
index 17870bc0..9f319ee8 100644
--- a/test/playbook/driver-runtime.test.mjs
+++ b/test/playbook/driver-runtime.test.mjs
@@ -210,3 +210,29 @@ test('T05 검토1-⑦ 선언된 응답 경로가 모두 있어야 성공이고,
   const only=await rt(e2).perform(step({elements:[{n:1,name:'조회',find:'button#go',action:'클릭'}],extract:[]}));
   assert.equal(only.ok,true);assert.equal(only.expectChecked,false);
 });
+
+test('T06 S-11 말줄임(…)으로 끝나는 읽기 값은 넘기지 않고 truncated로 멈춘다 — 전체 글자는 통과', async()=>{
+  // 화면이 줄여 보인 제목: 값이 넘어가지 않는다
+  let e=env();page(e,{onClick:tbl=>e.at(200,()=>{tbl.textContent='긴 제목이 화면에서 잘려 보인다…';})});
+  let r=await rt(e).perform(step());
+  assert.deepEqual([r.ok,r.reason,r.values],[false,'truncated',undefined]);
+  // 세 점 말줄임도 같다
+  e=env();page(e,{onClick:tbl=>e.at(200,()=>{tbl.textContent='잘린 제목...';})});
+  r=await rt(e).perform(step());assert.equal(r.reason,'truncated');
+  // 가운데 말줄임표는 잘림이 아니다(전체 값)
+  e=env();page(e,{onClick:tbl=>e.at(200,()=>{tbl.textContent='범위 1…3 전체 제목';})});
+  r=await rt(e).perform(step());assert.equal(r.ok,true);assert.equal(r.values['목록 행'],'범위 1…3 전체 제목');
+});
+
+test('T06 S-12 읽기 대상이 button·a 같은 비입력 요소면 value 속성이 아니라 글자를 읽는다(button.value는 빈 문자열)', async()=>{
+  const e=env();page(e);
+  // 실제 화면(공개 저장소 페이지)의 브랜치 선택 단추처럼: <button value="">main</button>
+  e.add(e.doc.body,'button',{id:'branch',value:'',text:'가상 브랜치'});
+  const s=step({elements:[{n:1,name:'브랜치',find:'button#branch',action:'읽기'}],extract:[{name:'브랜치',where:{selector:'button#branch'}}]});
+  const r=await rt(e,{freshness:false}).perform(s);
+  assert.deepEqual([r.ok,r.values&&r.values['브랜치']],[true,'가상 브랜치']);
+  // 입력칸은 여전히 value를 읽는다
+  const e2=env();page(e2);e2.add(e2.doc.body,'input',{id:'q',value:'가상 입력값',text:''});
+  const r2=await rt(e2,{freshness:false}).perform(step({elements:[{n:1,name:'칸',find:'input#q',action:'읽기'}],extract:[{name:'칸',where:{selector:'input#q'}}]}));
+  assert.deepEqual([r2.ok,r2.values&&r2.values['칸']],[true,'가상 입력값']);
+});
diff --git a/test/playbook/orca-adapter.test.mjs b/test/playbook/orca-adapter.test.mjs
index 54a827c7..04171581 100644
--- a/test/playbook/orca-adapter.test.mjs
+++ b/test/playbook/orca-adapter.test.mjs
@@ -13,13 +13,13 @@ const PW=['pass','word=','hunter2','value'].join('');
 const OVERLAY_OK={masked:2,errors:[],frames:{viewer:{ok:true},side:{ok:true}},perRule:{'td.owner':1},missing:[],boxes:{1:{x:40,y:80,w:120,h:24},2:{x:40,y:140,w:720,h:300}},elementsMasked:{1:false,2:true},view:{vw:800,vh:600,dpr:1}};
 
 // runCapture·observeStep이 부르는 browser 계약을 흉내 낸다(식 안의 표지로 종류 판별)
-function fakeBrowser({shotDir,overlay=OVERLAY_OK,post={ok:true,reasons:[]},observe={ar:[true,true],er:[true]}}={}){
+function fakeBrowser({shotDir,overlay=OVERLAY_OK,post={ok:true,reasons:[]},observe={ar:[true,true],er:[true]},leak=[]}={}){
   const calls=[];let n=0;
   return {calls,
     evalJs(expr){
-      const kind=expr.includes('const A=')?'observe':expr.includes('f.post()')?'post':expr.includes('f.cleanup()')?'cleanup':'overlay';
+      const kind=expr.includes('const A=')?'observe':expr.includes('const CSS=')?'leak':expr.includes('f.post()')?'post':expr.includes('f.cleanup()')?'cleanup':'overlay';
       calls.push(kind);
-      return kind==='observe'?observe:kind==='post'?post:kind==='cleanup'?true:overlay;
+      return kind==='observe'?observe:kind==='leak'?leak:kind==='post'?post:kind==='cleanup'?true:overlay;
     },
     screenshot(){calls.push('screenshot');const p=join(shotDir,`raw-${++n}.jpg`);copyFileSync(join(FIX,'shots','S02.jpg'),p);return p;},
     discard(p){calls.push('discard');if(existsSync(p))writeFileSync(p,'');require_unlink(p);},
@@ -106,7 +106,9 @@ test('S-4 캡처 단계 거부: 사후 검사 실패·오버레이 오류·가
     ['post 실패',{post:{ok:false,reasons:['dom_changed']}},{},/캡처 중 화면이 바뀌어 거부/],
     ['오버레이 오류',{overlay:{...OVERLAY_OK,errors:['x']}},{},/마스킹 오버레이 오류/],
     ['가림 필수 0건',{overlay:{...OVERLAY_OK,perRule:{'td.owner':0}}},{step:s=>({...s,maskRequire:['td.owner']})},/가림 필수 규칙이 0건/],
-    ['추출 미가림',{overlay:{...OVERLAY_OK,elementsMasked:{1:false,2:false}}},{},/가려지지 않았다/]
+    ['추출 미가림',{overlay:{...OVERLAY_OK,elementsMasked:{1:false,2:false}}},{},/가려지지 않았다/],
+    ['같은 값이 대상 밖에 노출',{leak:[{name:'목록 행',exposed:2}]},{},/대상 밖 2곳에 가려지지 않고 보인다/],
+    ['값 노출 검사를 읽지 못함(fail-closed)',{leak:null},{},/값 노출 검사 결과를 읽지 못했다/]
   ];
   for(const [name,opts,extra,re] of cases){
     const {err,pending,shotDir}=run(opts,extra);
diff --git a/test/playbook/playbook.test.mjs b/test/playbook/playbook.test.mjs
index 476cf6fc..b598fbde 100644
--- a/test/playbook/playbook.test.mjs
+++ b/test/playbook/playbook.test.mjs
@@ -25,6 +25,17 @@ test('S-5 정상: 승인 완료 흐름에서 플레이북 폴더가 만들어지
   for(const s of ['가상 서비스의 보관함 목록 조회까지(전송 제외)','목록 행 수가 응답 건수와 같다','전송 — 되돌릴 수 없음 · 관문: 사람의 보내기 승인 한마디 필요','box(web) https://app.example.test — 인증: env-token(BOX_TOKEN)','목록 행(문자열, masked) → result-sheet','종류: 주민번호','주 1회','공지 창이 늦게 뜬다','S01: auth','기간(YYYY-MM-DD) ← user'])
     assert.ok(skill.includes(s),`SKILL.md에 없음: ${s}`);
   assert.ok(skill.includes('[index.json](references/flows/sample-flow/agent/index.json)')&&skill.includes('[flow.html](references/flows/sample-flow/flow.html)'));
+  // 흐름 색인은 단계 지도 파일 경로까지 모두 적고(탐색 없이 바로 읽기 — T06 측정), 적힌 경로는 모두 실재한다
+  const ids=readJson(join(out,'references','flows','sample-flow','steps.json')).steps.map(s=>s.id);
+  assert.ok(ids.length>1);
+  for(const id of ids)assert.ok(skill.includes(`[${id}.json](references/flows/sample-flow/agent/${id}.json)`),`단계 지도 경로 없음: ${id}`);
+  for(const m of skill.matchAll(/\]\((references\/[^)]+)\)/g))assert.ok(existsSync(join(out,m[1])),`색인 경로가 없다: ${m[1]}`);
+  // 생성 머리말의 --dir은 최종 위치 자리표시다 — 임시 작업 폴더(사용자 이름이 든 절대 경로)가 남지 않는다(T06 유출 검사에서 드러남)
+  for(const md of readdirSync(join(out,'references','flows','sample-flow','flow'))){
+    const t=readFileSync(join(out,'references','flows','sample-flow','flow',md),'utf8');
+    assert.ok(t.includes('--dir <플레이북 폴더>/references/flows/sample-flow'),`머리말 자리표시 없음: ${md}`);
+    assert.ok(!t.includes(tmpdir())&&!t.includes(tmpdir().replace(/\\/g,'/'))&&!/pace-playbook-[A-Za-z0-9]{6}[\\/]/.test(t),`임시 경로가 남음: ${md}`);
+  }
   assert.ok(skill.includes(`규약 버전 ${DRIVING_VERSION}`)&&skill.includes('`pace-playbook-maker` 스킬의 `references/driving.md`'));
   assert.ok(skill.includes('[references/history.md](references/history.md)'));
   assert.deepEqual(checkPlaybook(out),{ok:true,problems:[]});
```
## 5. 새 시험 래퍼 test/playbook-pilot-harness.test.ts
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * P001 T06 시범 측정 도구(projects/P001…/tasks/T06…/pilot/harness/)의 단위 시험 — 정답 판정기·세션 기록 해석·기록 가리기.
 * 네트워크·브라우저 없이 합성 값만 쓴다. PACE 실행기는 test/**\/*.test.ts만 돌므로 여기서 실행하고 건수로 확인한다.
 */
const projects = resolve("projects");
const p001 = existsSync(projects) ? readdirSync(projects).find((n) => n.startsWith("P001_")) : undefined;
const t06 = p001 ? readdirSync(join(projects, p001, "tasks")).find((n) => n.startsWith("T06")) : undefined;
const dir = p001 && t06 ? join(projects, p001, "tasks", t06, "pilot", "harness") : "";

test("T06 측정 도구 단위 시험이 실제로 실행되고 모두 통과한다", { skip: dir && existsSync(dir) ? false : "T06 측정 도구 폴더가 없다" }, () => {
  const files = readdirSync(dir).filter((n) => n.endsWith(".test.mjs")).map((n) => join(dir, n));
  assert.deepEqual(files.map((f) => f.split(/[\\/]/).pop()).sort(), ["analyze.test.mjs", "score.test.mjs", "scrub.test.mjs"]);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...files], { encoding: "utf8", env });
  const out = result.stdout;
  const count = (name: string) => Number(new RegExp(`^# ${name} (\\d+)`, "m").exec(out)?.[1] ?? Number.NaN);
  assert.equal(result.status, 0, out.slice(-2000) + result.stderr.slice(-500));
  assert.equal(count("fail"), 0);
  assert.ok(count("tests") >= 13, `실행된 테스트 ${count("tests")}건`);
  assert.equal(count("pass"), count("tests"));
});
```
## 6. 측정 도구 scrub.mjs
```js
// 세션 원본 기록 가리기 — 사용자 경로·사용자 이름·토큰 모양을 치환해 증거로 남길 수 있게 한다(저장소 이름·커밋 값 같은 공개 정보는 그대로).
// T06 유출 검사 보완: Windows 단축 이름(예: ABCDEF~1.XYZ)·Claude 프로젝트 폴더 인코딩(C--Users-…), `orca tab list` 결과(사용자의 다른 탭 URL·작업 폴더)도 가린다.
import {homedir,tmpdir,userInfo} from 'node:os';
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// 사용자 이름의 Windows 8.3 단축형(앞 6자~1.확장 3자)과 그 '-' 인코딩
const shortForms=user=>{
  if(!user)return [];
  const [base,ext='']=user.toUpperCase().split(/\.(?=[^.]*$)/);
  const b=base.replace(/[^A-Z0-9]/g,'').slice(0,6),e=ext.replace(/[^A-Z0-9]/g,'').slice(0,3);
  return [`${b}~1${e?'.'+e:''}`,`${b}-1${e?'-'+e:''}`];
};
export function scrubText(text,extra=[]){
  let t=String(text);
  const user=(()=>{try{return userInfo().username;}catch{return '';}})();
  const home=homedir();
  const pairs=[[tmpdir(),'<TEMP>'],[home,'<HOME>'],...extra];
  for(const [from,to] of pairs){
    if(!from)continue;
    const variants=new Set([from,from.replace(/\\/g,'/'),from.replace(/\\/g,'\\\\'),from.replace(/^([A-Za-z]):/,(m,d)=>'/'+d.toLowerCase()).replace(/\\/g,'/')]);
    for(const v of variants)t=t.replace(new RegExp(esc(v),'gi'),to);
  }
  // Claude 프로젝트 폴더 이름 인코딩(C--Users-<이름>-AppData-…)
  t=t.replace(/([A-Za-z])--Users-[A-Za-z0-9.~_-]+?(?=-AppData|-Documents|-Desktop|\\|\/|"|$)/g,'$1--Users-<USER>');
  for(const s of shortForms(user))t=t.replace(new RegExp(esc(s),'gi'),'<USER>');
  if(user)t=t.replace(new RegExp(esc(user),'gi'),'<USER>');
  // Windows 단축 경로(8.3) 형태의 사용자 폴더 — 앞 6자+~1
  t=t.replace(/C:[\\/]+Users[\\/]+[^\\/"'\s]+/gi,'<USER-PATH>').replace(/\/c\/Users\/[^/"'\s]+/gi,'<USER-PATH>');
  // 토큰 모양
  t=t.replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,'<TOKEN>')
       .replace(/(authorization["']?\s*[:=]\s*["']?bearer\s+)[A-Za-z0-9._~+/=-]{10,}/gi,'$1<TOKEN>');
  return t;
}

// stream-json 줄 배열에서 `orca tab list` 결과를 가린다 — 그 출력에는 이 업무와 무관한 사용자의 다른 탭 URL·작업 폴더가 있다.
// 도구 호출(입력)은 남기고 결과 본문만 바꾼다. 반환: {lines, redacted}
export const TAB_LIST_REDACTED='<orca tab list 출력 가림 — 사용자의 다른 탭 URL·작업 폴더 정보>';
export function scrubStreamLines(lines){
  const ids=new Set();let redacted=0;
  const out=lines.map(l=>{
    let e;try{e=JSON.parse(l);}catch{return l;}
    if(e&&e.type==='assistant'&&e.message&&Array.isArray(e.message.content))
      for(const c of e.message.content)if(c&&c.type==='tool_use'&&c.name==='Bash'&&/(^|[\s;&|(])orca(\.exe)?\s+(\S+\s+)*?tab\s+list\b/.test(String(c.input&&c.input.command)))ids.add(c.id);
    if(e&&e.type==='user'&&e.message&&Array.isArray(e.message.content)){
      let hit=false;
      for(const c of e.message.content)if(c&&c.type==='tool_result'&&ids.has(c.tool_use_id)){c.content=TAB_LIST_REDACTED;hit=true;}
      if(hit){if(e.tool_use_result!==undefined)e.tool_use_result=TAB_LIST_REDACTED;redacted++;return JSON.stringify(e);}
    }
    return l;
  });
  return {lines:out,redacted};
}
```
## 6. 측정 도구 leak-check.mjs
```js
// 값이 새지 않는 경로 검사(T06 S-5, T-5) — 시범 작성·주행·학습에서 저장된 모든 파일에 민감 형식 실값이 없는지 파일 종류별로 본다.
//  A. 플레이북·지도·상태(steps.json·agent/*·flow/*·SKILL.md·history.md·drive-state·heal-state): scanSensitive를 그대로(생성기와 같은 검사)
//  B. 세션 기록·측정 증거(*.stream.jsonl, 세션 [pn]N.json, sessions-*.json, coexist-session.json, 실페이지 확인 *.jsonl):
//     실행기가 붙이는 메타데이터 종류(식별자·서명·시각·사용량/비용·무결성 해시)를 빼고 scanSensitive — 종류별 개수를 보고한다.
//     공개 정답 값(커밋 제목 등, 필드 output·got·truth·truthStart·truthEnd)은 설계상 증거로 남기는 공개 정보라 뺀다(개수 보고).
//  C. 그 밖 증거 글(.txt·.md): scanSensitive, UUID 실행 id만 메타데이터로 뺀다.
//  모든 종류에 사용자 경로·사용자 이름·토큰 모양 검사를 더한다. (코드 .mjs는 대상이 아니다 — 저장소 비밀 검사가 본다)
//  캡처 이미지: 승인 기록(captureRecord)의 가림 증거(post·elementsMasked·perRule) + 요소 box 안 픽셀 중 가림색(±40) 비율 —
//  가림 이미지는 모든 box가 기준 이상, 같은 화면을 가림 없이 찍은 대조군은 모든 box가 기준 미만이어야 한다(대조군 이미지는 임시 폴더에만, 끝나면 지운다).
// 사용: node leak-check.mjs <출력 파일> <검사 폴더>...   (Orca 게스트 프로필 pace-t06-guest 필요)
import {spawnSync,spawn} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync,existsSync,statSync,rmSync,mkdtempSync} from 'node:fs';
import {join,resolve,dirname,relative,extname,basename} from 'node:path';
import {homedir,userInfo,tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');
const imp=f=>import(pathToFileURL(join(ROOT,'skills','pace-playbook-maker','tools',f)).href);
const {scanSensitive}=await imp('sensitive.mjs');
const {orcaExe}=await imp('orca-adapter.mjs');
const [outFile,...dirs]=process.argv.slice(2);
const lines=[];const say=s=>{lines.push(s);console.log(s);};
const walk=d=>readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?walk(p):[p];});
const user=(()=>{try{return userInfo().username;}catch{return '';}})();
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const PATTERNS=[
  ['사용자 경로',/(?<![A-Za-z])[A-Za-z]:[\\/]+Users[\\/]+(?!<)[^\\/"'\s<]+/i],
  ['홈 경로',new RegExp(esc(homedir()).replace(/\\\\/g,'[\\\\/]+'),'i')],
  ...(user?[['사용자 이름',new RegExp('(^|[^A-Za-z0-9])'+esc(user)+'($|[^A-Za-z0-9])','i')]]:[]),
  ['토큰 모양',/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/],
  ['Bearer 토큰',/bearer\s+[A-Za-z0-9._~+/=-]{20,}/i]
];
const TEXT=new Set(['.json','.jsonl','.md','.txt','.html','.csv']);
const self=outFile?resolve(outFile):'';
const classOf=f=>{
  const p=f.replace(/\\/g,'/');
  if(/\.stream\.jsonl$/.test(p)||/\/[pn]\d\.json$/.test(p)||/\/sessions-(playbook|nomap)\.json$/.test(p)||/\/coexist-session\.json$/.test(p)||/\/round2-longtitle[^/]*\.jsonl$/.test(p))return 'B';
  if(/\/references\/|\/SKILL\.md$|\/(drive|heal)-state\.json$/.test(p))return 'A';
  return 'C';
};
// B의 메타데이터 종류(키 이름) — 값이 아니라 실행기가 붙이는 것
const META_KEYS={
  '식별자':/^(session_id|uuid|id|request_id|tool_use_id|parent_tool_use_id|hook_id)$/,
  '서명':/^signature$/,
  '시각':/^(resetsAt|startedAt|at|timestamp|credential_expires_at|ttft_stream_ms|duration_ms|duration_api_ms|ms)$/,
  '사용량·비용':/^(usage|modelUsage|model_usage_since_last_result|total_cost_usd|costUSD|rate_limit_info|cache_creation|server_tool_use)$/,
  '실행 경로 필드':/^(memory_paths|memoryPaths|messaging_socket_path|persistedOutputPath|wire_tool_inputs|cwd)$/,
  '공개 정답 값':/^(output|got|truth|truthStart|truthEnd)$/
};
const META_TEXT={'식별자':[/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,/\b(toolu|msg|req|srvtoolu)_[A-Za-z0-9]{10,}\b/g],'무결성 해시':[/\b[0-9a-f]{64}\b/gi],
  '공개 페이지 16진 값(커밋 SHA 등)':[/\b[0-9a-f]{32,40}\b/gi],'도구 결과 임시 경로':[/-AppData-Local-Temp-[^\s"\\]+(\\{1,2}|\/)[^\s"\\]*(\\{1,2}|\/)tool-results/g]};
const dropped={};const drop=k=>{dropped[k]=(dropped[k]||0)+1;};
const stripB=v=>{
  if(Array.isArray(v))return v.map(stripB);
  if(v&&typeof v==='object'){const o={};for(const [k,x] of Object.entries(v)){const m=Object.entries(META_KEYS).find(([,re])=>re.test(k));if(m){drop(m[0]);continue;}o[k]=stripB(x);}return o;}
  if(typeof v==='string'){let n=v;for(const [k,res] of Object.entries(META_TEXT))for(const re of res)n=n.replace(re,()=>{drop(k);return '<id>';});return n;}
  return v;
};
const stripC=t=>t.replace(META_TEXT['식별자'][0],()=>{drop('실행 id(UUID)');return '<id>';});
let files=0,violations=0;const perClass={A:0,B:0,C:0};
for(const d of dirs){
  for(const f of walk(resolve(d))){
    const ext=extname(f).toLowerCase();
    if(!TEXT.has(ext)||resolve(f)===self)continue;
    files++;const cls=classOf(f);perClass[cls]++;
    const text=readFileSync(f,'utf8');const rel=relative(ROOT,f).replace(/\\/g,'/');
    const found=[];
    // scanSensitive는 민감 형식을 찾으면 던진다(메시지에는 경로·종류만, 값 없음)
    const scan=(v,tag='')=>{try{scanSensitive(v);}catch(e){found.push(tag+String(e.message).replace(/^민감 형식 거부 — [^:]*: /,'').slice(0,160));}};
    const parse=s=>{try{return JSON.parse(s);}catch{return undefined;}};
    if(cls==='A'){if(ext==='.json'){const o=parse(text);if(o===undefined)found.push('JSON 파싱 실패');else scan(o);}else scan(text);}
    else if(cls==='B'){
      if(ext==='.jsonl')text.split('\n').forEach((l,i)=>{if(!l.trim())return;const o=parse(l);scan(stripB(o===undefined?l:o),`줄 ${i+1}: `);});
      else{const o=parse(text);if(o===undefined)found.push('JSON 파싱 실패');else scan(stripB(o));}
    }
    else scan(stripC(text));
    for(const [name,re] of PATTERNS)if(re.test(text))found.push(name);
    if(found.length){violations+=found.length;say(`위반 [${cls}] ${rel}: ${found.slice(0,5).join(' / ')}${found.length>5?` 외 ${found.length-5}건`:''}`);}
  }
}
say(`텍스트·JSON 파일 ${files}개 검사(A 플레이북·지도·상태 ${perClass.A} · B 세션·측정 기록 ${perClass.B} · C 그 밖 증거 ${perClass.C}) — 위반 ${violations}건`);
say(`검사 전 뺀 메타데이터(종류별 개수, 값 아님): ${Object.entries(dropped).map(([k,v])=>`${k} ${v}`).join(' · ')||'없음'}`);

// ---- 캡처 이미지 ----
const exe=orcaExe();
const orca=(...a)=>{const r=spawnSync(exe,[...a,'--json'],{encoding:'utf8',timeout:90000});const j=JSON.parse(r.stdout);if(!j.ok)throw new Error('orca '+a[0]+' 실패');return j.result;};
const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
const prof=orca('tab','profile','list').profiles.find(p=>p.label==='pace-t06-guest').id;
const MASK=[71,85,105],TOL=40,MIN_SHARE=0.5,CTL_MAX=0.2;   // 기준은 대조군을 돌리기 전에 정했다
const blank=orca('tab','create','--profile',prof,'--url','about:blank').browserPageId;
// 이미지는 명령 줄 길이 한도 때문에 data URL로 넘기지 않고, 별도 프로세스의 로컬 HTTP(CORS 허용)로 내준다 — 임시 폴더, 끝나면 지운다
const imgDir=mkdtempSync(join(tmpdir(),'pace-t06-leak-'));let imgN=0;
const srv=spawn(process.execPath,['-e',"const h=require('http'),fs=require('fs'),p=require('path');const d=process.argv[1];h.createServer((q,r)=>{const f=p.join(d,p.basename(new URL(q.url,'http://x').pathname));if(!fs.existsSync(f)){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':'image/jpeg','access-control-allow-origin':'*'});r.end(fs.readFileSync(f));}).listen(0,'127.0.0.1',function(){console.log('PORT '+this.address().port);});",imgDir],{stdio:['ignore','pipe','ignore']});
const PORT=await new Promise((ok,fail)=>{let b='';srv.stdout.on('data',x=>{b+=x;const m=/PORT (\d+)/.exec(b);if(m)ok(m[1]);});setTimeout(()=>fail(new Error('이미지 서버 시작 실패')),15000);});
// box 안 픽셀 중 가림색(±TOL) 비율과 평균색
const boxStats=(jpeg,boxes)=>{
  const fn='img-'+(++imgN)+'.jpg';writeFileSync(join(imgDir,fn),jpeg);
  const u='http://127.0.0.1:'+PORT+'/'+fn;
  const bs=Object.entries(boxes).map(([n,b])=>({n,x:Math.round(b.x),y:Math.round(b.y),w:Math.max(1,Math.round(b.w)),h:Math.max(1,Math.round(b.h))}));
  const expr=`(async()=>{const img=new Image();img.crossOrigin='anonymous';img.src=${JSON.stringify(u)};await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const M=${JSON.stringify(MASK)},T=${TOL};return JSON.stringify({iw:img.width,ih:img.height,boxes:${JSON.stringify(bs)}.map(b=>{const d=g.getImageData(b.x,b.y,b.w,b.h).data;let r=0,gg=0,bb=0,k=0,n=d.length/4;for(let i=0;i<d.length;i+=4){r+=d[i];gg+=d[i+1];bb+=d[i+2];if(Math.abs(d[i]-M[0])<T&&Math.abs(d[i+1]-M[1])<T&&Math.abs(d[i+2]-M[2])<T)k++;}return {n:b.n,share:+(k/n).toFixed(3),mean:[r/n,gg/n,bb/n].map(x=>Math.round(x))};})});})()`;
  let v=orca('eval','--page',blank,'--expression',expr).result;v=typeof v==='object'&&v&&'result' in v?v.result:v;while(typeof v==='string')v=JSON.parse(v);return v;
};
const fmt=st=>st.boxes.map(b=>`${b.n}:${b.share}`).join(' ');
let capOk=true;let controlDone=false;
try{
  for(const d of dirs)for(const f of walk(resolve(d)).filter(p=>/[\\/]steps\.json$/.test(p))){
    const doc=JSON.parse(readFileSync(f,'utf8'));
    for(const s of doc.steps.filter(x=>x.captureRecord)){
      const shot=join(dirname(f),'shots',s.id+'.jpg');if(!existsSync(shot))continue;
      const rec=s.captureRecord,rel=relative(ROOT,shot).replace(/\\/g,'/');
      const allMasked=Object.values(rec.elementsMasked||{}).every(Boolean);
      const reqOk=(s.maskRequire||[]).every(k=>(rec.masking.perRule[k]||0)>0);
      const st=boxStats(readFileSync(shot),rec.boxes);
      const pix=st.boxes.every(b=>b.share>=MIN_SHARE);
      say(`캡처 ${rel} (${st.iw}×${st.ih}): post=${rec.post===true} · 요소 전부 가림=${allMasked} · 가림 필수 규칙 충족=${reqOk} · 가린 건수 ${rec.masking.masked} · box별 가림색 비율 ${fmt(st)} → ${pix?'모든 box ≥ '+MIN_SHARE:'기준 미달 box 있음'}`);
      if(!(rec.post===true&&allMasked&&reqOk&&pix))capOk=false;
      if(controlDone)continue;
      // 대조군(한 번): 같은 화면(만들 때 입력의 공개 페이지, 같은 뷰포트)을 가림 없이 찍으면 같은 픽셀 검사에서 실패해야 한다
      const page=orca('tab','create','--profile',prof,'--url','https://github.com/ceo4ever/pace').browserPageId;
      try{
        for(let i=0;i<30;i++){sleep(700);try{const r=orca('eval','--page',page,'--expression',"!!document.querySelector('[data-testid=\"latest-commit\"]')");if(String(r.result)==='true')break;}catch{}}
        orca('viewport','--page',page,'--width',String(rec.view.vw),'--height',String(rec.view.vh),'--scale',String(rec.view.dpr));sleep(1500);
        const shotRes=orca('screenshot','--page',page,'--format','jpeg');
        const raw=readFileSync(shotRes.path);rmSync(shotRes.path,{force:true});
        const ct=boxStats(raw,rec.boxes);
        const ctlFail=ct.boxes.every(b=>b.share<CTL_MAX);
        say(`대조군(가림 없이 찍은 같은 화면 ${ct.iw}×${ct.ih}, 임시·삭제): box별 가림색 비율 ${fmt(ct)} → 픽셀 검사 ${ctlFail?'실패(기대대로 — 모든 box < '+CTL_MAX+')':'통과 — 검사가 가림을 구별하지 못한다'}`);
        if(!ctlFail)capOk=false;controlDone=true;
      }finally{try{orca('tab','close','--page',page);}catch{}}
    }
  }
}finally{try{orca('tab','close','--page',blank);}catch{}srv.kill();rmSync(imgDir,{recursive:true,force:true});}
const ok=violations===0&&capOk;
say(`판정: 텍스트·JSON 위반 ${violations}건 · 캡처 가림 ${capOk?'확인':'문제'} → ${ok?'통과':'실패'}`);
if(outFile)writeFileSync(resolve(outFile),lines.join('\n')+'\n');
process.exit(ok?0:1);
```
## 6. 측정 도구 heal-check.mjs
```js
// 변경 학습 확인(T06 S-4, T-4) — 시범 플레이북 **복사본**의 원본 steps.json에서 한 요소의 선택자를 현재 페이지에 없는 낡은 값으로 바꾸고 buildFlow로 지도를
// 정상 재생성한 뒤(생성물 agent/*는 직접 고치지 않는다), 실제 GitHub 페이지(게스트 프로필)에서 네 단계를 관찰한다:
//  ① 손상 전 정상 주행(정답 일치) ② 손상 직후 진단 실패(치유 없는 drive가 해당 단계에서 멈추고 진단 종류가 나옴)
//  ③ 자가 복구·반영(driveWithHealing — steps.json 선택자 변경·지도 재생성·checkAgentFresh·history 항목) ④ 새 탭 재주행(정답 일치·치유 호출 0)
// 복구하지 못하면 그 사실과 이유를 그대로 기록한다(T-4 미충족). 값은 공개 정보라 판정 결과만 남기고, 흐름 상태·기록 폴더는 유출 검사 대상으로 보존한다.
// 사용: node heal-check.mjs <출력 파일> <상태 보존 폴더> [--repo owner/name]
import {spawnSync} from 'node:child_process';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fetchTruth} from './truth.mjs';
import {judge} from './score.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');
const imp=f=>import(pathToFileURL(join(ROOT,'skills','pace-playbook-maker','tools',f)).href);
const {driveWithHealing,pendingHumanChecks}=await imp('healer.mjs');
const {createWebProbe}=await imp('heal-web.mjs');
const {createWebRuntime,drive,loadMap}=await imp('driver.mjs');
const {createStore,createOrcaBrowser,orcaExe}=await imp('orca-adapter.mjs');
const {buildFlow,checkAgentFresh}=await imp('build.mjs');
const {runCapture,captureRecord,sha256Hex}=await imp('capture-core.mjs');

const [outFile,keepDir]=process.argv.slice(2);
const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:undefined;};
const REPO=arg('--repo')||'ceo4ever/pace';   // 기준 캡처를 찍은 화면(요소 box가 같은 배치)
const STALE='#ref-picker-repos-header-ref-selector-v0',ELEMENT=1;
const lines=[];const say=s=>{lines.push(s);console.log(s);};
const exe=orcaExe();
const orca=(...a)=>{let last;for(let i=0;i<3;i++){const r=spawnSync(exe,[...a,'--json'],{encoding:'utf8',timeout:90000});try{const j=JSON.parse(r.stdout);if(!j.ok)throw new Error('orca '+a[0]+' 실패');return j.result;}catch(e){last=e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,700);}}throw last;};
const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
const prof=orca('tab','profile','list').profiles.find(p=>p.label==='pace-t06-guest').id;
const pages=[];
// 정답 조회는 일시적 네트워크 오류(소켓 끊김)만 두 번 더 시도한다 — 응답 상태 오류(한도 등)는 그대로 실패
const NO_TRUTH=process.argv.includes('--no-truth');   // 진단용: 정답 조회 없이(정확도 판정은 실패로 표시)
const truthOf=async r=>{if(NO_TRUTH)return {branch:'',stars:-1,sha7:'',title:'',date:''};for(let i=0;;i++){try{return await fetchTruth(r);}catch(e){if(i>=2||/GitHub API/.test(String(e.message)))throw e;sleep(2000);}}};
const openTab=()=>{
  const page=orca('tab','create','--profile',prof,'--url','https://github.com/'+REPO).browserPageId;pages.push(page);
  for(let i=0;i<30;i++){sleep(700);try{if(String(orca('eval','--page',page,'--expression',"!!document.querySelector('[data-testid=\"latest-commit\"]')").result)==='true')break;}catch{}}
  orca('viewport','--page',page,'--width','1280','--height','900','--scale','1');sleep(1500);
  return {page,browser:createOrcaBrowser({page})};
};
// 라이브러리가 읽은 화면 글자(textContent)를 정답 판정 형식으로 — 별은 괄호 안 표기, 날짜는 표시 날짜, 나머지는 공백 정리
const toOut=v=>{
  const s=k=>String(v[k]??'').replace(/\s+/g,' ').trim();
  const star=/\(([^)]+)\)/.exec(s('별 개수'));const d=Date.parse(s('최신 커밋 날짜')+' UTC');
  return {branch:s('기본 브랜치'),stars:star?star[1]:s('별 개수'),sha7:s('최신 커밋 해시'),title:s('최신 커밋 제목'),date:Number.isFinite(d)?new Date(d).toISOString().slice(0,10):null};
};

const work=mkdtempSync(join(tmpdir(),'pace-t06-heal-'));
const out=join(work,'github-repo-latest');
cpSync(resolve(here,'..','github-repo-latest'),out,{recursive:true});
const flowDir=join(out,'references','flows','repo-latest');
const keep=resolve(keepDir);rmSync(keep,{recursive:true,force:true});mkdirSync(keep,{recursive:true});
const state=createStore(join(keep,'state')),healStore=createStore(join(keep,'heal'));
let tab=openTab();
const mkArgs=(t,sunk)=>{
  const web=createWebRuntime({browser:t.browser,waitMs:5000,pollMs:150,freshness:false});   // 읽기만 하는 단계 — 지문 비교를 끈다(규약 §2)
  const probe=createWebProbe({browser:t.browser,mask:JSON.parse(readFileSync(join(flowDir,'steps.json'),'utf8')).mask});
  const doc=()=>JSON.parse(readFileSync(join(flowDir,'steps.json'),'utf8'));
  return {web,args:{flowDir,playbookDir:out,state,healStore,from:'S02',to:'S02',runtime:web,account:'guest',task:'repo-latest',maxAttempts:3,
    sink:async(d,n,v)=>{sunk[n]=v;},
    observe:async r=>probe.observe({step:loadMap(flowDir).steps.find(s=>s.id===r.step)}),
    verifyStep:async vs=>{const ok=await web.judgeScreen(vs);return ok?web.perform(vs):{ok:false};},
    regress:async(pd,c)=>{const st=pd.steps.find(s=>s.id===c.stepId);const bad=(st.elements||[]).filter(e=>{try{return t.browser.evalJs(`document.querySelectorAll(${JSON.stringify(e.find)}).length`)!==1;}catch{return true;}});return [{name:'요소 선택자 유일성',covers:[c.stepId],ok:bad.length===0}];},
    recapture:async patched=>{const cap=runCapture({doc:doc(),step:patched,frames:{},browser:t.browser});const bytes=readFileSync(cap.path);const sha=sha256Hex(bytes);const record=captureRecord({info:cap.info,post:cap.post,step:patched,shotSha256:sha,frames:{}});t.browser.discard(cap.path);return {record,bytes};}
  }};
};
let pass=true;
try{
  // ① 손상 전 정상 주행
  let truthA=await truthOf(REPO);let sunk={};let {args}=mkArgs(tab,sunk);
  const r1=await driveWithHealing({...args,runId:'t06-pre'});
  let truthB=await truthOf(REPO);
  const j1=judge(toOut(sunk),truthA,truthB);
  say(`① 손상 전 주행(${REPO}): status=${r1.status} 치유 호출 ${r1.healCalls} · 정답 대조 ${JSON.stringify(j1.fields)} → ${r1.status==='done'&&r1.healCalls===0&&j1.ok?'정확(치유 없음)':j1.ok&&r1.status==='done'?`값 5/5 정확, 단 치유 ${r1.healCalls}회 필요 — "치유 없는 정상 주행" 조건은 미충족`:'실패'}`);
  if(r1.healCalls>0||r1.status!=='done')say(`   멈춘 곳 ${JSON.stringify(r1.report?{element:r1.report.element,reason:r1.report.reason}:r1.reason)} · 치유 ${JSON.stringify(r1.heals)}${r1.heal?' · 결과 '+JSON.stringify({status:r1.heal.status,reason:r1.heal.reason,kind:r1.heal.diagnosis&&r1.heal.diagnosis.kind}):''}`);
  if(!(r1.status==='done'&&r1.healCalls===0&&j1.ok))pass=false;
  // 손상: 원본 steps.json에서 요소 1(기본 브랜치)의 선택자를 낡은 값으로 — find와 extract.where.selector를 함께(둘은 같아야 한다)
  const p=join(flowDir,'steps.json'),d=JSON.parse(readFileSync(p,'utf8'));
  const s2=d.steps.find(s=>s.id==='S02');const el=s2.elements.find(e=>e.n===ELEMENT);const oldFind=el.find;
  el.find=STALE;for(const x of s2.extract)if(x.where&&x.where.selector===oldFind)x.where.selector=STALE;
  writeFileSync(p,JSON.stringify(d,null,1)+'\n');buildFlow(flowDir);
  const fresh=checkAgentFresh(flowDir);
  const present=String(tab.browser.evalJs(`document.querySelectorAll(${JSON.stringify(STALE)}).length`));
  say(`손상: 요소 ${ELEMENT} 선택자를 현재 화면에 없는 값으로 바꾸고 buildFlow 재생성 — checkAgentFresh ${fresh.ok?'통과':'실패 '+JSON.stringify(fresh.problems)} · 실제 DOM에서 그 선택자 ${present}개`);
  if(!fresh.ok||present!=='0')pass=false;
  // ② 손상 직후 — 치유 없는 주행이 해당 단계에서 멈추고 진단 종류를 낸다
  tab=openTab();({args}=mkArgs(tab,sunk={}));
  const r2=await drive({flowDir,runId:'t06-damaged',runtime:args.runtime,state,sink:args.sink,from:'S02',to:'S02',approvalCtx:{account:'guest',task:'repo-latest',flow:'repo-latest'}});
  say(`② 손상 직후 주행(치유 없음): status=${r2.status} 단계 ${r2.step} 진단 ${JSON.stringify(r2.report?{element:r2.report.element,reason:r2.report.reason}:r2.reason)} · 넘긴 값 ${Object.keys(sunk).length}개`);
  if(r2.status==='done')pass=false;
  // ③ 자가 복구·반영
  ({args}=mkArgs(tab,sunk={}));
  truthA=await truthOf(REPO);
  const r3=await driveWithHealing({...args,runId:'t06-heal'});
  truthB=await truthOf(REPO);
  const after=JSON.parse(readFileSync(p,'utf8')).steps.find(s=>s.id==='S02').elements.find(e=>e.n===ELEMENT).find;
  const hist=readFileSync(join(out,'references','history.md'),'utf8');
  const fresh3=checkAgentFresh(flowDir);
  const pend=pendingHumanChecks({historyPath:join(out,'references','history.md')});
  say(`③ 자가 복구 주행: status=${r3.status} 치유 호출 ${r3.healCalls} · 치유 ${JSON.stringify(r3.heals)}${r3.heal?' · 결과 '+JSON.stringify({status:r3.heal.status,reason:r3.heal.reason,kind:r3.heal.diagnosis&&r3.heal.diagnosis.kind}):''}`);
  say(`   반영: steps.json 요소 ${ELEMENT} 선택자 ${after===STALE?'그대로(낡은 값)':after===oldFind?'원래 선택자로 복구':'새 선택자 '+after} · 지도 최신 ${fresh3.ok} · history S02 항목 ${/S02 ·/.test(hist)} · 사람 확인 대기 ${pend.filter(x=>x.step==='S02').length}건`);
  const j3=judge(toOut(sunk),truthA,truthB);
  say(`   복구 주행 값 정답 대조 ${JSON.stringify(j3.fields)}`);
  const healed=r3.status==='done'&&r3.heals.some(h=>h.status==='applied')&&after!==STALE&&fresh3.ok&&/S02 ·/.test(hist);
  if(!healed){pass=false;say('   → 복구하지 못했다 — T-4 미충족(이유는 위 치유 결과)');}
  else{
    // ④ 새 탭·새 실행 — 진단 없이 통과
    tab=openTab();({args}=mkArgs(tab,sunk={}));
    truthA=await truthOf(REPO);
    const r4=await driveWithHealing({...args,runId:'t06-post'});
    truthB=await truthOf(REPO);
    const j4=judge(toOut(sunk),truthA,truthB);
    say(`④ 반영 뒤 재주행: status=${r4.status} 치유 호출 ${r4.healCalls} · 정답 대조 ${JSON.stringify(j4.fields)} → ${r4.status==='done'&&r4.healCalls===0&&j4.ok?'정확':'실패'}`);
    if(!(r4.status==='done'&&r4.healCalls===0&&j4.ok))pass=false;
  }
  // 학습 산출물(history·steps.json·지도)도 유출 검사 대상으로 보존한다
  cpSync(out,join(keep,'playbook'),{recursive:true});
}finally{for(const pg of pages){try{orca('tab','close','--page',pg);}catch{}}rmSync(work,{recursive:true,force:true});}
say(`판정: ${pass?'T-4 충족':'T-4 미충족'}`);
if(outFile)writeFileSync(resolve(outFile),lines.join('\n')+'\n');
```
## 6. 측정 도구 round2.mjs
```js
// 2라운드 보완(T06, main 판단 A) — 캡처를 다시 하지 않고 바꿀 수 있는 행동·서술 필드만 더한다(find·screen 불변 → 승인 캡처 증거 그대로 재사용).
// ① orca 명령 세 가지 형태(도움말 호출 없이 바로 쓰게)
// ② S02 command: 다섯 값을 한 번에 읽는 식 — 화면이 커밋 제목을 '…'로 줄였으면 최신 커밋 줄의 펼침 단추(화면 안 표시 토글, 서버 상태 불변)를
//    눌러 '…'로 시작하는 이어지는 글의 첫 줄을 붙인다(GitHub 첫 화면에는 긴 제목 전체가 속성·스크립트 어디에도 없다 — 실페이지 확인)
// ③ 제목 verify: 잘린 값 금지(주행 라이브러리의 truncated 검사와 같은 규칙)
export const S02_READ = "(async()=>{const q=s=>document.querySelector(s);const vis=e=>e.getBoundingClientRect().height>0;const H='[data-testid=latest-commit-html]';const all=()=>[...document.querySelectorAll(H)].filter(vis).map(e=>e.textContent.trim());let t=all()[0]||null;if(t&&t.endsWith('…')){const b=q('[data-testid=latest-commit-details-toggle]');if(b&&b.getAttribute('aria-expanded')!=='true')b.click();let c=null;for(let i=0;i<20&&!c;i++){c=all().find(x=>x.startsWith('…'));if(!c)await new Promise(r=>setTimeout(r,150));}t=c?t.slice(0,-1)+c.slice(1).split('\\n')[0]:null;}const a=q('[data-testid=latest-commit-details] a[href*=commit]');const rt=q('[data-testid=latest-commit-details] relative-time');const st=q('[data-testid=star-button]');return JSON.stringify({path:location.pathname,branch:(q('#ref-picker-repos-header-ref-selector')||{}).innerText||null,stars:st?((st.innerText.match(/\\(([^)]+)\\)/)||[])[1]||null):null,sha7:a?a.textContent.trim():null,title:t,date:rt?(rt.getAttribute('datetime')||'').slice(0,10):null});})()";

// ④ 지도 읽기 호출 축소(캡틴 결정 '지도 읽기 호출 수 축소 시도'): 열기만 하는 S01(요소·추출·캡처 없음)을 S02의 진입 조건으로 접는다 —
//    지도 = index.json + S02.json 두 파일. 열기 명령은 S02 enter(→ index.start)에, 읽기·닫기 명령은 S02 toolNote·command에 둔다.
export function applyRound2(d) {
  d.steps = d.steps.filter((s) => s.id !== 'S01');
  const s2 = d.steps.find((s) => s.id === 'S02');
  s2.enter = '공개 저장소 첫 화면이 열려 있다 — 열기: `orca tab create --url https://github.com/<owner/repo> --json`(출력 result.browserPageId가 이후 <page>)';
  s2.toolNote = 'orca 명령 세 가지면 된다(도움말 불필요): 열기는 enter, 읽기는 command 한 번(다섯 값을 JSON으로 — 값이 null이면 그 요소가 없는 것이니 멈추고 보고), 닫기 `orca tab close --page <page>`. 제목이 화면에서 줄었으면 command의 식이 펼침 단추로 전체 제목을 읽는다';
  s2.command = 'orca eval --page <page> --expression "' + S02_READ + '"';
  const x = s2.extract.find((e) => e.name === '최신 커밋 제목');
  x.verify = '비어 있지 않고 말줄임(…)으로 끝나지 않는 전체 제목 — 화면이 줄였으면 펼침 단추(latest-commit-details-toggle)로 펼친 이어지는 글의 첫 줄을 붙인다';
  return d;
}
```
## 7. 증거 evidence/score.txt
```
{
 "playbook": {
  "n": 3,
  "success": 3,
  "medianMs": 24028,
  "medianToolCalls": 7,
  "medianExplore": 1,
  "medianMapBytes": 10791
 },
 "nomap": {
  "n": 3,
  "success": 2,
  "medianMs": 36088,
  "medianToolCalls": 8,
  "medianExplore": 3,
  "medianMapBytes": 0
 },
 "mapUsedInAllPlaybookSamples": true,
 "p6": "충족",
 "reasons": []
}
```
## 7. 증거 evidence/groups.txt
```
[1라운드] init·모델·버전 같음(6세션): true — 모델 sonnet(init claude-sonnet-5-5) · CLI 2.1.326 (Claude Code) · 도구 ["Bash","Read"] · 권한 dontAsk · 스킬 [] · MCP []
  p1 playbook anthropics/claude-code: 정확 true · 29206ms · 호출 9({"Bash":5,"Read":4}) · orca 밖 Bash 0 · 거부 0 · 프로필 위반 false · 시간 초과 false · 지도 읽음 true(파일 4개 10149B)
  p2 playbook microsoft/vscode: 정확 false · 36699ms · 호출 9({"Bash":5,"Read":4}) · orca 밖 Bash 0 · 거부 0 · 프로필 위반 false · 시간 초과 false · 지도 읽음 true(파일 4개 10149B)
  p3 playbook nodejs/node: 정확 true · 25934ms · 호출 8({"Bash":4,"Read":4}) · orca 밖 Bash 0 · 거부 0 · 프로필 위반 false · 시간 초과 false · 지도 읽음 true(파일 4개 10149B)
  n1 nomap anthropics/claude-code: 정확 true · 40135ms · 호출 7({"Bash":7}) · orca 밖 Bash 0 · 거부 0 · 프로필 위반 false · 시간 초과 false
  n2 nomap microsoft/vscode: 정확 true · 47401ms · 호출 8({"Bash":7,"Read":1}) · orca 밖 Bash 0 · 거부 1 · 프로필 위반 false · 시간 초과 false
  n3 nomap nodejs/node: 정확 true · 43700ms · 호출 11({"Bash":10,"Read":1}) · orca 밖 Bash 0 · 거부 1 · 프로필 위반 false · 시간 초과 false
[2라운드] init·모델·버전 같음(6세션): true — 모델 sonnet(init claude-sonnet-5-5) · CLI 2.1.326 (Claude Code) · 도구 ["Bash","Read"] · 권한 dontAsk · 스킬 [] · MCP []
  p1 playbook anthropics/claude-code: 정확 true · 28707ms · 호출 8({"Bash":5,"Read":3}) · orca 밖 Bash 2{"ls":2} · 거부 0 · 프로필 위반 false · 시간 초과 false · 지도 읽음 true(파일 3개 10526B)
  p2 playbook microsoft/vscode: 정확 true · 26009ms · 호출 8({"Bash":5,"Read":3}) · orca 밖 Bash 2{"ls":2} · 거부 0 · 프로필 위반 false · 시간 초과 false · 지도 읽음 true(파일 3개 10526B)
  p3 playbook nodejs/node: 정확 true · 28509ms · 호출 8({"Bash":5,"Read":3}) · orca 밖 Bash 0 · 거부 0 · 프로필 위반 false · 시간 초과 false · 지도 읽음 true(파일 3개 10526B)
  n1 nomap anthropics/claude-code: 정확 true · 34277ms · 호출 8({"Bash":8}) · orca 밖 Bash 0 · 거부 0 · 프로필 위반 false · 시간 초과 false
  n2 nomap microsoft/vscode: 정확 true · 42990ms · 호출 10({"Bash":9,"Read":1}) · orca 밖 Bash 0 · 거부 1 · 프로필 위반 false · 시간 초과 false
  n3 nomap nodejs/node: 정확 true · 38165ms · 호출 8({"Bash":7,"Read":1}) · orca 밖 Bash 0 · 거부 1 · 프로필 위반 false · 시간 초과 false
  프롬프트 6개 1라운드와 바이트 동일: true
[3라운드] init·모델·버전 같음(6세션): true — 모델 sonnet(init claude-sonnet-5-5) · CLI 2.1.326 (Claude Code) · 도구 ["Bash","Read"] · 권한 dontAsk · 스킬 [] · MCP []
  p1 playbook anthropics/claude-code: 정확 true · 24444ms · 호출 7({"Bash":4,"Read":3}) · orca 밖 Bash 0 · 거부 0 · 프로필 위반 false · 시간 초과 false · 지도 읽음 true(파일 3개 10791B)
  p2 playbook microsoft/vscode: 정확 true · 22106ms · 호출 7({"Bash":4,"Read":3}) · orca 밖 Bash 0 · 거부 0 · 프로필 위반 false · 시간 초과 false · 지도 읽음 true(파일 3개 10791B)
  p3 playbook nodejs/node: 정확 true · 24028ms · 호출 7({"Bash":4,"Read":3}) · orca 밖 Bash 1{"ls":1} · 거부 0 · 프로필 위반 false · 시간 초과 false · 지도 읽음 true(파일 3개 10791B)
  n1 nomap anthropics/claude-code: 정확 true · 35571ms · 호출 8({"Bash":8}) · orca 밖 Bash 0 · 거부 0 · 프로필 위반 false · 시간 초과 false
  n2 nomap microsoft/vscode: 정확 false · 39097ms · 호출 7({"Bash":6,"Read":1}) · orca 밖 Bash 0 · 거부 1 · 프로필 위반 false · 시간 초과 false
  n3 nomap nodejs/node: 정확 true · 36088ms · 호출 8({"Bash":7,"Read":1}) · orca 밖 Bash 0 · 거부 1 · 프로필 위반 false · 시간 초과 false
  프롬프트 6개 1라운드와 바이트 동일: true
판정: 두 군 조건 같음·플레이북 군 지도 읽음·프로필 위반 0
```
## 7. 증거 evidence/pilot-build.txt
```
인터뷰(저장소 밖 작업 폴더): 완전=true 빠진 항목 0·문제 0 · 민감 형식 실값 0
승인 캡처: S02 9fd8d5cd92b5(사람 확인 해시와 같음 true) · agentView=true
checkPlaybook 통과 · checkAgentFresh 통과
플레이북 파일 9개 — 입력별 값(저장소 이름 4개) 0건 · 자리표시 <owner/repo> 사용 true
판정: 통과
```
## 7. 증거 evidence/pilot-heal.txt
```
① 손상 전 주행(ceo4ever/pace): status=done 치유 호출 1 · 정답 대조 {"branch":true,"sha7":true,"title":true,"date":true,"stars":true} → 값 5/5 정확, 단 치유 1회 필요 — "치유 없는 정상 주행" 조건은 미충족
   멈춘 곳 undefined · 치유 [{"status":"applied","kind":"rebaseline","stepId":"S02","version":1}]
손상: 요소 1 선택자를 현재 화면에 없는 값으로 바꾸고 buildFlow 재생성 — checkAgentFresh 통과 · 실제 DOM에서 그 선택자 0개
② 손상 직후 주행(치유 없음): status=conflict 단계 S02 진단 {"element":1,"reason":"missing"} · 넘긴 값 0개
③ 자가 복구 주행: status=conflict 치유 호출 1 · 치유 [{"status":"unresolved","kind":"element-missing","stepId":"S02"}] · 결과 {"status":"unresolved","kind":"element-missing"}
   반영: steps.json 요소 1 선택자 그대로(낡은 값) · 지도 최신 true · history S02 항목 true · 사람 확인 대기 1건
   복구 주행 값 정답 대조 {"branch":false,"sha7":false,"title":false,"date":false,"stars":false}
   → 복구하지 못했다 — T-4 미충족(이유는 위 치유 결과)
판정: T-4 미충족
```
## 7. 증거 evidence/leak-check.txt
```
텍스트·JSON 파일 120개 검사(A 플레이북·지도·상태 42 · B 세션·측정 기록 47 · C 그 밖 증거 31) — 위반 0건
검사 전 뺀 메타데이터(종류별 개수, 값 아님): 시각 533 · 실행 id(UUID) 22 · 공개 정답 값 79 · 실행 경로 필드 234 · 식별자 2723 · 사용량·비용 336 · 서명 41 · 도구 결과 임시 경로 19 · 공개 페이지 16진 값(커밋 SHA 등) 66 · 무결성 해시 144
캡처 projects/P001_261116_자율_주행_업무_스킬_생성기/tasks/T06_시범_업무_스킬로_끝까지_검증/pilot/github-repo-latest/references/flows/repo-latest/shots/S02.jpg (1280×900): post=true · 요소 전부 가림=true · 가림 필수 규칙 충족=true · 가린 건수 55 · box별 가림색 비율 1:0.923 2:0.891 3:0.969 4:0.688 5:0.827 → 모든 box ≥ 0.5
대조군(가림 없이 찍은 같은 화면 1280×900, 임시·삭제): box별 가림색 비율 1:0.098 2:0.146 3:0.096 4:0.072 5:0.081 → 픽셀 검사 실패(기대대로 — 모든 box < 0.2)
캡처 projects/P001_261116_자율_주행_업무_스킬_생성기/tasks/T06_시범_업무_스킬로_끝까지_검증/evidence/heal-state/playbook/references/flows/repo-latest/shots/S02.jpg (1280×900): post=true · 요소 전부 가림=true · 가림 필수 규칙 충족=true · 가린 건수 55 · box별 가림색 비율 1:0.923 2:0.891 3:0.97 4:0.652 5:0.978 → 모든 box ≥ 0.5
캡처 projects/P001_261116_자율_주행_업무_스킬_생성기/tasks/T06_시범_업무_스킬로_끝까지_검증/evidence/heal-state/playbook/references/flows/repo-latest/versions/v1/shots/S02.jpg (1280×900): post=true · 요소 전부 가림=true · 가림 필수 규칙 충족=true · 가린 건수 55 · box별 가림색 비율 1:0.923 2:0.891 3:0.969 4:0.688 5:0.827 → 모든 box ≥ 0.5
판정: 텍스트·JSON 위반 0건 · 캡처 가림 확인 → 통과
```
## 7. 증거 evidence/case-impact.txt
```
사례 저장소 작업 사본 HEAD 기록(값은 비식별로 남기지 않음), git status 0줄 (검사 전)
임시 HOME 설치: 추가된 스킬 1개(pace-playbook-maker) — PACE 스킬 목록 밖 추가 0개
기존 항목(PACE 소유가 아닌 것) 파일별 해시 변경 0개 (PACE 소유로 새 버전이 덮은 스킬 3개)
사례 저장소 프로젝트 스킬 4개 + 설치 스킬 pace-playbook-maker — 이름 모두 서로 다름(총 5개)
--- 흐름 생성물 동일성(설치본 생성기) ---
OK   흐름 1 생성물 12개
OK   흐름 2 생성물 15개
OK   흐름 3 생성물 12개
OK   흐름 4 생성물 13개
OK   흐름 5 생성물 15개
OK   흐름 6 생성물 14개
OK   흐름 7 생성물 7개
OK   흐름 8 생성물 10개
OK   흐름 9 생성물 8개
흐름 9개, 파일 106개 비교, 불일치 흐름 0
--- 사례 저장소 테스트 ---
OK   flow tests pass 47 fail 0 (baseline 47)
OK   service-a tests pass 35 fail 0 (baseline 35)
OK   service-b tests pass 619 fail 0 (baseline 619)
OK   service-c tests pass 119 fail 0 (baseline 119)
사례 저장소 작업 사본 HEAD 불변, git status 0줄 (검사 후)
실제 ~/.claude/skills 목록 불변(14개)
판정: 흐름 동일 OK · 테스트 OK · 작업 사본 불변 OK · 실제 HOME 불변 OK · 공존(해시·추가·이름) OK → 통과
```
## 7. 증거 evidence/handoff-check.txt
```
인계 문서: ~/.pace-private/ 아래 있음(4941자) · 사례 저장소 작업 사본 git status 0줄
1절 코어 import 위치 9곳 중 실재(그 줄이 코어 import) 9곳
그 밖의 변경 위치 4곳 중 실재 4곳
검사 명령: npm test 4 · compare-identity 1 · git status 2 · 해시 비교(sha256sum) 1 · import grep 1
main 분기점 대비 바뀐·새 파일 320개(새 파일 전체·기존 파일은 더한 줄) × 금지어 25개 — 일치 0건
판정: 통과
```
## 7. 증거 evidence/coexist-session.json
```
{
 "at": "2026-11-17T00:59:38.415Z",
 "ms": 22661,
 "model": "claude-sonnet-5-5",
 "claudeVersion": "2.1.326 (Claude Code)",
 "calls": 1,
 "retries": 0,
 "allowedTools": [
  "Read"
 ],
 "toolUses": [
  "Read",
  "Read"
 ],
 "nonRead": 0,
 "initSkillCount": 47,
 "initSkillsChecked": [
  "<프로젝트 스킬 1>",
  "<프로젝트 스킬 2>",
  "<프로젝트 스킬 3>",
  "<프로젝트 스킬 4>",
  "pace-playbook-maker"
 ],
 "loaded": {
  "playbookMaker": true,
  "projectSkills": 4
 },
 "said": {
  "playbookMaker": false,
  "projectSkills": 1,
  "overview": true
 },
 "realHomeSkills": {
  "files": 500,
  "dirs": 14,
  "sameListAndHashes": false,
  "changedNote": "세션 전후 실제 ~/.claude/skills에서 바뀐 파일은 synced/<동기화 id>/ 아래 manifest.json·.last-complete-round 2개뿐 — claude.ai 동기화 스킬의 관리 파일. [확인] claude -p가 돌지 않던 10:33:59(KST)·10:55:13(KST)에도 다시 쓰였다(stat 2회) — 실행 중인 Claude Code가 주기적으로 쓰는 파일이라 이 검사의 세션이 원인이라고 할 수 없다. 스킬 폴더 14개·이름 목록 동일, 이 검사는 실제 HOME에 아무것도 설치·쓰지 않았다(코드 확인: 실제 HOME은 snapshot 읽기만)."
 },
 "caseRepo": {
  "statusBefore": 0,
  "statusAfter": 0,
  "headSame": true
 },
 "verdict": {
  "distinguishes": false,
  "overviewGuidance": true,
  "playbookMakerLoaded": "로드됨",
  "readOnly": false
 },
 "verdictNote": "init 스킬 목록에 사례 저장소 프로젝트 스킬 4개와 pace-playbook-maker가 모두 로드됨(이름 서로 다름). 그러나 허용 도구가 Read뿐이라 세션이 스킬 목록을 조회할 수단이 없어 답변은 프로젝트 스킬 1개만 열어 말했다 — 답변으로 5개를 구별하는 부분은 미확인(재시도 없음 조건). 기존 업무 스킬 안내는 그 1개 스킬에서 흐름 overview.md를 가리킴.",
 "trimmed": "공개 저장소 대비 줄임(T06 유출 검사): 세션의 전체 도구 목록·스킬 이름 목록·답변 원문·stream 원본은 사례 저장소 부트 맥락과 사용자 환경 정보를 담아 지웠다. 남긴 것: 개수, 확인 대상 5개 이름(사례 저장소 스킬은 번호), 판정"
}
```
## 7. 증거 evidence/pilot-rebuild.txt
```
{"generated":"<repo>_261116_자율_주행_업무_스킬_생성기\\tasks\\T06_시범_업무_스킬로_끝까지_검증\\pilot\\github-repo-latest","check":{"ok":true,"problems":[]}}
지도 파일: index.json S02.html S02.json
S02 요소 stale: [false,false,false,false,false] · 승인 캡처 shot sha256 앞 12자: 9fd8d5cd92b5 (사람 확인 해시 9fd8d5cd92b5와 같음: true)
index 단계: S02
지도 파일: index.json S02.html S02.json
S02 요소 stale: [false,false,false,false,false] · 승인 캡처 shot sha256 앞 12자: 9fd8d5cd92b5 (사람 확인 해시 9fd8d5cd92b5와 같음: true)
index 단계: S02
3라운드 재생성: SKILL.md 흐름 색인에 단계 지도 경로 포함
측정(3라운드) 뒤 재생성: 생성기 머리말 수정(임시 절대 경로 → <플레이북 폴더>/references/flows/repo-latest)으로 flow/overview.md·flow/S02.md 머리말 2줄만 바뀜 — 측정 세션이 읽은 SKILL.md·agent/*는 바이트 동일(diff -r 확인)
보존본(sessions-round1/2 playbook, heal-state)의 같은 머리말 줄은 임시 경로를 가림 처리했다(<흐름 폴더(임시 경로 가림)>)
```
