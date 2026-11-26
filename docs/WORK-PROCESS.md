# 작업 프로세스 세부

정의서 [`docs/README.md`](README.md)에서 옮긴 상세다. 정의서에는 한 줄 요약과 이 문서 링크만 남는다.

이 문서가 다루는 경로 중 `src/project/backlog.ts`·`harness.ts`는 민감 경로다 — 고치기 전에 [SECURITY](SECURITY.md)의 민감 경로 표와 체크리스트를 본다.

문서 템플릿은 개발 업무의 예시다. 업무별 형식·추적과 명령용 최소 구조는 [문서 형식과 추적](../skills/pace-project-dev/references/document-shape.md)을 따른다.

독립 검토는 [목표 대조 절차](../skills/pace-project-dev/references/goal-review.md)의 첫 판단을 받은 뒤 작업 문서를 대조한다. 마감의 목표 달성 판정은 기준 대조와 별도로 남긴다.

팀 측정을 채택한 프로젝트는 검토한 변경과 회고 자료를 먼저 커밋하고 깨끗한 worktree에서 finish를 실행한다. finish는 검사한 커밋의 자료와 하네스가 생성한 최종 Git tree를 대조한다. main에서 미리보기를 확인한 뒤 `pace project merge P### --yes --commit <표시된 전체 SHA>`로 승인 대상을 고정한다. finish 뒤 내용이 바뀌면 재마감·재확인이 필요하다. 채택 이력과 검증 근거는 [팀 측정](TEAM-METRICS.md)을 따른다. 팀 없는 기존 프로젝트는 `--yes`를 유지한다.

## 백로그 상태 전환

상태 원본은 BR 파일, BACKLOG.md 현황 표는 함께 갱신한다(`done` 자동). BACKLOG.md 전체 상태는 start 성공 시 진행, worktree 프로젝트는 실제 merge 성공 시 완료, main 직접 프로젝트는 finish 성공 시 완료로 갱신한다. 전체 백로그가 보류면 자동 전환을 거부하고 개별 보류 BR은 그대로 둔다. 보류 해제는 사용자가 결정해 백로그 원본을 갱신하고 대시보드를 새로 생성한 뒤 명령을 다시 실행한다. 마감 때 BR·태스크·현황의 번호와 완료/보류 상태가 일치하지 않으면 멈춘다. 완료 백로그에는 덧붙이지 않고 새 백로그 또는 메모리 `idea`로 발의한다.

## 지표와 사건 기록

프로젝트 작업자 역할은 `start --role <팀 구성원 이름>` > PROJECT 머리의 `작업자 역할` > 없음으로 고른다. 기존 worktree에 명시 역할을 적용하려면 `--launch`가 필요하다. 원본 적재와 tier 인자·시작 기록의 요청/관측 구별·재개/복구 경계는 [TEAM의 프로젝트 작업자 역할](TEAM.md#프로젝트-작업자-역할)을 따른다. 역할 미지정은 기존 경로이고 자동 lead는 없다.

- 지표: `pace project stats P### [--json]` — 프로젝트·태스크 시간, 도구별 토큰, 게이트 실패, 리뷰 지적 수·개선 후보. main에서도 소유 worktree를 조회한다. `projects/P###_…/log.jsonl`은 커밋하는 사건 기록(`{ts,p,t?,type,by,msg,ok?,src?,ref?,data?,to?,requestId?}` — 시간대 포함 ISO·작성자 cli/agent/coordinator/user·짧은 메시지·수치 data)이며 기록 오류는 명령을 막지 않는다. finish·merge는 프로젝트의 `METRICS.md`(프로젝트 기준·태스크 기준·태스크 밖 집계)와 `projects/METRICS.md`(비교표)를 자동 생성한다. PROJECT-CLOSE `## 지표`는 METRICS.md 링크와 에이전트 해석 1~3줄이며 누락 시 finish 실패. 개선 후보를 메모리·브레인으로 올릴지는 사람이 고른다
- 새 TASK의 `TASK 형식: v2`는 증명 범위와 비어 있지 않은 판정 주체를 요구한다(기준·테스트 앞 배치는 템플릿 관례이며 게이트의 순서 검사는 아니다). 게이트·verify·수동 reviewer는 같은 표지로 나누며 표지 없는 옛 TASK에는 새 규칙을 강제하지 않는다. 구조 검사와 의미 판정의 경계는 reviewer.md의 TASK 증명 범위 절을 따른다. 표지 제거·허위 기록의 우회와 의미·진정성은 기계가 보증하지 않는다.
- 새 태스크의 `사전 검토: v1`은 `PRE-REVIEW.json`의 마지막 판정·대상 해시·증거를 check/done/finish에서 확인한다. 작성법과 교차 대체 조건은 `skills/pace-project-dev/references/reviewer.md`의 사전 검토 기록 v1을 따른다. 과거 마커 없는 태스크는 기존 방식이며, 마커와 기록 삭제·허위 기록 우회 및 검토 의미·실제 선행 시점은 기계가 보증하지 않는다.
- 검토 원장 decision의 `by: pm|user`는 프로젝트 사건의 `by: agent|coordinator|user`와 별개다. 옛 결정의 주체는 unknown이다. 도구 계약은 [AGENT-CALL](AGENT-CALL.md), 영향 분류·허브의 장애 대응·승인 원문 확인은 [결정 권한 정본](../skills/pace-project-dev/references/decision-rights.md)을 따른다.
- 사건 작성: `pace project log P### [T##] --type decision|change|review|question|answer|escalation|note --msg "한 줄" [--src "사용자 결정|main 판단|자체 판단"] [--ref 프로젝트의_상대파일] [--by agent|coordinator|user] [--to owner|coordinator]`. decision/change는 PROJECT 결정 표도 자동 반영하므로 손으로 두 번 쓰지 않는다. review 메시지는 `tester pass blocking 0 should_fix 0` 또는 `reviewer fail blocking 1 should_fix 2`처럼 판정·지적 수를 적는다. start는 도구·선택 출처·launch 결과 및 PROJECT 출처 기반 착수 결정을, merge는 사용자 승인·커밋 수를 함께 기록한다. 출력 원문·세션 내용·코드 diff·비밀은 남기지 않는다
- 질문 수신자: question·escalation에만 선택값 --to owner|coordinator를 쓴다. 작업자는 coordinator, 사용자에게 전달한 코디네이터는 owner으로 기록하고 --ref의 프로젝트 내부 파일에서 원질문을 연결한다. 생략은 기존 입력으로 허용하고 비교에서는 미확인으로 분리한다. 잘못된 값·다른 사건과의 조합은 기록 전에 거부한다. 사용자 답을 받은 코디네이터는 같은 범위의 answer를 기록해 전달 질문의 대기를 닫은 뒤 reply하고, 작업자는 원질문의 answer를 별도로 한 번 기록한다. 전달 예시는 질문 사건 2·답 사건 2·owner 수신 행1이다. 수신자 행만으로 사용자 도달을 확정하지 않는다. 같은 요청을 묶어 사용자 답 근거→to:owner 성공 전송 근거→실패 전송만→그 밖 미확인 순으로 판정하고, 앞의 두 경우만 도달로 센다. 실패 재시도는 시도 수로 따로 남긴다. 기존 stats는 요청 수가 아닌 사건 수·대기 구간 합집합 의미를 유지한다.
- 대기 구분: 질문·에스컬레이션→같은 태스크(또는 프로젝트)의 답변까지 구간을 겹침 없이 합쳐 질의 대기로 보고 러닝 시간에서 빼 작업 경과를 계산한다. finish→merge(미병합이면 조회 시각)는 병합 승인 대기다. 결정/변경/리뷰 사건 수는 log 도입 후 기준이고 미도입 태스크의 리뷰 등급은 TASK-CLOSE로 보완한다. 착수는 출처(백로그 지시·확정된 대화)를 결정으로 기록하고 승인 대기 없이 바로 수행한다. 과거 계약 승인 사건은 기존 지표에서 계속 읽는다
- 측정 범위: 사건 시간 우선, 과거 기록은 git author 시각 근사(rebase가 바꾸는 committer 시각은 쓰지 않음). 태스크 토큰 구간은 Codex [착수, done], Claude/Gemini (착수, done], 진행 중은 조회 시각까지. Claude 주/서브 세션, Codex rollout별 첫 메타로 세션을 고정한 마지막 누적값−착수 전 마지막 누적값(없으면 0), Gemini 메시지별 수치를 읽기만 한다. 계정별 홈·설정 경로·Orca Codex 홈을 찾고, 기록 없는 도구는 상세 METRICS.md에서 행을 생략한다. 작업자는 PROJECT 헤더 worktree 경로(삭제 후에도 문자열 귀속), 코디네이터는 main 경로의 start→merge 구간으로 따로 집계하며 같은 시간의 다른 대화 혼입 가능성이 있다. 캐시·추론은 도구마다 의미가 달라 필드를 더해 공통 총량을 만들지 않는다. 파일 삭제·형식 변경에 따라 일부 사용량은 빠질 수 있다

### 에이전트 호출 원장

프로젝트의 호출 시도는 `projects/P###_…/calls/log.jsonl`에, 백로그 단계 호출은 `backlogs/BL…/calls/log.jsonl`에 남긴다. 다섯 측정 항목을 시도당 한 JSON 행에 직접 쓴다. 기존 루트 `log.jsonl`은 사건 기록이다. 새 행이 루트에 들어가면 구판 판독 단계에서 팀 측정이 거부되거나 대표 태스크 범위가 달라질 수 있으므로 호출 원장은 별도 경로를 사용한다. 일반 stats 조회는 동일 프로젝트의 활성 worktree와 main 원장을 함께 읽고 같은 시도 ID를 한 번만 센다. 마감·파일로 쓰는 지표는 해당 결산 체크아웃에 보존된 원장을 기준으로 한다.

`pace project log P### [T##] --type agent_call --call-file <JSON> [--json]`은 입력 JSON 한 개를 쓴다. 백로그는 P번호 대신 BL번호를 쓰고 태스크 인자는 생략한다. 백로그 호출은 그 검토 대상이 있는 체크아웃에서 조회하고 기록한다. 입력은 단일 링크 일반 파일이어야 한다. 예시의 두 null 표시처럼 없는 값도 키를 남긴다.

```json
{
  "version": 1,
  "id": "3176f41b0a834eae94461f514137b813",
  "at": "2026-11-26T12:00:00.000Z",
  "task": "T03",
  "agent": "pace-reviewer",
  "engine": "claude",
  "route": "native",
  "status": "completed",
  "reason": null,
  "replacement_reason": null,
  "model": {
    "requested": { "value": "claude-opus-5-5", "source": "requested" },
    "actual": { "value": "claude-opus-5-5", "source": "host" }
  },
  "effort": {
    "requested": { "value": "high", "source": "requested" },
    "actual": { "value": null, "source": "unknown" }
  },
  "duration_ms": { "value": 809, "source": "host" },
  "tokens": {
    "input": { "value": null, "source": "unknown" },
    "output": { "value": null, "source": "unknown" },
    "total": { "value": 2235, "source": "host" }
  },
  "ref": null
}
```

실제 시도별로 서로 다른 32~64자리 소문자 16진 ID를 쓰고 같은 시도 재기록·보강에는 동일한 ID와 처음의 시작 시각을 쓴다. `route`는 p, acp, chain, verify, native, manual 중 하나다. `status`는 unknown, completed, failed, interrupted 중 하나이고 `reason`과 `replacement_reason`에는 정해진 오류 코드만 받을 수 있다. 측정 출처는 unknown(미확인), requested(요청), pm(PM 기록), tool(도구 측정), host(호스트 보고)다. 출처가 달라도 알려진 값이 상충하거나 귀속·상태·참조가 다르면 거부한다. 외부 검토 명령만 호출 행에 예약 관계 `review_claim`을 만들 수 있다. Claude 자동 관측과 PM 수동 입력은 [호스트 호출 식별과 외부 검토 연결](AGENT-CALL.md#호스트의-팀-구성원-호출)에 따라 같은 시도 ID와 기록된 시각을 사용한다. 같은 값에 대해서는 실제 요청·호스트 보고·도구 측정을 PM 기록보다 우선한다. `ref`는 범위 안에 있는 기존 일반 파일의 상대 경로다. 비밀·세션 식별자·프롬프트·응답 원문은 입력에서 빼고 필요한 결과만 `ref`로 연결한다. 쓰기 잠금은 수행 프로세스의 종료가 확인된 경우에만 회수한다. 확인할 수 없는 잠금은 남기고 `calls/.write.local.json`의 진단과 재시도 안내를 표시한다.

## 선언 명령과 커밋 게이트

- 선언 명령: `검사`·`보안 검사`·`worktree 준비`·`의존성 감사`는 실행 전에 명령을 출력한다. `의존성 감사`(선택)는 finish가 보안 검사 뒤, 잠금 파일(`package-lock.json`·`pnpm-lock.yaml`·`yarn.lock`·`poetry.lock`·`uv.lock`·`Cargo.lock`·`go.sum` 등)이 base 대비 바뀐 브랜치에서만 실행하고 실패하면 멈춘다 — 같은 잠금을 다시 조회하지 않는다. 기존 패키지의 새 취약점은 main 주기 점검이 맡는다(하네스 밖). worktree 선언이 main과 다르면 main 선언을 쓰며 차이를 알린다. main에 선언이 없으면 worktree 선언을 사용한다. 명령이 부르는 작업본 스크립트까지 격리하는 기능은 아니다.
- 커밋 게이트: start가 저장소 git 내부에 PACE commit-msg 훅(`# PACE commit gate v1`)을 멱등 설치한다. 사용자 훅·링크·외부 또는 상대 hooksPath는 덮어쓰지 않고 경고한다. project/P### 브랜치의 `(P###/T##)` 태그마다 check 실패 시 커밋을 거부한다. pace 부재는 경고 후 허용한다. 훅 검사는 로그를 쓰지 않는다. finish는 완료 태스크의 태그 커밋 존재를 확인하므로 무태그 우회 이력도 마감에서 드러난다.

## 작업자 모델 설정

팀 원본은 `.pace/team`에 두고 `pace team new·list·sync`로 관리한다. 일반 worker 설정과 등급 설정 파일을 분리하며 `worker show`의 teamTiers에서 유효 대응표를 본다. `team sync --check --json`은 원본·설정·내용 차이를 구분하며 원본/출력과 권한의 계약은 [TEAM](TEAM.md)을 따른다. 역할 정의 생성만으로 프로젝트 작업자 역할이 자동 선택되지는 않는다.

작업자 모델·effort는 `pace worker show`, `pace worker set <도구> <model|effort> <값>`, `pace worker reset <도구> <model|effort>`로 관리한다. 설정은 `PACE_HOME/worker-settings.json`에 저장되며 설치본 교체와 독립적이다. `project start --model ... --effort ...`는 해당 실행에서 우선하고 `--effort default`는 도구 기본값을 선택한다. 초기 모델은 Codex `gpt-6.2-sol`, Claude `claude-opus-5-5`이며 effort는 도구 기본값이다.

## 소통 기록과 요청 연결

`project log`의 question/escalation/answer에 선택 `--request-id`를 붙여 [참여 소통](HANDOFF.md)과 한 요청으로 묶는다. 기존 사건 수·대기 계산은 유지하며 새로운 handoffs 집계와 혼용하지 않는다. 원문·상세 답은 Git common dir에만 보존한다. 전송은 원장/started 선기록 뒤이며 기록 실패 때 보내지 않는다. finish는 partial/blocked 포함 열린 위임·누락 로컬 본문을 경고하고 손상 원장/알려진 raw staging 후보는 차단한다.

by:user answer 근거 ref는 출처 위치·응답 식별자·지문만 담는 짧은 영수증이다. 답 원문과 상세 해석은 이 버전 관리 파일에 복사하지 않고 로컬 decision_reply 본문에 보존한다.

팀 측정·미확인/신고 총량·같은 조건의 비교·새 프로젝트 회고 관문은 [팀 측정과 회고](TEAM-METRICS.md)를 따른다.
