# T01 행동 검증 기록

작성자는 Codex/OpenAI다. 시나리오 실행은 각각 `pace agent run --agent claude --mode p --model sonnet --effort medium --cwd <격리 작업본> --prompt-file <입력>`으로 호출했고 원응답·모델·제공자·종료 결과를 보존했다. Claude가 Anthropic이라고 실행 결과에 보고됐다. [최종 실행 자료](eval-checked/materials.json) · [R08 재검증 실행 자료](eval-R08-recheck/materials.json)

- 최종 판정에는 `eval-checked`의 R01~R07과 `eval-R08-recheck`의 R08을 사용했다. 각 폴더에는 고정 입력, 프롬프트, 수정한 정본 사본, 원응답과 실행 정보를 두었다. 공통으로 제공한 문서와 채점표의 지문은 실행 전 기록했다.
- 앞선 R08은 부분 초안을 제안하여 독립 채점에서 실패했다. 정본의 정의 대조 4항에 부분 초안과 완성본을 함께 보류하도록 한정한 뒤 R08을 다시 실행했다. 변경은 역할이 없고 선행 장치가 빠진 분기에만 적용돼 R01~R07의 합격 근거는 유지됐다. [이전 채점](tester-final.md) · [최종 재검증](tester-R08-recheck.md)
- 구현 후 reviewer는 Anthropic이었다. 중간 reviewer 보고서의 `cross: false` 의견은 작성자 제공자와 대조하여 정정했다. OpenAI 작성자에 대한 Anthropic reviewer의 판정이며, Anthropic 평가 응답을 별도 OpenAI tester가 채점했다. [작성자·교차 상태](../PRE-REVIEW.json) · [구현 후 교차 기록](review-records/R5.json)
- tester 2단계의 Codex p 이어가기는 미지원이었다. 새 OpenAI 맥락에 1단계의 원문을 건네 실제 명령 실행과 계약 대조를 맡겼다. R08 reviewer의 첫 2단계 호출에는 격리 경로 지시가 부족했다. 사본 상대 경로를 명시해 같은 검토자에게 재요청했다. [tester 1단계](tester-command-stage1.md) · [reviewer 접근 관측](reviewer-R08-recheck-unavailable.md)

- 편향 우려는 앞선 실패 실행과 최종 재실행 프롬프트의 바이트 일치(cmp 종료 0)로 대조했다. 제안 범위 문구는 양쪽에 동일했다. 원응답 끝의 전제와 실제 제안은 두 검토자가 공개적으로 판정했으며, 모호한 수식어는 원문에 보존했다.
