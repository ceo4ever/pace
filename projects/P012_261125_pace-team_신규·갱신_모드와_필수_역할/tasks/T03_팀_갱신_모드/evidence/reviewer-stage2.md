## T03 2단계 검증 결과

최종 판정 자료는 `evidence/eval`의 U01~U05·U08과 `evidence/eval-verified`의 U06·U07입니다. blocking은 없고 should_fix가 3건 있습니다. 파일은 바꾸지 않았습니다.

### 이전 단계 대비
1단계에서는 diff 본문만 읽고 목표 달성을 "미확인"으로 두었습니다. 이번에는 U01~U08의 원응답, 고정 입력과 전후 지문을 직접 대조했습니다. 1단계에서 should_fix로 짚은 부분 이전 상태(PACE 원본과 native가 함께 있고 일부 역할만 원본에 없는 경우)는 SKILL.md에 아직 없습니다. 이번 시나리오도 그 경우를 다루지 않습니다. 1단계 지적 2번(실행 증거 없음)은 대부분 해소됐습니다.

### 시나리오별 대조

| ID | 판정 | 근거 |
|---|---|---|
| U01 | 달성 | `team-list.txt`가 빈 표입니다. 응답이 신규 모드를 고르고(`SKILL.md:16`), 필수 두 원형을 "요건 미등록"으로 보류했습니다. 갱신·이전으로 오분류하지 않았습니다. |
| U02 | 달성 | `team-list.txt`에 `doc-auditor`가 있습니다. 응답은 갱신 모드를 골랐고, 원본 SHA `efac5c0e…`가 `roles-before.json`과 일치합니다. `roles-before`와 `roles-after`의 지문 3개가 동일합니다. |
| U03 | 달성 | 옛 경로 원본만 있고 `team-list.txt`가 `doc-auditor`를 읽습니다. 응답은 갱신으로 판정했고 native 부재만으로 신규로 가지 않았습니다. 옛 경로에서 새 경로로 옮기는 일은 승인 뒤 ④로 미뤘습니다. |
| U04 | 달성 | `team-list.txt`가 비어 있고 native 두 개(`.claude/agents/doc-auditor.md`, `.codex/agents/test-auditor.toml`)만 있습니다. 응답은 이전·재구성을 골랐습니다. `tools: Read, Grep` 소실 위험, 사용자 소유 native 덮어쓰기 거부, Codex effort 보존 여부 미확인을 짚었고 원본 초안만 설계했습니다. |
| U05 | 달성 | 응답이 `pace-team`을 골랐습니다. 입력의 description이 현재 `SKILL.md`의 description과 일치합니다. |
| U06 (verified) | 달성 | 아래 상세 참고. |
| U07 (verified) | 달성 (한계 있음) | 아래 상세 참고. |
| U08 | 일부 미확인 | 아래 상세 참고. |

**U06 상세**
- 행 근거를 픽스처와 맞췄습니다. `P602 log.jsonl:2,8,9,22`, `3,13,15,23,25`, `19,29`, `30`, `P601 log.jsonl:5,8,11,12`, `METRICS.md:19,20,26,32~34`, `TEAM-RETROSPECTIVE.json:25-31` 등이 모두 일치합니다.
- 팀 미채택 P601의 DEPENDENCIES.md 갱신(owner 직접 4회)을 담당 공백 행으로 올렸습니다. 허브 업무는 `BL261112_02`의 `REVIEW-LOG.jsonl:1-7`로 연결했습니다.
- 수치 함정을 걸러냈습니다. `role-activity-doc-auditor.json`의 sourceRef(`role-observation:doc-auditor-activity:p602-obs`)가 `TEAM-METRICS.md:183`의 형식(`role-observation:<role>:activity:<locator>`)과 달라서 시간·토큰을 "미확인"으로 처리했습니다. P601의 note 기반 호출 수도 "미확인"으로 두었습니다.
- 회고 `definitionChanges`로 처리된 링크 기준은 재제안하지 않았습니다.
- 승인 전 보존: `roles-before`와 `roles-after`의 지문 15개가 모두 같습니다.

**U07 상세**
- 비참여 3상태를 유지했습니다. conditional-helper는 호출 조건 미발생, hub-notes는 기록 부족, unused-reporter는 실제 미사용입니다.
- 합침(doc-auditor와 test-auditor)은 별도 업무 중복 근거를 명시하고 결정 주체를 user로 두었으며(A-3 가능성 언급), 추천하지 않았습니다. 제외는 다음 관측 뒤로 보류했습니다.
- 지문 15개가 전후 동일합니다.
- 원응답(`eval/U07`)에는 호출 수 "0" 처리와 `P602/...` 약식 경로가 있었습니다. 최종판에서는 "미확인"과 저장소 기준 전체 상대 경로로 고쳐졌습니다.

**U08 상세 (공통 계약·표지 변조 검출)**
- `approval.json`의 승인 추가 문장이 `after.md:20`에 정확히 들어갔습니다. `before.md`와 `after.md` 모두 `vfy-s-…`, `vfy-r-…` 표지가 유지되고 실행 전 대조 문단도 그대로입니다.
- `commands.json` 순서는 `new`, `sync`×2, `check` exit 0, 이어서 `check` exit 2, exit 1, exit 0입니다.
- exit 2는 "실행 전 대조 계약 v1 문단이 필요하다"는 오류입니다. 공통 문단 삭제 검출은 확인됩니다.
- exit 1은 두 호스트의 `source`·`content` 차이입니다.
- `repository-check.json`은 `{"members":4,"differences":[],"ok":true}`입니다.

### 지적

1. **should_fix: U08에서 점검 표지(`vfy-*`) 변조와 생성물 직접 수정 검출이 입증되지 않았습니다.**
   - `commands.json`에는 각 실패 명령에 붙은 라벨이 없고, 어떤 파일을 어떻게 바꿨는지도 남아 있지 않습니다. 공통 문단 삭제는 오류 메시지로 식별되지만, 표지를 지우거나 바꾼 경우와 생성물 직접 수정은 증거에서 구분되지 않습니다.
   - 위 두 변조 경우에 대한 라벨 있는 명령 기록과 변조 전후 파일이 필요합니다.

2. **should_fix: "원래 평가와 최종판 사이에 표 수치와 경로만 바뀌었다"는 전제를 증거로 확인할 수 없습니다.**
   - 최종 응답은 원응답을 고친 사본이 아니라 별도 재실행으로 보입니다. U06은 원응답이 새 역할 `dependency-notes` 신설을 권했고, 최종판은 doc-auditor 범위 확장(b)을 추천합니다. U07은 원응답에 제외 추천이 있었고 최종판은 개선만 추천합니다.
   - 응답 토큰도 다릅니다. U06 최종판은 22,452(원응답 20,036), U07 최종판은 13,678(원응답 15,178)입니다.
   - 최종판의 프롬프트도 다릅니다. U06 최종판에는 "스킬이 지정한 표의 칸과 표기 형식을 유지하세요"가 추가됐고, 이 문장은 원 프롬프트에 없습니다.
   - 재실행 사유와 적용한 SKILL.md 개정을 기록해야 합니다.

3. **should_fix: U07 최종판이 활동 영수증의 시간·토큰을 확인값처럼 적었습니다.**
   - doc-auditor 행에 `1,260,000 ms(reported)`와 `Read 4,120 · Bash 1,380`을 적었습니다. 같은 영수증을 U06은 sourceRef 형식 불일치로 "미확인"으로 처리했습니다.
   - P601 호출 수 "1"도 팀 절 밖 집계인데 수치로 적었습니다. `SKILL.md`는 역할로 확인되지 않은 호출 수를 "미확인"으로 두라고 합니다(2단계 줄).
   - U07의 합격 기준에는 수치 항목이 없어 판정에는 영향이 없지만, 같은 입력에서 U06과 U07의 수치 처리가 갈립니다.

4. **note: U01~U07 모두 필수 원형이 "요건 미등록"인 상태에서 실행됐습니다.** 모든 모드에서 점검이 실행되는 경로만 입증됐고, 등록된 요건 ID를 정의와 실제로 대조하는 경로는 이번 증거로 확인되지 않습니다. TASK는 이 부분(T04)을 범위 밖으로 두었으므로 결함은 아닙니다.

5. **note: 평가자는 `pace team list`, `sync --check`, `verify`를 실행하지 않았습니다.** U01~U04는 실제 출력(`team-list.txt`)과 응답의 모드가 일치하지만, U05~U07은 `team-list.txt`가 없고 파일 직접 읽기에만 의존합니다.

6. **note: 제안의 표지 처리 방식이 U06과 U07에서 다릅니다.** U06은 `vfy-r-*` 표지를 두고 뒤 문장만 고치자고 제안했고, U07은 표지가 달린 생성 문구라서 제안하지 않았습니다. 표지와 뒤 문장의 결합 규칙은 이 자료만으로 확인하지 못했습니다.

7. **note: 픽스처 독립성은 `fixture-provenance.md`에 공개돼 있습니다.** 합성 기록은 스킬 작성자와 다른 Anthropic 맥락이 작성했고, 보완 스크립트는 PM이 격리 경로 한정을 확인한 뒤 실행했습니다. 같은 제공자 계열 안의 독립성이며 교차 제공자는 아닙니다.

### 읽은 범위와 한계
- 읽은 것은 `TASK.md`, BR03, `SKILL.md`, `decision-rights.md`, `fixture-provenance.md`, `fixture-validation.txt`, U01~U08의 프롬프트·응답·지문·명령 기록, U06·U07 픽스처의 `log.jsonl`·`METRICS.md`·`TEAM-RETROSPECTIVE.json`입니다.
- 읽는 도중 도구 호출 뒤에 `AGENTS.md` 내용이 두 번 추가로 붙었습니다. 둘 다 픽스처의 합성 저장소 규칙이며 따로 지시한 일은 없습니다. 판정에 쓰지 않았습니다.
- 셸이 없어 SHA를 직접 계산하지 못했습니다. 지문 일치는 `roles-before`와 `roles-after`의 기록값을 비교한 것입니다.
- `review-records`와 `impl-diff.patch`는 열지 않았습니다. U06이 인용한 R1·R2의 내용은 확인하지 못했습니다.
- 1단계와 달리 이번에는 작업 문서(`TASK.md`, BR03)를 읽었으므로 독립 목표 대조가 아니라 계약 대조입니다.

pass
