# 태스크 단계 세부

SKILL.md §3에서 옮긴 문서다. 분석·설계·구현 전 검토·테스트 단계의 세부 규칙. 

1. **분석** — `pace project task P### "<이름>"`. 명령이 `tasks/T0n_<이름>/TASK.md`를 만들고 표 상태를 `진행`으로 둔다 — 표의 `대기` 행과 이름(이름 칸 그대로)이 같으면 그 번호로 열고, 아니면 새 번호로 행을 더한다. 목적·재료를 쓴다. 앞 태스크 TASK-CLOSE의 "남긴 것"을 읽는다.

2. **설계** — 새 형식 TASK는 사전 검토 전에 [증명 범위·판정 주체](reviewer.md#task-증명-범위와-판정-주체)를 먼저 쓴다(표지 없는 옛 TASK는 기존 방식). 기준 `T-n`(프로젝트 기준 P-n과 이어지면 적는다), 테스트 표(기준마다 시나리오 한 줄 이상, 가장 싼 충분한 계층), 접근. 기준 문서는 §5 규칙으로 고른다. 코드를 바꾸면 `pace-tech-handbook` 언어 색인과 testing·`verification/` 색인의 안티패턴을 테스트 표와 접근에 대조한다. 화면·상태가 복잡하면 html-plan으로 설계를 보여 줄 수 있다(선택, `references/html-plan.md`). 착수 뒤 테스트 표·접근은 필요하면 고친다. 기준 `T-n`을 바꿀 때만 결정 메모에 이유를 남긴다.
   **구현 전 검토** — [reviewer.md](reviewer.md)의 구현 전 TASK 검토 절을 따른다. 워크트리 PM이 작성한 TASK.md를 별도 reviewer에 맡겨 상위 목적·브리프와의 정합, 범위·완료 기준·테스트 계획·접근과 위험을 검토받는다. blocking은 수정하고 `verify`를 다시 불러 자동 재검토를 받아 pass(blocking 0)이거나 사용자 결정으로 PRE-REVIEW `waiver`를 붙였을 때 구현한다. 연속 fail로 출력에 `escalation`이 붙으면 [반복 실패](reviewer.md#반복-실패-진단과-사용자-결정)정본의 조치 전 영향 분류·결정·재검증·보고를 따른다. should_fix는 반영하거나 이유를 남기고, 목적·범위 변경은 §6을 따른다. 대상과 판정·지적 처리·검토 방식을 태스크 기록에 남긴다. 검토한 내용이 구현 전에 실질적으로 바뀌면 다시 검토받는다(pass 뒤 변경이면 전체 검토로 열린다).
   **reviewer 배정** — 작성 PM과 다른 제공자를 우선한다(Claude PM → Codex, Codex PM → Claude). 발동이 불가능하면 [A-3의 B1](decision-rights.md#a-결정-주체)을 적용한다. 양쪽 모두 미실행이면 A-3으로 결정 요청을 하고 사전 검토 관문을 보류한다. 제공자·실행 결과를 확인한다.

4. **테스트** — 워크트리 PM이 저장소 검사 명령(`docs/README.md` 환경의 "검사")과 E2E를 수행하고, **tester ∥ reviewer**를 새 맥락으로 직접 배정·회수·판정한다(`references/tester.md`·`reviewer.md`, 방법은 `references/tools.md`). 구현 후 최초 reviewer는 사전 검토와 별도 새 맥락으로 열고 위 reviewer 배정 원칙을 따른다. reviewer는 `verify`로 받고 출력의 `escalation`부터 본다 — 있으면 [반복 실패](reviewer.md#반복-실패-진단과-사용자-결정)정본의 조치 전 영향 분류·결정·보고를 따른다. 없으면 tester fail이나 reviewer blocking은 고치고 **둘 다** 다시 돈다(reviewer 재검토는 `verify`를 다시 불러 원장의 직전 원문·바뀐 줄로 받는다. 반복 fail은 [반복 실패](reviewer.md#반복-실패-진단과-사용자-결정)). should_fix는 반영하거나 이유를 남기고, handoff는 남긴 것에 적는다. TASK-CLOSE "리뷰"에는 차수마다 한 줄(`1차: tester pass · reviewer blocking 1 — …`)과 교본 대조 한 줄(`교본: typescript — 안티패턴 대조, 따른 절 …` 또는 `교본: 해당 없음(코드 변경 없음)`).
