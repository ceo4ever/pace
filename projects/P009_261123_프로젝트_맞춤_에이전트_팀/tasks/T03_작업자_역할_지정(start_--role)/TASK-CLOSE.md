# T03 작업자 역할 지정(start --role) — 마감

- 태스크: [TASK.md](TASK.md) · 판정: 통과

## 목표 달성 판정

저장소 역할로 처음부터 일하여 역할 재지시 보정을 없앤다는 상위 목적과 맞는다. 명시 구성원 > PROJECT 구성원 > 없음 선택, 안전 선검사·실행 직전 재검증, 원본 읽기 prompt와 별도 model/effort 인자, 요청과 실제 관측 구분, 미지정 호환을 구현했다. 최종 코드의 Claude·Codex 각 첫 정상 시작에서 정상 업무·역할 밖 인계·재지시와 보정 필요 순간 0건을 확인했다. 두 실측은 맞춤 계약 사례이며 일반 템플릿의 판단·지속 효과·권한 집행 증명으로 확대하지 않는다.

독립 최종 첫 판단은 [reviewer](evidence/impl-review-final-stage1.json)·[tester](evidence/tester-final-stage1.json)다. [reviewer 2단계](evidence/review-final-stage2.json)와 [tester 2단계](evidence/tester-final-stage2.json)는 각각 계약 목표 달성·blocking0/pass다. 상대 최종 판정·마감 게이트는 각자 대신 판정하지 않았으며 PM이 두 실제 원문과 검사·증거를 합쳐 T-5까지 달성으로 판단했다. TASK-CLOSE 이후 check·done은 아래 판정을 전제로 별도로 실행한다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| T-1 | 통과 | S-1 실제 API/CLI의 명시·PROJECT·없음, 잘못된 이름·원본·호스트 선거부, 기존 checkout·복구 ref, 준비 중 변경 보류. [관련57건](evidence/final/focused-tests.txt) |
| T-2 | 통과 | S-2 두 호스트·tier/필드별 override·default effort, 실제 단일 argv·POSIX 인용 sentinel, [원본 첫 지시·인자 영수증](evidence/final/host-start-intents-current.json) 및 [지문/실측 대조](evidence/final/check-host-proof.mjs) |
| T-3 | 통과 | S-3 role 기록 엄격 검증·왕복, planned/arguments/unconfirmed/rejected와 runtimeObserved=false, 옛 사건·역할 없는 golden spec·큰/하드링크 PROJECT 호환 |
| T-4 | 통과 | S-4 [현재 관측](evidence/final/host-observations.json), [10개 실제 송수신](evidence/final/host-messages.json), [산출](evidence/final/host-results), [독립 대조 실행](evidence/final/proof-pass.txt). 역할 표식·실제 세션 model/low·업무·인계·미서명·성공 종료 보고, 모든 역사적 시도 보존 |
| T-5 | 통과 | 문서·전체/비밀 검사와 독립 tester/reviewer 두 단계 모두 blocking0/pass, 위 원문 및 [최종 비밀 검사](evidence/final/secret-scan-accept.txt) |

## 단위 테스트

- 최초 CLI RED 2건과 구현 후 수정 RED 4건을 보존했다. [후속 RED](evidence/final/review-fixes-red.txt)는 roleless PROJECT 호환·비밀 이름·설정 경계·미확인 상태 검출이다.
- `node --test test/project-role.test.ts test/project-log.test.ts test/project-metrics.test.ts test/team.test.ts test/worker-settings.test.ts`: 57/57 통과. 독립 tester도 직접 재실행했다.
- `PACE_SKIP_BROWSER_E2E=1 npm run check`: 타입 검사 포함 tests1074/pass1057/fail0/skip17, 종료0. [원문](evidence/final/check.txt). 최종 코드·문서·시험은 독립 첫 판단 뒤 바뀌지 않았으며 [해시 연결](evidence/final/source-review-binding.json)로 확인했다.
- 직전 전체의 기존 dashboard-init 형제 저장소 스냅숏 1건 실패는 [원문](evidence/final/check-final-fail.txt)을 보존했다. [단독](evidence/final/dashboard-recheck.txt)과 무변경 전체 재실행이 통과했고 원인은 미확정이다. 시험/제품을 약화하지 않았으며 프로젝트 이슈 `dashboard-init-형제-스냅숏-간헐-실패`로 추적한다.

## E2E

- 최종 두 실제 Orca 작업자는 PACE 임시 Git 저장소와 별도 PACE_HOME에서 source `project start --role`로 시작했다. 중간 설정은 medium tier→low이며 실제 모델은 Claude claude-opus-5-5/low, Codex gpt-6.2-sol/low다. 전달 argv·실제 start 로그·역할 지문·세션 원문 SHA/메타행·산출 사본·10개 메시지·성공 상태를 [증명 스크립트](evidence/final/check-host-proof.mjs)가 직접 대조한다. 원시 채팅 전체·인증 파일은 복사하지 않았다.
- Claude는 프로젝트 폴더 아래 1개 test 안에 정상/0/음수를, Codex는 루트의 3개 test로 검증했다. PM 재실행은 각각 1/1·3/3 통과다. 맞춤 역할에만 있는 식별어가 결과에 나타났고 두 호스트 모두 자기 산출 독립 승인 요청을 reviewer로 인계·signoff 미작성했다.
- launcher adapter는 local·기존 부모 Run 라우팅과 run-current→run-show 조회만 보완하며 spec/model/effort는 바꾸지 않는다. 처음의 라우팅 오류 두 건은 worker 생성 전 실패했고, 그 후 이전 코드 medium 실측 두 건과 현재 코드 low 실측 두 건을 모두 구분해 보존했다. 현재 pair의 첫 정상 시작은 모두 성공이다.
- 자식은 설치본 pace가 PATH에 있고 PACE_HOME은 미상속임을 보고했다. 사전 2단계 권고(b)에 따라 PATH shim 대신 매 PACE 호출에 절대 source CLI+임시 PACE_HOME을 명시했다. 실제 호출 후보 모두 임시 홈을 포함하고 bare pace 후보는 없다. 알려진 보호 메타데이터 9항목은 전후 동일하나 전체 홈 감사는 아니다.
- 작업자는 성공 보고 뒤 idle/reclaimable 상태다. 프로세스 종료·권한 차단으로 확대하지 않는다. 브라우저 코드는 바뀌지 않아 Orca 전체 검사에서 브라우저 E2E를 제외했다.

## 리뷰

- 사전 R1~R3 이력은 [PRE-REVIEW.json](PRE-REVIEW.json), 2단계 상세 판정은 [연결 문서](evidence/pre-review-response.md)에 보존했다. R1의 작업 문서 조기 노출은 숨기지 않았고 후속 TASK-only 새 맥락 판정 후 구현했다.
- 초기 구현: reviewer 첫 단계 pass·2단계 pass/blocking0, tester 첫 단계는 중첩 `node --test`의 NODE_TEST_CONTEXT 상속으로 증거 스크립트 stdout이 비어 fail했다. 테스트 수 단언은 유지하고 자식 환경만 격리한 뒤 같은 tester 재검증·2단계가 pass했다. 모든 원문을 고유 경로로 보존했다.
- 초기 2단계 should_fix의 roleless PROJECT 엄격 읽기 회귀, 실제 CLI의 비밀·1024자·Unicode/C1/format 제어·PROJECT 손상/삭제·unconfirmed/rejected 경로 부족, LF 정규화 지시를 반영했다. 관련 RED→57건/전체 통과·현재 코드 실제 low 실측을 다시 수행했고 최종 tester/reviewer를 각각 새 맥락으로 열었다.
- 최종 reviewer 1·2단계 pass/blocking0. 2단계는 같은 Anthropic의 다른 새 맥락에 첫 원문을 전달했으며 동일 reviewer 세션 재개나 새 블라인드로 주장하지 않는다. tester 1단계 조건부 pass→같은 첫 tester 세션의 2단계 pass/blocking0이며 adapter를 직접 감사하고 증명 스크립트를 재실행했다. 작성자 Codex/OpenAI와 검토자 Claude/Anthropic는 다른 제공자다.
- CRLF 실제 Windows 관측과 portable 지문 명령 예시는 should_fix로 남긴다. 현재 독립 LF 기대해시 단위 시험·정규화 지시로 T03 계약은 충족한다는 reviewer 판정이며 프로젝트 이슈 `역할-지문-crlf-호스트-대조`에 등록했다. final 증거 생성 뒤 비밀 검사를 다시 실행했고 실행 시각은 별도 영수증에 연결한다.
- 최종 tester SF1/SF3: S-4의 옛 host-role-start.md는 당시 코드의 역사적 기록으로 보존하고 현재 판정은 위 final 증거로 연결했다. TASK 접근의 PATH shim은 사전 2단계 권고(b)에 따른 절대 source CLI+명시 임시 홈 방식으로 대체했으며 원 TASK 해시를 소급 수정하지 않았다.
- 최종 tester SF2: 새 branch는 PROJECT 선택값을 main 작업 파일에서 읽고, 팀 원본은 당시 HEAD에서 읽는다. startProjectRaw는 worktree 생성 전에 프로젝트 폴더를 정의 커밋하므로 그 PROJECT가 새 checkout에 포함된다(harness.ts의 git add/commit→worktree add 순서). 복구 branch는 해당 ref, 기존 실행은 그 checkout을 읽는다. 준비 단계 등이 바꾸면 실행 직전 재확인으로 보류한다. 모든 파일을 최초 HEAD에서 읽는다고 확대하지 않으며 이 실제 경계를 여기 명시한다.
- note 처리: strict role 키/false 값 정책은 향후 스키마 버전 변경 때 호환 설계를 함께 한다. `--launch --no-launch`는 기존 경로 재실행 준비·안내만 만드는 조합이다. roleless PROJECT의 큰 ref 읽기는 이전 호환을 위해 유지한다. RED 접두와 하드링크 공통 판독기 검증은 nonblocking이다. 역할 밖 인계의 일반성은 BR08에 후속 등록했다. 기존 launch 실패도 command ok=true일 수 있으므로 role.settingsStatus를 구분한다.
- 교본: TypeScript/verification 색인·security — 외부 JSON 타입 가드, 비밀/경로/파일 경계, 실행 전 거부, shell 없는 argv와 인용, 별도 기대해시·golden·음성 sentinel·실제 호스트 대조. 자동 문서 노출·바깥 교본/세션 열람 한계는 각 reviewer 원문에 공개했다.
- PM 절차 오류로 TASK-CLOSE 작성 전 check 1회를 불필요하게 호출해 문서 없음으로 거부됐다. 사건 note로 구분했으며 최종 문서·판정 확보 후 올바른 순서로 재검사한다.

## 남긴 것

- T04: 같은 적재 지시로 정상·미적재·원본 삭제 대조를 구현한다. 질문에 기대 답을 넣지 않고, 대조 세션은 원본/생성물에 접근 불가한 조건을 증명해야 한다. 원본 시작 후 제거·실제 읽기 실패 보류 행동은 여기서 닫지 않았다.
- T04/T08 및 호스트 실사용 후속: Windows CRLF의 정상 원본 오보류, 기본 템플릿/실제 팀의 새로운 상황 인계를 추가 대조한다. 이번 맞춤 대본 인계를 일반 판단과 합치지 않는다. BR08의 T03 인계 대조와 위 이슈에 연결했다.
- 전달 설정과 실제 적용을 계속 분리한다. prompt/tools는 권한 집행이 아니며 T05 잠금·T09 소통 봉투·T08 실제 저장소 권한/운영 실증은 별도다.
- 기존 dashboard snapshot 간헐 실패 원인은 미확정이며 실패 원문·재현 조건을 수집한다. 전체 프로젝트 finish와 병합 승인 절차는 남아 있다.
