# T01 에이전트 체인 설정 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

기준 T-1~T-3의 운영 실측과 S-5 전체 검사가 충족됐다. 두 독립 세션의 첫 판단과 계약 대조 및 최종 판정에서 T01 목표가 P-1·BR01 및 원격 요청 실행 준비 목적과 맞고 체인 준비 목표를 달성했음을 확인했다. 최종 tester·reviewer 모두 pass, blocking 0이므로 태스크 마감은 통과다. 전체 프로젝트의 Telegram 연결·기동·실사용 목표가 달성됐다고 주장하지 않는다.

독립 1·2단계 원문: evidence/post-tester-phase1.md, evidence/post-tester-phase2.md, evidence/post-reviewer-phase1.md, evidence/post-reviewer-phase2.md. 첫 판단에서 제기된 위험과 계약·소스 대조 후 판정 변경의 이유는 각 원문에 보존했다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | 캡틴 승인·적용 전 계획 로그, evidence/operational-chain-apply.json: default Claude/p→Codex/p, 설치본 해시 일치, setup exit 0, 타 설정 보존 |
| T-2 | 통과 | S-0·S-2·S-3·S-3p: `evidence/readonly-observations.json` 및 positive-summary JSON, 두 실행기 읽기·차단·실제 파일 변경 대조. S-4c: `evidence/live-chain-observations.json` 의 실제 default 읽기·검증 집합 선택 |
| T-3 | 통과 | S-4: evidence/daemon-install-plan.txt, 계획 전용 exit 0·체인 준비됨, 로그온 등록 미실행 |

## 단위 테스트

`node --test test/agent-chain.test.ts`: 27 pass·0 fail, 증거 evidence/chain-unit-check.md. 미검증 단계 제외와 fallback 분기는 모사 시험이며 실제 Codex fallback 유도와 구분한다.

선언 전체 검사 `npm run check`: exit 0, tests 1,000 · pass 991 · fail 0 · skipped 9 · cancelled 0. 원문 `evidence/repository-check.log`, 집계·원문 SHA-256·기존 skip 목록 `evidence/repository-check-result.json`. 전체 검사 1회이며 총 경과 약 13분 5초다. 건너뜀 9건은 sh 실행 불가 3건, POSIX 지연 git 2건, macOS·Linux 설치 2건, Windows Antigravity 설치 실기 1건, 루트 교체 훅 제약 1건이다. 건너뜀을 실기 통과로 주장하지 않는다. 독립 최종 확인도 통과했다.

## E2E

기존 격리 합성 증거는 `evidence/isolated-test-summary.md`, 운영 반영 및 실제 default 읽기는 `evidence/operational-validation.md` 에 연결했다. 두 실행기 읽기 전용에서는 합성 파일 변경이 없었고 Codex는 실제 정책 거부, Claude는 CLI 도구 목록 제한을 관측했다. 양성 대조에서는 둘 모두 기존 파일 변경과 probe·shell-probe 생성을 관측했다. 사용자 전역 Git 파일은 전후 해시가 같았다.

Claude 외부 경로 양성과 양쪽 local Git 쓰기 허용 대조는 미확인이다. 해당 차단 판정은 단순 파일 부재가 아니라 Claude의 쓰기·셸 도구 미노출과 Codex 실제 권한 거부를 근거로 삼는다. 원본 CLI 출력은 임시 보관하고 저장소에는 민감정보 없는 관측만 남겼다.

## 리뷰

사전 검토: anthropic 1차 fail blocking 1 → 같은 세션 2차 pass blocking 0. 원문·TASK 스냅샷·해시·연속성은 PRE-REVIEW.json 및 `evidence/pre-review-1-phase2.md`, `evidence/pre-review-2.md` 에 있다. 운영 반영 전에 pass를 확보했다.

1차: tester 보류(전체 검사 대기) · reviewer blocking 0(S-5 보류) — 서로 및 사전 검토와 분리된 anthropic Claude 세션, 보고 모델 claude-opus-5-5. 명령을 직접 실행하지 않았으며 관측과 코디네이터 직접 확인 및 소스 발췌로 판단한 한계가 있다. should_fix 처리·handoff는 `evidence/post-review-resolution.md` 에 연결했다. 전체 검사 결과를 받은 같은 세션의 최종 확인 전 done·커밋하지 않는다.

최종 확인: tester pass blocking 0 · reviewer pass blocking 0 — 각 같은 세션이 전체 검사 시작·끝 원문 발췌·skip 9·지적 처리 기록을 대조해 S-5를 포함한 T01 목표 달성을 확인했다. 원문 `evidence/post-tester-final.md`, `evidence/post-reviewer-final.md`. main이 전체 로그 집계·원문 SHA-256과 TASK 정규화 해시·사전 pass 일치를 직접 확인했다. 검토자가 검사를 직접 재실행한 것은 아니며 성공한 전체 검사를 반복하지 않았다.

비밀 검사: `node scripts/secret-scan.ts` exit 0, 2,640개 파일 통과. 증거 `evidence/security-check.md`.

교본: 해당 없음(제품 코드 변경 없음).

## 남긴 것

T02: Telegram 봇·포럼 그룹·허용 사용자 및 실제 전송 결정을 확인해야 한다. 이번 승인에는 Telegram·로그온 등록·새 어댑터 설치가 포함되지 않는다.

T03·T04: daemon 환경 PATH·인증·설치본·긴 경로 확인. Claude는 Windows 8.3 짧은 임시 경로에서 읽기가 막혔고 긴 실경로에서는 성공했다. Codex fallback 실유도는 미실행이며 필요 시 후속 검증으로 선택한다. 사용자 hook 격리를 OS 전체 쓰기 금지 보장으로 확대하지 않는다.

READ_ONLY_PROVEN의 실측 버전 주석 및 버전 변경 시 자동 재검증 개선은 제품 코드 제외 범위여서 별도 메모리로 발의한다. 같은 대상의 성공한 격리 시험은 반복하지 않는다.
