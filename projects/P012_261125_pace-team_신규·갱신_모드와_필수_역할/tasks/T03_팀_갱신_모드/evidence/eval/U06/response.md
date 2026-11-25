# 팀 점검·갱신안 (pace-team 갱신 모드)

실행이나 파일 수정은 하지 않았고, 이 작업본 안의 자료만 읽었습니다. 그래서 `pace team list`, `sync --check`, `verify`는 실행하지 못했습니다. 원본 목록은 `.pace/team/agents/`를 직접 읽어 확인했고, 결과는 미실행으로 표시합니다.

## 1. 시작 모드와 관측 범위

- **모드**: 갱신. `.pace/team/agents/`에 원본 5개가 있습니다 (`AGENTS.md` 역할표와 일치). native 생성물은 `.claude/agents/*.md`와 `.codex/agents/*.toml`에 각 5개입니다.
- **최근 프로젝트**: P602(병합 2026-11-20)와 P601(병합 2026-10-23), 두 건뿐이라 둘 다 봤습니다.
  - P602는 팀 채택(`PROJECT.md:4`)입니다.
  - P601은 팀 미채택(`P601/log.jsonl`에 역할 start 행이 없음)입니다.
- **허브 쪽**: `BL261112_02`의 BACKLOG, REVIEW-LOG, decisions를 읽었습니다.
- **읽지 못한 것**:
  - 작업본에 `BL261110_01`, `BL261118_04`의 본문이 없습니다. 목록 행(`BACKLOG.md:7,10`)만 있습니다.
  - 호출 기록은 `log.jsonl`의 note뿐입니다. 역할별 토큰과 시간은 doc-auditor만 영수증이 있습니다 (`P602/METRICS.md:19`).

## 2. 필수 원형 점검

**등록 대조**

| 원형 | 합의 항목·파일:행 | 요건 ID·버전 | 등록 상태·근거 |
|---|---|---|---|
| 백로그 기획자 | 담당 BL261125_02 BR04 (`required-roles.md:9`) | 없음 | **요건 미등록(BL261125_02 BR04 담당)**. 표가 비어 있음 (`required-roles.md:27-28`). 작업본에 `BL261125_02`가 없어 합의 원문은 미확인입니다. |
| 문제 해결자 | 담당 BL261125_01 (`required-roles.md:10`) | 없음 | **요건 미등록(BL261125_01 담당)**. 표가 비어 있음 (`required-roles.md:32-33`). 작업본에 `BL261125_01`이 없습니다. |

두 원형의 정의 대조와 추가·개선 제안은 정본 규칙에 따라 보류합니다 (`required-roles.md:37,46`). 현재 팀에는 두 원형을 맡는 역할이 없습니다. 재점검 조건은 각 등록 담당 백로그가 표를 채운 뒤입니다.

**필수 역할 표지** (`required-roles.json:1`): conditional-helper(worktree·조건부), hub-notes(hub), unused-reporter(hub)입니다. `AGENTS.md` 구분표와 일치합니다.

## 3. 에이전트별 검토표

| 에이전트·정의 | 실제 맡은 일 | 담당 공백 | 반복 지적 | 비참여 | 호출 수·시간·토큰 | 근거(파일:행) |
|---|---|---|---|---|---|---|
| doc-auditor (`doc-auditor.md:16-22`) | 릴리스 메모 링크·버전 검사. P602 T02·T05에서 각 1회, P601 T03에서 1회 | 아래 공백 A 참고 | 링크 기준은 2026-11-18에 처리됨 (`doc-auditor.md:22`, `TEAM-RETROSPECTIVE.json:25-31`). 11-19 목표 검토에서 버전 표기 불일치(blocking)와 METRICS 표 열 수(should_fix)가 나옴 (`P602/review-records/R1.json`). R2에서 해소됨 | 참여 | P602 1,260,000 ms, Read 4,120·Bash 1,380 토큰, 영수증 기반 reported (`P602/METRICS.md:19`) | `P602/log.jsonl:8,22`, `P601/log.jsonl:8`, `P602/REVIEW-LOG.jsonl:1-2` |
| test-auditor (`test-auditor.md:16-19`) | 릴리스 메모 검사 note는 T03·T05에서 각 1회, 테스트 12건 통과 확인은 P601 T04에서 1회. P602 T03 check 실패 1회 | 없음 | tester fail 2건(T03, T05)은 각각 뒤 pass로 해소됨. 사유는 기록에 없음 | 참여 | 시간·토큰 미확인. 역할 시작 행만 있고 수치 영수증이 없음 | `P602/log.jsonl:13-17,23-26`, `P602/METRICS.md:20`, `P601/log.jsonl:12` |
| conditional-helper (`conditional-helper.md:16-20`) | 없음 | 없음 | 해당 없음 | **호출 조건 미발생**. T04가 외부 서비스 설정 변경이 범위에서 빠져 취소됨. 정의의 호출 조건과 일치함 | 0건. 정상 | `P602/log.jsonl:19,29`, `P602/METRICS.md:32` |
| hub-notes (`hub-notes.md:16-20`) | BACKLOG 기록 절에 새 행 추가. P601 메모 이동 등 4회 실행 | 이 업무가 아닌 것을 한 사례가 반복됨(제안 2) | **반복됨**: 결정·owner 열을 작성해 plan 검토에서 4번 fail. 2026-11-19 PM 결정 뒤 R5가 pass | 프로젝트 영수증 기준 **기록 부족(미확인)**. 같은 기간 BACKLOG에 실행 흔적이 있어 미사용으로 읽지 않음 | 호출 수·시간·토큰은 미확인 | `BACKLOG.md:23-29`, `REVIEW-LOG.jsonl:1-7`, `rule-change.md:5-10`, `P602/METRICS.md:33` |
| unused-reporter (`unused-reporter.md:16-20`) | 관측 없음 | 없음 | 해당 없음 | **실제 미사용**. 영수증 있음 | 0건 | `P602/METRICS.md:34`, `P602/log.jsonl:30` |
| **(담당 공백 행)** 의존성 목록 `DEPENDENCIES.md` 갱신 | owner가 직접 4회: P601 T02·T04, P602 T01·T05 | **어느 정의에도 담당이 없음** | 두 프로젝트에서 모두 반복됨. 팀 미채택 P601에서도 관측됨 | 해당 없음 | 해당 없음 | `P601/log.jsonl:5,11`, `P601/METRICS.md:20`, `P602/log.jsonl:5,21`, `P602/METRICS.md:27` |

**수치 대조**: P602의 METRICS 수치는 `log.jsonl`과 일치했습니다. blocking 4, should_fix 9, tester fail 2, 게이트 통과 1·실패 1, 태스크 완료 4·취소 1입니다 (`P602/METRICS.md:8-12`, `TEAM-RETROSPECTIVE.json:5-23`).

**표기 차이**: P602 `PROJECT.md:32`의 "미사용 후보 없음"은 METRICS의 unused-reporter 실제 미사용과 다르게 읽힙니다. 비참여로 분류된 역할은 `unusedRoles`에서 제외하는 규칙(`TEAM-METRICS.md:54`) 때문이라 오류는 아닙니다.

## 4. 제안

### 제안 1. 의존성 목록 갱신 담당 추가 (개선·추가)

- **관측 근거**: owner 직접 갱신이 4회입니다. 팀 채택·미채택 프로젝트에서 모두 나왔고, 현재 5개 정의 어디에도 담당이 없습니다 (`P601/METRICS.md:20`).
- **바꿀 범위**: maker 역할 1개를 신설하는 안을 추천합니다 (예: `dependency-notes`, tier medium).
  - doc-auditor는 reviewer라 작업본을 고치지 않습니다 (`doc-auditor.md:27`). 그래서 검토 독립성 때문에 doc-auditor에 합치지 않는 것을 권합니다.
  - 새 역할은 `DEPENDENCIES.md`의 항목·버전 갱신만 맡고, 검토는 기존 doc-auditor에 넘깁니다.
  - 도입하면 `pace project start P### --role <이름> --agent <claude|codex>`로 배정합니다.
- **검증**: `sync --check --json`의 differences 0, `verify <이름>`의 적재 확인, 다음 프로젝트에서 owner 직접 갱신 횟수를 비교합니다.
- **결정 주체**: user를 권합니다.
  - P602 note에 "owner가 직접 갱신한다"는 자체 판단이 적혀 있습니다 (`P602/PROJECT.md:24`).
  - 담당을 바꾸는 일이라 `AGENTS.md`의 "범위 변경은 user"에 가깝습니다. A-1에 해당하는지는 PM이 판정하되 불분명하면 user에게 올리세요.
  - 승인 전에는 원본과 생성물을 유지합니다.

### 제안 2. hub-notes 정의에 금지 항목과 변경 이력 명시 (개선)

- **관측 근거**: 정의의 출력은 "새 행"뿐이었는데도 결정·owner 열 작성이 4번 fail을 만들었습니다 (`REVIEW-LOG.jsonl:1,2,3,5`, `diagnosis.md:5`).
- **처리 상태**: 2026-11-19 PM이 "결정·owner 열은 PM, hub-notes는 새 행만"으로 정했고 R5가 pass했습니다 (`rule-change.md:9`, `REVIEW-LOG.jsonl:6-7`).
  - 이번 제안은 그 결정을 다시 정하자는 것이 아닙니다.
  - `hub-notes.md`에는 변경 이력과 명시 금지가 없습니다 (`hub-notes.md:22-25`).
  - `AGENTS.md`는 "변경 이력에 있는 항목은 처리 끝"으로 읽으므로, 정의에 반영돼야 같은 지적이 재발해도 근거가 남습니다.
- **바꿀 범위**: `hub-notes.md`의 "하지 않는 일"에 한 줄을 추가합니다. 내용은 "BACKLOG 결정·owner 열은 쓰지 않는다. 이 열은 PM이 쓴다"입니다. 날짜와 근거를 단 변경 이력 한 줄은 doc-auditor의 `doc-auditor.md:22` 형식을 따릅니다. 공통 문단과 `vfy-*` 표지는 보존합니다.
- **검증**: `sync --check`, `verify hub-notes`, 다음 BACKLOG 검토에서 결정·owner 열 지적이 0인지 확인합니다.
- **결정 주체**: PM입니다. 표기·정리이고 user의 범위·우선순위 결정에 영향이 없습니다 (`rule-change.md:10`). BL261114_03의 결정자가 user인 점은 그대로 유지합니다 (`BACKLOG.md:16`).

### 제안 3. unused-reporter는 무변경, 중복 여부만 확인 (근거 있는 무변경)

- **관측**: P602에서 실제 미사용입니다 (`P602/METRICS.md:34`).
- **참고**: 같은 정보를 이미 하네스가 `METRICS.md` 팀 절 "필수 역할 비참여"에 냅니다 (`TEAM-METRICS.md:54`, `P602/METRICS.md:29-34`). 업무 중복 가능성은 있지만, 관측은 1개 프로젝트이고 미사용·미발생만으로는 합침이나 제외를 제안하지 않는 규칙입니다.
- **다음 검증**: 다음 팀 프로젝트에서 unused-reporter 산출물을 실제로 쓰는지 확인합니다. 그래도 중복이 확인되면 그때 합침 제안을 냅니다. `required-roles.json`의 표지도 같이 대조해야 합니다.

## 5. 제안하지 않은 것

- **doc-auditor 링크 기준**: 2026-11-18에 처리가 끝난 항목이라 같은 근거로 재제안하지 않았습니다 (`doc-auditor.md:22`, `TEAM-RETROSPECTIVE.json:25-31`).
- **doc-auditor 버전 표기 일치 기준 추가**: 보류합니다. 버전 불일치 blocking은 R1에서 1회만 나왔습니다. 11-19 diff의 버전 변경이 앞선 검사(11-11, 11-14) 이후라 doc-auditor의 누락으로 단정할 수 없습니다. 같은 지적이 한 번 더 나오면 "기준 버전은 PROJECT 목표의 버전" 한 문장 추가를 제안하겠습니다.
- **반복 지적 3건(`review-blocking` 4, `review-should-fix` 9, `review-tester-fail` 2)**: 특정 역할과 문장에 연결할 사유 기록이 없어 미확인으로 둡니다.
  - T03·T05 tester fail의 사유 기록(review-records)이 없습니다.
  - 필요한 근거는 해당 두 건의 지적 원문입니다.
- **hub-notes의 "기록 부족(미확인)" 분류**: 유지합니다. BACKLOG에는 4회 실행 흔적이 있지만 `P602` 구간의 영수증이 아닙니다. 정리하려면 역할 활동 영수증이 필요합니다 (`TEAM-METRICS.md:183`).

## 6. 검증 상태와 남은 확인

| 항목 | 상태 |
|---|---|
| `pace team sync --check --json` | **미실행**. Claude·Codex의 doc-auditor 생성물에는 2026-11-18 변경 문구가 들어 있어 최신 원본에서 생성된 것으로 보입니다. 원본 SHA 일치는 확인하지 못했습니다. |
| `pace team verify --all` | **미실행**. `.pace/team/verify/` 보고서가 작업본에 없어 적재 관측이 없습니다. P602 role start의 `runtimeObserved:false`, `settingsStatus:planned`와 같은 상태입니다 (`P602/log.jsonl:2-3`). |
| 교차 제공자 검토 | 미확인. P602·BL 검토 로그는 모두 `verifier: claude`이고 `cross` 필드와 다른 제공자 시도 기록이 없습니다 (`P602/REVIEW-LOG.jsonl`, `BL.../REVIEW-LOG.jsonl`). 이 팀 계약이 제공자 독립성을 요구하는지도 작업본에서 확인하지 못했습니다. 요구한다면 B1 기록(`cross:false`와 사유)이 있는지 PM이 확인해야 합니다. |

## 7. 다음 단계

1. 제안 1은 user 결정(채택·보류·담당 대안)을, 제안 2는 PM 승인을 받아 주세요.
2. 승인되면 `.pace/team/agents/`의 원본을 수정합니다. 새 역할은 `pace team new`로 만들고 `pace team sync`로 생성물을 갱신합니다.
3. 반영 뒤 `sync --check --json`과 `verify`를 실행해 결과를 기록합니다.
