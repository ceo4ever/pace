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

- `node --test test/adopt-opal.test.ts` → 29 통과 / 0 실패(구현 후 검토 반영 시험 포함).
- `npm run check`(worktree, 다른 프로젝트 작업과 동시 실행으로 부하 큼): typecheck 통과, 테스트 833건 중 824 통과·3 실패·6 건너뜀. 실패 3건의 원인:
  - `project-harness.test.ts` — 전체 실행에서 파일 시간 초과(부하). 단독 재실행 71/71 통과.
  - `windows-job-stress`(Windows 동시 부하 잡 회수 5초) — main 체크아웃 기준선에서도 같은 실패(이 변경과 무관).
  - `install-windows-wrapper`(get.ps1 iex 설치) — worktree 브랜치(project/P002)에서 설치 코드 업데이트가 main 전제라 실패, main 체크아웃에서는 통과(AGENTS: 설치는 main에서만). 이 변경과 무관.

## E2E

해당 없음(부트 포함 e2e는 T03).

## 리뷰

- 사전 검토: codex(openai) 8차 — 1·2·3·5·6·7차 fail(blocking 2·2·1·1·1·1), 4차 blocking 0, 8차 blocking 0(verdict 단어는 `revise`였으나 지적 등급으로 읽으면 blocking 0 → pass, 코디네이터 2026-11-16 판정 기준). PRE-REVIEW.json은 8회 전부를 담는다(캡틴 결정 2026-11-16, 이력 복원). **복원의 한계**: 1~7차의 시도별 TASK 해시는 당시 저장하지 않아 복원할 수 없다 — 해당 시도의 `hash`는 그 차수 증거 파일(`evidence/review.md`~`review-7.md` = 1~7차)의 SHA-256으로 채운 대체값이며 TASK 해시가 아니다. 8차(`review-8.md`)만 실제 TASK 해시다. 시도별 blocking 수·판정은 증거 원문의 지적 등급을 센 값이다. `review-1.md`는 `review.md`의 복사본(중복)이다. 연속성은 모두 별도 codex 세션이라 `new`(pass 시도는 규칙상 `changed`+사유).
- 구현 후 검토: codex(openai, 다른 제공자) `pace agent verify`(goal) 3차, 증거 `evidence/post-review-codex-1.md`·`post-review-codex-2.md`·`post-review-codex-3.md`(`post-review-codex.md`는 1차와 같은 내용). 1차 blocking 2(`status.showUntrackedFiles=no`에서 새 파일 누락·같은 경로 다중 등록 항목 충돌 누락)+should_fix 1(frontmatter까지 `.opal/` 치환) → 모두 수정·시험(T01-S-3/S-4/S-2 추가). 2차 blocking 1(`assume-unchanged`·`skip-worktree`가 변경을 숨김)+should_fix 2(복구 실패 때 "원본 안 바꿈" 단정·S-5 제목) → 수정·시험. 3차 **blocking 0 · pass**, should_fix 3: `--no-optional-locks` 반영(git 헬퍼), NUL 바이트로 diff가 binary가 되던 문자열을 `|`로 교체, AGENT 복구가 POSIX 권한·파일 모드를 보존하지 않음은 남김(아래).
- tester: 별도 tester 새 맥락은 두지 않고 `node --test test/adopt-opal.test.ts` 29/29와 위 `npm run check`로 대신했다 — 한계로 남긴다.
- 교본: typescript — 안티패턴 대조: 오류를 삼키는 catch는 복구 실패를 모아 보고하도록 했고, 외부 경로 입력은 realpath·링크 거부로 제한. 따른 절: 오류 처리·경계 검증.

## 남긴 것

- T02: `commit-msg` OPAL 훅 교체(`installCommitHook` export 필요)·대시보드 진입점·문서 `opal` 참조 보고. `adopt-opal.ts`에 이 단계를 `applyAdoptOpal` 뒤에 붙이면 된다(롤백 범위에 훅 파일 포함 필요).
- T03: e2e에서 부트 출력에 표본 메모리 제목·브레인 검색·역할 문구가 나오는지 단언, README·docs "OPAL에서 넘어올 때" — **절차: OPAL 제거 → PACE 설치 → 온보딩으로 새 프로필 → 프로젝트마다 `pace adopt opal`**(OPAL 홈 프로필 이전은 범위 밖 — 사용자 결정, PROJECT.md 메모).
- 함정(브레인 후보): `pace project task`는 태스크 표의 행 이름이 이름 칸과 다르면 새 번호(T04)를 만든다 — 대기 행 이름을 그대로 쓰거나 만든 뒤 정정해야 한다.
- 구현 후 검토 3차 should_fix 남김: AGENT 복구(`writeFileAtomic`)가 POSIX에서 원래 파일 권한·모드를 보존하지 않는다 — 등록 실패 뒤 복구에서 `0600`·실행 비트가 기본 권한으로 돌아갈 수 있다(Windows 해당 없음). 필요하면 별도 백로그.
- `git ls-files`는 한글 경로를 따옴표로 감싼다(`core.quotepath`) — 테스트에서 주의.
