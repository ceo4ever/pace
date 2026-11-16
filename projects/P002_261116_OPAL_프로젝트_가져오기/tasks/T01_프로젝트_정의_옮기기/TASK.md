# T01 프로젝트 정의 옮기기(plan·apply·등록)

- 프로젝트: [P002](../../PROJECT.md) · 백로그: 대화 2026-11-16
- 상태: 완료
- 사전 검토: v1

## 목적

`pace adopt opal` 명령의 핵심: OPAL v2 프로젝트의 `.opal/`을 `.pace/`로 `git mv`하고, AGENT.md 표지를 `pace_agent_version`으로 바꾸며, 워크스페이스 등록부에 같은 `workspace_id`로 등록한다. 기본은 미리보기. 프로젝트 기준 P-1(옮기기 부분)·P-2·P-4.

## 재료

- 설계: [PROJECT.md](../../PROJECT.md) "설계" 절. 훅·대시보드·문서 보고는 T02, e2e·부트 확인·문서는 T03.
- 재사용: `workspace-registry.ts`의 `listCandidates`·`registerWorkspace`, `agent-definition.ts`의 `validateAgentDefinition`·`AGENT_BUDGET`. 옛 `migrate-v1.ts`는 읽기만(되살리지 않음).
- 확인한 지금 동작: `registerWorkspace`는 활성 같은 경로가 있으면 "중복"으로 거부 → 재실행 무변경은 어댑터 쪽에서 먼저 판별한다.

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 미리보기(기본)는 파일·git·등록부를 바꾸지 않고 옮길 것·등록할 ID·경고를 출력한다 (P-1) |
| T-2 | `--apply`는 `.opal`을 `git mv`로 `.pace`로 옮긴다. **맥락 보존**: AGENT.md 외 모든 파일의 목록·내용이 그대로이고, AGENT.md는 `opal_agent_version`→`pace_agent_version`·본문 `.opal/`→`.pace/` 문자열 치환 말고는 같다(경로 참조 승계 목적, 설명·예시도 같은 문자열이면 치환되나 그 외 문장은 건드리지 않음). `workspace_id`는 원본·변환본·등록부가 같다 (P-1·P-2) |
| T-3 | 재실행(`.opal` 없고 `.pace` 유효 v2·같은 ID·경로로 등록)은 변경 없이 성공, 등록이 빠졌으면 등록만 한다. 같은 경로·다른 ID, 다른 경로·같은 ID는 거부 (P-2) |
| T-4 | `.pace`와 `.opal` 공존·`.opal`의 staged/unstaged/untracked 변경·v1·AGENT 형식 불명·링크 포함·git 저장소 아님·저장소 하위 폴더에서 실행·유효하지 않은 `.pace`만 있음·등록부 충돌은 원본(파일·인덱스·등록부)을 바꾸지 않고 이유와 함께 종료 코드 1 (P-4) |
| T-5 | 이동 뒤 AGENT 재작성 또는 등록이 실패하면 파일·git 인덱스·등록부가 적용 전과 같아지고 무관한 기존 변경(저장소 다른 곳의 staged·untracked)은 보존된다. 복구 자체가 실패하면 실패한 항목을 보고한다. 한 번의 `--apply` 실행 안에서 계획을 만든 뒤 쓰기 직전에 다시 계산해 AGENT 원문·등록부(fingerprint)·git 상태가 달라졌으면 원본을 두고 멈춘다(별개로 실행한 미리보기와의 일치는 보장 대상이 아니다 — apply는 매번 전체를 다시 검증하므로 오래된 미리보기가 위험이 되지 않는다). 등록부는 되돌리지 않는다 — `registerWorkspace`가 항목을 마지막에 원자적으로(`link`) 만들어 던지면 항목이 없다는 계약에 기대고, 우리 쪽은 등록부를 지우거나 덮어쓰지 않는다(그래서 소유권 판별이 필요 없고 다른 작업의 항목을 건드릴 수 없다) 자동 커밋·push 없음 (P-4) |

## 테스트

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-1 | unit | T-1 | OPAL 표본(추적 파일 + .gitignore된 `.opal/run/` + 저장소 다른 곳의 untracked 파일) | CLI 미리보기 | ignored 포함 저장소 전체 파일 바이트·git status·HEAD·등록부 동일, 목록·ID 출력, 무시 파일 경고 | test/adopt-opal.test.ts |
| S-2 | unit | T-2 | 같은 저장소(한글 파일명·.opal/ 언급 본문 포함) | `--apply` | rename으로 보이는 git status, AGENT 외 파일(무시된 파일 포함) 목록·내용 동일, AGENT 차이는 허용한 치환뿐, 원본·변환본·등록부 ID 동일, 커밋 없음 | 같은 파일 |
| S-3 | unit | T-3 | apply 직후 / 등록부 비움 / 같은 경로·다른 ID / 다른 경로·같은 ID | 다시 apply | 무변경 성공 / 등록만 복구 / 거부 / 거부 | 같은 파일 |
| S-4 | unit | T-4 | 각 조건(공존·staged·unstaged·untracked·v1·형식 불명·링크·비 git·하위 폴더·무효 .pace) | apply | 종료 코드 1, 저장소(ignored 포함) 바이트·인덱스·등록부 동일 | 같은 파일 |
| S-5 | unit | T-5 | 저장소 다른 곳에 staged·untracked 변경; 실패 주입 위치 — ① `git mv` 시작 전 실패 ② `git mv`가 파일·인덱스를 바꾼 뒤 실패 ③ AGENT 재작성 시작 전 예외 ④ AGENT를 반쯤 쓴 뒤 예외 ⑤ 등록 시작 전 예외 별도로 복구 실패(`.opal` 자리 점유) | apply | 각 위치에서 바이트 단위 저장소 상태(ignored 포함)·인덱스·등록부가 적용 전과 같고 무관 변경 보존. 복구 실패는 실패 항목을 보고하고 나머지 복구는 계속 | 같은 파일 |
| S-6 | unit | T-5 | 계획 생성 뒤 ① 등록부에 다른 항목 추가 ② `.opal/AGENT.md` 변경 ③ `.opal` 다른 파일의 staged 변경 ④ `.opal`에 untracked 파일 생성 | apply 재계산 | 각각 중단. 비교 기준은 **주입 직후 상태** — 외부 변경은 그대로 남고 adopt가 추가로 바꾼 것이 없다 | 같은 파일 |
| S-7 | unit | T-5 | 등록 단계 실패 주입 + (a) 그 사이 다른 워크스페이스 항목이 등록됨 (b) 등록 직전 경쟁 실행이 같은 ID·경로를 먼저 등록함 | apply | 실패 복구가 (a)(b)의 항목을 지우지 않는다(등록부를 건드리지 않음) | 같은 파일 |

## 접근

- `src/project/adopt-opal.ts`: `planAdoptOpal(root, home)` → `{ state, blockers, warnings, moves, workspaceId, needsRegister, fingerprint }`, `applyAdoptOpal(root, home, expected, deps)`(계획 재계산 비교 → git mv → AGENT 재작성·검증 → 등록, 실패 시 역순 복원·복원 실패 보고). 검증(AGENT 변환·ID·등록 충돌)은 이동 전에 plan에서 끝내 복구 구간을 줄인다.
- 검사는 읽기 전용 git(`rev-parse`·`status --porcelain -- .opal`)과 `lstat` 순회(링크 거부). 무시된(ignored) 파일은 .opal에 있어도 git mv가 함께 옮기므로 별도 거부하지 않는다.
- `src/cli.ts`에 `adopt opal [--cwd] [--apply]` 분기와 HELP 한 줄.
- 인계(T03): OPAL v2와 PACE의 메모리·브레인 형식이 같다는 전제는 T03 e2e에서 이 표본을 `pace boot`·`pace memory list --project`·`pace brain lint`로 읽어 확인한다. T01은 파일 보존만 책임진다.
- 검토 반영(2026-11-16): ① git 상태 재검증은 S-6에 staged·untracked 주입을 더했다(ignored 파일의 변경은 계획과 무관하게 함께 옮겨지므로 중단 대상이 아니다). ② `git mv` 단계 실패는 이동 전 실패·이동 뒤(인덱스 갱신까지 된 뒤) 실패를 `move` 의존성 주입으로 시험하고(S-5), 둘 다 파일·인덱스를 적용 전으로 돌린다. ③ 등록부는 되돌리지 않는다(위 계약). ④ AGENT 본문 `.opal/` 치환은 경로 참조를 잇기 위한 절충이며 코드 블록·설명까지 같은 문자열을 바꾼다 — S-2 표본(`.opal/` 언급 본문)이 이를 허용 범위로 고정한다.
- T03 인계 조건(상위 목적 검증): e2e는 이 표본을 가져온 뒤 `pace boot` 출력에 (a) 표본 메모리의 제목, (b) 브레인 페이지 검색 결과, (c) AGENT.md의 프로젝트 역할 문구가 실제로 나타남을 단언해야 한다. 파일 보존만으로 T-2를 맥락 사용 가능성의 증거로 대신하지 않는다.
