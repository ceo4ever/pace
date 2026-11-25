**결론:** 개선 2건, 제외 검토 1건, 담당 공백 1건을 제안합니다. 합침은 권하지 않습니다. 승인 전이라 파일은 바꾸지 않았고, 작업본 밖도 읽지 않았습니다. `pace team list`, `sync --check`, `verify`는 실행하지 않고 원본과 기록을 직접 읽었습니다. 그래서 `.claude/agents`와 `.codex/agents` 생성물의 일치 여부, 적재 검증, 역할별 호출 수는 미확인입니다. 읽은 기록은 최근 프로젝트 2건(P601, P602)과 백로그 BL261112_02뿐이라 5건 상한 안에서 전부 본 것입니다.

## 현재 정의
- 역할 5개: doc-auditor, test-auditor(reviewer), conditional-helper, hub-notes, unused-reporter(maker).
- `.pace/team/required-roles.json:1`: conditional-helper는 worktree·조건부, hub-notes와 unused-reporter는 hub 상시로 지정돼 있습니다.

## 필수 원형 점검
| 원형 | 상태 | 근거 |
|---|---|---|
| 백로그 기획자 | `요건 미등록(BL261125_02 BR04 담당)` | `skills/pace-team/references/required-roles.md:27-29` 표가 비어 있고, `records/registration.md:1`이 등록 전이라고 적음 |
| 문제 해결자 | `요건 미등록(BL261125_01 담당)` | `required-roles.md:32-34`, `records/registration.md:1` |

두 원형 모두 정의 대조와 추가안을 보류합니다. 합의되지 않은 정의는 제안하지 않습니다. 재점검은 각 등록 담당의 차례가 지난 뒤에 합니다.

## 에이전트별 검토표
| 에이전트·정의 | 실제 맡은 일 | 담당 공백 | 반복 지적 | 비참여 | 호출·시간·토큰 | 근거(파일:행) |
|---|---|---|---|---|---|---|
| doc-auditor (`.pace/team/agents/doc-auditor.md:18`) | 릴리스 메모 링크·버전 검사 (P602 T02·T05, P601 T03) | 없음 | 링크 기준 보강 1건은 이미 처리됨 (`doc-auditor.md:22`) | 참여 | 21분, Read 4,120·Bash 1,380 토큰(reported). 호출 수는 note 기준 P602 2회, P601 1회 | `projects/P602_261120_릴리스_문서/METRICS.md:19`, `log.jsonl:8,22`, `TEAM-RETROSPECTIVE.json:25-31`, `P601/log.jsonl:8` |
| test-auditor (`test-auditor.md:18-20`) | P601 T04에서 테스트 12건 확인(정의대로). P602 T03·T05에서는 링크·버전 검사 note를 남김(정의 밖) | doc-auditor와 같은 검사를 같은 태스크 T05에서 각각 수행 | tester fail 2건(T03·T05)은 역할에 결합되지 않음 | 참여 | 미확인 (`METRICS.md:20`) | `P602/log.jsonl:13,15,22,23,25`, `P601/log.jsonl:12` |
| conditional-helper (`conditional-helper.md:18`) | 없음 | 없음 | 없음 | 호출 조건 미발생 (T04 취소로 외부 설정 변경이 범위에서 빠짐) | 0건 확인 | `METRICS.md:32`, `P602/log.jsonl:19`, `evidence/role-nonpart-conditional-helper.json` |
| hub-notes (`hub-notes.md:18-20`) | 허브 기록 절 새 행(P601 요약 이동). 정의 밖인 결정·owner 열 작성이 3회 | P602 요약 이동 기록 없음(미확인) | 결정·owner 열 지적 fail 4회 뒤 PM 결정으로 처리, 재검토 pass | 프로젝트 구간은 기록 부족(미확인) | 허브 기록 4행(11-12·13·15·18). 호출 로그가 아니라 BACKLOG 기록 절 기준 | `BACKLOG.md:23-29`, `REVIEW-LOG.jsonl:1-7`, `decisions/BL261112_02-rule-change.md:9-10`, `METRICS.md:33` |
| unused-reporter (`unused-reporter.md:18-20`) | 없음 | 없음 | 없음 | 실제 미사용 | P601·P602 두 프로젝트와 BACKLOG 기록 모두 호출 없음 | `METRICS.md:34`, `evidence/role-nonpart-unused-reporter.json`, `P601/METRICS.md:14-15` |
| (담당 없음) 의존성 목록 `DEPENDENCIES.md` 갱신 | owner가 직접 4회: P601 T02·T04, P602 T01·T05 | 5개 정의 어디에도 없음 | 없음 | - | - | `P601/log.jsonl:5,11`, `P602/log.jsonl:5,21`, `P601/METRICS.md:20`, `P602/PROJECT.md:24` |

## 제안
각 제안은 승인 전까지 보류하고 원본과 생성물을 유지합니다.

1. **test-auditor 경계 문장 정리 (개선).**
   - 근거: P602 T05에서 두 역할이 같은 검사를 중복 수행했습니다(`P602/log.jsonl:22-23`).
   - 합침은 권하지 않습니다. 둘 다 독립 검토 역할이고, test-auditor는 P601 T04에서 정의대로 쓰였습니다. 합치면 검토자가 하나로 줄어듭니다.
   - 바꿀 범위: test-auditor의 "하지 않는 일"에 문서 링크·버전 검사는 doc-auditor 담당이라는 한 문장.
   - 검증: `sync --check` 후 `verify test-auditor`, 다음 릴리스 프로젝트에서 중복 note가 없는지 확인.
   - 결정 주체: PM입니다. 표기·정리이고, 합의 변경이나 검토 약화(A-1·A-3)에 해당하지 않습니다.
   - 확인 필요: T05 중복이 의도한 이중 검토였는지 모릅니다. 의도였다면 이 제안은 철회합니다.
2. **unused-reporter 제외 검토.**
   - 실제 미사용만으로는 제외하지 않습니다. 별도 근거는 업무 중복입니다. 미사용 역할 목록은 하네스가 이미 산출합니다(`docs/TEAM-METRICS.md:54`, `:116`).
   - 이 역할은 필수 원형이 아니고 독립 검토도 맡지 않습니다.
   - 바꿀 범위: `unused-reporter.md`와 `required-roles.json:1` 항목, 이후 `sync`.
   - 결정 주체: 먼저 PM이 hub 상시 배정의 출처를 확인합니다. 그 배정이 owner 합의면 owner가 결정합니다. 출처를 못 찾으면 PM이 정리합니다.
   - 추천: 출처 확인 후 제외. 대안은 한 구간 더 관측하는 것입니다.
3. **의존성 목록 갱신 담당 공백.**
   - 두 프로젝트에서 4회 반복됐습니다. 기존 역할로는 맡길 곳이 없습니다.
   - doc-auditor는 작업본 수정 금지이고(`doc-auditor.md:27`), hub-notes는 허브 기록 절에 한정됩니다.
   - 선택지: (a) owner 직접 갱신을 규칙으로 명시하고 유지, (b) 새 maker 역할 추가.
   - 추천: (a). 두 프로젝트 모두 메모에 owner 직접 갱신이 의도로 적혀 있습니다.
   - 결정 주체: owner(user)입니다. 담당 변경은 범위 결정이므로 PM이 대신 정하지 않습니다.

## 무변경과 확인 사항
- **doc-auditor:** 링크 기준 보강은 이미 처리됐습니다. 정의 변경 이력(`doc-auditor.md:22`)과 회고 영수증이 있으므로 같은 근거로 재제안하지 않습니다.
- **hub-notes:** 정의 변경은 없습니다. 정의(`hub-notes.md:20`)는 이미 "새 행"만 출력하라고 되어 있어, 문제는 정의가 아니라 실행이었습니다. PM 결정(`BACKLOG.md:17`)과 재검토 pass(`BACKLOG.md:29`, `REVIEW-LOG.jsonl:7`)로 처리됐습니다. 11-20 이후 재발 여부는 기록이 없어 미확인입니다.
- **hub-notes의 P602 요약 이동:** P602는 11-20에 병합됐는데, BACKLOG 기록 절에 P602 메모 요약 행이 없습니다. 미수행인지 기록 누락인지 PM 확인이 필요합니다. 정의 변경 사안은 아닙니다.
- **conditional-helper:** 호출 조건 미발생이므로 합침·제외 제안 대상이 아닙니다. 유지합니다.
- **반복 지적:** review-blocking 4, should-fix 9, tester-fail 2는 count만 신고돼 있습니다(`TEAM-RETROSPECTIVE.json:5-23`). 의미와 원인이 기록돼 있지 않고, tester-fail에 대응하는 정의 변경도 없습니다. 이 부분은 근거를 더 요청하는 상태이고 제안하지 않습니다.
- **표기 관찰:** maker 3개의 "하지 않는 일"에 "reviewer는 작업본을 수정하지 않는다"가 그대로 있습니다(`conditional-helper.md:25`, `hub-notes.md:25`, `unused-reporter.md:25`). 생성 기본 문구로 보입니다. 선두 키워드는 유지하고 문장만 정리하면 되며, PM 표기 사안입니다.

## 다음 조치
먼저 PM이 제안 1의 T05 중복이 의도였는지, 그리고 hub-notes의 P602 요약 이동 여부를 확인해 주세요. 다음으로 owner에게 제안 3의 (a)/(b)를 한 번에 하나씩 묻겠습니다. 승인된 범위만 `pace team new`·원본 편집·`sync`·`verify`로 반영하고, 그 전까지 `.pace/team/agents/*.md`와 생성물은 그대로 둡니다.
