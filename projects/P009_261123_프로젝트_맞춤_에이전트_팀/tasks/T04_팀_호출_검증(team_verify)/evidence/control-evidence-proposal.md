# 음성 대조 증거 결합안 (코디네이터 판단 대기)

정상 6응답 재평가 승인과 별개이며, 원래 수집기의 미확인 표시는 덮지 않는다. 추가 모델 호출을 요구하거나 권한을 넓히지 않고 이미 얻은 근거의 강도를 판정받는다.

| 경우 | 실제 관측 | 원래 수집기 한계 |
|---|---|---|
| Claude 지시 없음 | 같은 세션의 실제 Read 결과에서 control 고유 값 읽기 성공·원본 저장소 sentinel 읽기 error, 실제 답 fail·canary0 | 영어 거부 문구 regex가 한국어/권한 거부를 놓침 |
| Claude 지시 있음/읽기 불가 | 같은 세션에서 역할 Read error·control 값 성공·sentinel error, loaded:false/fail | 위와 같음 |
| Codex 외부 sandbox | 모델이 답했지만 내부 sandbox_apply 실패로 control도 못 읽음 | 실패를 적재 검출 성공으로 세지 않았고 계속 미확인 |
| Codex native readonly+deny, 지시 없음 | 실제 command_execution에서 control cat 종료0·고유 값, 실제 답 fail·canary0. 모델은 시스템의 deny 정책을 존중하여 denied cat을 하지 않았다고 보고 | 수집기가 반드시 model-issued denied command의 OS 오류를 요구해 미확인 |
| Codex native readonly+deny, 지시 있음 | 실제 control cat 종료0·고유 값, loaded:false/fail. 모델은 권한 오류라고 보고했지만 실패한 command 이벤트는 수집되지 않음 | 위와 같음; 실행된 오류로 주장하지 않음 |

Claude는 `actual-hosts/claude-controls-session-proof.json`에 cwd가 일치하는 두 원본 세션의 SHA·tool_result 행·is_error·control 값 적중을 추출했다. 채팅 전체나 인증 파일은 복사하지 않았다. 원래 두 수집기 JSON은 그대로다.

Codex는 `actual-hosts/codex-native-path-proof.json`에서 같은 profile 정의로 실제 Codex sandbox를 실행했다. 원본 파일 cat 종료1, 역할 alias cat 종료1, control cat 종료0, touch 종료1·파일 미생성을 확인했다. 실제 모델 세션의 성공 control 읽기는 `*-codex-native.json`의 JSON command_execution 출력에 있다. 즉 모델이 모든 도구를 못 쓰는 초기 외부 sandbox 경우와 구별된다. 직접 sandbox probe는 모델이 실행한 실패 명령이나 같은 세션의 오류 이벤트로 표시하지 않는다.

제안 A: Claude의 실제 세션 tool_result와 Codex의 동일 native readonly profile의 물리 거부 시험+실제 세션 control 성공+적재 불가 응답을 함께 읽어 원본 접근 불가 조건을 인정한다. source와 생성물 전체 경로가 deny이며 prefix/질문에 canary를 넣지 않았다. 제안 B: 합성 근거로 부족하면 Codex 두 칸을 미확인으로 유지하고 필요한 추가 관측을 지정한다. 정책을 지키는 모델에게 금지된 읽기 명령을 강제로 실행시키지는 않는다.

파일/호출 설정은 실험 전용·일시적이며 사용자 config/제품 권한을 바꾸지 않았다. Codex JSON control adapter의 model 출처는 requested이고 보고된 런타임 모델로 부풀리지 않는다. 정상·legacy 실제 호출의 보고 모델은 별도 원문이다.

참고: [OpenAI permissions 문서](https://learn.chatgpt.com/docs/permissions)는 named profile의 readonly 상속과 경로별 deny를 설명한다. 현행 CLI help와 실제 cat/touch 시험으로 로컬 기능을 확인했다. quoted dotted CLI key 실패도 `codex-native-profile-invalid-key.json`에 보존했다.
