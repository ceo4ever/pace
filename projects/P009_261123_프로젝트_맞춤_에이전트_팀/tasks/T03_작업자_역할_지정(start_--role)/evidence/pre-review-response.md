# T03 사전 검토 처리

R1 pass는 PROJECT 선열람이 있어 순수 목표 첫 판단으로 쓰지 않고 원문을 보존했다. R2/R3는 TASK만 읽은 새 Claude 맥락의 pass이며 R3 뒤 별도 작업 문서 대조(review-pre-stage2.json)를 회수했다. 구현 전 blocking0/pass이고 R3 이후 TASK 해시는 불변이다.

- SF-1: 2단계 권고 (b)를 선택한다. review-pre-stage2-prompt.txt의 세부 판정(정상 시작=영수증 성공+실제 호스트 기동, 인자 거부는 해당 시도 실패)을 현재 파일·구현 후 검토·TASK-CLOSE에서 함께 인계한다.
- SF-2: 새 branch도 체크아웃될 HEAD/ref blob 기준으로 검증하고 준비/ff 병합이 끝난 launch 직전에 지문을 재검사한다. 커밋되지 않은 main 원본은 자동 반영하지 않으며 문서·시험에서 구별한다.
- SF-3: 구현 전 workerSpec golden을 고정했고, 팀 원본/생성물이 있어도 role 없는 경로를 검증한다. 명시 effort default는 기존 의미대로 effort 인자를 생략하며 tier로 복귀시키지 않는다.
- SF-4: probe 역할 원문에서 소스 CLI 절대경로와 임시 PACE_HOME을 모든 작업 명령에 명시하고, 실제 자식의 pace 경로/설정 홈을 기록한다. PATH 상속을 가정하거나 설치본을 재설치하지 않는다.
- SF-5: 기존 잘못된 to와 같은 전체 행 제외 정책을 유지하고, 손상 role 행은 손상으로 분리해 테스트한다. 통계가 행을 제외하는 한계를 문서화하며 옛 역할 없는 start는 불변이다.
- SF-6: 런타임 불일치가 관측되면 이슈·T04/T08 인계와 전달≠적용 문서를 남긴다. 인자 전달만으로 실제 적용을 달성으로 바꾸지 않는다.
- 초기 should_fix의 골든 회귀/선행 대시·제어/Unicode·크기·비밀 거부/메타문자 argv·안내 인용/모든 시도·보정 필요 순간 집계/무해한 임시 probe를 구현 후 검출한다.
- N: project start role은 팀 구성원 이름이고 team new role은 역할 종류다. 기존 checkout의 도구 선택은 기존 main 규칙, 역할은 실행 checkout 원본임을 명시한다. 비대상 도구에는 claude/codex 선택을 안내하며 기타 project 하위 명령의 role 오용을 거부한다.
