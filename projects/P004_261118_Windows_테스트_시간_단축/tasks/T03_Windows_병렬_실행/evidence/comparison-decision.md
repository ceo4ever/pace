# 동시성 비교와 선택

정본은 `comparison-2026-11-18T13-42-41-253Z/comparison.json` 및 같은 그룹의 각 회차 raw spec/환경이다. 4→8→8→4 순서를 바꾸거나 실패 관측을 교체하지 않았다. 네 회차 모두970건·961통과·실패0·skip9, 원래 범위/skip 사유 대조 통과다. test-command 이름1건 변경과 새 검증2건만 의도한 차이다.

| 파일 동시성 | 표본 수 | 최소(초) | 최대(초) | 중앙값(초) |
|---|---:|---:|---:|---:|
| 4 | 2 | 692.948 | 702.170 | 697.559 |
| 8 | 2 | 633.831 | 657.639 | 645.735 |

8의 중앙값이4보다 약7.43% 낮아 사전5% 규칙에 따라8을 고른다. 두 표본의 운영 선택이며 통계적 개선율이나 향후 모든 환경의 최적값으로 주장하지 않는다. Windows 기본값과 첫 argv 시험 기대값만1→8로 바꿨으며 macOS/Linux의 기본값은 유지한다. 기본값 반영 뒤 test-command8건·typecheck·새 도구 strict tsc가 통과했다.

## 중간 독립 리뷰 지적 처리

`mid-review-1-stage1.md`와 `mid-review-1-stage2.md`는 독립 anthropic 신규 사후 맥락의 코드 pass(blocking0·should_fix2·nit4)다. 목표 달성 판정은 아직 대기다. 원문에 실제 비밀·계정 식별자는 발견하지 않았다.

SF-1/SF-2의 사후 검증은 `audit-comparison.ts`를 그룹 경로와 함께 실행해 `comparison-2026-11-18T13-42-41-253Z/environment-and-invocation-audit.json`에 기록했다. commit,95개 test SHA·runner/helper·도구5개 fingerprint, 실제 runtime 경로 상태와 로그를 제외한 diff stat, Node/npm/Git/Python·코어·메모리·전원·Defender 기록은 네 회차에서 동일했다. P004 evidence 밖 gitStatus 경로/상태도 동일하다. diff stat의 실제 차이는 질문·답 사건 때문에 project log 추가가5줄→7줄이 된 것과 합계151→153 insertions뿐이며 원문을 보존했다. 해당 기록과 진행 메모 갱신·읽기 리뷰/로그 조회는 수집과 겹쳤다. 추가 시험/성능 진단·source 변경은 없었다. 이 스냅숏이 모든 파일 본문의 연속 감시나 조용한 호스트를 증명한다고 주장하지 않는다.

각 raw의 `> node scripts/test.ts --test-concurrency=N`을 실제로 읽어4·8·8·4가 runner에 전달됐음을 확인했다. Node 내부 시간 겹침 검출은 동일 표본의1 RED/2 GREEN과 연결한다. 새 기본값5회에서는 원시 npm 줄에 override가 없는지 별도로 확인한다.

nit1의 도구 SHA 절대 키는 기존 측정 provenance를 보존하기 위해 이 그룹에서 바꾸지 않았다. nit2 min/max는 위 표에 공개했다. nit3 suites는 각 raw/저장본을 읽는 공용 parseText가 suites!=0을 거부하므로 이 프로젝트에서 모두0이며, 파일 정체성은 별도 프로파일로 보완한다. nit4 배리어 시간 제한은 바꾸지 않았고 실제4회 내 해당 시험이 전부 통과했다. 판정 완화·재시도는 없었다.

## 다음 검증

선택값 반영 소스를 고정하고 명시 override 없는 `npm run check` 새 연속5회를 수행한다. 비교 표본4회를 여기에 섞지 않는다. `assess-selected.ts`가 각 raw/JSON/시간과 T02 범위·skip 및 실제 npm 기본 호출을 검증한다. 실패·중단·수정 시 원문을 보존하고 새5회 묶음으로 구분한다. 이후 별도 프로파일·문서/브레인과 최종 tester/reviewer 판정을 완료한다.
