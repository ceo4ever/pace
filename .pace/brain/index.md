# 프로젝트 브레인 목차

> 자동 생성 — 직접 고치지 말 것. 페이지 21개. 형식은 SCHEMA.md.

## 결정과 이유

- [브레인은 프로젝트 관문에서 챙긴다](pages/concept/brain-at-project-gates.md) — 브레인은 부트에 넣지 않고, 하네스가 두 관문에서 챙긴다 — new가 관련 페이지 후보를 계약 재료에, finish가 PROJECT-CLOSE 브레인 행(반영·해당 없음+이유)을 확인
- [브레인은 필요한 것만 찾아 쓴다](pages/concept/brain-pull-not-push.md) — 브레인은 세션마다 주입하지 않고 필요할 때 검색해 쓰며 변경 근거를 lint로 대조한다 #brain #search #lint
- [Canvas 스킬 묶음 설치 경계](pages/concept/canvas-추출-도구-봉인과-설치-경계.md) — pace-canvas-skills 경로로 봉인 묶음을 통째 설치하며 상류 format과 바이트를 보존한다
- [설치·실행 함정 모음](pages/concept/install-and-launch-pitfalls.md) — < /dev/tty로 넘기면 Claude Code(Bun)가 kqueue EINVAL로 죽음, 처음 폴더는 신뢰 창 기본값이 종료, ps1은 BOM 필수, 자동 모드는 자기 설정 수정과 rm -rf를 막음 #install #pitfalls #macos #windows
- [LLM은 먼저 말할 수 없다 — 화면 인사와 pace onboard](pages/concept/llm-cannot-speak-first.md) — 훅은 맥락만 넣고 응답을 일으키지 못하므로, 열자마자 보이는 인사는 부트가 만든 systemMessage로, 바로 대화를 시작하려면 첫 메시지를 넣어 CLI를 연다 #boot #onboarding #ux
- [메모리 두 영역 — 프로필과 프로젝트](pages/concept/memory-two-scopes.md) — 프로필 메모리(user·rule·todo)는 에이전트를 따라다니고, 프로젝트 메모리(status·rule·issue·todo·note·idea)는 저장소에 커밋된다. 프로젝트 메모리를 없앴다가 되살렸다 #memory #design-history
- [OPAL 가져오기 adopt opal 결정과 함정](pages/concept/opal-가져오기-adopt-opal-결정과-함정.md) — adopt opal은 git mv로 .opal을 .pace로 옮기고 AGENT 표지·훅·진입점을 안전하게 바꾼다 — 판별은 원문 일치만, 복구는 변경 전 등록, 참조 보고는 위치만
- [프로필 = 독립 에이전트, 역할은 AI 비서 고정](pages/concept/profile-is-independent-agent.md) — 프로필마다 정체성·사용자 정보·메모리·스킬을 격리하고(Hermes 참고), 역할은 묻지 않고 AI 비서로 고정 — 개발·관리·리서치는 일의 성격별 방식으로 RULES에 둔다 #profile #identity #design-history
- [세션 부트는 시작 훅 + 대체 규칙](pages/concept/session-boot-via-hooks.md) — 활성화 명령 대신 각 도구의 세션 시작 훅이 pace boot를 부르고, 훅이 불안정한 도구는 한 줄 대체 규칙으로 부트한다 #boot #hooks #platform
- [상황별 부트 — 위치를 판별해 사실을 넘긴다](pages/concept/situational-boot-greeting.md) — 부트는 세션 위치를 PACE 프로젝트·정의 없음·새 프로젝트·밖으로 판별하고 git·메모리를 넘기며, 첫 멘트는 에이전트가 판단한다. 홈 폴더(~/.pace 있음)는 프로젝트로 보지 않는다 #boot #situation
- [백로그 대시보드 자동 갱신과 Git 경계](pages/concept/백로그-대시보드-자동-갱신과-git-경계.md) — 대시보드 최초 생성과 Git 자료 갱신의 경계를 유지하고 프로젝트 상태·인덱스 자료를 안전하게 보존한다
- [작업 하네스 실측 함정](pages/concept/작업-하네스-실측-함정.md) — 정의서 라벨은 한 번만·표 첫 칸에, 계획 행 번호, 링크 증거 경로, 마감 문서의 비밀 예시, 커밋 칸·마감 상태는 done·finish가, stash 공유, list는 worktree 작업본 우선 #harness #pitfalls

## 구성요소

- (없음)

## 흐름

- [작업 하네스 흐름](pages/flow/작업-하네스-흐름.md) — 출처로 즉시 착수하고 태스크 check·커밋 훅·finish를 거쳐 사람 승인 병합한다. 선언 명령은 base 우선이며 실행 환경 격리까지 하지는 않는다 #harness #project #workflow

## 분석·조사

- [에이전트 설정과 daemon 자동 실행 함정](pages/synthesis/agent-설정과-daemon-자동-실행-함정.md) — schtasks ONLOGON은 일반 권한에서 액세스 거부 → HKCU Run + 숨김 VBS 런처, 외부 명령 출력은 콘솔 코드 페이지(949)로 해독, 로그인 확인은 claude auth status(JSON)·codex login status(종료 코드), 감지·계획·적용 분리 #daemon #install #windows #agent-setup
- [ACP 어댑터 실측 (스파이크)](pages/synthesis/pace-agent-acp-실측.md) — claude-agent-acp 0.81.1 실측 — 읽기 전용·권한 거부, resume, effort, mcpServers, 훅, 이벤트. codex-acp·한도 문구·약관은 미확인 #agent #acp #claude #codex #security #daemon
- [pace agent 호출 함정 (실측)](pages/synthesis/pace-agent-호출-함정-실측.md) — codex exec·codex-acp 읽기 전용 미강제, codex-acp 기본 모델 오류 text, ACP 빈 응답, 설치본이 낡으면 자식에 부트가 실림 #agent #codex #claude #acp #security
- [pace-intent 의도 파악 기획 구조와 함정](pages/synthesis/pace-intent-의도-파악-기획-구조와-함정.md) — 프로세스·렌즈/템플릿·pace intent 증명 3레이어, B는 지금 착수 신호일 때만, 렌더 보안(JSON 블록·텍스트 노드·CSP·블록 schema), 근거 경로 realpath, 에이전트 기록의 한계는 두 사람 방식으로 #pace-intent #intent #planning #pitfalls
- [pace-scout 기회 탐색 구조와 함정](pages/synthesis/pace-scout-기회-탐색-구조와-함정.md) — 명령(기계)·스킬(생각)·증명(외부 증거) 3레이어, 유튜브 자막은 봇 차단이라 붙여넣기, 수치 대조의 시간·날짜·번역 함정, 루프 수정은 실패 단언으로 범위를 고정 #pace-scout #scout #pitfalls
- [도구별 세션 시작 훅 동작 (실측)](pages/synthesis/platform-hook-behavior.md) — 호스트별 부트 훅 실측과 최신 공식 문서: Codex 약 2,500토큰, Cursor 비차단, Antigravity 시작 훅 지원 #hooks #platform #claude #codex #cursor #antigravity #gemini
- [Telegram 어댑터 설계 함정](pages/synthesis/telegram-어댑터-설계-함정.md) — update_id는 일주일 무수신 뒤 무작위, getUpdates offset은 요청 시점에 확인, 토큰 비노출은 자르기 전 제거, 토픽 메뉴는 chat 단위, 파일 조회는 워커로 #telegram #daemon #security #adapter
- [프로젝트 지표 해석과 세션 기록 함정](pages/synthesis/프로젝트-지표-해석과-세션-기록-함정.md) — 사건 우선 시간·도구별 토큰 의미, 삭제된 worktree 귀속·코디네이터 분리, 상세/비교 지표와 경계 검증 함정

## 용어

- (없음)
