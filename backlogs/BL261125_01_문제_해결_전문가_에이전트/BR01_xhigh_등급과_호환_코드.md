# BR01 xhigh 등급과 호환 코드

- 상태: 완료
- 백로그: [BL261125_01_문제_해결_전문가_에이전트](BACKLOG.md)

<!-- 개발 업무의 예시. 형식·추적 정본: pace-project-dev의 references/document-shape.md. -->

## 목적

문제 해결 전문가를 최상위 모델로 실행할 수 있게 **등급 코드와 옛 설치본 호환**을 만든다([백로그 목표](BACKLOG.md#목표), 고른 길 2). 이 BR은 민감 경로 코드·시험만 다룬다. 구성원 정의·지침·호출 수단·실제 적용 관문·eval과 문서는 [BR06](BR06_문제_해결_구성원_정의·지침·실제_적용_관문·eval.md)이 맡는다(허브 결정 2026-11-26 17:40 분할 — 문서와 민감 경로 코드를 섞지 않는다).

## 범위

- **최상위 등급 `xhigh`**:
  - `WORKER_TIERS`에 `xhigh`를 추가한다(`src/core/worker-tiers.ts:7`). 팀 원본 `tier`, `pace worker set <도구> tier.xhigh.<model|effort>`, `pace worker show`의 teamTiers, 생성물 매핑이 이 값을 받는다. 설정 항목 정규식(`src/core/worker-tiers.ts:67` `tier\.(high|medium|low)`)과 오류 문구, 모든 등급의 effort를 tier 문자열로 단언하는 시험(`test/team.test.ts:276`)을 함께 고친다.
  - **기본 effort(owner 결정 2026-11-25)**: Claude `high`, Codex `medium`. 등급 이름은 `xhigh`(최상위 모델 등급)를 유지하지만, effort는 tier 문자열이 아니라 **도구별 기본값**으로 둔다 — 현재 규칙 "effort는 등급 override → tier 문자열"(`docs/TEAM.md:91`, `src/core/worker-tiers.ts:62` `effort: override?.effort ?? tier`)의 예외다. 근거: claude-api 스킬(2026-11-03 캐시) — Fable 5.2 API 기본 effort는 high이고, high에서 시작해 xhigh는 이득이 측정된 곳에서만 쓰라고 권한다. Codex 모델의 공식 기본 effort는 미확인이다. 더 올릴지는 BR06 능력 eval의 실측으로 판단한다(바뀌면 BR06이 이 기본값을 바꾸는 후속 변경을 낸다).
  - **기본 모델**: `xhigh` 등급의 기본 model은 일반 worker 기본값이 아니라 각 도구의 최상위 모델로 둔다 — Claude `claude-fable-5-2`, Codex `gpt-6.2-astra`. 문서화된 해석 순서 "tier override → 일반 worker model → 배포 기본값"(`docs/TEAM.md:91`, `:153`)의 예외다(문서 반영은 BR06). 사용자 override(`worker-tiers.json`)는 여전히 우선한다.
  - **옛 설치본 호환**: 옛 판독기는 새 값을 전체 손상으로 처리한다 — `worker-tiers.json`의 `xhigh` 키는 파일 전체 거부(`src/core/worker-tiers.ts:48`), 원본 `tier: xhigh`는 팀 원본 파싱 오류(`src/team/model.ts:98`, 모르는 필드도 거부 `:87`)라서 `pace team sync`(`src/team/sync.ts:43` `loadTeam`)와 팀 측정(`src/project/team-metrics.ts:338-342` — 채택 저장소면 오류, 아니면 원본 관측 미확인)이 깨진다. 이는 `docs/TEAM.md:80`이 "옛 설치본이 새 키를 손상으로 읽지 않도록" 등급 파일을 분리한 것과 같은 위험이다(새 판독기가 옛 파일을 읽는 문제가 아니라 **옛 판독기가 새 값을 읽는 문제**). 호환 방식을 설계에서 고른다 — (가) 별도 파일·키 분리(옛 판독기가 보지 않는 위치에 `xhigh` 매핑·구성원 등급 승격을 둔다. 위치·형식은 BL261125_02 BR02가 정한 필수 역할 표지 형식을 따르거나 같은 원칙 — 옛 판독기가 보지 않는 별도 파일·키 — 으로 정한다. 그 표지는 BL261125_02 병합으로 `.pace/team/required-roles.json`에 있다 — `docs/TEAM.md:127`), (나) 병합 전 재설치 순서 강제(main 병합 직후 `bash scripts/install.sh`, 다른 worktree·기기의 옛 설치본 영향과 안내 포함). **(가)를 기본안으로 둔다**(PM 결정 2026-11-25). (나)를 고르면 프로젝트 게이트(`pace team list`·`team sync --check`·finish·merge)를 어느 실행본(worktree의 `./bin/pace.ts` 대 설치본 `~/.pace`)으로 돌리는지 설계에 명시해야 한다 — 설치본은 main에서만 설치하므로(AGENTS.md) 병합 전 worktree의 설치본은 옛 판독기이고, 옛 판독기는 `tier: xhigh`를 거부하며(`src/team/model.ts:98`), 팀 채택 프로젝트의 finish(`src/project/harness.ts:1868`)·merge(`:2042`)는 `refreshProjectMetrics` → `collectTeamMetrics`를 거쳐 `src/project/team-metrics.ts:338-342`(채택 저장소면 `loadTeam` 오류를 그대로 던짐)에 닿는다. (가)에서도 옛 설치본으로 `pace team sync`를 돌리면 서로 다른 매핑으로 공유 생성물이 번갈아 바뀌는 문제(`docs/TEAM.md:105`)가 생기는지 확인한다. 기존 high·medium·low의 해석·생성물 바이트는 바꾸지 않는다. 새 구성원 자동 배정(`src/team/store.ts:92`)도 바꾸지 않는다 — `xhigh`는 명시한 구성원만 쓴다.
- **BR06 인계**: 고른 호환 방식과 구성원 등급 승격 위치·형식, 설정 명령을 설계 문서에 적어 BR06이 그대로 쓰게 한다.
- **보안**: `src/team/`·`src/core/worker-tiers.ts`는 민감 경로(`docs/SECURITY.md:24` 민감 경로 표)이므로 설계에서 SECURITY 체크리스트를 적용한다.
- **변경 범위**: `src/core/worker-tiers.ts`·`src/team/**` 코드와 `test/**` 시험, 설계 문서만 바꾼다. `src/project/role-record.ts`·`src/project/event-log.ts`·`src/project/team-input.ts`는 같은 역할 이름의 정확한 xhigh 경로 검증, 구판 호환 시작 행 저장과 두 판독 경로의 복원만 바꾼다 (main 판단). `docs/**`·`skills/**`·팀 원본·필수 역할 정본은 바꾸지 않는다(BR06).
- **제외**: `pace-troubleshooter` 원본·생성물, 호출 수단, 지침·반환 계약, 모델 거부 처리, 실제 적용 관문, 능력 eval, `docs/TEAM.md`·`skills/pace-team`·브레인 문서, 필수 역할 요건 등록(모두 BR06), 호출 신호(BR02), 호출 기록(BR03), 호출 절차(BR04·BR05), 다른 구성원의 모델·effort 최적화(별도 주제), 조건부 역할 미사용 처리(`src/project/team-metrics.ts:358` — BL261125_02 BR02 소유).

## 완료 기준

- 고른 호환 방식의 설정 경로(파일·키 분리면 그 위치, 아니면 `pace worker set claude tier.xhigh.model <값>`)에서 설정·`reset`이 동작한다. 잘못된 등급 이름은 거부한다. 기존 high·medium·low의 생성물 바이트가 바뀌지 않는 것을 시험으로 확인한다.
- `xhigh` 기본 매핑이 Claude `claude-fable-5-2`·effort `high`, Codex `gpt-6.2-astra`·effort `medium`이고 override가 우선하는 것을 시험으로 확인한다. 다른 등급의 effort는 계속 tier 문자열임을 같은 시험에서 확인한다.
- **옛 판독기 시험**: 고른 호환 방식에서 옛 판독기(병합 전 커밋의 `readWorkerTiers`·`loadTeam`, 또는 옛 설치본)가 새 저장소·새 `PACE_HOME`을 읽을 때 기존 등급 해석·`team sync --check`·팀 측정이 깨지지 않음(또는 재설치 순서 강제 시 그 안내·차단이 동작함)을 시험으로 확인한다. (가)에서는 옛 설치본으로 `pace team sync`를 돌려도 공유 생성물이 번갈아 바뀌지 않는지(`docs/TEAM.md:105`)도 확인한다.
- 픽스처 구성원에 `xhigh`(또는 분리 위치의 등급 승격)를 주면 `team sync`가 native 생성물에 위 model·effort를 쓰고 `project start --role`(`src/team/worker-role.ts:74`)이 같은 값을 해석하는 것을 시험으로 확인한다.
- 이 BR은 필수 역할 요건 행을 등록하지 않는다. 등급·모델·effort 요건은 BR06이 등록하고, 판정 근거로 이 BR의 시험을 인용한다.
