# T07 pace-team 스킬 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

저장소의 업무 근거와 승인 경계에서 역할을 고르고, 실제 호스트 적재 점검과 마감 회고로 연결하는 여섯 단계 스킬을 만들었다. Roblox는 게임 수명 단계와 공유 Studio 경계에서 역할을 분리했다. AI SQL은 문서·계약과 화면·셸을 각각 묶고 데이터 권한과 독립 검토를 분리했다. 두 설계의 출처와 금지·인계 규칙은 [팀 설계](team-designs.md)에 있다. 실제 두 저장소의 역할 운영과 도입 효과는 T08 인계 범위다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | 읽기 전용 입력 확인과 ①~⑥ 단계. 정상 단계 순서, 압박 2종의 결정 질문과 승인 보류, 이미 정해진 질문의 재질문 음성 대조. [행동](evidence/behavior-summary-r4.json), [입력](evidence/analysis-inputs.json) |
| T-2 | 통과 | 출처별 필수 업무 대응, 권한·병렬·독립성의 합침과 분리 이유, 근거 없는 역할을 검출하는 대조. [설계](team-designs.md), [업무표 검사](evidence/r5-design-coverage-check.json), [음성 대조](evidence/design-negative-controls.json) |
| T-3 | 통과 | 두 합성 Git의 팀 sync 차이 0, Claude와 Codex 적재 확인 총 26행, 실제 두 저장소와 보호 설정 전후 일치. [전후/결과](evidence/detailed-boundary-summary.json), [Studio sync](evidence/detailed-studio-sync.json), [문서 sync](evidence/detailed-document-sync.json) |
| T-4 | 통과 | 여덟 역할 원형의 하지 않는 일, init의 세 분석 모드와 dev 태스크 연결, 스킬 frontmatter와 설치 발견 경로를 확인했다. [정적 검사](evidence/static-skill-check.txt) |
| T-5 | 통과 | 완전 관측 후보는 병합 검토, 부분 수집 후보는 유지와 추가 근거, 반복 승인 지적은 경계 개선을 제안했다. 두 압박 변형과 거짓 통과 대조를 관측했다. [행동](evidence/behavior-summary-r4.json), [독립 최종 계약](evidence/impl-contract-closeout.json) |

## 단위 테스트

- `PACE_SKIP_BROWSER_E2E=1 npm run check -- --test-concurrency=1`의 정확한 건수와 제한을 [전체 검사](evidence/whole-check.txt)에 보존했다. 전체 1,363개 중 1,346개를 통과했고 17개를 생략했다. 실패는 0개다. 초기 실행은 dev 스킬 크기 상한을 25바이트 넘겼다. 연결 문장을 줄여 해당 검사 8개를 통과했다. R4 실행에서 기존 대시보드 정션 대조의 간헐 실패가 나타났고 단독 재실행은 통과했다. [초기 전체 검사](evidence/whole-check-r1.txt), [스킬 재검사](evidence/project-dev-size-r2.txt), [대시보드 단독 검사](evidence/dashboard-junction-isolated-r5.txt)
- 스킬 YAML, ①~⑥ 순서와 설치 시 경로 발견을 확인했다. Python 검증기의 PyYAML을 사용할 수 없어 Ruby/Psych로 헤더를 대조했다. [정적 검사](evidence/static-skill-check.txt)

## E2E

- 격리된 두 Git과 `PACE_HOME`에서 `team new`, `team sync`, `team sync --check --json`, 실제 호스트의 `team verify --all --agent`를 실행했다. Studio 9역할, AI SQL 4역할 원본과 두 생성물의 지문을 기록했다. 상세 원본은 업무·금지·승인·실제 인계 수신자를 담았다. 네 보고서의 원본 지문 26개가 각각 일치했다. 네 호스트 조합에서 Claude·Codex가 원본 적재를 관측했다. [요약](evidence/detailed-boundary-summary.json), [실측과 판단](evidence/verification-notes.md)
- 실제 다른 제공자의 행동 표본은 Anthropic의 정상 1종, 압박 2종이다. 정상 첫 실행의 회고 표현을 의미와 별도로 기계 판정한 실패를 보존했다. enum과 이유 필드를 구별했다. 다음 회차에서 단일 역할과 전체 검증 명령이 혼용된 사례는 스킬의 명령 안내를 수정했다. 최종 스킬의 정상·압박 실행과 음성 대조를 모두 확인했다. [초기 원문](evidence/behavior-summary-first.json), [확정 관측](evidence/behavior-summary-r4.json)

## 리뷰

- 사전 검토. 첫 호출은 180초 제한으로 미실행, 다음 계획은 교차 검토 통과 뒤 최소성 관련 blocking 1을 받았다. 역할에 필수 업무 또는 독립 검토의 근거를 요구하고 과잉 설계 및 두 압박 입력을 대조했다. 수정본 목표와 별도 계획 계약이 모두 통과했다. [판정 시도](PRE-REVIEW.json), [계약](evidence/pre-contract.json), [처분](evidence/pre-review-disposition.md)
- 구현 뒤. Anthropic 독립 목표 검토에서 업무표와 담당·운영 인계 누락을 발견해 두 차례 보완했다. 전체 업무표를 다시 대조한 최종 Anthropic 목표 검토와 별도 OpenAI 계약 검토를 확인했다. 네 호스트 조합의 실제 적재 실행과 별도 Anthropic 행동 관측을 확인했다. 최초 계약은 합성 원본의 범위·인계 표현이 기본값에 머물러 T-3을 차단했다. 상세 원본과 26개 실제 지문 대조를 추가한 뒤 독립 종결 검토를 받았다. [이전 판정](evidence/impl-contract-r5-initial.json) [독립 목표](evidence/impl-goal-r5.json), [독립 계약](evidence/impl-contract-closeout.json), [고정 파일](evidence/candidate.json)
- 교본. `skill-creator`의 최소 진입점·단계별 안내·역할 참고 자료 분리를 적용했다. 코드 교본 대상이 되는 제품 코드 변경은 없었다.

## 남긴 것

- [T08 인계](../../USER-VALIDATION.md)에 두 설계와 현장 검증 관측 범위를 연결했다. 사람 승인을 받은 main 병합·설치 뒤 사용자 측 역할 운영, Studio 직렬화, 실제 비용과 효과를 확인한다.
- 실제 호스트 관측은 합성 원본의 prompt 적재와 세 행동 입력으로 제한된다. 타 도구 설정과 현장 팀 효과는 별도 근거가 필요하다.
