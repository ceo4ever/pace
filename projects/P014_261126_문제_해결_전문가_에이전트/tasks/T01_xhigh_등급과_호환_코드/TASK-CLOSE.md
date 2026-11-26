# T01 xhigh 등급과 호환 코드 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

문제 해결 전문가에게 Claude `claude-fable-5-2/high`와 Codex `gpt-6.2-astra/medium`을 전달하고, 기존 세 등급과 구판 동기화·팀 측정을 보존했다. 두 호스트의 시작 인자와 새·옛 CLI 교대 실행 결과를 대조했다. 실제 모델·effort의 호스트 런타임 관측은 T06에서 수행한다. [구판 호환 실측](evidence/compatibility.json)

독립 테스터가 두 명령을 실행해 목적을 대조했고, 별도 검토자가 코드와 관측을 대조했다. 1·2단계 모두 동일 후보 패치 SHA-256 `32e7a3787bdb335f79f32be21b97ae3e451447febc4418c3617af20913575eeb`를 확인했다. [후보 패치](evidence/implementation.patch) [독립 테스터 첫 판단](evidence/tester-stage1.md) [독립 리뷰어 첫 판단](evidence/review-records/R2.json)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1 `test/team.test.ts`의 두 호스트 기본값·set/reset·override·기존 세 등급 effort와 설정 파일 바이트·유효하지 않은 등급 비교. |
| T-2 | 통과 | S-2 `test/team.test.ts`의 명시 승격과 native 두 형식, `test/project-role.test.ts`의 두 호스트 start 인자·해시와 override 재실행. |
| T-3 | 통과 | S-3 구판과 신판을 두 차례 교대. check 차이 0건, sync 종료 0, 시작 행 통계 출처 events, 기존·신규 생성물 바이트 보존과 신판 두 판독기의 정확 경로 복원. [결과](evidence/compatibility.json) |
| T-4 | 통과 | S-4 `test/team.test.ts`와 `test/project-role.test.ts`의 링크·형식·UTF-8·크기·경로와 표지 거부, 외부 대상과 기존 생성물 바이트 보존, 준비 중 지문 변경 시 시작 보류. |

## 단위 테스트

- xhigh 선택 검사에서 기준 구현은 8개 중 7개가 실패했다. 작업본에 대한 독립 테스터의 재실행은 8개 통과, 실패·건너뜀 0개였다. [테스터 최종 판정](evidence/tester-stage2.md)
- 임시 `PACE_HOME`에서 `PACE_SKIP_BROWSER_E2E=1 npm run check -- -- --test-concurrency=8`로 타입 검사와 전체 시험을 돌렸다. 결과는 1497개 중 통과 1480개, 실패 0개, 건너뜀 17개, 종료 0.
- 첫 전체 실행은 1497개 중 1479개 통과, 1개 실패, 17개 건너뜀이다. 대시보드 형제 저장소의 스냅숏을 읽는 도중 Git의 `.git/objects/maintenance.lock`이 사라져 ENOENT로 실패했다. 같은 단일 시험은 기준선과 작업본 양쪽에서 통과했다. 이전부터 기록된 부하 민감 시험이며 이 태스크는 코드와 시험을 수정하지 않았다.
- `node scripts/secret-scan.ts` 통과. 임시 홈의 실제 작업본 `team sync --check --json`은 기존 구성원 5명과 차이 0건을 반환했고 `worker show`는 두 xhigh 기본값을 표시했다.

## E2E

고정 기준 `5cddecd00c68ab61f7e31cd80984dc34517bdc46`을 별도 사본으로 실행했다. 팀 채택과 조건부 역할 표지를 갖춘 저장소에서 신판의 실제 `project start --role --no-launch`가 기록을 만든 뒤 worktree에서 번갈아 list·sync·stats를 실행했다. 구판은 xhigh를 팀 목록에서 건너뛰고 stats에는 시작 행의 역할과 시각을 집계했다. 두 판독기가 같은 역할 이름의 실제 경로를 복원했고 여덟 생성물의 SHA-256이 유지됐다. [재현 드라이버](evidence/compatibility-driver.txt) [교대 실행 원문](evidence/compatibility.json)

## 리뷰

- 사전 Claude R1에서 시작 행의 구판 팀 측정 오류 1건을 재현했다. 같은 행에 구판 호환 기본 슬롯과 숫자 표지를 저장하고, 신판의 두 판독기에서 정확 경로를 되살리도록 설계했다. Claude R2가 9개 경로 한정 구현을 허가했다. 표지 없는 xhigh 경로와 기존 legacy 슬롯에 붙인 표지는 시험에서 거부한다. [사전 R1](review-records/R1.json) [사전 R2](review-records/R2.json)
- 구현 검토 최초 실행은 구판 실행 근거를 볼 수 없었고 검색에 작업 문서 일부가 섞였다. 이전 판단을 종결 근거에서 제외했다. 새 격리 맥락에서 구판 교대 증거로 첫 판정을 회수하고 동일 Claude 세션에 TASK를 전달했다. 두 단계 최종 판정은 pass, blocking 0건, should_fix 0건이다. [첫 실행](evidence/review-records/R1.json) [격리 재실행](evidence/review-records/R2.json) [최종 대조](evidence/reviewer-stage2.md)
- 독립 Codex 테스터는 1단계 이후 `p` 모드 resume 미지원으로 원문을 넘긴 별도 세션을 썼다. 초회 2단계의 시간 초과 뒤 격리 사본의 잔여 전체 검사 프로세스를 회수하고 두 지정 명령으로 재검증했다. 최종 T-1~T-4와 검출력·약화 여부 판정은 pass다. 지표 로그 경고 1줄은 숫자 표지의 수동 주입 거부 시험에서 발생했다. 해당 시험은 로그 바이트 보존을 단언한다. [테스터 첫 판단](evidence/tester-stage1.md) [테스터 최종 판정](evidence/tester-stage2.md)
- 교본은 TypeScript 및 verification 색인의 경로·오류 상태 검증을 대조했다. 기존 파일 검사와 원자 쓰기를 재사용했고, 실제 CLI 교대와 링크·상위 경로·위조 행 음성 대조로 분기 시험을 보완했다.

## 남긴 것

- T06에서 `pace team new pace-troubleshooter --role reviewer`로 만든 원본을 `.pace/team/agents-xhigh/pace-troubleshooter.md`로 옮기고 `tier: xhigh`를 적용한 뒤 신판 `team sync`로 전용 표지의 native 생성물을 만든다.
- xhigh override는 `PACE_HOME/worker-tiers-xhigh.json`의 `{ "<host>": { "xhigh": { "model": "<값>", "effort": "<값>" } } }` 형태다. `pace worker set <host> tier.xhigh.<model|effort> <값>` 및 `pace worker reset <host> tier.xhigh.<model|effort>`로 설정한다.
- 구판과의 실제 교대 실행은 Codex 시작 행에서 수행했다. 신판의 Claude·Codex 시작 시험은 같은 기록 형식과 두 판독기를 검사한다. xhigh 설정 파일이 손상되면 기존 `worker show` 오류 규칙에 따라 `teamTiers`가 null이고 오류가 표시된다. 기존 등급을 쓰는 동기화와 개별 설정은 읽을 수 있다.
- 브레인 lint는 오류 0건, 기존 OPAL 문서의 README 근거 경고 1건이다. T01에서 해당 근거 경로는 변경하지 않았다.
