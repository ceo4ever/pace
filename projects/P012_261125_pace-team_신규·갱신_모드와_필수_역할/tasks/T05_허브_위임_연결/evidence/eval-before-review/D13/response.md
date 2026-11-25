**읽은 것**: 자동 첨부는 `userEmail` 컨텍스트가 하나 있었고 식별 값은 쓰지 않는다. 직접 읽은 파일은 아래와 같다.
- `skills/pace-project-dev/SKILL.md` 전체(1–93줄)
- `references/cross-verify.md` 전체(1–10줄)
- `references/task-steps.md` 전체(1–12줄)
- `references/decision-rights.md` 전체(1–46줄)
- `references/commands.md` 전체(1–16줄)
- `references/reviewer.md` 20–32줄
- `references/` 아래 grep 결과(`allow-same-provider`, `cross:`, `미실행`)

전체 바이트는 도구로 확인하지 못했고 읽기 전용이라 실행도 하지 않았다.

## 사례 1: 다른 제공자는 불가, 같은 제공자 새 세션은 가능

TASK 검토와 백로그 검토 모두 같은 절차다. 근거는 `decision-rights.md`의 B1과 A-3이다.

- **담당**: TASK 검토는 워크트리 PM(작성자)이 맡고, 백로그 검토는 백로그 기획자 위임을 받은 허브 PM이 맡는다. 검토는 같은 제공자의 별도 새 세션 reviewer가 한다.
- **순서**
  1. 다른 제공자를 먼저 시도한다. 이미 시도했고 실패했다.
  2. 미실행 사유(종료 10)를 기록한다. 같은 제공자로 몰래 대체하지 않는다.
  3. `pace agent verify --allow-same-provider`로 새 세션 검토를 연다. 호스트의 별도 새 세션도 된다.
  4. TASK 검토는 `--kind task`로, 백로그 검토는 `--author-agent <…> --target <파일> --purpose-file <상위 목적 글> --out <기록>`으로 부른다.
  5. 결과에 `cross: false`를 기록한다.
  6. blocking·should_fix·note마다 반영 여부와 이유를 남긴다.
  7. TASK는 pass(blocking 0)일 때만 구현한다.
- **기록**
  - `pace project log P### T0n --type review|decision --msg "다른 제공자 미실행(사유), 같은 제공자 새 세션 cross:false" --src "자체 판단"`
  - TASK 검토는 대상·제공자·방법·결과를 태스크 기록과 `review-records/`에 남긴다.
- **회신·보고**: 사용자에게 먼저 회신하거나 승인받을 일은 없다. A-3은 "아니오"다. 완료 보고나 사후 요약에 `cross: false`와 사유를 한 줄 붙인다.
- **질문·승인 대기**: 0건. 이 대체를 위해 멈추거나 묻지 않는다.

## 사례 2: 다른 제공자도 같은 제공자 새 세션도 불가 (양쪽 모두 미실행)

A-3이 "예"가 된다. 검토를 생략하거나 약화하는 것이기 때문이다.

- **담당**: 워크트리 PM은 검토 관문을 보류하고 허브에 `ask`로 인계한다. 허브가 owner에게 요청한다.
- **순서**
  1. TASK 검토는 사전 검토 관문을 보류하고 구현하지 않는다. 백로그 검토는 해당 검토 결과를 쓰지 않는다.
  2. 미실행 사유를 기록한다.
  3. 허브가 C 형식으로 결정 요청을 보낸다. 항목은 A-3 번호, 대상과 근거, 선택지, 추천과 이유다. 원장을 쓰면 `decision_request`를 `to: owner`로 보낸다.
  4. 독립 작업은 계속한다.
- **기록**
  - `pace project log P### T0n --type decision --msg "양쪽 제공자 미실행, A-3 요청 중" --src "자체 판단"`
  - owner 회신 뒤에는 `--src "사용자 결정"`으로 기록한다.
- **주의**: 검토가 한 번도 실행되지 않았다면 PRE-REVIEW `waiver`의 근거가 성립하지 않는다. 회신이 와도 도구 복구 후 재시도하거나, 합법적으로 변경된 계약으로 다시 판정한다.
- **질문·승인 대기**: owner 결정 요청 1건(TASK 검토와 백로그 검토가 각각 막혔다면 건별 1건씩, 최대 2건). 해당 조치만 보류한다.

## 공통 경계

- 실행된 교차 검토의 fail은 같은 제공자 새 세션으로 대체할 근거가 되지 않는다.
- 병합·푸시·배포는 이 상황과 무관하며 사람 승인 뒤에 한다.
