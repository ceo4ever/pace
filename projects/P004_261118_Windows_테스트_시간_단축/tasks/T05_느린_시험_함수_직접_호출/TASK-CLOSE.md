# T05 느린 시험 함수 직접 호출 — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

반복 CLI 기동 비용을 줄이면서 실제 Git/명령 진입/장애 주입의 검출력을 지키는 목표를 달성했다. 상위 목적은 Windows에서 전체 검사를 자주 실행할 수 있게 하는 것이다. 로직 시험3개만 실제 main 직접 호출로 전환했고 대표 CLI70블록과 EIO 실제 주입4회를 유지했다. 같은3개 사례의 단회 전후121918.0488→107391.3875ms(11.915%)는 좁은 관측이다. 전체 중앙705472.9278ms로 기준선의49.49%가 된 것은 P004 누적 변경의 결과이며 T05 단독 기여로 주장하지 않는다.

독립1·2단계 원문은 `evidence/function-independent-post-review/`와 `evidence/final-independent-review/`에 있다. 최초 함수 코드 검토 때 reviewer는 새 독립 맥락이었고, 이후 최종 검토는 같은 맥락의 연속 재검토라 완전히 새로운 블라인드 검토가 아니다. tester도 main이 공급한 독립 검토를 이어 수행했다. 최종 reviewer/테스터가 각각 T-1~3·P-5/P-6 충족과 차단0을 확인했다. 동일 Windows PC의 계약 목표 달성이며 다른 장비/OS의 속도 보장은 미확인이다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1/S-3/S-5: `evidence/candidate-time-comparison.json`, `evidence/cli-retention-catalog.json`, `evidence/harness-full.log`, `evidence/final-independent-review/tester-stage2.md` |
| T-2 | 통과 | S-2~5/S-8: `evidence/function-mutations/`, `evidence/wrapper-source-smoke.json`, `evidence/wrapper-validation/reconciled-manifest.json`, `evidence/final-v2-views/manifest.json` |
| T-3 | 통과 | S-6/S-7: `evidence/wrapper-final-results.md`, `evidence/wrapper-final-binding.json`, `evidence/final-independent-review/reviewer-stage2.md`, `evidence/final-independent-review/tester-stage2.md` |

## 단위 테스트

전환 전후 같은 이름 필터3건 모두 통과했다. 어댑터 신규1건은 fixture 내 PID/세대 재사용·HOME 전환·cwd/env/출력 복원·실제 CLI 예외2/1/1 및 stderr 동등성을 확인했다. 하네스 파일 전체74건 통과·실패/취소/skip0이다. 변이8실행(4쌍)은 같은 원래 단언에서 모두 실패했다. M1은 status 단언에서 먼저 검출되어 뒤 무변경 byte 단언까지 도달하지 않았다. M2는 BL 생명주기와 EIO의 실제 직접 merge 뒤 완료 단언에서 검출됐다. M3는 유지한 실제 CLI의 tmp 잔존 단언이며 직접 전환의 별도 표본이 아니다. `evidence/function-mutations/summary.json`과 원문에 연결했다.

Telegram은 save 순번 대신 n3 토픽 표 상태의 최초 저장에만 오류를 주입했다. 원래4개 단언을 유지하고 주입1회·의도 영속화·실제 토픽 생성1회를 추가 확인했다. 지연된 offset 저장의 구식 순번 실패와 의미 주입 통과, bind/new rollback 제거 실패를 소유 사본에서 대조했고 파일 전체39통과·기존 skip1이다. 원문은 `evidence/telegram-validation-2026-11-18T19-36-55-780Z/`, `evidence/telegram-file-full.log`다.

Windows 래퍼는 같은 Bash의 실제 command-v 결과를 Windows로 변환하고 lstat 일반 파일·설치 bin 부모·native 파일·bigint dev/ino를 확인한다. 원래 표기는 stderr에 남기며 &&로 실패를 전달했다. 파일 전체10건 통과, 다른 파일 오지정1건은 새 부모 단언124행에서 실패했다. 그 뒤 inode 단계는 미도달이다. 승인된 별칭 대조는 /tmp와 /c의 같은 파일 허용과 다른 파일 거부를 별도로 확인했다. 버전·실제 훅·인자·이름·skip·timeout을 유지했다. `npm run typecheck`도 종료0이며 자세한 원문은 `evidence/wrapper-implementation-results.md`다.

## E2E

새 비계측 전체 세트 `evidence/t05-wrapper-final-2026-11-18T22-44-36-407Z/`는700562.8303/707019.9272000002/705472.9278ms다. 각 종료0·996건/987통과/실패취소0/skip9다. 원래 T01 비계측3회의 원값 중앙1425464.3326999997ms 대비 최종705472.9278ms×2=1410945.8556ms로 절반 조건을 충족한다. 기존 이름/판정/skip사유를 T03다섯회 각각과 대조했고 기존95파일 중92개 byte 불변·정확한3개 예외·T04신규25+어댑터1을 확인했다. helper/runner도 그대로다.

시작종료609개 소스·도구13개·HEAD는 동일했고 T04 기존 최상위 증거 byte를 유지했다. `evidence/wrapper-final-launch.json`, `evidence/wrapper-final-binding.json`, T04의 runtime-t05-wrapper 스냅숏에 근거가 있다. 현재609개 측정 byte와 Git 줄바꿈 정규화 후 blob 식별자는 `evidence/closing-source-worktree.json`에 연결한다. 마감 커밋 뒤 실제 HEAD blob과의 동일성도 프로젝트 마감에서 확인한다. 스냅숏은 연속 감시나 호스트 부하 동결이 아니다.

원래 무효3세트(Telegram, stale-lock, Windows 문자열 비교)·모든 진단/도구 오류와 순서 실수는 보존하고 최종 표본에 합산하지 않았다. 집중 판독기의 custom 메시지 형식 오판과 최종 판독기의 반올림 literal 엄격 비교는 각각 도구 종료1로 남겼다. 전자는 기존 소스SHA/124행 stack, 후자는 원래 baseline 원문/회차 원값으로 읽기 검증만 정정했으며 새 시험/측정0이다. 최초 부분 final-views와 실행 도구는 보존하고 최종 읽기 결과는 별도 final-v2-views다. 도구1개가 종료 스냅숏 뒤 바뀐 전후 SHA도 `evidence/wrapper-final-read-reconciliation.json`에 분리했다. 세 측정 원문/시간은 바꾸지 않았다.

## 리뷰

- 사전: 최초 조건부 중단, Telegram 보완, 함수 계획 fail B2 후 같은 reviewer pass B0, Windows 계획 pass B0/SF2를 각각 새 TASK 해시/PRE-REVIEW 원문으로 보존했다. 함수 B1 공유 상태·B2 bin 오류 계약, SF-A raw 출력·SF-B 실제 변이 import 경로 및 Windows 일반 파일/설치 bin·원래 표기 진단을 반영했다.
- 사후1차: 새 anthropic reviewer 코드 pass B0/SF0 nit4 및 openai tester T-1/P-5·T-2 집중 증거 pass. 당시 전체 실패/T-3/P-6 미충족을 그대로 유지했다. 원문은 `evidence/function-independent-post-review/`다.
- 사후 최종: 같은 독립 anthropic Claude Opus5.5 reviewer pass blocking0 should_fix0, 같은 독립 openai Codex tester pass blocking0. T-1~3/BR05/P-5/P-6 충족이다. `evidence/final-independent-review/provenance.json`에 원문4개·출처/SHA·연속성을 연결했다. 읽기 검토이며 별도 전체 재실행은 하지 않았다. main이 양쪽 결과를 받아 마감 승인했다.
- 교본: typescript·verification — 공유 상태/출력 복원, 오류 성공 은폐, 구현 복제 검사와 mock 과용을 대조했다. 실제 제품 main/Git/CLI·원래 단언의 변이 검출 및 정확 byte 감사로 검증했다. 브라우저/GUI·외부 서비스·추가 작업자는 필요하지 않았다.

## 남긴 것

같은 fixture 자식의 모듈 상태 재사용은 현재 project 경로의 정적 감사와 실제 사례로만 확인했다. 범용 안전성, 미등록 자손 완전 회수, 별칭 전체 실패의 역사적 원인, 다른 장비/OS 성능은 보장하지 않는다. 상대적으로 좁은 절반 여유는 약7.259초이고 표본은3회다.

reviewer nit는 실행 소스를 바꾸지 않고 이월했다: bin 오류/legacy 후처리 중복, direct 변수 가림, Telegram save 훅의 단언 진단성, argv[1] 재실행 정적 감사 범위, wrapper custom 메시지와 inode 단독 음성 부재다. 차단이나 should_fix는 남지 않았다. 목표 도달 후 전환을 더 넓히지 않는다. 프로젝트의 전체 diff 보안·별도 목표 판정 및 finish 필수 전체 검사는 프로젝트 마감에 남기며 그 실행은 P-6 표본에 넣지 않는다.
