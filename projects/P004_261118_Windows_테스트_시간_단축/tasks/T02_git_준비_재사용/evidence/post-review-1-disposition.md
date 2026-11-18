# T02 사후 1차 처리

## 판정과 독립성

main이 제공한 별도 신규 맥락의 anthropic Claude Opus 5.5 reviewer는 코드 pass(blocking 0·should_fix 0·nit 5), openai Codex tester는 집중 검증 통과·전체 S-5 fail이다. Tester의 자동 부트 노출 제한은 원문에 공개되어 있으며 이번 실패 원인으로 채택하지 않았다. 전체 계약 미충족·목표 달성 미확인을 유지하고 done/커밋하지 않는다.

원문은 `post-review-1-stage1.md`, `post-review-1-stage2.md`, `post-tester-1-stage1.md`, `post-tester-1-stage2.md`다. 실행 원문 `post-tester-1-fixture-agent.tap`은 helper+agent-chain 31/31, `post-tester-1-harness-home.tap`은 HOME 검증 1/1이다. Tester는 세션 한정 임시 격리와 GIT_OPTIONAL_LOCKS=0을 사용했으며 PM 전체 단회 관측의 실행 환경과 구분한다. 여섯 파일을 읽어 시험명·코드·경로·판정만 있음을 확인했으며 실제 인증 값이나 비밀 원문은 발견하지 않았다.

## 비차단 지적 처리

1. TASK 접근의 첫 대상 HOME과 실제 seed 전용 HOME 차이: `pre-review-disposition.md`에 결정·이유·실제 검증을 보강했다. firstDestination 미사용 인자는 유지한다. 검토 정본 해시를 보존하며 기준 변경으로 취급하지 않는다.
2. `.git/commondir`·`objects/info/http-alternates` 미검사: 현재 prepare 두 개는 시험이 소유한 일반 git init만 생성한다. reviewer는 낮은 위험의 nit로 판단했다. 이번 지원을 임의의 외부 Git 원본 수용으로 확대하지 않으며, 두 파일을 명시적으로 거부한다고 주장하지 않는다. 범용 입력 지원은 별도 보완 사항이다.
3. readonly HEAD 확인 timeout 5초: 좁은 실제 Windows 검사와 전체의 fixture 소비 시험에서 timeout 실패는 관측되지 않았다. 가능성을 남기되, 관측 없이 timeout을 늘리지 않았다.
4. HOME 검증의 seed 접두사 결합·원본 Git 조회: 시험 내부 위치 식별이며 실제 조회는 readonly다. 원본 변경 검출은 별도 digest 검증으로 유지한다. 내부 명명 결합을 허용하는 시험으로 기록하고 제품 API로 확대하지 않는다.
5. 원본 초기화 실패 시 fixtureContexts 항목 잔존: 프로세스별 소유 tempRoot와 함께 exit에 회수되며 실패 원본은 정상 캐시에 등록되지 않는다. 이후 후보는 새로운 정확 키를 사용한다. 프로세스 수명 내 실패 항목의 조기 정리는 이번 필수 수정으로 삼지 않았다.

1단계의 환경변수 미설정·tempRoot 정규화·test-map 소비 누락 우려는 2단계에서 실제 helper와 common 규칙으로 해소됐다. 실패 candidate/부분 대상은 기존 tempRoot exit 정리로 관리한다. SHA/시각/index 영향은 기존 audit에 공개되어 있다. 비용 표본의 일반화와 전체 시간 개선 주장은 하지 않는다.

## 남은 차단

계측 없는 전체 종료 1과 기존 wrapper pass→fail을 보존한다. 내부 실패 이름·정확한 인과는 미확정이다. main 판단에 따라 추가 전체 실행·경합 수정·done/커밋 없이 사용자 작업 순서 결정을 기다린다. 코드 통과를 태스크 완료로 바꾸지 않는다.
