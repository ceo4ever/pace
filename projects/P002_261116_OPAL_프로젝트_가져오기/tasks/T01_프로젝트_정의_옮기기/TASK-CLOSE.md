# T01 프로젝트 정의 옮기기(plan·apply·등록) — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

- 상위 목적(OPAL 정의된 프로젝트의 맥락을 PACE에서 잃지 않는다)에 대한 T01 몫: `.opal`→`.pace` 이동·AGENT 변환·같은 ID 등록. **달성** — 근거: test/adopt-opal.test.ts S-2(AGENT 외 파일 바이트 보존·허용 치환·ID 일치), S-3(재실행·복구).
- 한계(미확인): 옮긴 메모리·브레인·역할이 실제 `pace boot`에 나타나는지(OPAL↔PACE 형식 동일 전제)는 T03 e2e의 몫이며 인계 조건을 TASK.md에 적었다. T01은 이를 확인했다고 주장하지 않는다.
- 독립 1단계: codex(openai, 작성자 anthropic과 다른 제공자) `pace agent verify --kind task` 8회(evidence/review.md ~ review-8.md). 1~7차의 blocking(맥락 보존 기준 누락, 부분 실패 복구 시험, 복구 소유권)을 기준·접근·테스트에 반영했고 8차에서 blocking 0. 2단계(구현 후 목표 대조)는 아래 리뷰 절 참고.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1 (미리보기가 ignored 포함 저장소 바이트·git·등록부를 바꾸지 않음) |
| T-2 | 통과 | S-2 두 건(rename 상태·AGENT 치환·ID 일치·AGENT 외 보존) |
| T-3 | 통과 | S-3 (재실행 무변경·등록 복구·같은 경로 다른 ID 거부·다른 경로 같은 ID 거부) |
| T-4 | 통과 | S-4 (공존·미커밋·v1·형식 불명·링크·비 git·하위 폴더·무효 .pace·staged·untracked) |
| T-5 | 통과 | S-5(mv 전·후·AGENT 부분 기록·등록 전 실패·복구 실패 보고)·S-6(등록부·AGENT·staged·untracked 변경)·S-7 |

## 단위 테스트

- `node --test test/adopt-opal.test.ts` → 24 통과 / 0 실패.
- `npm run check`(worktree, 다른 프로젝트 작업과 동시 실행으로 부하 큼): typecheck 통과, 테스트 833건 중 824 통과·3 실패·6 건너뜀. 실패 3건의 원인:
  - `project-harness.test.ts` — 전체 실행에서 파일 시간 초과(부하). 단독 재실행 71/71 통과.
  - `windows-job-stress`(Windows 동시 부하 잡 회수 5초) — main 체크아웃 기준선에서도 같은 실패(이 변경과 무관).
  - `install-windows-wrapper`(get.ps1 iex 설치) — worktree 브랜치(project/P002)에서 설치 코드 업데이트가 main 전제라 실패, main 체크아웃에서는 통과(AGENTS: 설치는 main에서만). 이 변경과 무관.

## E2E

해당 없음(부트 포함 e2e는 T03).

## 리뷰

- 사전 검토: codex 8차 — 마지막 8차 blocking 0(should_fix 2: 등록부 비복구 계약의 시험은 S-7로 대체 확인, 부분 이동 실패는 S-5 ②로 시험 — 반영). 기록 PRE-REVIEW.json은 마지막 pass만 담는다(이전 시도의 해시는 TASK 개정으로 복원할 수 없어 증거 파일로만 보존).
- 구현 후 tester ∥ reviewer: 이 작업자는 하위 에이전트 사용이 금지되어(코디네이터 지시) 별도 새 맥락 reviewer를 띄우지 않았다 — 자체 대조만 했다(미실시를 통과로 취급하지 않는다). 다른 제공자의 구현 검토는 finish 전 코디네이터 판단에 맡긴다.
- 교본: typescript — 안티패턴 대조: 오류를 삼키는 catch는 복구 실패를 모아 보고하도록 했고, 외부 경로 입력은 realpath·링크 거부로 제한. 따른 절: 오류 처리·경계 검증.

## 남긴 것

- T02: `commit-msg` OPAL 훅 교체(`installCommitHook` export 필요)·대시보드 진입점·문서 `opal` 참조 보고. `adopt-opal.ts`에 이 단계를 `applyAdoptOpal` 뒤에 붙이면 된다(롤백 범위에 훅 파일 포함 필요).
- T03: e2e에서 부트 출력에 표본 메모리 제목·브레인 검색·역할 문구가 나오는지 단언, README·docs "OPAL에서 넘어올 때" — **절차: OPAL 제거 → PACE 설치 → 온보딩으로 새 프로필 → 프로젝트마다 `pace adopt opal`**(OPAL 홈 프로필 이전은 범위 밖 — 사용자 결정, PROJECT.md 메모).
- 함정(브레인 후보): `pace project task`는 태스크 표의 행 이름이 이름 칸과 다르면 새 번호(T04)를 만든다 — 대기 행 이름을 그대로 쓰거나 만든 뒤 정정해야 한다.
- `git ls-files`는 한글 경로를 따옴표로 감싼다(`core.quotepath`) — 테스트에서 주의.
