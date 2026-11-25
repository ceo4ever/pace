# 두 저장소의 팀 설계

읽기 전용 기준은 Roblox `03e7c7900107`과 AI SQL `16fcad8af522`다. [입력 목록과 지문](evidence/analysis-inputs.json)은 각 HEAD와 작업본이 같았음을 기록한다. 설계에 필요한 확인은 이미 사용자가 정한 프로젝트 범위와 두 저장소 지침에서 했다. 새 사용자 질문과 대기 시간은 0이다. 입력 확인 경과와 합성 행동 질문은 따로 기록한다.

| 확인 항목 | roblox-studio | ai-sql-client |
|---|---|---|
| 결정 주체 | `AGENTS.md` 권한 절과 `docs/README.md`의 작업 프로세스. owner가 시제품 선택·제품 진행·prod 승인과 가격 변경을 결정한다. 리드는 근거와 선택지를 올린다. | `AGENTS.md`와 `docs/DESIGN.md` §3·§8. owner가 유료 실제 Claude 시험과 제품 범위 변경을 승인한다. 데이터 쓰기는 실행 파이프라인의 승인 정책을 거친다. |
| 병렬과 자원 | 코드·문서 브랜치는 충돌을 대조해 병렬화한다. `AGENTS.md`에서 Studio 플레이를 한 번에 한 worktree로 제한하고 Rojo 포트를 분리한다. | `docs/PROJECT.md` 구성에 따라 화면·셸, 서버·데이터 경계를 나눈다. 공용 API나 테스트 DB를 공유하면 변경 순서와 독립 DB·포트를 먼저 정한다. |
| 이름·말투 | `.claude/agents`와 `.codex/agents`의 기존 이름을 유지하는 설계다. 기존 권한·도구 제한의 실제 이전은 T08에서 확인한다. | 업무 이름과 간결한 근거 보고를 기본값으로 쓴다. 개인 비서 이름이나 사용자의 프로필은 역할에 복제하지 않는다. |
| 비용·등급 | P009가 승인한 일반 PACE 합성 호스트 점검만 수행한다. 실제 Studio 실행·광고·배포·과금의 별도 권한은 적용 범위가 확정될 때 확인한다. | `AISQL_REAL_CLAUDE=1`에는 별도 승인이 필요하다. 합성 호스트 검증은 일반 PACE 적용 범위에서만 수행하고 실제 앱·DB·유료 통합은 보류한다. |

## roblox-studio

| 필수 업무 | 근거 | 담당 | 독립 판정·결정 | 다음 인계 |
|---|---|---|---|---|
| ① 트렌드 탐색 | 정의서 §작업 프로세스, new-game ① | hermes | argos가 후속 결정에 쓰는 출처를 대조 | 출처·누락을 daedalus에게 |
| ② 벤치 비교 | `docs/templates/BENCHMARK.md` | hermes | argos가 비교 기준과 반례를 대조 | 유효 비교·한계를 daedalus에게 |
| ③ 컨셉·가격 가설 | GDD·경제 양식, 정의서 관문1 | daedalus·plutus | argos 평가 뒤 owner가 대상을 선택 | 선택 범위·권한을 제작 담당에게 |
| ④ 시제품 | `docs/templates/PROTOTYPE.md` | daedalus·gaia, 화면 필요 시 apollo | argos가 검증 가능성을 대조 | 요구·자산·결과를 ⑤ 판정으로 |
| ⑤ 시제품 판정 | `docs/templates/REVIEW.md`, 관문2 | argos | 작성자와 별도 제공자, owner가 진로 결정 | 판정·불확실성을 athena에게 |
| ⑥ 서버·UI·맵 제품 개발 | `AGENTS.md` 데이터·구매·Studio 정책 | hephaestus·apollo·gaia | argos가 회귀, 권한·공유 자원을 대조 | 커밋·검증과 범위를 릴리스 준비로 |
| ⑦ 출시 준비·승인 요청 | 출시 체크리스트·정의서 관문3 | iris·athena | argos 검증, owner가 prod 승인 | 확인된 승인과 재현 근거를 owner에게. 실제 prod 집행은 범위 밖으로 T08 이후 owner가 지정한다 |
| ⑧ 운영과 경제 관측 | 운영 지표·경제 양식 | iris·plutus | argos가 표본/근거 대조, owner가 가격 결정 | 관측·한계를 다음 조사 및 회고로 |
| ⑧ 장애 분류와 보고 | `docs/SECURITY.md`, `docs/ARCHITECTURE.md` | athena가 분류, hephaestus·apollo·gaia가 해당 영역 조사 | argos가 재현을 대조, owner가 운영 조치를 결정 | 위험과 복구 근거를 owner에게. 실제 운영 적용은 범위 밖 |
| 공통 자원·정책 | `AGENTS.md` worktree·Studio·승인 규칙 | athena | argos가 관문 증거의 누락을 대조 | 함께 쓸 자원과 범위의 상태를 담당에게 |

현재 설계 범위의 필수 업무 담당 누락은 0이다. prod 집행과 운영 변경의 권한·인계는 범위 밖으로 명시했다.

업무 단계는 `docs/README.md:90`과 `.codex/skills/new-game/SKILL.md`에서 따왔다. 명령과 운영 책임은 `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/templates/`에서 대조했다. 작성은 Codex로 배정하고 독립 판정은 Claude의 `argos`에 맡긴다. 두 제공자를 쓸 수 없을 때에는 검토를 보류한다.

| 역할 | 근거 있는 필수 업무와 분리 이유 | 금지·인계 |
|---|---|---|
| athena · 리드 | ①~⑧ 관문과 의존성 정리. `docs/README.md:90`의 각 관문에서 승인 주체가 제작자와 다르다. | 게임 선택·prod·가격을 대리 승인하지 않는다. `HANDOFF: owner`에 선택지와 증거를 보낸다. |
| hermes · 리서치 | ① 트렌드·② 비교 분석. `docs/templates/BENCHMARK.md`와 `new-game`의 원천 비교를 맡긴다. 설계에 앞서 독립 수집한 자료가 필요하다. | 결론을 승인하지 않는다. 출처·한계를 daedalus에 넘긴다. |
| daedalus · 기획 | ③ 컨셉·④ 시제품 설계. `docs/templates/GDD.md`와 `PROTOTYPE.md`가 기준이다. 조사 결과를 사용자 흐름과 구현 계약으로 바꾼다. | 자기 시제품을 판정하지 않는다. 시험 가능한 계획을 argos와 제작 역할에 넘긴다. |
| argos · QA | 결정에 쓰이는 ①~④ 출처·컨셉·시제품 및 ⑤~⑧ 판정·변경·출시·지표 검토. `docs/templates/REVIEW.md`와 `RELEASE-CHECKLIST.md`를 읽고 다른 제공자에서 판정한다. | 제작 파일을 고치지 않는다. 근거와 차단 이유를 athena에 보낸다. |
| hephaestus · 서버 | ⑥ 서버 상태, DataStore·구매 처리. `AGENTS.md`는 데이터·구매 코드에 테스트와 마이그레이션 계획을 요구한다. UI와 구매 권위가 다르다. | 클라이언트 입력을 권한으로 쓰지 않는다. API·실패 조건·회귀를 apollo와 argos에 보낸다. |
| apollo · UI | ⑥ 상호작용과 모바일 경계. Roblox UI 스킬과 `AGENTS.md`의 Studio/Git 경계에 근거한다. 화면 작업은 데이터 권한과 분리한다. | 가격·저장 권위를 정하지 않는다. 화면 상태와 기기별 관측을 argos에 넘긴다. |
| gaia · 맵 | ④/⑥ 공간·모델 작업. `AGENTS.md`의 Studio 플레이 직렬화·자산 형식을 충족한다. 공용 Studio 자원 때문에 스크립트 작업과 분리한다. | Studio에서 Git 스크립트나 prod를 변경하지 않는다. 자산·자원 상태를 athena에 알린다. |
| iris · 출시·시장 | ⑦ 출시 계획·⑧ 시장 측정. 출시 체크리스트·운영 지표가 요구하는 출시·외부 채널 준비다. 승인 전 계획만 만들 수 있기 때문에 배포 집행 및 경제 조정과 분리한다. | 게시나 광고·배포를 승인 없이 실행하지 않는다. 출시 근거를 athena에 올린다. |
| plutus · 경제 | ③ 가격 가설·⑥ 보상 설계·⑧ 경제 관측. `docs/templates/ECONOMY.md`와 `AGENTS.md` 가격 승인 경계에서 나온다. 실제 구매 처리와 경제안의 권한이 다르다. | 실제 상품·가격·재화를 바꾸지 않는다. 대안과 예상 영향만 owner에게 올린다. |

기존 역할이 각 근거와 맞아 이름을 유지했다. 시제품 작업 하나에 아홉 역할을 호출할 필요는 없다. 담당과 판정자만 선택하고 출시·운영 역할은 해당 단계에 참여한다. 기존 명시 도구 제한의 승계와 실제 Studio 잠금은 T08 현장 대조다.

작업별 최소 배정은 전체 후보에서 선택한다. 예를 들어 기존 벤치 자료를 쓰는 UI 시제품이면 daedalus와 apollo를 한 제작 역할로 합치고 argos를 따로 둔다. 자료가 새로 필요할 때만 hermes를 추가한다. 출시·가격·Studio 쓰기가 모두 범위 밖이면 그 역할의 실행은 시작하지 않는다. 조사 요약만 있는 소규모 과제는 hermes와 daedalus를 합칠 수 있지만 이 저장소의 여러 게임이 조사 자료를 공유할 때에는 조사·제작 계약이 독립적으로 이어져 두 후보를 유지한다. iris와 plutus는 보고만 함께 쓸 수 있다. 실제 출시와 상품 가격은 서로 다른 승인·되돌림 근거가 있으므로 후보를 분리한다.

## ai-sql-client

| 필수 업무 | 근거 | 담당 | 독립 판정·결정 | 다음 인계 |
|---|---|---|---|---|
| 업무 분류·정의·대표 문서 | 정의서 작업 프로세스, `backlogs/BACKLOG.md` | flow-lead | quality-review가 범위·근거를 대조 | 합의 문서와 조건을 해당 구현 담당에게 |
| 접근 권한·정책·데이터 변경 | `docs/DESIGN.md` §3·§8, `docs/DEPLOYMENT_AUTH.md` | data-api | quality-review 회귀 판단과 필요한 owner 승인 | API·실패 경계를 화면과 검토자에게 |
| UI·데스크톱 응답 | `AGENTS.md` UI 규칙, 정의서 구성 | product-ui | quality-review가 light/dark와 실제 전환·키보드 대조 | 화면·셸 근거를 검증 단계로 |
| 통합·검토·릴리스 판정 재료 | `docs/PROJECT.md` 환경, DB·fake agent·Playwright | quality-review | 작성자와 별도 제공자, 외부 권한은 owner | 독립 결과·미확인을 flow-lead에게 |
| Electron·Tauri 패키징 후보·배포 | `docs/PROJECT.md` 환경·Rust 셸 비교, `docs/DEPLOYMENT_AUTH.md` | product-ui가 후보 패키징 계획과 비교 근거 정리 | quality-review가 격리된 패키지 검증을 대조, owner가 배포 권한과 서명을 결정 | 근거를 flow-lead와 owner에게. 실제 패키지 게시·배포는 범위 밖이며 owner가 담당을 지정한다 |

현재 설계 범위의 필수 업무 담당 누락은 0이다. 실제 서명·게시·배포의 집행은 범위 밖으로 명시했다.

`AGENTS.md`, `docs/PROJECT.md`의 구성·작업 프로세스, `docs/DESIGN.md` §3·§4·§8, 루트 백로그에서 요구를 뽑았다. 개인 비서의 말투와 계정은 설계 입력에서 제외했다. 작성은 Codex, 판정은 Claude의 `quality-review`로 배정한다.

| 역할 | 근거 있는 필수 업무와 합침·분리 이유 | 금지·인계 |
|---|---|---|
| flow-lead · 계약·문서 | 요구·업무 문서·대표 설계와 승인 경계. `docs/PROJECT.md`의 루트 문서/백로그와 `docs/DESIGN.md` 경계를 함께 다룬다. 같은 산출물의 계약 조율과 문서 초안은 합치며 판정은 분리한다. | 자기 문서를 독립 검토하지 않는다. 비용·범위 증거는 owner, 판정 자료는 quality-review에 넘긴다. |
| data-api · 서버·데이터 | Fastify, ACP/MCP, DB 접근·인증·데이터 정책. `docs/DESIGN.md` §3·§8의 단일 실행 파이프라인을 한 역할에 맡긴다. 데이터 부작용을 통제하므로 화면과 분리한다. | 승인 없는 쓰기·유료 API 실행을 하지 않는다. 권한 계약·마이그레이션·실패 증거를 검토자에 보낸다. |
| product-ui · 화면·셸 | React 화면, light/dark, Electron·Tauri 경계. `AGENTS.md` UI 요구와 `docs/PROJECT.md` 구성에서 공통 화면·셸을 하나로 묶는다. | DB 정책과 배포 권한을 정하지 않는다. 화면 상태·키보드·셸 차이의 근거를 검토자에 보낸다. |
| quality-review · 독립 검증 | `AGENTS.md` typecheck/DB·UI 시험과 `docs/PROJECT.md`의 fake 에이전트·Playwright 경계. 대표 문서와 코드 모두 작성자와 다른 제공자에서 판정한다. | 작업본·사용자 환경을 고치거나 실제 유료 시험을 자동 실행하지 않는다. 실패·미확인을 flow-lead로 넘긴다. |

AI SQL은 시장·게임 경제·맵 업무가 확인되지 않았다. 시스템·문서·화면·검사의 실제 항목으로만 구성했다. 문서 대표 업무는 계약·문서 작성과 독립 검토를 선택하고, 구현이 필요한 과제로 확대되면 해당 데이터 또는 화면 역할을 배정한다.

두 설계 모두 팀 후보 표를 받은 작성자와 다른 제공자에서 증거 누락·권한·과잉 배정을 대조한다. 담당표와 실제 역할 변경은 승인 범위가 맞을 때 확정하고, 불일치한 결정은 owner에게 올린다. 적용 시 작성 역할은 Codex, 독립 판정 역할은 Claude로 명시하며, 두 제공자 적재 결과와 작업별 실제 검토 배정을 따로 기록한다.

## 역할 생성과 요청 등급

| 설계 | lead · high | maker · medium | reviewer · high |
|---|---|---|---|
| roblox-studio | athena | hermes, daedalus, hephaestus, apollo, gaia, iris, plutus | argos |
| ai-sql-client | flow-lead | data-api, product-ui | quality-review |

이 종류를 `team new --role`에 전달했다. 합성 실행에서 Claude는 `claude-opus-5-5`, Codex는 `gpt-6.2-sol`을 요청했다. 역할 종류에 따른 요청 effort는 high 또는 medium이다. 보고 모델은 각 실제 적재 기록으로 확인했으며 실제 effort는 미확인이다. 적용 저장소가 설정을 승인하기 전에는 합성 실행의 모델·등급을 운영 기본값으로 변경하지 않는다.

## 회고와 인계

회고에는 [집계 입력](../../../../docs/TEAM-METRICS.md#측정-입력), [비교](../../../../docs/TEAM-METRICS.md#비교), [회고](../../../../docs/TEAM-METRICS.md#회고와-br07-인계)를 사용한다. 누락이나 미확인 수집을 활동 0으로 확정하지 않는다. 반복 지적을 실제 승인·인계 문장의 개선 후보로 연결한다. 합성 후보 검증 결과는 T07 증거에 보존하고 실제 역할 이전·설치·Studio·도입 효과와 사용자 회고는 [T08 인계](../../USER-VALIDATION.md)에 둔다.
