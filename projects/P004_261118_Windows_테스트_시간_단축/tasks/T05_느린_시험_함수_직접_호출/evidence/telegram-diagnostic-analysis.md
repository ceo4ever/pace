# 저장 실패 주입의 실행 순서 진단

원래 시험은 /bind 실패 안내가 mock.texts에 나타나면 save를 /new용 호출 횟수 주입으로 바꾼다. MockTelegram은 HTTP 요청을 calls에 넣은 뒤 응답한다. adapter는 say 응답을 기다린 뒤 advance에서 offset을 별도로 저장한다. 안내 수신 관측은 offset 저장 완료 배리어가 아니다.

소유 임시 사본에서만 진단했다. 실제 Telegram API나 사용자 설정은 사용하지 않았다. 처음 `telegram-diagnostic-2026-11-18T19-29-45-235Z`는 일반 sendMessage fault를 사용했지만 /bind 경계를 강제하지 못했고 세 경우 모두 통과했다. 이 결과를 원인 해소로 취급하지 않는다.

두 번째 `telegram-diagnostic-2026-11-18T19-30-28-991Z`는 mock의 /bind 실패 안내 응답만200ms 늦췄다. 원래 단독 시험은 통과했다. 호출 횟수 주입은 bind-offset에서 count0, intent에서 count1로 실제 실패했다. createForumTopic은 호출되지 않았고 '상태를 저장하지 못해 토픽을 만들지 않았다' 안내가 기록됐다. 원래 시험은 '토픽은 만들었으나 저장하지 못했다'를 기다리므로 같은6초 timeout으로 실패했다.

같은 지연에서 의미 상태 주입은 bind-offset count0과 intent count1을 정상 저장하고, topic-table count2에서 한 번 예외를 발생시켰다. createForumTopic 실행, 표 미등록과 생성 의도 유지의 원래 단언이 통과했다. 호출 횟수와 무관하게 의도한 실제 save 단계에 실패를 주입하는 대조다.

이는 기존 시험의 가능한 경합과 검증 가능한 최소 수정 방향을 보여 준다. 과거 전체 원문에는 save 단계 trace가 없어 그때 정확히 같은 순서였다고 확정하지 않는다. 기존 무효 세트는 계속 실패/무효로 보존한다. 전체 부하를 다시 거는 진단은 하지 않았다. 실제 제품/시험 원본은 아직 바꾸지 않았다.
