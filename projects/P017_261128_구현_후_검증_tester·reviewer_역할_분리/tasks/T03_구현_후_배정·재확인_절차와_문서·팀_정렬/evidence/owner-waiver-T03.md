# owner 결정 — T03 사전 검토 예외로 구현 (A-3)

- 결정: owner, 2026-11-28, 허브가 질문. owner 원문 선택: "예외로 구현 (Recommended)"
- 질문 요지: 공동 2회차(R4) F1(기존 미추적 파일 본문 변경을 경로 스냅샷이 놓칠 수 있음)을 구현 직전 스냅샷에 미추적 파일 sha256을 함께 고정해 증거 쪽에서 닫고, 사전 검토는 waiver(by user)로 현재 TASK 해시에 묶어 구현한다. TASK 문장 변경 없음. 구현 후 tester·reviewer 검증은 그대로다.
- 대상 TASK 해시: `333974bc1da1c6a70d1571bc03518630981c98813f6e3dbf57beb6fcc67283a4`

## 경과

- R1 fail(blocking 4)·R2 fail(blocking 3) 예산 소진, 공동 1회차 R3 fail(blocking 3), 공동 2회차 R4 fail(blocking 1). 모두 category detection. 근거 evidence/joint-pre-1.md·joint-pre-2.md.

## R4 원문 (review-records/R4.json)

- id F1 · blocking · detection · location `TASK.md:52`
- scenario: 구현 전에 이미 미추적 상태인 범위 밖 파일의 내용이 구현 중 바뀌고 경로와 미추적 상태가 유지되면, 전후 status와 추적 파일 diff가 같아서 S-6이 변경을 놓칠 수 있다.
- reproduction: 읽기 전용 조회에서 현재 T03 TASK가 git status --short --untracked-files=all에 ??로 나오고 git diff HEAD --name-only에는 나오지 않는 것을 확인했다. 같은 Git 상태의 범위 밖 파일을 가정해 이름과 미추적 상태를 유지한 채 본문 한 줄만 바꾸면 두 명령의 해당 경로 관측값은 전후 동일하다. TASK.md:52의 '미추적 포함'은 경로 목록을 포함하는 방식으로도 충족할 수 있고, 기존 미추적 파일의 내용 또는 해시를 전후 비교한다는 조건은 없다.
