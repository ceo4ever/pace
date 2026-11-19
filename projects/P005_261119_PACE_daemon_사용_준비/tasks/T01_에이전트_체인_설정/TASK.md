# T01 에이전트 체인 설정

- 프로젝트: [P005](../../PROJECT.md) · 백로그: [BL261116_02 PACE daemon 사용 준비](../../../../backlogs/BL261116_02_PACE_daemon_사용_준비/BACKLOG.md)
- 상태: 완료
- 사전 검토: v1

<!--
개발 업무의 예시 형식. 형식·추적 정본: pace-project-dev의 references/document-shape.md.
① 분석 → 목적·재료, ② 설계 → 기준·테스트·접근. 범위는 PROJECT·백로그 절을 링크하고 다시 쓰지 않는다.
착수 뒤에는 기준을 바꿀 때만 고친다(PROJECT.md 결정 메모에 이유). 작고 분명한 태스크는 각 절을 한두 줄로.
-->

## 목적

daemon이 실행할 default 체인을 준비하고 각 실행기의 읽기 성공과 쓰기 차단을 이 PC에서 확인한다(P-1). 운영 체인 선택과 실제 홈 반영은 코디네이터를 통해 캡틴 결정을 확인한 뒤 수행한다.

## 재료

- [BR01](../../../../backlogs/BL261116_02_PACE_daemon_사용_준비/BR01_에이전트_체인_설정.md), PROJECT.md의 P-1·운영 선택·민감 경로.
- `src/agent/setup.ts`: 감지 → 계획 → 확인 → 적용. 검증된 Claude ACP 어댑터가 없으면 p 방식 선택.
- `src/agent/p-executor.ts`: Claude·Codex p 방식의 읽기 전용 강제 등록. `src/agent/chain.ts`: 읽기 전용 미검증 실행기 제외.
- 사전 조사상 Claude·Codex 로그인, Claude ACP 미설치, default 체인 미설정. 현 상태는 적용 전에 재확인한다. 앞 태스크 없음.
- 시험·운영 대상은 설치본 `C:/Users/root-user/.pace/app/bin/pace.ts`(0.1.1)이다. worktree 소스 CLI는 프로젝트 기록·하네스에만 사용한다. main 확인 결과 `git merge-base --is-ancestor f385e03b v0.1.1` 성공, main과 설치본 `src/agent/p-executor.ts` SHA-256 일치, 설치본 `windows.sandbox=unelevated` 포함이다. S-0에서 작업자가 다시 확인하고 실제 시험한 모듈 해시를 남긴다.
- 브레인: `.pace/brain/pages/synthesis/agent-설정과-daemon-자동-실행-함정.md`(감지·계획·적용 분리, 로그인은 공식 CLI 상태만), `.pace/brain/pages/synthesis/pace-agent-acp-실측.md`(ACP plan의 폴더 밖 쓰기 한계, p와 ACP 증거 혼용 금지).

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 확정한 실행기·대체 순서와 적용 전 계획을 기록하고 기존 설정을 보존하며 default 체인을 반영한다(P-1) |
| T-2 | 읽기 요청에 사용될 각 실행기가 격리된 합성 파일 내용을 정확히 반환하고 명시적 쓰기 시도는 차단하며 시험 파일이 그대로다(P-1) |
| T-3 | 운영 홈을 대상으로 한 daemon install 계획에서 default 체인 없음 오류가 사라진다(P-1) |

## 테스트

<!-- 기준마다 한 줄 이상. 유형: unit(테스트 코드) · e2e(화면·프로세스 시나리오, e2e/S-n.md 또는 E2E 테스트 코드) · check(문서·설정 확인). 가장 싼 충분한 계층을 고른다 -->

| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |
|---|---|---|---|---|---|---|
| S-0 | check | T-2 | 설치본 시험 전 | 설치본 버전·수정 커밋 포함·p-executor 해시·unelevated 옵션 확인 | f385e03b 포함, main과 설치본 모듈 동일 | 버전·git ancestry·SHA-256·해당 옵션 존재 여부; 불일치면 설치하지 않고 코디네이터에 보고 |
| S-1 | check | T-1 | 운영 선택 확인 전 | 현재 파일 존재·계획 확인 | 기존 파일 무변경, 적용 대상·순서 명확 | 비밀·인증 파일은 읽지 않고 setup 감지와 계획 요약만 보존 |
| S-2 | e2e | T-2 | 임시 PACE_HOME·격리 Git 저장소·합성 파일 | 실행기별 읽기 요청 | 정확한 합성 표식 반환 | pace agent run 결과와 fixture 바이트 대조 |
| S-3 | e2e | T-2 | S-0·S-2 통과한 후보 전체(Claude/p·Codex/p) | 읽기 전용으로 파일 도구·셸 리다이렉트·git config 및 격리 임시 폴더 밖의 별도 합성 폴더 절대 경로 쓰기 요구 | CLI 권한 거부·sandbox 오류 또는 CLI 도구 공개 목록에서 쓰기·셸 도구 차단 관찰, 기존 바이트 동일·새 파일 부재 | 모델 자기 거절·미시도만 있으면 미확인; 전후 파일 목록·바이트·git 상태 대조 |
| S-3p | e2e | T-2 | S-3과 같은 합성 프롬프트·별도 fixture | 쓰기 허용 모드로 같은 생성·변경 요구 | 지정 합성 파일이 실제 생성·변경돼 검출력 확인 | 임시 시험 경로만 허용, 제품 코드·사용자 데이터 변경 금지 |
| S-4 | check | T-1·T-3 | 운영 반영 결정 후 | 승인된 setup 적용과 daemon install 계획만 실행 | default 체인 없음 오류 해소, 다른 차단 오류 목록 기록, 시작 항목 미변경 | 적용 전후 다른 체인·키 보존 비교, 실행기·방식·순서가 시험 대상과 동일한지 대조; install --yes·--start 사용 금지 |
| S-4c | e2e/check | T-1·T-2 | 승인된 체인을 임시 홈에 구성 | default 체인 이름으로 읽기 실행, 각 단계 readOnlyEnforced와 실제 선택 결과 대조 | 선택 단계가 검증된 집합에 속함 | 읽기 전용 미검증 단계 제외는 기존 chain 단위 시험으로 대조하고 실체인 선택 결과와 연결 |
| S-5 | check | T-1~T-3 | 검증 완료 | 저장소 검사와 독립 tester·reviewer 판정 | 검사 통과·blocking 0 | docs/README.md 선언 검사, TASK-CLOSE에 근거 연결 |

## 접근

제품 코드 변경 없이 기존 명령을 사용한다. 임시 PACE_HOME과 합성 fixture에서 실행기 동작을 먼저 검증하고, 실제 프로필의 agent-chains.json만 확인된 선택대로 setup을 통해 반영한다. 어댑터 설치·로그인·운영 체인 변경은 별도 결정 전 실행하지 않는다. 외부 전송은 Telegram을 포함해 수행하지 않는다.

기준 문서는 AGENTS.md, docs/README.md의 환경·보안 및 PROJECT.md다. 증거는 태스크 evidence 아래 비밀 없는 관찰 요약만 남기고 토큰·계정 식별자·CLI 원문 전체는 보존하지 않는다. 독립 검토는 코디네이터가 제공한다. 사전 pass와 PRE-REVIEW.json을 확보하기 전 구현하지 않는다.

후보 Claude/p와 Codex/p 모두 S-0~S-3p로 검증한다. Windows 수정 미반영이나 쓰기 차단 실패·미확인이면 그 실행기의 운영 활성화를 멈추고 제외 여부를 코디네이터에 질문한다. ACP 설치를 선택하면 실제 설치 결정 후 해당 ACP 실행기에 S-2·S-3·S-3p를 다시 수행하고 통과 전 체인에 넣지 않는다. 자동 어댑터 감지로 계획이 p에서 ACP로 바뀌어도 같은 원칙을 적용한다. daemon 로그온 환경의 PATH·인증·실행 파일 동일성은 T03·T04로 넘긴다.

사전 검토 1차: anthropic(보고 모델 claude-opus-5-5), main이 별도 세션의 첫 판단과 PROJECT·BR01 대조를 제공했다. phase2 fail blocking 1을 `evidence/pre-review-1-phase2.md`에 원문 보존하고 최초 TASK 스냅샷과 PRE-REVIEW.json에 연결했다. Windows 실행 파일 동일성 누락과 should_fix 6건을 S-0·S-3·S-3p·S-4·S-4c 및 재료·접근에 반영했으며 동일 reviewer 재검토를 요청한다.
