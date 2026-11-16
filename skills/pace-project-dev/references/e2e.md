# E2E 시나리오

## 방식 고르기

| 저장소 | 방식 |
|---|---|
| E2E 프레임워크가 있다 (Playwright·Cypress 등, `docs/README.md` 환경에 선언) | **테스트 코드가 기본**. 그 프레임워크로 쓰고 검사·E2E 명령으로 돌린다. TASK.md 방법 칸에 파일 경로 |
| 없다 | 태스크 폴더 `e2e/S-n.md`에 시나리오(템플릿 `E2E-SCENARIO.md`)를 쓰고, tester가 도구의 브라우저·셸로 실행한다 |

## 시나리오 형식 (프레임워크 없을 때)

Markdown 머리말(기준·표면·조건) + YAML 블록 하나.

```yaml
steps:
  - { fragment: login, with: { id_ref: E2E_LOGIN_ID, pw_ref: E2E_LOGIN_PW } }
  - { do: navigate, target: /orders }
  - { do: click, target: "주문하기" }
expect:
  - { see: "주문 완료", in: "토스트" }
  - { url: /orders/done }
```

- `do`: navigate · click · fill · select · press · wait · call(api) · run(cli)
- `expect`: see(문구 in 위치) · url · status(api) · output(cli) · absent
- **비밀은 원문을 쓰지 않는다** — 환경 변수 이름만(`value_ref`, `*_ref`). finish가 프로젝트 폴더(`e2e/`·`evidence/` 포함)의 비밀 노출을 검사한다.

## 기동

- 기동 명령·포트는 `docs/README.md` 환경 선언을 따른다. 없으면 TASK.md 조건 칸에 적는다.
- worktree가 여럿 뜰 수 있다 — 고정 포트가 이미 쓰이고 있으면 빈 포트로 띄우고 증거에 실제 주소를 적는다. 다른 worktree의 서버를 쓰지 않는다.
- 띄운 서버는 끝나면 내린다.

## 판정과 폴백

| 판정 | 뜻 |
|---|---|
| 통과 | 모든 expect가 맞음 |
| 실패 | 실행했는데 단언이 맞지 않음. **다른 도구로 넘어가 덮지 않는다** |
| 막힘 | 실행 자체를 못 함 — 서버가 안 뜸, 도구 없음, 비밀 환경 변수 없음 |

브라우저 도구가 없거나 안 되면 다음 도구로 넘어간다: 도구 브라우저(MCP·내장) → `orca` 브라우저 → 셸(`curl`·CLI 출력). 모두 안 되면 막힘으로 적고 이유를 남긴다. 막힘은 통과가 아니다 — 기준이 E2E로만 확인되면 태스크는 막힘이고 멈춤 조건으로 묻는다.

## 증거

- 태스크 폴더 `evidence/`: 스크린샷, 출력 로그, 실행 기록(`S-n.md`: 시각·명령·결과). 커밋한다.
- 큰 파일(동영상·트레이스 등, 저장소 한도 초과)은 커밋하지 않고 경로·생성 방법만 TASK-CLOSE에 적는다.
- TASK-CLOSE의 `evidence/…` 경로는 `pace project check`가 존재를 확인한다.

## 재사용 시나리오 승격

같은 흐름이 다음 태스크·프로젝트에서도 쓰일 만하고 **통과 증거가 있으면** 저장소의 `tests/e2e/`로 옮긴다(기존 `test/` 폴더를 쓰는 저장소면 `test/e2e/`).

- `journeys/`: 사용자 관점의 완결된 여정
- `fragments/`: 여러 여정이 공유하는 조각(로그인 등) — `params`와 끝난 뒤 상태(`postconditions`)를 적는다. 조각끼리 중첩하지 않는다.

여정은 `{ fragment: <id>, with: {…} }`로 조각을 부른다. 승격은 정본 반영 목록에 적는다.
