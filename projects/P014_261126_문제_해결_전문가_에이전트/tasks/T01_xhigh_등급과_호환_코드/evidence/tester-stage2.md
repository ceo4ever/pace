**전체 PASS.** 지정된 독립 2단계 범위에서 T-1~T-4를 충족했다. 문제 해결 전문가의 명시적 `xhigh` 승격이 Claude·Codex 실행 준비에 반영됐고, 구판은 기존 등급·구성원·공유 생성물을 유지하면서 신판의 시작 행을 팀 측정에 포함했다.

- **실행·선택** — 두 명령을 직접 실행했다. Node의 `xhigh` 선택 검사는 종료 `0`, 8개 통과, 실패·건너뜀 0개였다. 호환성 드라이버도 종료 `0`이었다.
- **T-1 충족** — `resolveTeamSettings`는 `xhigh` 기본값과 override를 별도 파일에서 읽는다. `show/set/reset` 단언은 두 호스트의 기본 모델·effort, 필드별 override와 복원, 무효 등급 거부, 기존 세 등급의 effort와 기존 설정 파일 바이트를 비교한다. 자동 배정은 기존 분기를 유지하며, 승격 시험에서 reviewer가 이동 전 `high`임을 확인한다. [worker-tiers.ts](src/core/worker-tiers.ts#L63), [team.test.ts](test/team.test.ts#L300)
- **T-2 충족** — 팀 시험은 승격 후 목록, 두 native 생성물의 모델·effort, 일반 생성물 바이트를 검증한다. 두 호스트의 시작 시험은 전달 인자와 시작 행의 설정, 복원된 원본 경로와 SHA-256을 비교한다. override 재실행은 시작 행을 직접 검사하며, 코드에서 같은 설정을 시작 인자에 사용함을 확인했다. [team.test.ts](test/team.test.ts#L342), [project-role.test.ts](test/project-role.test.ts#L124), [harness.ts](src/project/harness.ts#L720)
- **T-3 충족** — 드라이버는 고정 구판과 신판을 같은 저장소·`PACE_HOME`에서 두 차례 교대했다. 네 차례 모두 check 차이 0건, sync 종료 `0`, 기존 설정과 native 8개 파일의 해시 일치를 확인했다. 구판 통계는 `specialist`와 실제 시작 시각을 `events`에서 집계했고, 신판 판독기 둘은 정확한 `agents-xhigh` 경로를 복원했다. [compatibility-driver.txt](compatibility-driver.txt#L79)
- **T-4 충족** — 파일 검사와 정확 경로 비교에 대응해 잘못된 등급·값, 링크·디렉터리·과대 파일·잘못된 UTF-8, 중복 원본·관리 표지 충돌·고아, 위조된 역할·경로·숫자 표지를 거부하는 단언이 있다. 관련 실패에서 기존 바이트와 링크 대상이 보존됐고, 준비 중 원본이 바뀌면 작업자 호출을 차단했다. 표지 없는 사용자 출력 충돌은 동일한 코드 분기와 기존 단언을 확인했다. [team.test.ts](test/team.test.ts#L180), [team.test.ts](test/team.test.ts#L333), [project-role.test.ts](test/project-role.test.ts#L161), [sync.ts](src/team/sync.ts#L55)

**약화 없음.** 기준 커밋과의 `git diff`에서 기존 시험의 유일한 수정은 세 등급 순회에서 새 `xhigh`를 제외한 것이다. 기존 세 등급의 기대값은 그대로이고, `xhigh` 전용 단언이 추가됐다.

Node에서 지표 로그 기록 경고가 한 번 나왔으며 원인은 확인되지 않았다. 호환성 실행 네 차례의 측정 출처는 모두 `events`였다. `settingsStatus: planned`, `runtimeObserved: false`이므로 모델 런타임 적용은 관측 범위 밖이다. 전체 회귀는 PM 범위이며, 소스·시험·프로젝트 문서는 수정하지 않았다.
