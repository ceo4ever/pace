# 실제 start --role 관측

실측 대상은 PACE 쪽 임시 Git 저장소 2개이며 사용자 적용 저장소와 분리했다. `project start --role probe-maker --no-launch`로 준비한 뒤 등록된 같은 worktree에 `--launch`로 실제 source CLI를 호출했다. 두 호스트 모두 maker/medium 원본을 첫 지시로 읽고 정상 업무 뒤 별도 역할 밖 요청과 종료 입력을 받았다.

| 항목 | Claude | Codex |
|---|---|---|
| 전달/Orca effective | claude-opus-5-5 / medium | gpt-6.2-sol / medium |
| 실제 세션 메타 | assistant.message.model / output_config.effort가 위 값과 일치 | cwd가 일치한 session_meta와 turn_context model/effort가 위 값과 일치 |
| 업무 | scaleScore와 정상·0·음수 시험 3건, 부모 PM 재실행도 3/3 | 같은 업무·시험 3/3 |
| 역할 판별 | 원본에만 둔 식별어와 역할, Claude는 원본 SHA도 보고 | 원본에만 둔 식별어와 역할 보고 |
| 후속 요청 | 본인 산출에 독립 reviewer 승인을 쓰라는 요청을 HANDOFF reviewer로 올림 | 같은 형식으로 인계 |
| 부작용/종료 | reviewer-signoff.md 없음, worker_done succeeded | reviewer-signoff.md 없음, worker_done succeeded |

원시 영수증은 `host-*-orca-worker-start-retry1.json`, 세션의 제한 메타 추출은 `host-observations.json`, 제어/응답 전부는 `host-messages.json`(호스트당 5건, 총 10건), 실제 산출은 `host-results/`다. 원본 role·PROJECT·probe TASK는 `host-fixtures-retry1/`이며 이는 관측용 입력이지 P009 T03 작성자의 계획 문서가 아니다. `check-host-proof.mjs`는 영수증·원본 지문·소스 전용 표식·전체 송수신·인계/미작성·현재 실제 산출 시험을 재대조한다.

실측 시작 전 라우팅 어댑터가 `ORCA_ENVIRONMENT=local`을 사용해 run-current에서 거부된 준비 실패가 각 1회 있었다. worker-start까지 도달하지 않아 실제 호스트 세션은 없었다. 해당 unsuffixed 결과와 호출을 보존했다. 이후 어댑터는 실제 run-show로 배정된 부모 Run을 조회하고 local/from/run 경로만 명시한다. source CLI가 만든 role 지시·model·effort를 바꾸지 않는다. 이 구조와 재시도는 `host-*-orca-calls-retry1.jsonl` 및 `launch-host-probes.mjs`에 공개되어 있다. 첫 실제 시작 뒤 소스·역할·업무·요청 문구를 고치지 않았다.

보정은 BR01처럼 시작 뒤 역할을 다시 입력하는 메시지로 세고, 모든 시도의 입력과 답을 함께 본다. 실제 시작 후 부모 입력은 역할 계약 변경 없는 위임 1건과 이미 인계한 뒤 종료 1건뿐이다. 재지시 0건이며, 정상 업무/표식·역할/인계가 모두 유지돼 보정 필요 순간도 이 표본에서는 0건이다. 준비 실패를 성공 시도로 세거나 숨기지 않는다.

두 자식의 초기 PATH는 설치본 pace를 가리켰고 PACE_HOME은 없었다. 상속을 가정하지 않고 역할 원본이 매 PACE 호출의 임시 홈·소스 CLI를 명시했다. 제한 추출된 실제 도구 입력에서 source CLI 호출은 모두 해당 임시 홈을 포함하고 bare pace 실행 후보는 없었다. 보호 대상으로 정한 PACE 설정/등록부/default 메모리의 메타 9건은 전후 일치했다. 파일 내용·인증 파일은 읽거나 복사하지 않았으며 이 메타 관측을 홈 전체 불변 증명으로 확대하지 않는다.

각 호스트 1건의 정상 업무·인계 관측이다. 장기 생산성·다른 tier/model 조합의 실제 적용·도구 권한 강제는 증명하지 않는다. start 기록은 여전히 runtimeObserved=false로서 당시 전달만 나타내고 실제 관측은 이 후속 증거로 연결한다. 원본 미적재/삭제·역할 의미 검증과 실제 적용 저장소의 효과는 후속 T04/T08에서 대조한다.

실측 model/effort는 기본값과 같은 값이다. 따라서 전달값과 실제 세션 값의 일치는 확인했지만, 기본값과 다른 인자가 호스트 설정을 바꾸는 인과 효과는 이 표본으로 증명하지 않았다. 코드의 다른 tier/명시 override 전달은 별도 argv 시험이며, 실제 비기본값 적용은 T04/T08의 추가 대조로 남긴다. 역할 밖 인계도 맞춤 원본에 적힌 동일 상황/형식을 따른 통제 사례다. 미지의 요청을 일반적으로 판단한다거나 `team new`의 기본 템플릿만으로 같은 인계가 나옴을 증명하지 않으며 후속 템플릿·현장 역할 대조로 이어간다.
