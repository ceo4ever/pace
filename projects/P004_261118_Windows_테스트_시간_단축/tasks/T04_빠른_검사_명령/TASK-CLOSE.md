# T04 빠른 검사 명령 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

설치 형태의 PACE CLI가 외부 Git 작업본의 관련 단위와 명시된 사전 검사를 실행한다. 범위가 불확실하면 실제 전체 검사를 실행하며, 실패1과 확인 불가3을 성공으로 숨기지 않는다. 독립 reviewer와 tester가 수정본의 T-1~3 및 P-4를 통과로 판정했다. Windows와 공개한 작업본·신뢰 경계 안에서 목표를 달성했다. 전체 시간 목표 P-6은 별도 최종 세 회에서 판정한다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1/S-2/S-6 관련 단위 합집합·중복·실제 설치형 Node/Python 및 사전 검사. `evidence/post-review-focused-all.tap` 및 `evidence/post-tester-2-phase-3-retest.md` |
| T-2 | 통과 | S-3~5 삭제·숨김 index·sparse 실제 전체 전환, 실패1·예외3, 기존 회귀. `evidence/post-review-focused-index-exception-2.tap` 및 `evidence/post-tester-2-round2-index-verified.jsonl` |
| T-3 | 통과 | S-7 최종 빠른3회·S-8 수정 전체995건·S-9 문서 예시 실행. `evidence/fast-v2-runtime-binding.json` 및 `evidence/runtime-v2-run-binding.json` 및 `evidence/t04-fixed-full-2026-11-18T18-29-13-627Z/t03-regression-comparison.json` |

## 단위 테스트

최종 focused 원문은 새25건과 기존11건, 총36건 통과·실패/취소/skip0이다. 실제 설치형 CLI·Git·셸·언어 드라이버를 사용했다. 숨긴 B 단위의 실제 실패를 부분 통과로 놓치던 RED, staged 삭제와 같은 경로 untracked 공존, sparse, 사전 검사 뒤 시험 소실을 보존했다. 수정 후 숨김/삭제/sparse는 실제 전체 실행과 index byte 불변을 확인했고, 실행 경계 예외는 전체 재시도 없이3이다. 이미 관측한 실패1은 이후 예외로 덮지 않는다.

새 독립 tester는 집중5건과 별도 외부 Git 표본4건을 직접 실행했다. 최초 표본은 PowerShell 입력 인코딩으로 한글 검사 라벨이 손상되어3이었다. 코드 포인트로 같은 라벨을 만든 뒤 네 표본이 통과했으며 실패·성공 원문을 모두 보존했다. `evidence/post-tester-2-round2-index-observations.jsonl` 및 `evidence/post-tester-2-round2-index-verified.jsonl`에 구별되어 있다.

## E2E

- S-6: 실제 APP_PARTS 복사본에 node_modules 없이 외부 Git에서 bin/pace.ts와 소유 .cmd를 실행했다. 실제 Node/Python driver의 pristine 실행과 관측 prefix 실행을 구별했다. 사용자 설치기·전역 설정을 실행하지 않았다.
- S-7: 최종 빠른 세 회는15.2985854/14.7455398/14.7940135초, 중앙14.7940135초다. 준비4.6864145초는 별도다. 실제 typecheck와 scout-card 두 시험 파일11건을 실행했고 부분 통과, 전체 전환 없음이다. `evidence/fast-2026-11-18T18-26-09-503Z/summary.json` 및 같은 폴더 environment/results/run 로그가 원문이다. 설치 bin/src97개 SHA를 v2 전체 직전 snapshot과 대조해 차이0을 `evidence/fast-v2-runtime-binding.json`에 기록했다. 개발 사본의 TypeScript에만 기존 node_modules를 연결했다. 원래 전체 대비1.04%, T03 전체 대비2.17%는 서로 다른 범위의 지연 비교이며 P-6 증명이 아니다.
- S-8: 수정본 실제 `npm run check`는710711.7803ms·종료0,995건 중986통과·실패/취소0·skip9다. T03 기본4 다섯 회 각각과 기존970건의 이름·판정·skip 사유를 대조했고, 기존95개 시험/runner/helper 본문은 그대로이며 새25건이 추가됐다. 원문은 `evidence/t04-fixed-full-2026-11-18T18-29-13-627Z/run-1.log`다. 607개 실행 파일의 시작·종료 files 배열 SHA가 같고 JSON 차이는 captured 시각뿐이다. snapshot은 연속 감시가 아니다. `evidence/runtime-v2-comparison.json` 및 `evidence/runtime-v2-run-binding.json`에 focused와 전체의 최종 시험 소스 연결도 있다.
- 초기 v1 전체991건·710587.2781ms 및 빠른 중앙14.687초는 당시21건 시험 소스의 역사적 결과다. 수정 후995건/25건 및 최종36건 focused와 섞지 않는다. v1 실행 소스는 실제 보존 사본과 당시 SHA로 검증했고 원본을 덮어쓰지 않았다. `evidence/v1-source-provenance.json` 및 `evidence/runtime-v1-regression-revalidated.json`에 연결했다. 중간 실패와 재검증 이유는 `implementation-evidence.md`와 `evidence/post-review-1-disposition.md`에 남겼다.
- S-9: README의 채택 JSON을 실제 외부 Git fixture에서 실행했다. checks 명시/기준 commit과 동일 map/명시 신뢰/수동 의존성 매핑/전체 전환/미실행3 및 커밋 변경 제외를 README·AGENTS·개발/초기화 스킬에 기록했다. 기존 all/finish 전체 경로는 유지했다.

## 리뷰

- 사전: 독립 anthropic reviewer의 초기 blocking2를 반영해 같은 reviewer의 새 TASK 해시 검토 pass blocking0. PRE-REVIEW 원문과 처리 기록을 보존했다.
- 사후1차: 독립 reviewer와 tester fail. staged 삭제 공존 및 숨김 index로 부분 성공이 가능한 차단 사항을 수정했고 sparse·예외 분류·증거 연결도 보완했다. 원래 실패 원문과 수정 전 RED를 보존했다.
- 사후2차: 같은 anthropic Claude Opus5.5 reviewer 코드 pass blocking0 should_fix1. fast-v2 추가 검토에서 should_fix0, T-1~3/P-4 충족. `evidence/post-review-2.md` 및 `evidence/post-review-2-fast-addendum.md`다. 남은 설치97개 SHA 연결 nit는 위 산출물로 보완했다.
- tester 재검토: 같은 독립 openai Codex tester T-1~3 pass, 차단 결함 없음. `evidence/post-tester-2-phase-3-retest.md`다. 전체를 독립 세션에서 다시 실행하지 않은 한계를 공개했다. 원문 출처·SHA·민감 검사 결과는 `evidence/post-review-2-provenance.json`이다. (main 판단) 두 판정과 증거 연결을 받아 추가 전체 없이 마감한다.
- 교본: typescript·verification — 공유 가변 상태·구현을 베낀 검사·오류 성공 은폐·mock 과용을 대조했다. 실제 실패 sentinel, 프로세스 상태, 설치형 경계와 독립 표본을 사용했다. 사용 기능은 Git/파일/CLI와 독립 검토이며 브라우저 조작은 필요하지 않았다.

## 남긴 것

숨김 플래그나 sparse가 하나라도 있으면 관련 없는 변경이어도 보수적으로 전체 검사한다. 실행 전 불확실성은 전체 전환이고, 사전 검사 이후 예상 밖 예외는3으로 끝내며 전체를 재시작하지 않는다. ignored 입력·수동 map의 전이 의존성 누락은 자동 발견하지 않는다. 선언은 신뢰하는 코드 실행이며 샌드박스가 아니다.

실제 설치기·POSIX 셔임/python3·POSIX 프로세스 그룹 종료와 다른 프로젝트의 폭넓은 속도는 미검증이다. Windows Store Python alias는 실제 시작 후 실패1이며 명령 발견만으로 Python 가용성을 보장하지 않는다. Windows 임의 자손 완전 회수도 보장하지 않는다. 초기 fixture 정리 EPERM의 OS 원인은 미확정이며 유한 수명 자식 종료 확인 후 재검증 통과가 재발 방지 증명은 아니다.

T05는 BR05의 조건부 중단을 먼저 판단한다. T04 한 번710.712초는 P-6 기준712.732초 아래지만 최종 세 회 중앙값/실패0/범위 보존 판정은 남았다. 별도 승인된 계획에 따라 현재 소스의 최종 세 회를 측정하고 목표가 충족되면 불필요한 함수 전환을 중단할 수 있다. 목표 미달·실패는 관측을 숨기지 않고 다음 판단으로 올린다. 측정 중 다른 시험/진단과 실행 소스 편집은 겹치지 않았지만 읽기·증거 기록 및 호스트 부하를 정량화하지 않았다.
