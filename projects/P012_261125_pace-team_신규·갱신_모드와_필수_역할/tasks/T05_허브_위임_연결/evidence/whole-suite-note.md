첫 전체 실행에서 S-10b의 본문 종료 이후 발생한 비동기 Error: aborted 때문에 Node가 telegram-flow 테스트 파일을 실패 1건으로 추가 보고했다. 개별 테스트 통과 1,373개와 제외 17개는 두 전체 시험에서 같았다. 해당 파일 단독 실행은 40개 모두 통과했고, 같은 코드의 최종 npm run check는 1,390개 중 1,373 통과, 실패 0, 17 제외였다. T05에서는 Telegram 코드나 검사를 수정하지 않았다.

브라우저 E2E 제외 환경은 저장소의 Orca 실행 규칙을 따랐다. [전체 시험 기록](full-test-summary.txt) · [해당 파일 재시험](telegram-retest.txt)
