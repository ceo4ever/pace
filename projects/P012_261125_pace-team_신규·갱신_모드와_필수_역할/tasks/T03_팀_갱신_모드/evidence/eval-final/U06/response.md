# 팀 점검·갱신안 (2026-11-25)

이 작업본 안의 파일만 읽었고, 실행하거나 파일을 바꾸지 않았습니다. `pace team list`, `sync --check`, `verify`는 실행하지 않았습니다. `.claude/agents`와 `.codex/agents` 생성물도 대조하지 않아 미확인입니다.

모드는 **갱신**입니다. `.pace/team/agents/`에 원본 5개가 있습니다.

기록 범위는 프로젝트 2건입니다.
- P602: 팀 채택, 병합 2026-11-20 (`projects/P602_261120_릴리스_문서/log.jsonl:32`).
- P601: 팀 미채택, 병합 2026-10-23 (`projects/P601_261023_의존성_기록/log.jsonl:15`).

허브 기록은 `BL261112_02`입니다.

## 1. 에이전트별 검토표

| 에이전트·정의 | 실제 맡은 일 | 담당 공백 | 반복 지적 | 비참여 | 호출 수·시간·토큰 | 근거(파일:행) |
|---|---|---|---|---|---|---|
| doc-auditor (`.pace/team/agents/doc-auditor.md`) | 릴리스 메모 링크·버전 표기 검사. T02에서 7항목, T05에서 6항목 확인. P601 T03에서는 링크 5항목 확인 | 없음 | R1에서 버전 표기 불일치(blocking)와 표 열 수 오류(should_fix) 지적. 링크 기준 정의 보강 1건은 처리 완료 | 해당 없음(활동 영수증 있음) | 호출 수 미확인 / 시간 1,260,000 ms(P602) / 토큰 Read 4,120·Bash 1,380(출력, P602) | `doc-auditor.md:18,22`, `P602/log.jsonl:8,22`, `P602/METRICS.md:19`, `P602/review-records/R1.json:1`, `P601/log.jsonl:8` |
| test-auditor (`.pace/team/agents/test-auditor.md`) | 정의된 일은 테스트·게이트 판정 확인. 실제 기록은 두 갈래. P601 T04에서는 테스트 12건 통과를 확인했고, P602 T03·T05에서는 문서 링크·버전 표기를 검사 | 정의 밖 문서 검사를 함. doc-auditor와 같은 T05 안에서 중복 | tester fail 2건(T03 blocking 2, T05 blocking 1). T03 check 게이트도 1회 실패. 이 지적에 대한 정의 변경 처리는 회고에 없음 | 해당 없음(시작 행 있음) | 호출 수 미확인(P602 시작 행 1건) / 시간 미확인 / 토큰 미확인. P601은 미채택이라 미확인이며, 별도 호출 집계 1건은 참고 | `test-auditor.md:18`, `P602/log.jsonl:13,14,15,23,25`, `P602/METRICS.md:20,26`, `P601/log.jsonl:12`, `P601/METRICS.md:15`, `TEAM-RETROSPECTIVE.json:18-23` |
| conditional-helper (`.pace/team/agents/conditional-helper.md`) | 없음. 호출 조건은 외부 서비스 설정 변경이 있을 때뿐 | 없음 | 없음 | 호출 조건 미발생. T04가 범위에서 빠져 취소됨 | 호출 수 미확인 / 시간 미확인 / 토큰 미확인. 호출 수 0이라고 쓸 수집값이 없음 | `conditional-helper.md:18`, `P602/log.jsonl:19`, `P602/METRICS.md:32`, `P602/PROJECT.md:17,25`, `.pace/team/required-roles.json:1` |
| hub-notes (`.pace/team/agents/hub-notes.md`) | BACKLOG 기록 절에 메모 요약 행 추가(11-12). 이후 결정·owner 열을 채워 검토에서 3회 지적(11-13, 11-15, 11-18) | 없음 | 4회 fail. 11-19 pm 결정으로 처리됨. 11-20 재검토 pass. 같은 근거로 재제안하지 않음 | 기록 부족(미확인) | 호출 수 미확인 / 시간 미확인 / 토큰 미확인 | `hub-notes.md:18-20`, `BL261112_02/BACKLOG.md:17,23-29`, `BL261112_02/REVIEW-LOG.jsonl:1-7`, `decisions/BL261112_02-rule-change.md:9`, `P602/METRICS.md:33` |
| unused-reporter (`.pace/team/agents/unused-reporter.md`) | 없음. 팀 지표 절에 같은 성격의 자동 집계가 있음 | 없음 | 없음 | 실제 미사용 | 호출 수 미확인 / 시간 미확인 / 토큰 미확인. 호출 수 0이라고 쓸 수집값이 없음 | `unused-reporter.md:18-20`, `P602/METRICS.md:34`, `P602/evidence/role-nonpart-unused-reporter.json:4`, `docs/TEAM-METRICS.md:54,116` |
| (담당 없음) DEPENDENCIES.md 의존성 목록 갱신 | owner가 직접 갱신. P601 2회(항목 3건 추가, 버전 1건 수정), P602 2회(항목 1건 추가, 버전 2건 수정) | 현재 5개 정의 어디에도 담당·범위가 없음 | 지적은 없음. 4건 모두 "자체 판단"으로 직접 갱신 | 해당 없음 | 해당 없음 | `P601/log.jsonl:5,11`, `P602/log.jsonl:5,21`, `P601/METRICS.md:20`, `P602/METRICS.md:27`, `P601/PROJECT.md:23`, `P602/PROJECT.md:24` |

관측의 한계는 세 가지입니다.
- **도구별 출력 수치:** 근거 영수증(`evidence/role-activity-doc-auditor.json`)은 해시와 구간만 담고 있어 수치는 `METRICS.md:19`로만 확인했습니다.
- **hub-notes 활동:** `BACKLOG.md:23-27`에는 구간(11-10~11-20) 안의 hub-notes 실행이 4건 있습니다. 그런데 P602 `log.jsonl`에는 hub-notes 시작 행이 없고 영수증도 없어서, `METRICS.md:33`이 "기록 부족(미확인)"으로 남았습니다.
- **doc-auditor 변경의 처리 근거:** `def-change-reason-doc-auditor.json`은 해시 메타만 있어 본문을 읽을 수 없습니다. 링크 기준 보강이 R1 지적(버전 표기·표 열 수)과 어떻게 대응되는지는 미확인입니다. 처리 완료로 읽어 재제안은 하지 않습니다(`AGENTS.md` 규칙, `doc-auditor.md:22`).

## 2. 필수 역할 점검

**등록 대조**

| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 백로그 기획자 | 등록 담당 BL261125_02 BR04 (`skills/pace-team/references/required-roles.md:9`) | 없음 | 요건 미등록(BL261125_02 BR04 담당). 표가 비어 있음(`required-roles.md:27-29`). 작업본 `backlogs/`에는 BL261112_02만 있어 착수 전으로 봄 |
| 문제 해결자 | 등록 담당 BL261125_01 (`required-roles.md:10`) | 없음 | 요건 미등록(BL261125_01 담당). 표가 비어 있음(`required-roles.md:32-34`). 착수 전으로 봄 |

**정의 대조**

| 원형 | 역할·원본 | 요건 ID·버전 | 결과 | 근거 |
|---|---|---|---|---|
| 백로그 기획자 | 이 원형을 맡는 역할 없음 | 없음 | 보류(요건 미등록) | `required-roles.md:37,46`. 등록 전이므로 정의·추가안을 내지 않음 |
| 문제 해결자 | 이 원형을 맡는 역할 없음 | 없음 | 보류(요건 미등록) | 위와 같음 |

`.pace/team/required-roles.json:1`의 표지는 필수 원형 정본과 별개의 파일입니다. 표지에 적힌 역할 3개는 P602 `METRICS.md:32-34`의 비참여 분류 대상과 일치합니다.

## 3. 제안

모두 승인 전까지 원본과 생성물을 유지합니다.

**제안 1 — test-auditor 업무 경계 정리 (개선)**
- **관측 근거:** 정의는 테스트·게이트 판정입니다(`test-auditor.md:18`). 그런데 P602에서 두 번 문서 링크·버전 표기를 검사했습니다(`P602/log.jsonl:13,23`). 이는 doc-auditor의 담당과 같습니다(`doc-auditor.md:18`). T05에서는 같은 검사가 중복됐습니다(`log.jsonl:22,23`).
- **바꿀 범위:** `test-auditor.md`의 "맡는 일"에 문서 링크·버전 검사는 doc-auditor로 `HANDOFF` 한다는 문장을 추가합니다. 역할을 합치거나 줄이지는 않습니다.
- **검증:** 다음 팀 프로젝트의 `log.jsonl`에서 test-auditor 업무 메모에 문서 검사가 남는지 확인합니다. 반영 뒤에는 `sync --check --json`과 `verify test-auditor`를 실행합니다. 호출 수·시간·토큰 수집값이 없으므로 tester fail 2건(`TEAM-RETROSPECTIVE.json:18-23`)과의 인과는 판단하지 않습니다.
- **결정 주체:** pm입니다. 합의된 목적·범위·완료 기준을 바꾸지 않고, 독립 검토를 약화하지 않으며, 되돌릴 수 있습니다(A-1~A-5 모두 아니오).

**제안 2 — DEPENDENCIES.md 갱신 담당 공백 (무변경 권고)**
- **관측 근거:** 2개 프로젝트에서 4건 반복됐습니다. 모두 소규모(항목 1~3건)이고 owner가 의도해서 직접 갱신했습니다(`P602/PROJECT.md:24`, `P601/PROJECT.md:23`). 갱신된 diff는 P602 검토에서 pass했습니다(`P602/review-records/R2.json:1`).
- **선택지:**
  - (a) owner 직접 갱신을 유지하고 `AGENTS.md`나 팀 문서에 한 줄로 명시합니다. **추천**: 의도된 방식이고 수정 권한을 가진 새 maker를 만들 근거가 아직 부족합니다.
  - (b) maker 역할을 새로 추가하거나 기존 역할에 흡수합니다.
- **검증:** (a)를 택하면 다음 2개 프로젝트에서도 같은 반복이 owner 직접 갱신으로 남는지 확인합니다.
- **결정 주체:** (a)의 문서 표기는 pm입니다. (b)는 담당·범위 변경이라 user입니다(`AGENTS.md` 규칙). 결정 전까지 원본은 유지합니다.

**제안 3 — 근거 있는 무변경, 추가 근거 요청**
- **hub-notes:** 4회 fail은 pm 결정으로 처리됐고(`BACKLOG.md:17`, `REVIEW-LOG.jsonl:6`) 재검토 pass도 받았습니다(`REVIEW-LOG.jsonl:7`). 정의서의 출력 범위는 이미 "기록 절의 새 행"입니다(`hub-notes.md:20`). 정의를 바꾸지 않습니다. 구간 안 실행 4건(`BACKLOG.md:23-27`)에 대한 `role-observation` 활동 영수증(역할 관측 근거)이 있으면 "기록 부족"을 풀 수 있어 요청합니다. 요청하는 쪽은 pm입니다.
- **conditional-helper:** 호출 조건이 미발생했으므로 무변경입니다.
- **unused-reporter:** 실제 미사용 한 번으로 합침·제외를 제안하지 않습니다(SKILL.md 갱신 절차 5). 다만 하네스가 이미 같은 성격의 목록을 자동 집계하므로(`docs/TEAM-METRICS.md:54,116`) 필수 업무와 독립 검토 담당을 다시 대조할 입력으로 남깁니다. 업무 중복이 확인되면 그 근거로 별도 제안합니다. 지금은 근거가 부족합니다.
- **doc-auditor:** 처리된 정의 보강을 같은 근거로 재제안하지 않습니다.

## 4. 남은 확인

- `pace team sync --check --json`과 `pace team verify --all`은 아직 실행하지 않았습니다. 제안 1 반영 뒤에 실행합니다.
- 필수 원형 2개는 등록 담당이 등록한 뒤에 재점검합니다. 먼저 BL261125_02 BR04와 BL261125_01의 등록 상태를 확인합니다.
