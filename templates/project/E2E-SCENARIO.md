# {{scenarioId}} <!-- 시나리오 이름 -->

- 기준: <!-- T-n --> · 표면: <!-- web · api · cli --> · 조건: <!-- 사전 상태, 사용할 조각 -->

<!--
E2E 프레임워크가 없는 저장소에서 tester가 도구 브라우저로 실행하는 시나리오.
비밀은 원문이 아니라 환경 변수 이름만: value_ref / *_ref. 원문 값을 이 파일에 쓰지 않는다.
do: navigate · click · fill · select · press · wait · call(api) · run(cli)
expect: see(문구 in 위치) · url · status(api) · output(cli) · absent
판정: 통과 · 실패(단언이 맞지 않음, 다른 도구로 넘어가 덮지 않는다) · 막힘(실행 자체를 못 함). 브라우저 도구가 없으면 다음 도구로 넘어간다.
-->

```yaml
steps:
  # - { fragment: login, with: { id_ref: E2E_LOGIN_ID, pw_ref: E2E_LOGIN_PW } }
  - { do: navigate, target: / }
expect:
  - { see: "", in: "" }
```
