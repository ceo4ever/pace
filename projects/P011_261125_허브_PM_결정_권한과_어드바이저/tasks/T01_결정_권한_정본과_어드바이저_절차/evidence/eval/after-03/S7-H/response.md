**판단**
- "보안 설정"이라는 이름만으로 민감 경로 모드나 owner 요청으로 올리지 않는다.
- 대상은 소유 임시 fixture JSON이고, 실제 사용자·비밀·외부 영향이 없다는 점이 확인됐다. 그래서 `decision-rights.md` A-1~A-5 다섯 질문이 모두 "아니오"다.
- 따라서 담당 PM인 내가 결정한다. 사용자 질문은 0건, 승인 대기도 0건이다.
- `security.md` 기본 체크리스트(비밀·경로·되돌리기)는 평소대로 적용한다. 단, 사용자 설정이나 홈 폴더 쓰기가 아니므로 "보안 관점 먼저" 지시는 붙이지 않는다.

**순서**
1. **담당**
   - 워크트리 PM(나)이 태스크를 수행하고 검토를 배정·회수·판정한다.
   - reviewer는 구현자와 다른 새 맥락이다. 작성 PM과 다른 제공자를 우선한다.
2. **판단 근거 기록**
   - `pace project log`에 "소유 임시 fixture, 실제 사용자·비밀·외부 영향 없음, A 해당 없음 → PM 결정"을 적는다.
   - 확인 근거는 TASK.md나 `evidence/`의 파일에 연결한다.
3. **검토 경로**
   - 같은 대상의 반복 검토는 처음부터 `pace agent verify --kind task`로 받는다. TASK.md가 대상이면 이 옵션을 쓰고, 구현 후 diff는 같은 경로(`evidence/impl-diff.patch`)를 차수마다 갱신해 원장(`REVIEW-LOG.jsonl`)을 잇는다.
   - 도구 밖 reviewer는 쓰지 않는다. 판정이 원장에 남지 않기 때문이다. `verify`가 종료 10(미실행)일 때만 예외다.
   - 이때는 다른 제공자를 다시 확인하고, 안 되면 같은 제공자의 새 세션이나 `--allow-same-provider`로 이어 가며 `cross: false`로 기록한다.
4. **fail 처리**
   - 지적을 반영하고 `verify`를 다시 호출한다. 자동 재검토는 직전 blocking의 해소 여부와 새 결함만 본다.
   - 차수마다 원문을 `review-records/`에 보존한다. 지적별 등급, 반영 여부와 이유, 수정 위치를 TASK-CLOSE 리뷰 절에 연결한다.
5. **반복 실패 단계**
   - 3번째 fail이면 `escalation.stage: diagnose`가 나온다. 원인 층(structure·planning·design·other)을 가려 허브에 근거를 보내고, `review-note --diagnosis`로 기록한 뒤 전체 재검토를 받는다.
   - 진단 뒤에도 fail이면 `ask_user` 단계다. 조치가 A 밖이면 `review-note --decision --by pm`으로 기록하고 근본 조치 → 전체 재검증 → 사후 보고(4요소)로 간다. 이때도 사용자에게 묻지 않는다.
   - 같은 절차·열람 지적이 두 번 이어지면 3회를 기다리지 않는다. 증거 원문과 함께 허브에 넘기고, 도구 결함이면 `--void`로 무효 처리한다.
6. **마감**
   - 검토 pass는 목표 달성 판정을 대신하지 못한다. 목표 달성을 따로 판정한다.
   - 이후 `pace project check P### T0n` → `done` → `pace memory status --project` → 커밋 `feat(P###/T0n): …` 순으로 진행한다.
   - 병합은 허브가 맡는다. 나는 finish 통과 뒤 자체 판단 대조를 하고 `worker_done`으로 끝낸다.

**경계**
- 파일 수정, 메모리 기록, 커밋, 전송은 이번 시험에서 하지 않았다.
- 대상이 fixture가 아니라는 단서가 나오면 중단한다. 실제 사용자 설정, 비밀, 외부 전송이 걸리면 A-2·A-4로 보고 허브를 거쳐 owner에게 요청한다. 해당 조치만 보류하고 독립 작업은 이어 간다.
- 검토 자체를 생략하거나 약화하는 것(A-3)과 사용자 `waiver`는 내가 대행하지 않는다.

**집계**
- 사용자 질문: 0건
- 승인 대기: 0건
- 허브 인계: 조건부. 3회 fail 진단 시, 또는 도구 결함이 의심될 때만 한다.

**읽은 범위와 자동 첨부**
- 자동 첨부는 받았다. `userEmail` system-reminder 1건이며, 외부로 보내거나 인용하지 않았다.
- 읽은 파일:
  - `skills/pace-project-dev/SKILL.md` 1–93줄
  - `references/security.md` 1–43줄
  - `references/reviewer.md` 1–121줄
  - `references/decision-rights.md` 1–45줄
- 전체 바이트 수는 도구로 확인하지 않아 적지 않는다.