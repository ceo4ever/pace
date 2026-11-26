# 독립 검토 2단계: P014 T01 xhigh 등급과 호환 코드

## 결론
**목표 달성, 전체 pass**로 판정합니다. 지적은 blocking 0건, should_fix 0건, note 3건입니다. 다만 이 판정은 코드·시험 코드·실행 결과를 읽고 내렸고, 선언된 검사와 비밀 검사는 직접 실행하지 못했습니다.

## 1·2단계가 같은 후보를 보는지
- 1단계에서 읽은 working tree 소스가 `implementation.patch` 내용과 일치했습니다. 확인한 위치는 `worker-tiers.ts:7`, `model.ts:103`, `event-log.ts:37-54`, `sync.ts:53-85`입니다.
- `compatibility.json`의 기준 커밋은 `5cddecd`로, TASK의 구판 기준과 같습니다.
- 수정된 파일 7개는 TASK의 구현 후보 경로 9개 안에 들어 있습니다.
- **독립성 기록:**
  - 1단계 판정은 이 대화의 앞 턴에서 같은 제공자·같은 모델·같은 세션이 냈습니다. 호출자는 "별도로 회수했다"고 했지만, 이 대화에서는 같은 맥락이 이어졌으므로 2단계가 1단계와 독립된 맥락이라고 볼 수 없습니다.
  - 검토 주체는 바뀌지 않았습니다.
  - 1단계 판정은 TASK를 읽기 전에 확정됐고, 2단계에서 고치지 않았습니다.

## 상위 목적 대조
상위 목적은 세 가지입니다. xhigh 설정의 전달, 기존 등급·구판 동기화 보존, 채택 프로젝트 팀 측정 보존입니다. TASK의 접근 (가)가 이 목적과 어긋나지 않습니다.
- xhigh 정보는 구판이 읽지 않는 별도 설정 파일, 별도 원본 폴더, 별도 생성물 표지로 나눠 둡니다.
- 시작 행은 구판이 아는 경로 슬롯을 그대로 쓰고 숫자 표지를 함께 남깁니다.

이 접근은 결정 메모가 재현한 구판 실패 두 가지를 피합니다. 하나는 기존 원본에 `tier: xhigh`를 쓰면 check가 종료 2로 끝나는 것이고, 다른 하나는 시작 행에 새 경로를 직접 쓰면 구판 stats가 손상 오류를 내는 것입니다. 실제 호스트 모델 적용은 BR06 기준이라 이번 판정에 넣지 않았습니다. 고쳐야 할 목표·전략·계획 단계는 없습니다.

## 기준별 근거와 시험의 검출력
- **T-1 (S-1) — 충족**
  - 구현 근거:
    - xhigh 기본값은 Claude `claude-fable-5-2/high`, Codex `gpt-6.2-astra/medium`이고 override가 우선합니다(`worker-tiers.ts:17-20, 54-55`).
    - 설정은 기존 `worker-tiers.json`과 분리된 파일에 저장됩니다.
    - 자동 배정(`store.ts:93`)은 바뀌지 않았습니다.
  - 시험이 확인하는 것:
    - 두 호스트에서 set/reset을 왕복합니다.
    - 기존 설정 파일의 바이트가 그대로인지 봅니다.
    - 기존 세 등급의 effort가 등급 이름과 같은지 봅니다.
    - 잘못된 등급 `tier.ultra`를 거부하는지 봅니다.
- **T-2 (S-2) — 충족**
  - 구현 근거: 원본 탐색이 세 위치를 모두 보고, 둘 이상이면 중복으로 거부합니다(`store.ts:235-250`). sync와 start는 같은 `resolveTeamSettings`로 설정을 정합니다.
  - 시험이 확인하는 것:
    - 두 호스트로 start할 때 orca 인자 `--model/--effort/--spec`이 맞는지 봅니다.
    - 시작 행의 model·effort와 원본 지문이 맞는지 봅니다.
    - override 뒤 다시 실행해 새 값이 반영되는지 봅니다.
    - 커밋 ref(`resolve("HEAD")`)와 worktree에서 각각 원본을 해석합니다.
    - 준비 단계에서 원본이 바뀌면 실행을 보류하는지 봅니다.
- **T-3 (S-3) — 충족**
  - driver가 S-3 조건을 모두 갖췄습니다:
    - 팀 측정 v1을 채택했습니다.
    - 조건부 필수 역할 표지(`required-roles.json`)를 넣었습니다.
    - 실제 `start --role`로 시작 행을 기록했습니다.
    - 구판·신판으로 `list`, `check`, `sync`, `stats`를 교대로 2회 실행했습니다.
  - 각 조건은 assert로 확인됩니다(`driver:96-107`). driver는 assert가 모두 통과해야 결과를 출력하는 구조입니다.
  - `compatibility.json`의 4회 실행 모두 다음을 기록했습니다:
    - 종료 0
    - 기존 생성물 바이트 보존
    - xhigh 생성물 유지
    - 구판에서도 specialist가 집계됨
  - 두 신판 판독기는 모두 원본 경로 `agents-xhigh/specialist.md`를 정확히 되살렸습니다.
- **T-4 (S-4) — 충족**
  - 구현 근거:
    - 시작 행의 숫자 표지는 같은 이름의 기본 경로가 붙은 유효한 start에서만 받아들입니다(`event-log.ts:48-52`).
    - 호출자가 표지를 직접 넣으면 기록을 거부합니다(`:38`).
    - 생성물 표지와 원본 경로가 맞지 않으면 관리하지 않는 파일로 봅니다(`sync.ts:292`).
    - 충돌이나 고아 생성물이 있으면 쓰기 전에 실패합니다(`sync.ts:64, 79, 85`).
  - 시험이 확인하는 것:
    - 위조 행 10종(다른 이름, 다른 폴더, 상위 경로, glob, 표지 누락, 표지 값 2나 "1", start가 아닌 행)을 두 판독기가 모두 거부합니다.
    - 0xff 바이트, 64KiB 초과, 디렉터리, 심볼릭 링크 원본을 ref와 worktree 양쪽에서 거부합니다.
    - 링크된 xhigh 설정 파일이 있으면 링크 대상을 그대로 둡니다.
    - 충돌·중복·고아 상황에서 기존 생성물 바이트를 보존합니다.

## SECURITY 민감 경로
아래 항목은 모두 코드와 시험으로 확인했습니다.
- **원본 경로와 지문:** 정확히 일치하는 경로 하나만 추가로 허용하고(`role-record.ts:156`), 지문은 실제 xhigh 원본으로 계산합니다.
- **링크·크기·UTF-8 차단:** xhigh 설정 파일에는 기존 `ordinaryFile` 검사와 원자 쓰기가 그대로 적용됩니다. 원본에는 `refText`와 `readTeamFile` 검사가 적용됩니다.
- **내부 숫자 표지와 기록 소비자:** `eventLines`를 쓰는 판독기(`harness.ts:1936`, `team-finish.ts:178, 206`)와 `readTeamEvents`가 모두 `decodeEvent`를 거칩니다. 표지를 해석하지 않고 원시 행을 읽는 다른 소비자는 Grep 범위에서 찾지 못했습니다.
- **기존 파일 호환:** 기존 설정 파일은 xhigh 키를 거부해 두 파일이 섞이지 않습니다. 구판은 xhigh 생성물을 관리 대상이 아닌 파일로 보고 고아로 잡지 않습니다.

## 지적
blocking 0건, should_fix 0건, note 3건입니다.
1. **F1 (note):** 구판 교대 실행 증거에는 Codex 호스트의 `--no-launch` 시작 한 건만 있습니다. Claude 호스트로 시작한 행을 구판이 집계하는지는 실제 실행으로 보지 못했습니다. 다만 인코딩이 호스트와 무관해 위험은 낮습니다.
2. **F2 (note):** `worker-tiers-xhigh.json`이 손상되면 `worker show` 전체가 종료 2로 끝나 정상인 기존 등급 표도 보이지 않습니다. sync와 기존 등급 해석에는 영향이 없습니다.
3. **F3 (note):** TASK가 요구한 선언 검사(`npm run check`)와 `보안 검사`의 실행 결과를 이 checkout에서 볼 수 없었습니다. 셸이 없어 직접 실행하지도 못했습니다. 이 결과는 테스터·하네스 단계에서 확인해야 합니다.

```pace-review
{"version":2,"findings":[{"id":"F1","severity":"note","category":"other","location":"compatibility-driver.txt:79","scenario":"구판 교대 실행 증거가 codex 호스트의 --no-launch 시작 1건만 다룬다. claude 호스트 xhigh 시작 행을 구판이 집계하는지는 실측하지 않았다(인코딩이 호스트와 무관해 위험이 낮다).","reproduction":"driver의 start에 --agent claude 변형을 추가하고 구판 project stats --json을 비교","confidence":"medium","impact":"minor","criterion":null,"safety_path":null},{"id":"F2","severity":"note","category":"implementation","location":"src/core/worker-tiers.ts:92","scenario":"worker-tiers-xhigh.json이 손상되면 worker show 전체가 종료 2로 끝나 정상인 기존 등급 표도 보이지 않는다. sync와 기존 등급 해석은 영향받지 않는다.","reproduction":"PACE_HOME/worker-tiers-xhigh.json에 '{\"codex\":{\"high\":{}}}'를 쓰고 pace worker show 실행","confidence":"high","impact":"minor","criterion":null,"safety_path":null},{"id":"F3","severity":"note","category":"other","location":null,"scenario":"TASK가 요구한 npm run check와 보안 검사의 실행 결과를 이 checkout에서 관측할 수 없다. 셸이 없어 검토자도 실행하지 못했다.","reproduction":"npm run check 및 docs/README.md의 보안 검사 명령 실행","confidence":"high","impact":"minor","criterion":null,"safety_path":null}],"criteria":[{"id":"T-1","state":"present","observation":"worker-tiers.ts:17-20,54-55,75-81은 xhigh 기본값과 override 우선을 분리된 파일로 처리한다. 자동 배정(store.ts:93)은 바뀌지 않았다. S-1 시험은 두 호스트의 set/reset 왕복, 기존 파일 바이트, 기존 세 등급의 effort가 등급 이름인지, tier.ultra 거부를 확인한다. 시험은 재실행하지 않았다."},{"id":"T-2","state":"present","observation":"store.ts:235-250은 세 위치를 탐색하고 중복을 거부한다. sync와 start는 같은 resolveTeamSettings를 쓴다. project-role 시험은 두 호스트 start의 orca 인자, 시작 행의 model·effort·지문, override 후 재실행을 확인하고, ref(HEAD)와 worktree 해석, 준비 단계 변경 시 실행 보류를 확인한다. 시험은 재실행하지 않았다."},{"id":"T-3","state":"present","observation":"driver는 S-3 조건(팀 측정 v1 채택, 조건부 필수 역할 표지, 실제 start --role, list/check/sync/stats 교대 2회)을 갖추고 driver:96-107의 assert로 확인한다. compatibility.json의 4회 결과는 종료 0, 기존 생성물 바이트 보존, xhigh 생성물 유지, 구판의 specialist 집계를 보인다. 두 신판 판독기는 원본 경로를 정확히 복원했다."},{"id":"T-4","state":"present","observation":"event-log.ts:38,48-52는 표지 주입, 표지 누락, 다른 이름·경로, 1이 아닌 표지 값을 거부한다. sync.ts:64,79,85,292는 충돌·고아·표지와 경로 불일치를 쓰기 전에 거부한다. 시험은 위조 행 10종의 두 판독기 거부, 0xff·64KiB 초과·디렉터리·링크 원본의 ref와 worktree 양쪽 거부, 링크된 설정의 대상 보존, 실패 시 생성물 바이트 보존을 확인한다. 시험은 재실행하지 않았다."}]}
```

pass
