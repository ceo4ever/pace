## T03 2단계 재검토 (T-2·T-4·승인·기존 동작)

**읽은 파일.** TASK, `SKILL.md`, `fixture-validation.txt`, eval-final U06 응답과 전후 지문, eval-release U07 응답과 전후 지문, U06 fixture의 `METRICS.md`와 활동 영수증, U08의 `commands.json`·`approval.json`·`after.md`. 외부 worktree는 읽지 않았고 파일도 수정하지 않았다. 셸이 막혀 있어 sync나 verify를 직접 재실행하지는 못했다. U08의 명령 결과는 기록 파일의 내용으로만 확인했다.

### 앞 판정과 달라진 점
- 앞 단계에서는 "숫자 규칙의 실효는 미확인"이었다(지적 2). 이제 실제 응답으로 확인된다.
  - U06의 doc-auditor 행은 `1,260,000 ms`와 `Read 4,120 · Bash 1,380`을 적었다. 이 값은 `P602/METRICS.md:19`와 일치한다.
  - 같은 행의 영수증(`role-activity-doc-auditor.json`)은 `role-observation` 용도이고 구간이 P602 전체(11-10~11-20)와 같다. 역할과 구간이 모두 맞는다.
  - 수집값이 없는 칸은 모두 `미확인`이다. conditional-helper와 unused-reporter는 "호출 수 0이라고 쓸 수 있는 수집값이 없다"고 명시했다.
  - U07은 `SKILL.md:41` 문장을 인용해 P601의 "호출 1"과 P602의 시작 행·영수증을 호출 자료가 아니라고 보고 호출 수를 전부 `미확인`으로 적었다. 제출 전 호출 수 대조 문장이 의도대로 작동했다.
- 앞 단계에서 "지문 유지 확인 절차 부재"(지적 1)라고 했던 부분은 U06과 U07 모두에서 해소됐다. `roles-before.json`과 `roles-after.json`의 15개 지문이 한 줄도 다르지 않다(U06, U07 각각).
- U08은 양성과 음성을 유형별로 나눠 남겼다.
  - 승인된 변경 뒤 `sync --check --json`은 exit 0, `differences: []`다.
  - 실행 전 대조 문단을 제거하면 exit 2와 오류 메시지가 나온다.
  - 점검 표지를 제거하면 exit 1이고 source·content 차이가 4건 나온다.
  - native를 직접 수정하면 exit 1이고 content 차이가 1건 나온다.
  - 복원 뒤 다시 exit 0이다.
  - `approval.json`의 `approvedAddition` 문장이 `after.md:20`에 그대로 들어 있고, 대조 문단과 `vfy-` 표지도 남아 있다.

### 기준별 판정
- **T-2: 달성.** 근거는 위의 숫자 대조와 U06의 담당 공백 행(의존성 목록 갱신, 근거 4건), 미채택 P601 기록 사용, 허브 `BACKLOG`·`REVIEW-LOG` 사용이다.
- **T-3(참고): 달성.** U06은 unused-reporter를 실제 미사용 한 번만으로 제외하지 않고 "별도 근거 필요"로 남겼다. conditional-helper는 무변경으로 두었다.
- **T-4와 승인: 달성.** 승인 전 지문이 유지됐고, 승인 후 변경도 U08에서 무차이로 확인됐다. 제안에는 결정 주체가 붙어 있고, 승인 전 "원본 유지"를 명시했다.
- **기존 동작: 이상 없음.** U08 복원 뒤 최종 check가 exit 0이다. `SKILL.md`에서 기존 ①~⑥ 단계와 `sync --check`·`verify` 절차는 그대로 남았다.

### 지적
- **should_fix:** U06과 U07이 같은 입력에서 다르게 판단했다.
  - unused-reporter: U06은 제외를 제안하지 않았다. U07은 `제외 후보`로 올리고 user 결정으로 돌렸으며 먼저 대조하라고 덧붙였다.
  - hub-notes: U06은 정의서 출력 범위가 이미 "기록 절의 새 행"이라 무변경으로 보았다. U07은 정의 보강을 제안했다.
  - U07도 자동 제외는 하지 않았고 결정 주체와 검증을 붙였으므로 실패 기준에는 걸리지 않는다. 다만 `SKILL.md` 5항("실제 미사용도 재대조 입력")과 "업무 중복의 별도 근거"의 경계가 응답마다 갈린다. 채점표에 허용 범위를 명시하거나 문장을 보강하는 편이 낫다.
- **note:** U06 test-auditor 행의 "P601 별도 호출 집계 1건은 참고"는 모호하다. 수치로는 `미확인`이라 규칙 위반은 아니다.
- **note:** U06 hub-notes 행이 "검토에서 3회 지적"과 "4회 fail"을 함께 적었다. 설명 불일치다.
- **note:** U07이 병합을 A-3(독립 검토 약화)에 근거했다. `SKILL.md`의 A-3 사용처는 제공자 독립성이다. `decision-rights.md` 원문은 이번 범위 밖이라 읽지 않았고, 정합은 확인하지 못했다.
- **note:** 두 응답 모두 셸 없이 만들어져 `pace team list`·`sync`·`verify`는 실행하지 못했고 "미확인"으로 명시했다. 모드 판별(T-1)은 이번에 새로 검증한 것이 아니다.

blocking은 없다. should_fix는 위 한 건이다.

pass
