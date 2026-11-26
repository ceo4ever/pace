# T02 조기 호출 도구 신호와 문턱 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

검토 실패, 같은 시험 파일의 반복 실패, 같은 영역의 재지적, 같은 파일 편집 뒤의 같은 등급 재지적을 구분할 권고와 회차 근거를 구현했다. PM의 호출과 인계는 T04·T05에서 이 출력을 사용한다. 실제 프로젝트의 수렴 개선은 수집한 과거 원장의 문턱 근거와 별도이며 프로젝트 병합 뒤 관측한다. [고정 원장 계산](evidence/convergence.json) [독립 테스터 목적 대조](evidence/tester-stage1-final.md) [독립 리뷰어 목적 대조](evidence/reviewer-stage1.md)

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1. 역사 원장에서 두 번째 유효 실패 직후 pass 7/27, 가장 긴 원장을 빼면 3/8. 일반 verify는 2회에 권고와 두 기록을 내고 3회에 기존 진단을 따른다. 예산 단위의 기존 종료 16은 P013 시험에서 확인했다. [문턱 계산](evidence/convergence.json) |
| T-2 | 통과 | S-2. 등록 파일의 두 번째 검증된 실패, Git 로컬 기록 뒤 선택 경로 유지, dirty TASK의 선언 검사와 등록 파일 재실행. 직접 실행, 다른 파일과 미선택, 타임아웃·0건·전체 skip, 악성 링크 음성 대조. Python 실패도 같은 문턱에서 권고한다. [집중 검사](evidence/focused-tests.txt) |
| T-3 | 통과 | S-3·S-4. 지적 ID·근접 행·기준 없는 목표 지적의 재발, 무관 위치·기준·구분과 손상 기록의 배제, 같은 검토 대상의 변경 구획과 등급. 실제 verify가 첫 유효 fail의 예산 안에서 두 권고의 종류·단위·회차를 낸다. [집중 검사](evidence/focused-tests.txt) |
| T-4 | 통과 | S-1~S-5. 기존 원장·예산 및 소진·T09 상위 검토 회귀, 타입·비밀과 팀 채택 회귀, TS-01~TS-05 v1 등록/정의 대조. [요건 대조](evidence/requirements.md) [테스터 보충 확인](evidence/tester-supplement.md) |

## 단위 테스트

- 기준 구현은 신호 관련 집중 시나리오에서 실패했다. 최종 후보의 집중 검사 33개가 통과했다. 신호 10개, 기존 예산 P013 T01 9개, 상위 검토 P013 T09 14개다. [실행 결과](evidence/focused-tests.txt)
- 선언된 전체 검사 결과는 1507개 중 통과 1490개, 실패 0개, 건너뜀 17개, 종료 0. 임시 `TMPDIR`·`PACE_HOME`과 `PACE_SKIP_BROWSER_E2E=1`, 동시 실행 6을 사용했다. 테스트 프로세스에서만 Git 자동 유지보수를 껐다.
- 앞선 전체 검사 중 하나는 T01에서도 관측한 대시보드 시험이 실패했다. 다른 실행은 daemon 작업공간 복제 시험의 초기 등록이 종료 2를 냈다. 그 daemon 시험은 같은 테스트 설정의 단독 실행에서 통과했다.
- `node scripts/secret-scan.ts`를 작업본과 독립 사본에서 실행했고 통과했다. 독립 사본에서 팀 채택 회귀 3개도 통과했다. [보충 확인](evidence/tester-supplement.md)

## E2E

- 실제 임시 프로젝트 worktree와 등록 Node·Python 파일을 사용했다. 관측 이력은 대상 worktree의 Git 메타데이터에만 생겼고, 후속 `changed`는 선택을 유지했다. 프로젝트 문서를 수정한 뒤의 `changed`는 기존 전체 검사 명령의 실패를 반환했고, `file`은 해당 등록 파일을 관측했다. 팀 절도 새로 생기지 않았다. [선택 검사 실행](evidence/focused-tests.txt)
- `verify` 정상 진입점의 기록·판정에는 재현 가능한 합성 응답을 썼다. 기록 검증을 마친 바로 앞 시도의 영역이 다시 나오면 권고를 붙인다. 같은 등급의 파일 변경 증거는 같은 검토 대상의 두 스냅숏을 비교한다. [최종 후보](evidence/implementation.patch)

## 리뷰

- 사전 R1이 추적 파일에 관측을 쓰면 다음 선택 검사가 전체 검사로 전환되는 문제를 발견했다. Git 로컬 이력과 등록 파일의 명시 실행으로 보완했고 R2에서 구현 허가를 받았다. R2의 후속 지적을 반영해 실행하지 않은 뒷 파일의 연속성 시험을 추가했다. Vitest는 관측 대상 밖으로 두고 명시 파일 안내는 T04·T05 인계에 남겼다. [사전 R1](review-records/R1.json) [사전 R2](review-records/R2.json)
- 구현 초기 독립 검증은 다른 검토 대상의 비교와 실패 경로 검출력에서 보완이 필요했다. 같은 대상 경계를 추가하고 시험을 넓힌 최신 패치 SHA-256 `2efc205bed08221e898884a9277a385dc023aa74456e5b462b2dd85c06902c81`에서 독립 검증을 다시 받았다. [초기 리뷰어 근거](evidence/reviewer-stage1-first.md) [초기 테스터 근거](evidence/tester-stage2-first.md) [최신 테스터 2단계](evidence/tester-stage2.md) [테스터 최종 판정](evidence/tester-supplement.md)
- 최종 교차 reviewer는 pass, blocking 0건, should_fix 1건이다. 두 유효 실패가 일반 예산을 모두 쓴 경우 신호 3·4를 함께 표시하자는 의견은 P-9의 소진 인계 우선에 따라 적용하지 않았다. 증거가 유효한 미확인 기준점 뒤 첫 유효 실패로 예산 안 조기 권고를 시험했다. [리뷰어 목적 대조](evidence/reviewer-stage1.md) [최종 교차 검토](evidence/review-records/R1.json)
- TypeScript 및 verification 교본의 경로 검사와 오류 상태를 대조했다. 테스트 러너 원래 실행과 파일 판정, 원장 판정과 권고 출력의 분리, 링크 대상 보존을 확인했다.

## 남긴 것

- T04·T05에서 조기 권고는 `verify`의 `troubleshooterSignals`와 선택 시험의 `문제 해결 호출 권고`를 사용한다. `budget_exhausted`·종료 16은 기존 인계이고 외부 `review-record`의 상위 검토 출력도 기존 인계다. 프로젝트 문서가 바뀌어 전체 전환이 된 경우 명시 `pace test file`로 등록 Node·Python 시험을 관측한다.
- `superficial_fix`는 파일 단위 대리 지표다. 같은 파일의 멀리 떨어진 부분만 바뀌어도 같은 영역의 지적과 등급이 재발하면 권고를 낼 수 있다. PM의 수정 판단은 실제 위치의 원문과 변경을 대조한다.
- 시험 이력은 worktree 로컬에 있으며 다른 clone에서 같은 회차를 볼 수 없다. 기존 원장 판독 상한 32MiB를 넘거나 손상이 있으면 권고를 보류하고 시험 결과를 반환한다.
