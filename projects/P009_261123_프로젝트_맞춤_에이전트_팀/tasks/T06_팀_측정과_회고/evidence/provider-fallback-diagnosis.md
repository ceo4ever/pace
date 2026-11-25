# 마지막 작은 delta 검증 호출 실패 진단

- 반복: Claude reviewer resume·tester resume·fresh reviewer가 모두 provider exit1, startedtrue/cleanupUnconfirmedfalse로 종료. 판정 원문 없음. 첫3번의실제stderr는 별도파일보존하며 자동오류가stdout첫300자만보여 원인을 특정하지못했다. 이를reviewer의의미fail로세거나기존pass를지우지않는다.
- 원인 층: structure(호출/제공자 실행). 새context도실패하여resume만의문제라고확정할수없다. 실제인증정보/사용량을읽거나설정/요금제를변경하지않는다.
- 합의 영향 분류: 목적/범위변경없는PM경로. 기존다른제공자(Anthropic) R6첫판단과최종계약대조는pass0/목표달성이고직접tester24도pass이다. 남은것은수신의도log+원장IDunion의작은delta및문구확인.
- 근본 조치: 같은실패호출반복을멈춘다. 설치된다른제공자CLI는없음(gemini부재), 독립새Codex세션으로review/test를대체한다. author와같은OpenAI제공자이므로crossfalse·교차아님이라고명시한다. reviewer정본의발동실패시같은제공자별도새세션대체지침을적용하며큰산출물의기존교차pass를대체/위조하지않는다.
- 남은 불확실성: Claudeexit1원인미확인. 작은delta확인이새제공자의교차검증이되지는않는다. 자동approval정책이나사용자설정을넓히지않는다.
- 재검증: 같은source24시험과읽기전용delta평가를수행하고최종전체check/비밀검사/소스지문을대조한다. 판정/실행미수행을실패/미확인으로그대로보고한다.
