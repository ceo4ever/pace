**판단**: 진단 뒤 첫 fail에서 종료 0과 `ask_user`가 나왔다. 남은 지적은 합의 범위 안의 로컬 fixture 갭이다. 이것을 A-1~A-5에 대조하면 모두 "아니오"다.
- A-1: 목적·기준·범위를 바꾸지 않는다. 기준을 유지한 채 검증을 보강하는 것이다.
- A-2: 외부 전송이나 되돌릴 수 없는 조치가 없다.
- A-3: 검토나 테스트를 생략하거나 약화하지 않는다.
- A-4, A-5: 새 권한, 비밀 노출, 사람 확인이 필요 없다.

따라서 PM 경로(`reviewer.md` §ask_user)로 간다. owner 질문은 하지 않는다.

**순서와 담당**
1. 담당은 워크트리 PM이다.
   - 신호를 받은 그 호출에서 바로 대응한다. 다음 호출의 종료 16을 기다리지 않는다.
   - 수정 직전에 조치를 합의된 목적·범위와 대조해 A 분류를 한다.
2. 분류 이유와 근본 조치(fixture 보강)를 `evidence/`의 근거 파일에 쓴다.
3. 결정을 기록한다.
   - `pace agent review-note --target <대상> --decision --by pm --choice <선택> --summary <사유> --file evidence/<근거>.md`
4. fixture를 보강한다. 범위는 로컬 fixture뿐이고, 기준(`P-n`/`T-n`)은 바꾸지 않는다.
5. 저장소 검사 명령과 필요한 E2E를 다시 돌린다.
6. `pace agent verify`로 전체 재검증을 한다.
   - 진단·결정 뒤이므로 `rereview_of`로 좁히지 않는 전체 검토다.
   - 사전 검토 단계면 현재 TASK 해시에 대한 pass를 받아 PRE-REVIEW에 연결한다.
   - 같은 영역이 또 지적되면 원인 층(structure/planning/design/other)을 다시 진단한다.
7. 사후 보고를 TASK-CLOSE 리뷰 절과 C의 사후 요약에 4요소로 남긴다: 무엇이 반복됐는지, 고친 층, 채우거나 덜어낸 것, 재검증 결과.

**하지 않는 것**
- PM 결정은 waiver가 아니다. PRE-REVIEW `waiver`는 쓰지 않는다. `waiver`는 사용자만 쓸 수 있다.
- 계약 목표가 미달이거나 미확인이면 done하지 않는다.
- 병합, 푸시, 배포는 하지 않는다. 필요해지면 허브로 인계한다.

**건수**
- 질문 0건, 승인 대기 0건.
- 허브 보고는 완료 보고의 사후 요약에 포함한다.
- 이 시험에서는 실제 명령을 실행하지 않았다.

**읽은 범위**
- 자동 첨부는 userEmail 컨텍스트를 받았다.
- `skills/pace-project-dev/SKILL.md` 1–93줄 전체를 읽었다.
- `references/reviewer.md` 68–121줄을 읽었다.
- `references/decision-rights.md` 1–46줄 전체를 읽었다.
- `references/coordinator.md`와 `references/task-steps.md`는 Grep 결과에서 일치한 줄만 봤다.
- 전체 바이트 수는 확인하지 않았다.