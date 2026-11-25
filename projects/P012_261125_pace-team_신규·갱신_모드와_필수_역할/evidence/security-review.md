# P012 최종 후보 독립 보안 검토

**결론: blocking 0건, should_fix 0건, handoff 4건.** 파일 수정과 명령 실행은 하지 않았고, 실제로 읽은 범위는 아래와 같습니다.

## 읽은 범위

| 대상 | 범위 |
|---|---|
| `SECURITY.md`, `project-security.md`, `security-candidate.txt`, `secret-scan.txt`, `review.txt` | 전체 |
| `product.patch` | 전체 읽음 (약 1065줄, 파일 41개). 운영 코드는 `src/project/team-metrics.ts`, `team-metrics-document.ts`, `team-input.ts`입니다. 규칙과 문서는 `docs/TEAM.md`, `docs/TEAM-METRICS.md`, 스킬 5종입니다. 설정은 `.pace/team/required-roles.json`, 팀 원본, 생성물 2종입니다. 시험은 `test/team-metrics.test.ts`, `test/project-role.test.ts`입니다. |
| `changed-files.txt` | 1–279행과 `projects/` 제외 목록(`product.patch`의 diff 헤더로 대조). 나머지는 `projects/…/evidence/eval*` 산출물이며 개별로 읽지 않았습니다. |
| `full.patch` | Grep으로 비밀 패턴(키·토큰·개인키·이메일·홈 경로)을 전체 검사했습니다. 직접 읽은 곳은 verify 결과 JSON(252–281행), 대시보드 `data.js`(391–397행), `PROJECT.md`·`log.jsonl` 헤더(468–497행)입니다. |
| 전체 저장소 비밀 검사 | `secret-scan.txt`의 "통과 8106개 파일"을 그대로 신뢰했고 재실행하지 않았습니다. |

## 경계별 판정

- **표지 경로·형식** (`src/project/team-metrics.ts:733-761`): 안전한 경로 검사(`safeTeamPath`)와 32KiB 상한이 있습니다. 필드 집합이 엄격하고 `validTeamName`과 중복 검사를 거칩니다. 오류가 나면 `HandoffError`를 내는 fail-closed 방식입니다. 시험(`test/team-metrics.test.ts` "안전하지 않은 입력")이 다음을 확인합니다.
  - 중복, `../`, 추가 키, 중복 JSON 키, 비 UTF-8, 상한 초과를 거부합니다.
  - 비밀 후보는 거부하며 원문을 출력하지 않습니다.
  - 하드링크와 심볼릭 링크도 거부합니다.
- **증거 참조**: 영수증을 `observationCovered`로 다시 대조해 역할, 종류, 구간이 일치해야 합니다. 구간 밖이나 다른 구간의 영수증은 반영되지 않고 `unconfirmed`로 남습니다. 활동 영수증과 비참여 신고가 충돌하면 `unconfirmed`로 내려갑니다.
- **역할 단계와 권한**: 생성물과 문서가 "도구 안내는 권한 제한이 아니다"라고 명시해 SECURITY.md의 "역할은 보안 경계가 아니다"와 일치합니다. 승인 사실을 과장하는 문구는 찾지 못했습니다.
- **기존 팀 여부와 finish·merge**: 표지는 팀 채택 프로젝트(`adopted`)에서만 읽습니다. 미채택 프로젝트에는 팀 절이 생기지 않고, 표지가 Git 인덱스에서 빠지면 finish가 보류됩니다. 모두 시험으로 확인됩니다.
- **기록·대시보드**:
  - verify 결과 JSON에는 모델 응답 원문이 들어 있고, SECURITY.md가 허용하는 보존 방식입니다. `vfy-s-…`, `vfy-r-…`는 검증용 식별자이며 비밀이 아닙니다.
  - `backlogs/dashboard/data.js`의 `/Users/me/orca/...`는 자리표시 경로입니다. 실제 사용자 홈 경로나 이메일, 키 패턴은 `full.patch` 전체에서 발견하지 못했습니다.
- **새 백로그·기존 정정·외부 결정 전 승인**: 쓰기 승인 전 대기(H04), A-1 영향 시 owner 결정, 기획자 자기검토 금지(BP-08)가 규칙과 평가 시나리오에 일관되게 들어 있습니다. 시험 코드의 가짜 자격 증명은 `join`으로 조립되어 비밀 검사에 걸리지 않습니다.

## handoff (병합을 막지 않음)

1. **표지로 후보 등급이 바뀜.** `src/project/team-metrics.ts:806` 이후에서, 표지에서 `hub`나 `conditional`로 지정된 역할은 `unusedRoleCandidates`에서 빠지고 비참여 분류로 옮겨집니다. 표지는 진위 서명이 아니고 허용된 변경은 Git 검토뿐이므로, 표지를 바꾸는 PR은 사람이 배정 근거를 대조해야 합니다. 코드가 이를 강제하지 않고 `docs/TEAM.md`의 문장에만 의존합니다.
2. **팀 원본에 없는 표지 역할은 조용히 무시됨.** 순회는 `members` 기준이라 표지에만 있고 원본이 없는 역할은 오류가 나지 않습니다. 의도라면 문서에 명시하는 편이 좋습니다.
3. **SECURITY.md 민감 경로 표에 새 경계가 없음.** `.pace/team/required-roles.json` 읽기와 `src/project/team-metrics.ts`의 표지 판독이 표에 없습니다. `src/team/` 행은 `src/project/`의 코드에 닿지 않습니다. `PROJECT.md`의 보안 영향 절은 이 patch의 hunk에 없어 변경 여부를 확인하지 못했습니다. 표에 한 줄 추가하는 후속을 권합니다.
4. **비참여 신고는 자기 신고임.** `src: "team-role-nonparticipation"`인 `note`와 영수증이 근거이고 작성자 인증이 없습니다. `docs/TEAM-METRICS.md`에 "신고는 인증 수단이 아니다"로 이미 명시되어 있어 문서와 동작은 일치합니다. 기획자의 기존 백로그 "일반 정정" 역시 프롬프트 수준의 제한이며 복구는 Git에 의존합니다.

## 한계

- `metadataJson`, `safeTeamPath`, `fields` 구현은 이 patch에 없어, 위 거부 동작은 시험 코드의 기대로만 확인했고 구현은 읽지 않았습니다.
- `evidence/eval*`의 개별 파일(수백 개)은 열어 보지 않았고 secret-scan에 의존했습니다. 이 범위의 잔여 위험은 "미확인"입니다.
- `changed-files.txt` 줄 수(1485)와 후보 행 수(1484)가 하나 다르게 보입니다. 후행 개행 때문으로 추정하지만 맞춰 보지 않았습니다.
- `full.patch`와 `product.patch`의 SHA-256은 명령을 실행하지 않아 대조하지 못했습니다.
