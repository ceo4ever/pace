## 판정

사례는 하나다. 이름은 "보안 설정"이지만 대상이 소유한 임시 fixture JSON이고, 실제 사용자·비밀·외부 영향이 없다고 확인됐다. 그래서 A-1~A-5 어디에도 해당하지 않고(decision-rights A), 민감 경로 모드도 걸리지 않는다(security.md). 담당 PM인 내가 결정한다. 허브와 owner에게 올릴 일은 없다.

## 순서

1. **담당:** 워크트리 PM(나)이 맡는다. 단독 결정이며 `ask`와 `decision_request`는 만들지 않는다.
2. **A 대조:** 조치(fixture 검토·수정), 대상, 합의, 기존 승인을 다섯 질문에 대조하고 모두 "아니오"로 판정한다. 근거는 다음과 같다.
   - 합의 변경이 없다.
   - 푸시·병합·배포·외부 전송이 없다.
   - 보안 검사·독립 검토를 생략하거나 약화하지 않는다.
   - 새 권한·비밀·비용이 없다.
   - 사람이 직접 할 일이 없다.
3. **검토:** 같은 대상의 반복 검토는 처음부터 `pace agent verify`로 이어 원장을 잇는다. 도구 밖 reviewer를 섞지 않는다. 다른 제공자를 먼저 시도하고, 미실행이면 사유를 기록한 뒤 `--allow-same-provider`(`cross: false`)로 같은 원장에 잇는다(B1, reviewer.md).
   - fail이면 지적을 반영하고 verify를 다시 부른다(자동 재검토).
   - 재검토에서는 직전 blocking 해소와 그 수정이 만든 새 결함만 본다.
4. **escalation 신호:** 출력의 `escalation`을 먼저 따른다.
   - 3번째 fail이면 `diagnose`다. 원인 층을 가려 `pace agent review-note --target <대상> --diagnosis --layer <층> --summary … --file <증거>`로 기록한다. 이후 새 기준으로 전체 검토한다.
   - 진단 뒤 첫 fail이면 `ask_user` 단계다. A 밖이므로 `evidence/`에 분류 이유와 근본 조치를 쓰고 `review-note --decision --by pm --choice … --summary … --file …`로 기록한다. PM 결정이며 waiver나 사용자 결정이 아니다.
   - 같은 reviewer가 실질 결함 없이 절차·열람 지적만 두 번 반복하면 structure 문제다. 재검토를 멈추고 증거 원문과 함께 허브에 B로 보낸다. 도구 결함으로 무효가 된 fail은 `--void`로 처리한다.
5. **보안 관점:** fixture에 비밀 원문과 개인 정보가 없는지만 기본 체크리스트로 확인한다. 이름만 보고 A-4나 보안 에스컬레이션으로 올리지 않는다. 이 오분류가 이번 사례의 핵심 경계다.
6. **기록:** 매 차수의 원문을 `review-records/`에 보존하고, 판정·지적 처리·분류 근거를 `pace project log`에 남긴다. 결과는 TASK-CLOSE 리뷰 절과 사후 요약(C)에 4요소(반복된 것·고친 층·채우거나 덜어낸 것·재검증 결과)로 적는다.
7. **마감:** 검토가 pass여도 목표 달성 판정은 별도로 한다(goal-review). 이후 `pace project check`, `done`을 수행하고 §7에 따라 `pace memory status --project`를 갱신해 같은 커밋에 넣는다.

## 회신·보고와 대기 수

- **회신·보고:** 허브나 owner에게 보낼 회신은 없다. 사후 요약에 "분류: A 해당 없음, PM 결정" 한 줄만 붙인다.
- **질문:** 0건
- **승인 대기:** 0건
- **멈춤:** 없다. 이 사례에서 병합·푸시·배포는 수행하지 않는다.

## 자동 첨부와 읽은 범위

- **자동 첨부:** 있었다. 사용자 계정의 이메일 컨텍스트가 자동 첨부됐고, SessionStart hook 컨텍스트도 있었다. 이메일 값은 쓰지 않는다.
- **읽은 파일과 줄:**
  - `skills/pace-project-dev/SKILL.md`: 1–93 전체
  - `references/decision-rights.md`: 1–45 전체
  - `references/security.md`: 1–43 전체
  - `references/reviewer.md`: 1–125 전체
- **열지 않은 references:** 나머지 references는 열지 않았다.
- **다른 사례의 문서:** 읽지 않았다.
- **전체 바이트:** 도구로 확인하지 않았으므로 적지 않는다.
