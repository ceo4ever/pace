# 작업 프로세스 세부

정의서 [`docs/README.md`](README.md)에서 옮긴 상세다. 정의서에는 한 줄 요약과 이 문서 링크만 남는다.

이 문서가 다루는 경로 중 `src/project/backlog.ts`·`harness.ts`는 민감 경로다 — 고치기 전에 [SECURITY](SECURITY.md)의 민감 경로 표와 체크리스트를 본다.

문서 템플릿은 개발 업무의 예시다. 업무별 형식·추적과 명령용 최소 구조는 [문서 형식과 추적](../skills/pace-project-dev/references/document-shape.md)을 따른다.

독립 검토는 [목표 대조 절차](../skills/pace-project-dev/references/goal-review.md)의 첫 판단을 받은 뒤 작업 문서를 대조한다. 마감의 목표 달성 판정은 기준 대조와 별도로 남긴다.

## 백로그 상태 전환

상태 원본은 BR 파일, BACKLOG.md 현황 표는 함께 갱신한다(`done` 자동). BACKLOG.md 전체 상태는 start 성공 시 진행, worktree 프로젝트는 실제 merge 성공 시 완료, main 직접 프로젝트는 finish 성공 시 완료로 갱신한다. 전체 백로그가 보류면 자동 전환을 거부하고 개별 보류 BR은 그대로 둔다. 보류 해제는 사용자가 결정해 백로그 원본을 갱신하고 대시보드를 새로 생성한 뒤 명령을 다시 실행한다. 마감 때 BR·태스크·현황의 번호와 완료/보류 상태가 일치하지 않으면 멈춘다. 완료 백로그에는 덧붙이지 않고 새 백로그 또는 메모리 `idea`로 발의한다.

## 지표와 사건 기록

- 지표: `pace project stats P### [--json]` — 프로젝트·태스크 시간, 도구별 토큰, 게이트 실패, 리뷰 지적 수·개선 후보. main에서도 소유 worktree를 조회한다. `projects/P###_…/log.jsonl`은 커밋하는 사건 기록(`{ts,p,t?,type,by,msg,ok?,src?,ref?,data?}` — 시간대 포함 ISO·작성자 cli/agent/coordinator/user·짧은 메시지·수치 data)이며 기록 오류는 명령을 막지 않는다. finish·merge는 프로젝트의 `METRICS.md`(프로젝트 기준·태스크 기준·태스크 밖 집계)와 `projects/METRICS.md`(비교표)를 자동 생성한다. PROJECT-CLOSE `## 지표`는 METRICS.md 링크와 에이전트 해석 1~3줄이며 누락 시 finish 실패. 개선 후보를 메모리·브레인으로 올릴지는 사람이 고른다
- 새 태스크의 `사전 검토: v1`은 `PRE-REVIEW.json`의 마지막 판정·대상 해시·증거를 check/done/finish에서 확인한다. 작성법과 교차 대체 조건은 `skills/pace-project-dev/references/reviewer.md`의 사전 검토 기록 v1을 따른다. 과거 마커 없는 태스크는 기존 방식이며, 마커와 기록 삭제·허위 기록 우회 및 검토 의미·실제 선행 시점은 기계가 보증하지 않는다.
- 사건 작성: `pace project log P### [T##] --type decision|change|review|question|answer|escalation|note --msg "한 줄" [--src "사용자 결정|main 판단|자체 판단"] [--ref 프로젝트의_상대파일] [--by agent|coordinator|user]`. decision/change는 PROJECT 결정 표도 자동 반영하므로 손으로 두 번 쓰지 않는다. review 메시지는 `tester pass blocking 0 should_fix 0` 또는 `reviewer fail blocking 1 should_fix 2`처럼 판정·지적 수를 적는다. start는 도구·선택 출처·launch 결과 및 PROJECT 출처 기반 착수 결정을, merge는 사용자 승인·커밋 수를 함께 기록한다. 출력 원문·세션 내용·코드 diff·비밀은 남기지 않는다
- 대기 구분: 질문·에스컬레이션→같은 태스크(또는 프로젝트)의 답변까지 구간을 겹침 없이 합쳐 질의 대기로 보고 러닝 시간에서 빼 작업 경과를 계산한다. finish→merge(미병합이면 조회 시각)는 병합 승인 대기다. 결정/변경/리뷰 사건 수는 log 도입 후 기준이고 미도입 태스크의 리뷰 등급은 TASK-CLOSE로 보완한다. 착수는 출처(백로그 지시·확정된 대화)를 결정으로 기록하고 승인 대기 없이 바로 수행한다. 과거 계약 승인 사건은 기존 지표에서 계속 읽는다
- 측정 범위: 사건 시간 우선, 과거 기록은 git author 시각 근사(rebase가 바꾸는 committer 시각은 쓰지 않음). 태스크 토큰 구간은 Codex [착수, done], Claude/Gemini (착수, done], 진행 중은 조회 시각까지. Claude 주/서브 세션, Codex rollout별 첫 메타로 세션을 고정한 마지막 누적값−착수 전 마지막 누적값(없으면 0), Gemini 메시지별 수치를 읽기만 한다. 계정별 홈·설정 경로·Orca Codex 홈을 찾고, 기록 없는 도구는 상세 METRICS.md에서 행을 생략한다. 작업자는 PROJECT 헤더 worktree 경로(삭제 후에도 문자열 귀속), 코디네이터는 main 경로의 start→merge 구간으로 따로 집계하며 같은 시간의 다른 대화 혼입 가능성이 있다. 캐시·추론은 도구마다 의미가 달라 필드를 더해 공통 총량을 만들지 않는다. 파일 삭제·형식 변경에 따라 일부 사용량은 빠질 수 있다

## 선언 명령과 커밋 게이트

- 선언 명령: `검사`·`보안 검사`·`worktree 준비`·`의존성 감사`는 실행 전에 명령을 출력한다. `의존성 감사`(선택)는 finish가 보안 검사 뒤, 잠금 파일(`package-lock.json`·`pnpm-lock.yaml`·`yarn.lock`·`poetry.lock`·`uv.lock`·`Cargo.lock`·`go.sum` 등)이 base 대비 바뀐 브랜치에서만 실행하고 실패하면 멈춘다 — 같은 잠금을 다시 조회하지 않는다. 기존 패키지의 새 취약점은 main 주기 점검이 맡는다(하네스 밖). worktree 선언이 main과 다르면 main 선언을 쓰며 차이를 알린다. main에 선언이 없으면 worktree 선언을 사용한다. 명령이 부르는 작업본 스크립트까지 격리하는 기능은 아니다.
- 커밋 게이트: start가 저장소 git 내부에 PACE commit-msg 훅(`# PACE commit gate v1`)을 멱등 설치한다. 사용자 훅·링크·외부 또는 상대 hooksPath는 덮어쓰지 않고 경고한다. project/P### 브랜치의 `(P###/T##)` 태그마다 check 실패 시 커밋을 거부한다. pace 부재는 경고 후 허용한다. 훅 검사는 로그를 쓰지 않는다. finish는 완료 태스크의 태그 커밋 존재를 확인하므로 무태그 우회 이력도 마감에서 드러난다.

## 작업자 모델 설정

작업자 모델·effort는 `pace worker show`, `pace worker set <도구> <model|effort> <값>`, `pace worker reset <도구> <model|effort>`로 관리한다. 설정은 `PACE_HOME/worker-settings.json`에 저장되며 설치본 교체와 독립적이다. `project start --model ... --effort ...`는 해당 실행에서 우선하고 `--effort default`는 도구 기본값을 선택한다. 초기 모델은 Codex `gpt-6.2-sol`, Claude `claude-opus-5-5`이며 effort는 도구 기본값이다.
