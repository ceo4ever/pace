# T01 TASK 증명 범위와 판정 주체 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

T01 계약 목표는 달성했다. 새 형식으로 증명 범위와 정당한 판정 주체를 먼저 확인하여 필요한 검토에 집중하고, 옛 TASK 호환·목적 대비 충분성·필수 안전을 보존했다. [독립 tester](evidence/tester-final.md)와 [같은 Claude 세션의 reviewer 2단계](evidence/reviewer-stage2.md)가 기준·목표를 대조했다. 첫 판단은 [reviewer R5](evidence/review-records/R5.json)와 [tester 첫 판단](evidence/tester-stage1.md)에 보존됐다. 운영에서 스스로 범위를 지키는 일반 효과와 bubble-catch 통과 회차는 설치 뒤 측정이며 이번 실측으로 보장하지 않는다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1·S-2·S-4: 구조·호환·CRLF·생성 TASK·check/done 시험 및 독립 tester |
| T-2 | 통과 | 프롬프트·reviewer 정본 대조와 최종 여섯 판정 원문 |
| T-3 | 통과 | S-3: 누락 1건 fail, 충분 범위 pass/확장 should_fix, 부족 범위 fail, 사람 원문 pass, 권한 대체/안전 제외 각각 fail |

## 단위 테스트

최종 선언 `npm run check`(타입 검사 + 전체 회귀)가 1035건 중 1018 pass·17 skip·실패 0으로 종료했다(248.2초, 종료0). [최종 전체 원문](evidence/check-declared-final.txt).

독립 tester 직접 실행: 관련 세 파일 40건·하네스 2건 통과, 타입 검사 통과. 최신 의미상 미정/TBD 문구를 읽은 뒤 agent-verify 11건도 재실행 통과했다. [결과 원문](evidence/tester-final.md).

기본 검사·병렬도2에서 변경 밖 브라우저·정션 보호·Telegram 실패 주입 시험이 번갈아 실패했다. 원문은 [첫 전체 검사](evidence/check-attempt1.txt), [중간 전체 통과](evidence/check-attempt2.txt), [브라우저 실패](evidence/check-complete-failed.txt), [정션 실패](evidence/check-final-retry-failed.txt), [병렬도2 실패](evidence/check-concurrency2-failed.txt), [직렬 실패](evidence/check-concurrency1-failed.txt)에 보존했다. [브라우저 단독](evidence/browser-isolated.txt)과 [정션 단독](evidence/dashboard-isolated.txt)은 통과했다. 병렬도 조정 뒤에도 기존 S-4b가 재현되어 코디네이터가 main의 동일 증상과 기존 이슈를 확인했다. [기존 S-4b 이슈](../../../../.pace/memory/telegram-flow-s-4b-단독-실행-실패.md), [P008 파일 전체 진단 40건 pass](evidence/telegram-file-diagnostic.txt), [단독 실패](evidence/telegram-isolated-failed.txt). 이후 코디네이터 지시대로 선언 명령을 다시 실행하여 최종 통과했다. main 결과는 전달받은 사실이며 직접 실행한 P008 결과와 구별한다. PROJECT 결정과 사건에 경로를 남겼다. 검사 선언·범위는 바꾸지 않았고 이슈는 열린 상태로 둔다.

## E2E

실제 소스 CLI와 Anthropic Claude Opus 5.5로 같은 예제 TASK의 다섯 유형을 검토했다. ⑤는 권한/안전을 나눴다. 모두 읽기 전용·교차 제공자·최초 전체 검토(rereview_of null)이며 원장과 원문 해시를 독립 tester가 대조했다.

- [① 절 누락: blocking 1](evidence/cases-run3/1-missing/review-records/R1.json)
- [② 충분 범위: pass, 확대 요구 should_fix](evidence/cases-run3/2-sufficient/review-records/R1.json)
- [③ 좁은 범위: blocking](evidence/cases-run3/3-too-narrow/review-records/R1.json)
- [④ 사람 원문 충실 전달: pass](evidence/cases-run3/4-human-original/review-records/R1.json)
- [⑤a 결정 대행: blocking](evidence/cases-run3/5a-substitute/review-records/R1.json)
- [⑤b 필수 안전 제외: blocking](evidence/cases-run3/5b-safety-excluded/review-records/R1.json)

첫 실측과 run2의 확대 요구 note 판정도 지우지 않았다. 문구·판정 지시 위치를 근본 조치하고 전체 사례를 run3으로 다시 검증했다. 확대 제안의 명시적 질문에 대한 규칙 준수 관측이며, 자발적 실사용 개선을 증명한 것은 아니다. 예제 승인 원문은 합성 자료이며 실제 배포 승인이 아니다.

## 리뷰

사전 R1·R2 pass blocking 0, [PRE-REVIEW](PRE-REVIEW.json)에 당시 해시와 원문을 연결했다. R1 should_fix를 계획에 반영해 R2를 받았고 R2의 주석 빈 값·실측 분리·원문 보존·승인 원문 fixture 제안을 구현했다.

구현 reviewer: 1차 pass 이후 R3 F1(구조 누락 단건 지적과 제한 재검토의 결합으로 안전 미평가)이 나와 [실패 시험](evidence/scope-red.txt) 뒤 전체 검토 복원으로 고쳤다. R4 재검토 pass, R5 전체 pass blocking 0, 2단계 계약 대조 pass. 의미상 미정/TBD는 단건 억제하지 않도록 명시했다. 임의의 LLM 규칙 오분류와 완전한 Markdown 해석은 관측 한계로 남긴다.

Tester: Codex p의 [첫 2단계 시도](evidence/tester-stage2-attempt1.md)는 EPERM 미실행과 당시 사례2 등급 차이로 fail이었다. 호스트의 별도 맥락 tester가 직접 실행·검출력·최종 사례를 확인해 pass했다. 같은 제공자 tester이며 Anthropic 교차 판정과 구별한다. 부트·git 맥락 노출과 주체 변경을 원문에 기록했다. 파서의 코드 블록/인라인 주석 결함은 [첫 RED](evidence/parser-red.txt), [인라인 RED](evidence/inline-red.txt) 이후 고쳤다.

반복 내용은 범위 확대 등급 혼동이었다. structure 층에서 특별 규칙과 일반 등급 안내의 충돌·모호함을 줄이고, should_fix를 확장 승인·반영 의무와 분리한 뒤 여섯 사례 전체를 재검증했다. [지적 처리와 한계](evidence/observations.md). 교본: typescript/INDEX·verification/INDEX — 임시 루트·거부 경로·상태 누출·대역/실제 CLI 경계를 대조했다.

## 남긴 것

T02에서 결정 주체와 단계 문서를 연결한다. 표지/기록 조작의 진정성과 임의 Markdown 전체 해석은 기계가 보장하지 않는다. 기본 전체 검사 불안정 이슈는 유지하고 finish의 선언 전체 검사는 별도로 통과해야 한다. 설치본 인수와 bubble-catch 운영 지표는 승인·병합 뒤 main 담당이다.
