# BR02 사후 reviewer 묶음 점검 판정

- 상태: 대기
- 백로그: [BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음](BACKLOG.md)

<!-- 개발 업무의 예시. 형식·추적 정본: pace-project-dev의 references/document-shape.md. -->

## 목적

사후 reviewer의 질문과 필수 판정 항목을 "TASK 기준 충족"에서 **세 묶음의 점검 항목**으로 바꾼다([백로그 수정안 1·2](BACKLOG.md#목표)). 실행 증거가 없어 생기는 unknown과 그로 인한 재검토·호출 소진을 없앤다. 묶음 안 결함(교착·소급 변경·감사 누락·빈 시험)은 질문 안 지적으로 판정에 닿게 한다(fin-link P045/T06 R1, T02 R1 — [백로그 근거](BACKLOG.md#목표)).

## 범위

- **질문과 필수 항목**(owner A-1 단순화 2026-11-28): 사후 reviewer를 부르면 항상 경계(A)·상태(B)·흐름(C) 세 묶음의 모든 점검 항목(12항목)을 묻는다. TASK 줄 값과 무관하다. 사후 질문 문구와 항목 ID는 설계에서 정한다. ID는 결정 권한·백로그 준비 기준·`C-n`과 겹치지 않는다. TASK 기준 `T-n`은 필수 항목에서 뺀다(지금은 `src/agent/review-criteria.ts:50`이 넣는다).
- **답 형식과 판정**: 항목마다 결함(파일:줄+재현) / 없음(따라가 본 경로) / 해당 없음(이유) 중 하나로 답한다. 경로 없는 "없음", 이유 없는 "해당 없음", 누락은 미확인이다. 결함은 지금의 구조화 지적 형식(`location`·`scenario`·`reproduction`·`recurrence`)과 판정 계산을 따른다. 점검 항목에 걸린 결함은 질문 안 범주다(`implementation·design`이라는 이유만으로 note로 낮추지 않는다). 기준 재판정과 계획 타당성 지적은 질문 밖 note다. 한 기록 = 한 원문 = 한 판정이다.
- **입력**(Q1 owner 결정 2026-11-27): 사후 reviewer는 목표 대조 1단계를 하지 않고, TASK와 diff를 입력으로 받는다.
  - 사후 단계에서 1단계 지시(`src/agent/verify.ts:70`·`:76`·`:81`)를 빼고, 묶음 점검 지시로 바꾼다.
  - TASK는 도구가 그 태스크의 루트 TASK.md에서 붙인다.
  - 백로그·사전·scope 없는 일반 검토의 프롬프트는 바뀌지 않는다. 분기는 단계로 하고 원장 `kind`는 바꾸지 않는다.
- **범위를 좁히는 문장 미적용**: 사후 단계에서 다음 네 문장을 쓰지 않는다. 매 호출 세 묶음 전체를 diff 전체에 대해 묻고, 직전 지적이 있으면 해소 여부도 답하게 한다.
  - `verify.ts:61`·`:62`.
  - `src/agent/structured-review.ts:111`.
  - `src/agent/verify-cli.ts:368`.
  - 수정 확인의 해소 의미는 현행대로 둔다. 진단 확인 pass는 원 기록의 지적 전부를, 진단 없는 확인은 그 지적 하나만 해소한다.
- **대상은 구현 diff만**: 비-diff 대상은 호출 없이 거부하고 tester 경로를 안내한다. 기존 사후 시험 픽스처 중 비-diff 대상을 쓰는 것은 같은 태스크에서 의도적으로 갱신한다.
- **거부는 예약 전**: 비-diff 거부와 사후 단계 같은 대상 fail 재요청 거부(`verify-cli.ts:119-120`)를 예산 예약 전으로 옮긴다. owner 회차의 같은 해시 fail 재요청 허용은 그대로다. `verify`와 `review-hand` 모두 같다.
- **사후 검토 주기**(owner 결정 A-1 2026-11-28, 원문 "1" — [evidence/owner-decision-2026-11-28-new-cycle.md](evidence/owner-decision-2026-11-28-new-cycle.md); R9 F26·R10 F31): 사후 reviewer pass는 검토 주기를 닫는다. pass 뒤 tester를 통과한 새 diff(BR03 화면·문서 예외가 아닌 것)는 새 사후 검토 주기를 열고 일반 예산(유효 판정 2회·호출 4회, 값은 그대로)을 새로 받는다. fail·unknown 뒤의 수정 diff는 같은 주기 안의 재검토다. 주기를 저장·판독하는 방식은 설계 몫이다. 기존 규칙과의 관계: 사후 단계에서 pass가 주기를 닫는 이 예외만 완료 백로그 BL261124_04 BR01:14-17과 P013 P-2(`projects/P013_*/PROJECT.md:43`)의 태스크 단계별 합산·pass 뒤 초기화 금지를 바꾼다. 사전·백로그 단계와 사후 fail·unknown 뒤 수정 diff는 기존 합산 그대로다(`review-note --decision` 뒤 초기화 금지도 그대로).
- **옛 기록**: 이미 커밋된 사후 기록은 판독만 한다(메모리 `구판-호환-설계-금지`). 구판 판정 생성 경로와 이중 판독을 만들지 않는다. 저장 위치·필드·판독 방법은 설계에서 정하고 사전 검토로 판정받는다.
- **제외**: TASK 줄·사전 판정(BR01). 배정 절차와 문서(BR03). 예산 값·공동 시도·escalation(입장 판정 `src/agent/review-admission.ts`는 사후 주기 경계만 바뀐다). done 게이트(Q2).

## 완료 기준

- 사후 프롬프트와 필수 항목이 세 묶음 12항목이고 `T-n`이 없다. TASK 값이 `생략`이어도 같다(시험).
- 12항목 모두 형식을 갖춘 답이고 유효 blocking이 없으면 pass다. 누락·경로 없는 "없음"·이유 없는 "해당 없음"은 unknown이다. 실행 증거가 없다는 이유로는 unknown이 되지 않는다(시험).
- **인수 사례**: P045/T06 R1의 교착(F2)·소급 변경(F1) 시나리오를 흐름(C)·상태(B) 항목의 blocking으로 낸 모의 원문은 fail이다. 원래 기록대로(note, `implementation·design`) 넣으면 질문 밖 note다. 기준 재판정·계획 타당성 지적도 note다(시험).
- 사후 프롬프트에 루트 TASK.md와 diff가 있다. 1단계 지시와 범위를 좁히는 네 문장이 없다. 각 문장의 부재를 따로 단언한다(시험 — 첫 검토·재검토·수정 확인, `verify`·`review-hand`).
- 비-diff 거부와 사후 같은 대상 fail 재요청 거부에서 실행기·call 행·예산이 그대로다. owner 회차 허용은 그대로다(시험).
- **단계 경계 회귀**: 백로그·사전·scope 없는 일반 검토의 프롬프트와 `review-admission.ts`가 그대로다. `legacyStructureOnly`와 옛 사후 기록의 판정·`pace project stats` 결과가 변경 전과 같다(시험).
- **검토 주기**(시험): 같은 태스크에서 해시 H1 fail → H2 pass로 판정 2회를 쓴 뒤, tester를 통과한 세 번째 해시 H3가 두 경로 모두에서 누적 예산으로 막히지 않고 새 주기 예산으로 집계된다. (가) `verify`: 실행 전에 막히지 않고 실행된다. (나) `review-hand`로 H3를 넘기고 반환을 `review-record`로 등록: 입장·예약(`src/agent/review-hand.ts:174-178`, `:206-209`)과 등록(`:217-233`)이 모두 통과하고 새 주기로 집계된다. 음성 대조는 두 경로 모두에 적용한다. 음성 대조: (a) H1 fail 뒤 수정 diff H2의 verify는 기존 주기 예산을 이어 쓴다. (b) pass한 H2를 같은 해시로 다시 요청하면 새 주기를 열지 않는다. 현재 막히는 경로는 `src/agent/review-budget.ts:133-150`, `review-followup.ts:176-180`, `review-admission.ts:19-25`, `verify-cli.ts:320-326`이다(R9 재현).
- 조기 호출 신호(`location`·`recurrence`, TS-21)가 묶음 결함 지적에서도 계산된다(시험).
- **설치 전 관문**(owner A-1 2026-11-28): 구현 뒤 아래 여섯 입력을 새 사후 프롬프트로 **입력당 2회** 실제 재생한다(분모 12회). 원문·결과는 evidence에 고정하고 tester가 판정한다.
  - **입력 고정**: 입력 하나 = 패치 + 그 태스크 TASK.md다. 패치에서 바이너리 파일 diff(`Binary files`·`GIT binary patch` 절, 예: `docs/ia/ia.xlsx`)만 빼고 다른 절은 그대로 둔다. 재생 기록에 뺀 경로와 실제로 넘긴 패치·TASK의 sha256을 남긴다. 아래 해시는 이 규칙으로 계산해 둔 기대값이다(앞 16자리, 2026-11-28 기획자 계산). 다르면 재생하지 않고 원인을 기록한다.
  - TASK는 패치와 같은 커밋의 TASK.md다. 다섯 태스크 모두 TASK.md 커밋이 하나뿐이라 그 커밋이 유일한 고정본이다. R1 당시와 같은 바이트인지는 원장으로 확인되지 않는다(사전 검토 해시는 TASK 일부만 덮는다, `src/project/pre-review.ts:78-80`).
  - 표본(fin-link 경로 `/Volumes/Data/StoreLinkStudio/fin-link/projects/P045_261127_사용자_관리_US-01_실제_API_연결/tasks/`):

| 입력 | 패치 @ 커밋 | 넘길 패치 sha256 | TASK.md sha256 | 고른 근거 |
|---|---|---|---|---|
| P045 T01 | `T01_*/evidence/post-candidate.patch` @ `7ac1424b` | `ae53eb83474ca1b4` | `947af6a842e3f2b7` | R1 기록 해시와 같다. 지금 파일(`d9fdca4c…`)은 R2 보완판 |
| P045 T04 | `T04_*/evidence/post-goal-candidate.patch` @ `219d59ed` | `d2d90555963f7430` | `a5a53db88d94dd65` | R1 기록 해시와 같다 |
| P045 T05 | `T05_*/evidence/post-candidate.patch` @ `584002dc` | `a1718c48009d046e`(`ia.xlsx` 뺌) | `a942dd85073853f8` | R1 대상 묶음 문서의 diff 파일 목록과 같다 |
| P045 T06 | `T06_*/evidence/post-candidate.patch` @ `236af351` | `8c5865a3eede5f9a`(`ia.xlsx` 뺌) | `0e09378505d6d8b6` | 같은 관계. 잠금 코드 8곳으로 교착·소급 변경 경로 포함 |
| PACE P014 T04 | `projects/P014_261126_문제_해결_전문가_에이전트/tasks/T04_호출_절차_연결/evidence/implementation-final.patch` @ `2a9c002` | `8a6a5d833a482c95` | `48bcb3b68c96e3e5` | 사후 기록 3건이 모두 이 해시 |
| **경계(A) 합성** | P045 T01 입력에서 `+        actor_id = self.ctx.user_id`부터 `raise HTTPException(403, "개인정보 보기 권한이 없다")`까지 5줄(패치 1654-1658행, 연락처 원문 열람 `contacts`의 개인정보 보기 권한 검사)을 지우고 그 hunk 머리(1461행)를 `+1,209`→`+1,204`로 고친다 | `88340aa38c20c93c` | T01과 같다 | **합성 결함**이다. 과거 원장에서 사후 diff의 실제 경계(A) 결함을 찾지 못했다(fin-link P035·P044·P045의 권한 blocking은 모두 사전 검토의 TASK 시험 설계 지적, PACE `a3dfdbd`는 런타임 모드 의미라 diff로 판정할 수 없다). 같은 패치의 시험 단언(연락처 403)은 남겨 둔다 |

  - **통과 조건**:
    - unknown이 12회 중 1회 이하다.
    - 상태(B)·흐름(C): T06 2회 모두 교착이 흐름(C), 소급 변경이 상태(B) 항목의 **유효 blocking**으로 나오고 도구 판정이 fail이다.
    - 경계(A): 합성 입력 2회 모두 권한 검사가 빠진 원문 열람이 경계(A) 항목의 **유효 blocking**으로 나오고 도구 판정이 fail이다.
    - 세 묶음 모두 양성 사례가 위처럼 검출돼야 통과다. 질문 안 should_fix나 note로만 나오면 관문 실패다.
  - **음성 대조**(분모 12회와 별도):
    - 현행 프롬프트 기준선은 새로 돌리지 않는다. 기존 R1 판정은 다섯 모두 unknown이다. T01·T04·P014는 **패치 바이트만 같다**. 전체 reviewer 입력은 이번에 TASK를 더하므로 다르다(기존 사후 프롬프트는 TASK를 받거나 읽지 않았다, `src/agent/verify.ts:70`). T05·T06은 묶음 문서(`post-review-01-bundle.md`)가 대상이었으므로 **참고 기준선(동일 입력 아님)**이다.
    - 무해 diff: P045 T05 `T05_*/evidence/post-02-docs.patch` @ `584002dc`(문서 정정, `ia.xlsx` 뺌, 기대 sha256 `c1efc8309e9be521`)와 T05 TASK.md를 2회 돌려 2회 모두 유효 blocking이 없다.
  - **역할 구분**: 위 인수 사례의 모의 원문 시험은 판정 계산(blocking이면 fail)을 검증한다. 실제 reviewer가 그 결함을 blocking으로 보고하는지는 이 재생만 검증한다. 하나로 다른 하나를 대신하지 않는다.
  - **실패 시**: 설치를 보류한다. 12항목과 필수 답 근거(결함의 위치·재현, "없음"의 경로, "해당 없음"의 이유)는 그대로 두고 질문 문구·프롬프트만 보완해 같은 표본으로 다시 측정한다. 항목 수나 답 근거를 줄이려면 owner A-1 결정을 받는다.
- 문구 고정 시험(`test/agent-structured-review.test.ts:16`·`:447`·`:486`)을 의도적으로 갱신하고 TASK-CLOSE에 적는다.
- 바꾼 경로가 `src/agent/**`(`call-hook.ts` 제외)·`test/**`(필요하면 `src/project/review-metrics.ts` 판독부)뿐이다.
