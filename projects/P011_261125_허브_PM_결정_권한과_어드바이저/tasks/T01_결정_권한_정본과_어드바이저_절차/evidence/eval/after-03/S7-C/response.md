**판단**: 이 사례는 반복 실패 3회째의 `diagnose` 단계다. 땜질이 아니라 근본 조치를 정할 시점이다. (`reviewer.md` 반복 실패 절, `SKILL.md` §6)

**순서**

1. **담당과 신호 확인 (워크트리 PM)**
   - 3차 verify 호출이 종료 0과 `escalation.stage: diagnose`를 냈다. 이 신호를 받은 호출에서 바로 대응한다.
   - 지적별로 TASK.md를 고치지 않는다.
   - `verify`를 다시 부르지 않는다. 진단이 기록되기 전에는 종료 16으로 차단된다.

2. **원문 보존 (워크트리 PM)**
   - 1~3차 원문을 차수별 고유 경로인 `review-records/R1~R3.json`과 `evidence/`에 보존한다.
   - 비밀·민감정보를 검사한다.
   - 원문을 잃었으면 추정 복원하지 않고 한계를 적는다.

3. **원인 층 판정 (워크트리 PM)**
   - 세 차수의 blocking(PATH 누락, launchd 등록, 강제 종료 신호)을 모은다.
   - 모두 Windows 기준 계획을 macOS에 옮긴 탓이므로 **design 층**(설계와 실제 환경의 불일치)으로 본다.
   - 근거가 planning(목표·전제)에 가까우면 그렇게 적는다. 이 경우 진단 문서에 이유를 쓴다.
   - 진단은 `evidence/diagnosis.md`에 쓴다.

4. **허브 이관 (워크트리 PM → 허브, `ask` 1건)**
   - 세 차수 근거와 진단을 허브에 보낸다.
   - 허브가 [B](references/decision-rights.md)로 재현하고 근본 조치를 정한다. 근본 조치는 TASK를 macOS 기준으로 재설계하는 것이다.
   - 이때 `pace project log`에는 허브 결정을 "(main 판단)"으로 기록한다.

5. **조치 전 영향 분류 (A 대조)**
   - **A-1**: macOS를 대상으로 삼는 것이 합의된 목적·범위·기준 `P-n`을 바꾸는가? PROJECT.md와 브리프를 먼저 대조한다. 합의가 이미 macOS였다면 "아니오"다. 이 경우 PM이 결정하고 진단 증거만 남긴다.
   - **A-1이 "예"이거나 가릴 수 없으면** 허브가 owner에게 A-1 번호를 붙여 요청한다.
     - 요청에는 대상, 실패 추이, 진단과 고친 층, 남은 지적 성격, 선택지, 추천과 이유의 6요소를 담는다.
     - 회신까지 해당 조치만 보류한다.
   - **A-3**: 검토나 테스트를 약화하는 조치는 하지 않는다.
   - **A-2·A-4·A-5**: 해당 사항이 없다.

6. **진단 기록 (워크트리 PM, 근본 조치 결정 후)**
   ```
   pace agent review-note --target <TASK.md 경로> --diagnosis --layer design --summary "<진단·조치>" --file evidence/diagnosis.md
   ```
   - owner 결정이 있었다면 진단 증거에 확인된 승인 원문 위치나 영수증을 연결한다.

7. **재설계와 전체 재검토**
   - TASK.md를 macOS 기준으로 다시 쓴다.
   - 같은 영역을 다시 지적하면 그 설계를 재진단한다.
   - 진단 뒤 첫 `pace agent verify --kind task`는 새 기준 **전체 검토**다. 이전 지적으로 purpose를 좁히지 않는다.
   - verify는 기존 경로로 잇는다. 도구 밖 reviewer로 바꾸지 않는다.
   - 진단 뒤 첫 fail은 종료 0과 `ask_user`를 낸다. 이 경우 `ask_user`는 호환용 이름이다. 영향 분류에 따라 PM 결정 또는 사용자 결정 기록을 먼저 남긴다.

8. **보고와 기록**
   - TASK-CLOSE 리뷰 절과 C의 사후 요약에 4요소를 남긴다: 무엇이 반복됐는지, 고친 층, 채우거나 덜어낸 것, 재검증 결과.
   - pass가 나오면 PRE-REVIEW.json에 원장 순서대로 옮긴다. fail 뒤 pass의 continuity는 `changed`이며 reason은 "진단 뒤 새 기준 전체 검토"다.
   - pass 전에는 구현에 들어가지 않는다.
   - `waiver`는 사용자만 쓸 수 있다. PM 결정으로 대신하지 않는다.

**경계**
- 이 단계에서 `review-note --void`는 쓰지 않는다. diagnose 단계에서는 도구가 진단·결정으로만 넘어가도록 강제한다.
- 이번 건은 도구 결함이 아니라 실질 결함이므로 structure 층 무효 처리 대상도 아니다.
- 병합·푸시·배포는 하지 않는다.

**대기·질문 수**
- 사용자에게 직접 하는 질문: 0건.
- 허브 인계: 1건.
- owner 승인 대기: 조건부 0~1건. A-1이 "예"일 때만 허브가 요청하며, 그때 해당 조치만 보류한다.

**첨부·읽은 범위**
- 자동 첨부: 사용자 이메일 컨텍스트만 받았다. 이 답변에는 쓰지 않았다.
- 읽은 파일:
  - `skills/pace-project-dev/SKILL.md` 1–93줄
  - `references/reviewer.md` 1–121줄
  - `references/decision-rights.md` 1–45줄
  - `references/task-steps.md` 1–11줄
- 전체 바이트는 확인하지 않았다.