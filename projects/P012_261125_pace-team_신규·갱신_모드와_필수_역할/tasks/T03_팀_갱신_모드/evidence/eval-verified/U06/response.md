# 팀 점검 결과: 갱신 모드

**요약:** 정의를 바꿀 근거가 확인된 제안은 3건입니다. 모두 PM이 정할 수 있는 정리입니다. 담당자가 없는 반복 업무가 1건 있고, 이는 user가 정해야 합니다. 필수 원형 두 개는 요건이 아직 등록되지 않아 정의 대조와 제안을 보류했습니다.

**하지 않은 것:** 지시대로 명령을 실행하지 않았고 파일도 바꾸지 않았습니다. 그래서 `pace team list`, `pace team sync --check --json`, `pace team verify`는 모두 실행하지 않았습니다. 모드는 원본 파일을 직접 읽어서 판정했습니다. `.pace/team/agents/`에 원본 5개가 있으므로 갱신 모드입니다(`skills/pace-team/SKILL.md:17`).

**관측 범위:** 완료된 프로젝트는 두 건뿐입니다.
- P602: 팀 채택(`projects/P602_261120_릴리스_문서/PROJECT.md:4`), 2026-11-20 병합
- P601: 팀 미채택(`projects/P601_261023_의존성_기록/PROJECT.md:22`), 2026-10-23 병합

허브 쪽 업무는 `backlogs/BL261112_02_허브_진행_메모/`의 BACKLOG.md와 REVIEW-LOG.jsonl에서 따로 확인했습니다.

---

## 1. 에이전트별 검토표

| 에이전트·정의 | 실제 맡은 일 | 담당 공백 | 반복 지적 | 비참여 | 호출 수·시간·토큰 | 근거(파일:행) |
|---|---|---|---|---|---|---|
| doc-auditor (`.pace/team/agents/doc-auditor.md`) | 릴리스 메모의 링크·버전 표기를 검사했습니다(P602 T02 7항목, T05 6항목). 링크 확인도 했습니다(P601 T03 5항목). 정의된 맡는 일과 맞습니다. | 없음. 다만 DEPENDENCIES.md는 검사 범위 밖입니다(별도 행 참고). | 링크 상대 경로 기준은 P602 회고에서 처리됐고 변경 이력에 있어 다시 제안하지 않습니다. 목표 검토 R1의 버전 표기 불일치(blocking)와 METRICS 표 열 수(should_fix)는 R2에서 해결됐고 1회만 관측됐습니다. T02 리뷰의 fail(blocking 1, should_fix 3)은 지적 내용이 기록되지 않아 같은 지적의 반복인지 미확인입니다. | 참여(역할 시작 행과 활동 영수증 있음) | 호출 수 미확인(P602에는 역할 시작 1행과 업무 메모 2건만 있고 `role`/`to`/`requestId` 호출 기록이 없습니다. P601의 1회는 note 기반의 팀 절 밖 집계입니다) / 시간 미확인(METRICS 신고값은 1,260,000 ms입니다. 그러나 영수증 sourceRef가 `role-observation:doc-auditor-activity:p602-obs`라서 `role-observation:<role>:activity:<locator>` 형식에 맞지 않습니다) / 토큰 미확인(신고값은 Read 4,120·Bash 1,380이며 같은 한계가 있습니다) | `.pace/team/agents/doc-auditor.md:18-22`, `projects/P602_261120_릴리스_문서/log.jsonl:2,8,9,22`, `projects/P601_261023_의존성_기록/log.jsonl:8`, `projects/P602_261120_릴리스_문서/TEAM-RETROSPECTIVE.json:25-31`, `projects/P602_261120_릴리스_문서/review-records/R1.json:1`, `projects/P602_261120_릴리스_문서/review-records/R2.json:1`, `projects/P602_261120_릴리스_문서/METRICS.md:19`, `projects/P602_261120_릴리스_문서/evidence/role-activity-doc-auditor.json:4`, `docs/TEAM-METRICS.md:183`, `AGENTS.md:21` |
| test-auditor (`.pace/team/agents/test-auditor.md`) | P601 T04에서 "테스트 12건 통과"를 확인했고 정의와 맞습니다. P602 T03·T05에서는 "릴리스 메모 검사: 버전 표기·링크 7/6항목"을 했습니다. 이는 정의(테스트 결과와 게이트 판정) 밖이고 doc-auditor의 일과 겹칩니다. tester 리뷰 행에는 역할 필드가 없어 test-auditor가 한 것인지 미확인입니다. | 없음. 대신 업무 중복이 2회 있습니다. | `review-tester-fail`이 2회입니다(T03, T05). 회고에는 기록만 되어 있고 `definitionChanges`에 이 역할이 없어 처리되지 않았습니다. 정의상 출력인 "실패 사유 한 줄"도 로그에 없습니다. | 참여 선언은 있지만 활동 영수증이 없습니다. METRICS에는 수치 부족(null)으로 나옵니다. | 호출 수 미확인 / 시간 미확인 / 토큰 미확인 | `.pace/team/agents/test-auditor.md:18-20`, `projects/P602_261120_릴리스_문서/log.jsonl:3,13,15,23,25`, `projects/P601_261023_의존성_기록/log.jsonl:12`, `projects/P602_261120_릴리스_문서/TEAM-RETROSPECTIVE.json:18-22,25-31`, `projects/P602_261120_릴리스_문서/METRICS.md:20,26` |
| conditional-helper (`.pace/team/agents/conditional-helper.md`) | 관측된 업무가 없습니다. 호출 조건이 되는 T04(외부 서비스 설정 변경)를 user가 취소했습니다. | 없음 | 없음 | 호출 조건 미발생(`condition-not-triggered`) | 호출 수 미확인 / 시간 미확인 / 토큰 미확인 | `.pace/team/agents/conditional-helper.md:18-20,25`, `projects/P602_261120_릴리스_문서/PROJECT.md:25`, `projects/P602_261120_릴리스_문서/log.jsonl:19,29`, `projects/P602_261120_릴리스_문서/METRICS.md:32`, `projects/P602_261120_릴리스_문서/evidence/role-nonpart-conditional-helper.json:4`, `.pace/team/required-roles.json:1` |
| hub-notes (`.pace/team/agents/hub-notes.md`) | BACKLOG 기록 절에서 4회 실행됐습니다. P601 메모 요약 2행을 옮긴 일은 정의와 맞습니다. 결정 열과 owner 열을 채운 3회는 정의 밖입니다. 11-20 마감한 P602의 메모 이동은 BACKLOG에 기록이 없습니다(관측 시점 기준). | P602 메모를 허브로 옮기는 일이 관측되지 않았습니다. | 결정·owner 열 작성으로 BACKLOG 검토가 4회 fail했습니다(R1~R3, 진단 뒤 R4). 이후 pm이 "결정·owner 열은 PM이 쓰고, hub-notes는 기록 절 새 행만 쓴다"고 결정했고 R5는 pass입니다. 하지만 이 결정이 정의서의 하지 않는 일과 변경 이력에 반영되지 않아 정의 측면에서는 미처리입니다. | P602: 기록 부족(미확인)입니다. 같은 기간에 백로그 쪽 실행 기록은 있지만 프로젝트 영수증이 없습니다. | 호출 수 미확인(BACKLOG의 실행 4행은 업무 기록이지 호출 수집값이 아닙니다) / 시간 미확인 / 토큰 미확인 | `.pace/team/agents/hub-notes.md:18-20,24-25,35`, `backlogs/BL261112_02_허브_진행_메모/BACKLOG.md:17,23-29`, `backlogs/BL261112_02_허브_진행_메모/REVIEW-LOG.jsonl:1-7`, `backlogs/BL261112_02_허브_진행_메모/decisions/BL261112_02-diagnosis.md:5`, `backlogs/BL261112_02_허브_진행_메모/decisions/BL261112_02-rule-change.md:5-10`, `projects/P602_261120_릴리스_문서/METRICS.md:33` |
| unused-reporter (`.pace/team/agents/unused-reporter.md`) | 관측된 업무가 없습니다. P602 회고의 `unusedRoles: []`는 이 역할이 만든 산출물이 아닙니다. | 없음 | 없음 | 실제 미사용(`unused`) | 호출 수 미확인 / 시간 미확인 / 토큰 미확인 | `.pace/team/agents/unused-reporter.md:18-20`, `projects/P602_261120_릴리스_문서/METRICS.md:34`, `projects/P602_261120_릴리스_문서/evidence/role-nonpart-unused-reporter.json:4`, `projects/P602_261120_릴리스_문서/log.jsonl:30`, `projects/P602_261120_릴리스_문서/TEAM-RETROSPECTIVE.json:4` |
| (담당 없음) DEPENDENCIES.md 의존성 목록 갱신 | owner가 직접 4회 갱신했습니다(P601 T02·T04, P602 T01·T05). 두 프로젝트 모두 이 배정은 "(자체 판단)"으로 기록됐고 user 결정이 아닙니다. | 갱신과 검사 모두 담당 역할이 없습니다. doc-auditor의 검사 범위에도 포함되지 않습니다. | 해당 없음 | 해당 없음 | 호출 수 미확인 / 시간 미확인 / 토큰 미확인 | `projects/P601_261023_의존성_기록/log.jsonl:5,11`, `projects/P601_261023_의존성_기록/METRICS.md:20`, `projects/P601_261023_의존성_기록/PROJECT.md:23`, `projects/P602_261120_릴리스_문서/log.jsonl:5,21`, `projects/P602_261120_릴리스_문서/METRICS.md:27`, `projects/P602_261120_릴리스_문서/PROJECT.md:24`, `.pace/team/agents/doc-auditor.md:18` |

**공통 관측:** maker 역할 세 개의 하지 않는 일에 `reviewer는 작업본을 수정하지 않는다`는 문장이 들어 있습니다(conditional-helper, hub-notes, unused-reporter).
- 이 문장은 역할 종류와 맞지 않습니다(`.pace/team/agents/conditional-helper.md:25`, `.pace/team/agents/hub-notes.md:25`, `.pace/team/agents/unused-reporter.md:25`).
- hub-notes는 BACKLOG.md에 행을 써야 하므로 이 문장과 충돌합니다.
- 인계 절은 "워크트리 lead에게" 보내라고 하는데, 팀에 lead 역할이 없습니다. 허브 쪽 역할(`.pace/team/required-roles.json:1`)이 인계할 곳이 분명하지 않습니다(`.pace/team/agents/hub-notes.md:35`).

**비참여 해석:** 호출 조건 미발생(conditional-helper)과 기록 부족(hub-notes)은 합치거나 제외할 근거로 쓰지 않았습니다(`docs/TEAM-METRICS.md:52-60`, `skills/pace-team/SKILL.md:41`).

## 2. 필수 역할 점검

`records/registration.md:1` 기준으로 지금은 BL261125_02 BR04와 BL261125_01을 시작하기 전입니다. 정본의 두 요건 표는 모두 비어 있습니다(`skills/pace-team/references/required-roles.md:27-28,32-33`). 이 작업본에는 BL261125_* 백로그가 없어서 합의 원문도 대조하지 못했습니다.

**등록 대조**

| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 백로그 기획자 (`pace-backlog-planner`) | 작업본에 합의 원문 없음(미확인) | 없음 | `요건 미등록(BL261125_02 BR04 담당)` — `skills/pace-team/references/required-roles.md:9,27-28`, `records/registration.md:1` |
| 문제 해결자 (`pace-troubleshooter`) | 작업본에 합의 원문 없음(미확인) | 없음 | `요건 미등록(BL261125_01 담당)` — `skills/pace-team/references/required-roles.md:10,32-33,37`, `records/registration.md:1` |

**정의 대조**

| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 백로그 기획자 | 맡은 역할 없음(AGENTS.md:10-14의 다섯 역할 중 해당 없음) | 없음 | 보류(요건 미등록). 정의 대조와 추가안을 내지 않습니다. | `skills/pace-team/references/required-roles.md:37,46` |
| 문제 해결자 | 맡은 역할 없음 | 없음 | 보류(요건 미등록). 정의 대조와 추가안을 내지 않습니다. | `skills/pace-team/references/required-roles.md:37,46` |

**재점검 조건:** 각 등록 담당 태스크가 요건 행을 등록하면 등록 대조와 정의 대조를 다시 합니다.

## 3. 갱신 제안

결정 주체는 `skills/pace-project-dev/references/decision-rights.md:9-15`의 A-1~A-5 질문으로 판정했습니다.
- 제안 1~3: 모두 '아니오'입니다. 프로젝트 합의를 바꾸지 않고, 저장소 안에서 Git으로 되돌릴 수 있으며, 안전 기준을 강화하는 쪽입니다. 비용과 권한 변화도 없습니다. 따라서 PM이 결정합니다(`AGENTS.md:20` 표기·정리).
- 제안 4: 업무 범위를 바꾸므로 user가 결정합니다.

| # | 제안 | 관측 근거 | 바꿀 역할·범위 | 필요한 검증 | 결정 주체 |
|---|---|---|---|---|---|
| 1 | **hub-notes 개선** — ① 하지 않는 일에 "BACKLOG의 결정·owner 열을 쓰지 않는다. 필요하면 허브 PM에게 HANDOFF한다"를 추가합니다. ② `vfy-r-84eabc514b1c4135` 표지는 그대로 두고 뒤 문장을 "BACKLOG.md 기록 절 밖은 수정하지 않는다"로 바꿉니다. ③ 공통 인계 문단 뒤에 "허브 쪽 역할이므로 수신자는 허브 PM이다"라는 별도 문단을 둡니다. | 검토 4회 fail과 진단, 11-19 pm 결정. 그런데 정의서에는 금지 조항이 없습니다. | `.pace/team/agents/hub-notes.md:22-25,35` | `pace team sync --check --json` 결과가 exit 0이고 `differences` 없음 → `pace team verify hub-notes --agent claude` 및 `--agent codex` → 다음 BACKLOG 검토에서 결정·owner 열 지적이 0건인지 확인 | pm. 2026-11-19 pm 결정(`backlogs/BL261112_02_허브_진행_메모/decisions/BL261112_02-rule-change.md:9-10`)을 정의서에 반영하는 정리입니다. |
| 2 | **test-auditor 경계 정리** — ① 하지 않는 일에 "문서의 링크·버전 표기 검사는 doc-auditor 담당이므로 받으면 HANDOFF한다"를 추가합니다. ② 맡는 일의 출력에 "테스트 명령, 통과·실패 수, 실패 사유를 작업 메모에 남긴다"를 분명히 적습니다. | P602에서 정의 밖의 문서 검사를 2회 했습니다(`log.jsonl:13,23`). `review-tester-fail`이 2회인데 회고에서 처리되지 않았고(`TEAM-RETROSPECTIVE.json:18-22`), 실패 사유도 기록되지 않았습니다. 반면 P601에서는 정의대로 수행했습니다(`P601 log.jsonl:12`). | `.pace/team/agents/test-auditor.md:18-20,24-25` | sync check → `pace team verify test-auditor` → 다음 팀 프로젝트에서 test-auditor 메모에 문서 검사가 없는지, fail 사유가 기록되는지 확인 | pm |
| 3 | **unused-reporter 입력·출력 정리** — ① 입력을 "역할 start 행"에서 "같은 구간의 stats JSON `team.requiredRoleNonParticipation`과 비참여 영수증"으로 바꿉니다. ② 출력은 호출 조건 미발생, 기록 부족, 실제 미사용의 세 상태로 구분합니다. ③ maker 역할 세 개의 `vfy-r-*` 문장도 표지는 두고 역할 종류에 맞게 고칩니다(conditional-helper 포함). | 허브 쪽 역할과 조건부 역할에는 start 행이 없어서, 현재 입력으로는 세 분류를 구별할 수 없습니다(`docs/TEAM-METRICS.md:54-60`). 실제 미사용이 1회 관측됐습니다(`METRICS.md:34`). | `.pace/team/agents/unused-reporter.md:18-20,25`, `.pace/team/agents/conditional-helper.md:25` | sync check → `pace team verify unused-reporter` 및 `conditional-helper` → 다음 마감에서 METRICS 팀 절과 결과가 일치하는지 대조 | pm. 단, 제외나 합침은 제안하지 않습니다. 실제 미사용 1회만으로는 근거가 부족하고, 하네스의 `unusedRoleCandidates` 대조(`docs/TEAM-METRICS.md:116`)와 업무가 겹치는지는 개선 뒤 다시 관측해 판단합니다. 제외하게 되면 `required-roles.json` 표지도 바뀌므로 user 결정입니다. |
| 4 | **DEPENDENCIES.md 담당 공백** — 선택지: (a) 새 maker 역할을 추가해 갱신을 맡김, (b) doc-auditor의 검사 범위에 DEPENDENCIES.md 표 형식·버전 검사를 추가하고 갱신은 owner가 계속함, (c) 지금처럼 유지. **추천: (b).** owner가 직접 갱신하는 이유를 모르는 상태에서는 검사 공백만 먼저 메우는 쪽이 범위 변경이 가장 작습니다. | owner가 2개 프로젝트에서 4회 직접 갱신했고, 배정은 PM의 자체 판단이었으며, 담당 역할이 없습니다. | `.pace/team/agents/doc-auditor.md:18` 또는 새 원본 | user 답을 받은 뒤 sync check와 verify → 다음 프로젝트에서 owner 직접 갱신과 검사 기록을 관측 | user(`AGENTS.md:20` 범위 변경). owner만 할 수 있는 확인이 필요하다면 A-5도 해당합니다. 회신이 올 때까지 이 항목만 보류하고, 제안 1~3은 따로 진행할 수 있습니다. |

**바꾸지 않을 역할**
- doc-auditor: 링크 기준 지적은 처리가 끝났습니다(`.pace/team/agents/doc-auditor.md:22`, `AGENTS.md:21`). 남은 지적은 1회만 관측됐습니다. 다음 마감에서 버전 표기나 표 형식 지적이 다시 나오면 재검토합니다.
- conditional-helper: 호출 조건이 발생하지 않았을 뿐이라 유지합니다(`vfy-r` 문장 정리는 제안 3에 포함).

user가 정할 질문은 제안 4 하나입니다. 승인 전까지는 팀 원본과 `.claude`/`.codex` 생성물을 그대로 둡니다.

## 4. 별도 확인이 필요한 사항
- **doc-auditor 영수증:** 활동 영수증의 sourceRef 형식이 맞지 않습니다(`projects/P602_261120_릴리스_문서/evidence/role-activity-doc-auditor.json:4`). 그래서 METRICS의 `reported` 수치를 확인값으로 쓰지 않았습니다. 다음 stats 조회에서 이 수치가 어떻게 판정되는지 확인해야 합니다.
- **생성물 일치 여부:** native 생성물에 원본 지문 표지는 있습니다(`.claude/agents/hub-notes.md:3`). 하지만 실행 금지로 `sync --check`를 돌리지 않아 원본과 일치하는지는 확인하지 못했습니다.
