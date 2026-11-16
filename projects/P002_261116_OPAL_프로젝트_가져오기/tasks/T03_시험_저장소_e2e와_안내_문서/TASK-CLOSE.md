# T03 시험 저장소 e2e와 안내 문서 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

- 상위 목적(OPAL 정의 프로젝트의 맥락과 커밋 게이트를 PACE에서 잃지 않는다)에 대한 T03 몫: 가져온 맥락이 실제로 살아나는지·교체된 훅이 실제 `git commit`을 막는지를 e2e로 증명하고 사용자 절차를 문서화. **달성** — 근거: `test/adopt-opal-e2e.test.ts` S-1(가져오기 전엔 부트·`memory list`·`brain search`에 표본이 없고, 가져온 뒤 부트에 역할 문구·이슈·할 일 제목, `memory list`에 3종 요약, `brain search`에 표본 페이지, `workspace list`에 ID), S-2(실제 `git commit`: 가져오기 전 OPAL 훅은 `opal project check P001 T01`을 부름, 가져온 뒤 PACE 훅이 `pace project check P001 T01`을 이 저장소에서 부르고 실패→커밋 거부·HEAD 불변, 성공→커밋, 다른 브랜치·태그 없는 메시지→호출 0건·커밋, 백업=원본 OPAL 훅).
- 한계(미확인·주의): ① 표본은 PACE 도구로 만든 `.pace`를 `.opal`로 옮긴 것이라 OPAL이 만든 원본 파일이 아니다. 형식 동일성의 근거는 소스 동일성(`git diff c5ffef4c~1 HEAD -- src/memory/memory.ts src/project/brain.ts` 비어 있음)뿐이며, 생성 경로·설정·다른 파서까지 같다는 증거가 아니므로 "OPAL 원본 호환성 전체 증명"으로 확대하지 않는다. ② 훅 시험은 가짜 `pace`로 연결·종료 코드 전달만 본다(실제 `pace project check` 내부 판정·`PACE_COMMIT_CHECK=1` 전달은 대상 아님 — 구현에 환경변수가 있음은 코드로 확인). ③ 실제 다른 PC·OPAL 설치본 제거는 문서 절차이며 자동화·실측하지 않았다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1 (위 판정 절) |
| T-2 | 통과 | S-2 — 이 환경(Windows·Git의 `sh`)에서 **skip 0으로 실행·통과**(아래 단위 테스트 절의 skip 수) |
| T-3 | 통과 | S-3·S-4(`test/adopt-opal-docs.test.ts`): 6단계 순서·`--apply`·미리보기·프로필 비이전·이름 대응표 3행·멈춤 이유 5종·`파일:줄` 목록·`pace boot --host plain` 확인 |
| T-4 | 통과 | S-3 + S-3b(아래) |
| T-5 | 통과 | 부분 검사 `pace test unit adopt-opal` 57/0, `node scripts/secret-scan.ts` 통과(657개 파일), `tsc` 통과. 전체 `npm run check`는 합의대로 finish 전 1회 |

S-3b 문서 검토 항목(사람이 확인): 멈춤 조건별 대처 문단 — README "원본을 바꾸지 않고 멈추는 경우와 대처" 표(`.pace` 공존·미커밋 변경+숨김 플래그 해제법·v1/형식 불명/링크·루트 아님/비 git·같은 ID 다른 위치(등록부 파일 확인·정리 / 복제 시 새 UUID)·같은 경로 다른 ID) ✔ · `docs/README.md` 구성 요소 표 `OPAL 가져오기` 행 ✔ · 문서 표의 `README.md` 설명 갱신 ✔ · 정의서→README 링크(범위 절 `../README.md#opal에서-넘어올-때`) ✔ · 하네스 라벨 3종(`검사`·`보안 검사`·`worktree 준비`): `git diff -U0 -- docs/README.md`에서 라벨 행 변경 0건, 시험이 라벨 삭제를 잡는지 대조 단언 포함 ✔.

## 단위 테스트

- `pace test unit adopt-opal` (신규 단위 `adopt-opal`을 `.pace/test-map.json`에 등록: `src/project/adopt-opal.ts`·README·정의서 ↔ 시험 3파일) → 테스트 57 · skip 0 · 실패 0 (T01·T02 시험 포함, e2e 2·문서 4).
- 전체 `npm run check`: finish 전 1회(코디네이터 판단 — 전체 검사 약 35분·P001과 동시 부하). 이 태스크는 부분 검사만.

## E2E

S-1·S-2 — `test/adopt-opal-e2e.test.ts`(임시 `PACE_HOME`·임시 git 저장소의 실제 CLI 자식 프로세스와 실제 `git commit`). 증거는 시험 코드와 실행 결과(57/0/skip 0).

## 리뷰

- 사전 검토: codex(openai) 2회 — 1차 fail(blocking 1: 게이트 증명이 skip으로 빠질 수 있음 → T-2에 "skip이면 미충족"·실행 환경 기록 반영), 2차 blocking 0(pass). PRE-REVIEW.json 1차 hash는 TASK 해시 미보존으로 `evidence/review-1.md`의 SHA-256 대체값(한계), 2차 hash는 실제 TASK 해시.
- 구현 후 검토: codex `pace agent verify`(goal) 2회, `evidence/post-review-codex-1.md`·`-2.md`. 1차 blocking 1(브레인 전후 대조 누락)+should_fix 4(등록 충돌 대처가 막힌 경로·하네스 라벨 검사 정규식이 `\|`를 잃어 삭제도 통과·숨김 플래그 해제 절차·적용 전 메모리 대조 표식) → 모두 수정·시험(라벨 검사는 삭제를 잡는 대조 단언 추가). 2차 **blocking 0 · pass**, should_fix 2(비활성 등록을 `pace workspace list`로 못 찾음 → README에 등록부 폴더 직접 확인 안내, 게이트 실행 위치 검사가 폴더명만 비교 → 전체 경로 정규화 비교로 수정)와 note 1(실제 `project check` 내부 판정은 대상 아님 — 위 한계) 반영.
- tester: 별도 tester 새 맥락 없음 — 부분 검사 57/0과 위 시험으로 대신(한계).
- 교본: typescript — 테스트 코드: 임시 폴더 격리·실제 프로세스·실패 대조(전후 대조, 라벨 삭제 대조) 적용. 따른 절: 테스트 설계.

## 남긴 것

- finish 전: 전체 `npm run check` 1회(부하가 크면 `project-harness`·Chrome 관측 테스트가 멈춰 수십 분 걸린 이력 — 멈춘 자식만 종료하고 해당 파일을 단독 재실행해 확인). `pace project finish P002`의 PROJECT-CLOSE(기준 P-1~P-6 대조·목표 달성 판정).
- 남김(should_fix): AGENT 복구가 POSIX 권한을 보존하지 않음(T01 TASK-CLOSE). OPAL 원본 파일 표본이 필요하면 별도 백로그.
- 문서 한계: 이름 대응표의 `opi → pace-project-init`은 OPAL→PACE 스킬 이름 관계를 문서화한 것이며 OPAL 설치본의 실제 제거 절차는 OPAL 쪽 문서에 있다.
