# roblox-studio 메시지 지시 조건 기준선

시작 기준 커밋 d0f9ed0c7016536466ce75b4918573814630eb16. 최초 관측은 T01·T02였으나 T01 마감 재확인에서 P002 병합 완료를 확인했다. BR01에 따라 최종 구간은 2026-11-23T08:00:26.280Z ~ 2026-11-23T14:47:17.091Z(merge 85행), T01~T03 전체다. 현재 원본은 roblox-studio main(기존 worktree는 정리됨), 중간 원장은 baseline-roblox-interim-T01-T02.json에 보존한다. 대상 저장소에 역할을 추가하거나 변경하지 않았다.

| 항목 | 확인값 | 근거·한계 |
|---|---:|---|
| 캡틴 도달 질문/결정 요청 | 확인 10 (10~12 범위) | baseline-roblox-questions.json의 질문/답 행 대응 |
| 코디네이터 대신 답한 질문 | 4 | 원본 로그 4·9·32·61행 |
| 수신자 판별 불가 질문 | 2 | 41·68행은 안내 전달과 캡틴 질문/결정 요청 도달을 구별할 근거가 부족 |
| 정상 사용자 결정/승인 | 8 + 병합 1 별도 | 사용자 결정 17·26·30·38·47·52·74행 7건 + Studio 사용 승인(msg_2f52cd385ba9) 1건. 병합 승인 85행 1건, 질문과 중복 합산하지 않음 |
| 정상 역할 배정 | 1 | Orca msg_82ed0e9953b2, 시작 뒤 아테나 정의 읽기 지시 |
| 계약 밖 코디네이터 수동 지시 | 관측 0 | 확보된 메시지 구간만, 정상 배정과 질문 답은 제외 |
| 캡틴 역할 보정/파일 수정/명령 대행 | 각각 미확인 | 각 1개 미복원 구간, 실제 총 건수를 0으로 두지 않음 |
| 검토 blocking 합 | 48 | 사전 33 + 구현 후 reviewer 8 + tester 7, 판정별 합 |
| fail 뒤 재검토 | 18 | T01 사전3·reviewer1·tester1, T02 사전5·reviewer1·tester1, T03 사전3·reviewer2·tester1 |
| 실행 게이트 실패 | 7 | 원본 12·15·40·53·65·80·81행 gate ok=false |

과거 stats의 로그 요약 blocking은 31다. 여러 판정이 한 행에 묶였거나 빠져 있어 실제 판정 합 48와 다르며, 두 값을 같은 지표로 혼용하지 않는다. T08도 사전·구현 후 tester/reviewer 실제 판정별 합과 fail 뒤 재검토를 같은 정의로 계산한다. 원문이 없는 기록은 미확인으로 표시한다.

원본 이벤트의 안전한 요약 사본은 baseline-roblox-events.json, 수신자 수동 분류는 baseline-roblox-questions.json, 메일 시각·주제·참조는 baseline-roblox-mail-index.json, 전체 구조화 결과는 baseline-roblox.json이다. 캡틴 원문·비밀은 복사하지 않았다. 추가 표본에서는 --to와 질문 연결 파일 및 손작업 note를 사건 발생 때 기록해 누락 구간을 줄인다.

원본 41행은 코디네이터의 잠금 승인과 캡틴 안내 전달만 확인되어 captain 질문으로 확정하지 않는다. 행별 근거는 questions.json에 각각 적었다. 09:16:34의 'Worker stopped without reporting'은 자동 수명 알림이며 실제 캡틴 결정 요청이 아니므로 개입 집계에서 제외한다.

T03 Studio 사용 질문 66행의 로그 answer는 빠져 있으나 실제 메일 msg_2f52cd385ba9에서 캡틴 승인을 확인했다. FIFO question-wait는 개별 의미 연결로 사용하지 않는다. 자동 수명 알림은 두 건 모두 제외했다. main PROJECT-CLOSE의 캡틴 직접 작업 12건은 자체 요약이며 정의와 원장이 달라 이 표의 확인 질문 10건·미확인 2건을 대신하지 않는다.

최종 독립 검토의 동일 분류 기준 지적을 반영해 41·68행 모두 unknown으로 처리했다. 확인 질문10/coordinator4/unknown2(캡틴10~12 범위)다. 구현 후 시도별 status·근거 경로는 quality.post_assessments, 원본 마감의 리뷰 절 발췌와 SHA256은 baseline-roblox-post-review-sources.json에 보존했다.
