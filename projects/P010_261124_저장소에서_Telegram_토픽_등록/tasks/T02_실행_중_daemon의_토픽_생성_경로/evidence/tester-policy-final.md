# T02 사용자 결정 반영 — 독립 tester 2단계

- 판정 시각: 2026-11-24 17:52 KST.
- **이번 정책·모의 회귀 범위: pass. T02 전체 완료 판정: fail — T-4의 실제 P-5가 승인 대기여서 목표 달성 미확인.** 구현 결함으로 인한 실패는 검출하지 않았다.
- 독립 목표 대조: 맞음. 먼저 작성된 `tester-policy-stage1.json`을 회수한 다음 현재 TASK, PROJECT P-4·P-5, BR02와 변경 시험을 읽었다. 1단계의 정적 판단을 실행 결과와 대조했다. 기존 작성자 명령 로그·자체 판정·다른 최종 tester 보고서는 읽지 않았다.
- 목표 달성: 모의 환경에서는 승인한 로컬 등록 → 실행 중 설정·토픽 반영 → 해당 저장소 표식의 첫 read-only 조회를 관측했다. 실제 포럼과 원문 자연어 요청에서 시작하는 사용자 경험은 미확인이다.

## 직접 실행

이 기기의 Node v24.22.3으로 다음 명령을 한 번 실행했다. 종료 코드 0, signal 없음, **80 pass / 0 fail / 0 skipped / 0 cancelled / 0 todo**, Node 보고 시간 **14438.396125 ms**였다.

```sh
node --test test/daemon-topics.test.ts test/daemon-workspace.test.ts test/daemon-t05.test.ts test/telegram-flow.test.ts test/telegram-format.test.ts test/telegram-use.test.ts
```

실행 래퍼가 임시 루트를 만들고 자식의 PACE_HOME·HOME·USERPROFILE·TMPDIR·TMP·TEMP를 그 안으로 지정했다. 세션 환경 변수와 NODE_OPTIONS를 제거했으며 `PACE_SKIP_BROWSER_E2E=1`로 실행했다. 시험 helper도 각 프로세스의 임시 PACE_HOME을 만든다. Bot API는 `MockTelegram`의 `127.0.0.1` 서버 또는 주입한 가짜 fetch이고 Gateway는 임시 daemon의 loopback 소켓이다. 운영 daemon·실제 Bot API·사용자 PACE 홈은 사용하지 않았다. 완료 뒤 실행 래퍼 소유 임시 루트를 정리했다.

| 시험 파일 | 실행·통과 수 |
|---|---:|
| daemon-topics.test.ts | 6 |
| daemon-workspace.test.ts | 9 |
| daemon-t05.test.ts | 11 |
| telegram-flow.test.ts | 40 |
| telegram-format.test.ts | 10 |
| telegram-use.test.ts | 4 |

## 기준과 검출력

| 기준 | 판정 | 직접 관측한 근거 |
|---|---|---|
| T-1 / P-3 | pass | `test/daemon-topics.test.ts:40`의 실제 CLI 자식·Gateway·daemon·가짜 API에서 하위 폴더 루트 선택, 미승인 preview 무등록, 승인 후 등록 ID 결속, createForumTopic 1회와 첫 표식 응답을 단언한다. `:106`은 정지·어댑터 없음·포럼 미확인·포럼 변경의 설정 반영/미결속과 생성 0회를 대조한다. |
| T-2 / P-3 | pass | `daemon-topics.test.ts:236`은 Bot API 장벽으로 응답 유실·General 합류·다른 CLI add를 실제로 겹치게 하고 설정 두 항목·allowedUsers 보존, 토픽 두 개와 이름별 생성 1회를 검사한다. `:271`은 확정 실패 후 재시도, 응답 단절, 의도/결속 저장 실패를 주입하고 재기동 후 재생성 금지, 같은 ID bind 복구·다른 ID bind 거부를 단언한다. `:365`는 생성 중 정지 후 재기동에서도 생성 호출 1회를 유지한다. |
| T-3 / P-4 | pass | 아래 정책·권한 판정과 `daemon-topics.test.ts:166`, flow S-9g·S-9·S-9j·S-9k·S-21, workspace CLI/Gateway 시험의 실행·단언을 대조했다. |
| T-4 / P-5 | fail: 미확인 | 모의 하위 폴더 CLI에서 첫 표식 응답과 경로·토큰·chat/thread ID 비노출은 `daemon-topics.test.ts:40`과 hiddenValues 검사로 통과한다. 실제 에이전트 세션의 원문 요청 → 확인 화면 → 실제 포럼 첫 조회 및 사용자 확인은 승인 대기이며 이번 시험으로 대체하지 않는다. |

### 정책 변경 범위

1. **추가 인자 거부 및 조회 차단: pass.** flow S-9g(`test/telegram-flow.test.ts:395`)는 절대경로, 인용된 공백 경로, 상대경로, `..`, `~/a`, 경로만 입력, 인자 없음의 7개 입력마다 사용법과 로컬 `pace daemon workspace add` 안내를 기다린다. fs worker 호출 0, host.workspaces 조회 0, createForumTopic 0을 명시적으로 단언한다. 등록부 조회 함수 자체의 별도 spy는 없으나, `src/daemon/telegram/adapter.ts:416`에서 정규식 실패가 이름 조회·ensureWorkspaceTopic 전에 반환하며 등록부 검증은 그 뒤 `workspaceRootAvailable`의 worker 경로에만 이어진다는 코드 대조로 보완했다.
2. **설정·등록·토픽·의도 불변: pass.** S-9g는 메모리 설정, 디스크 topics/provisioning, projects/config 미생성을 대조한다. `daemon-topics.test.ts:166`은 이미 설정·등록부가 존재하는 실제 daemon에서도 추가 인자 입력 전후 설정 원문·등록 후보 목록·topics/provisioning 동일성을 검사한다. 여기서 불변은 업무 상태다. update 소비에 필요한 offset 등 전송 메타데이터의 무변경을 주장하지 않는다.
3. **노출된 유효 이름만 허용: pass.** 동일 통합 시험은 설정 전용 legacy 이름의 생성과 read-only 조회를 허용하고 등록부 전용 이름, 이동한 등록 신원, 잘못된 chat·사용자를 거부한다. flow S-9는 정상 이름 결속·중복 입력 생성 1회·해당 토픽 실행을 유지한다.
4. **정상 이름의 실패 복구: pass.** S-9j의 확정 실패 의도 삭제→재요청 성공, 결과 불명 의도 보존→자동 재생성 금지→수동 bind, S-9k의 검증 worker timeout→생성 0회 및 후속 명령 처리, 저장 실패 롤백 시험을 정상 이름 입력으로 전환하면서 해당 단언을 유지했다. N-1은 권한·포럼 안내와 같은 이름 재시도 성공, 알려지지 않은 오류의 경로 비노출을 검사한다.
5. **CLI·Gateway 비약화: pass(선택 범위).** `daemon-workspace.test.ts` 9건을 수정 없이 실행했다. 승인 전 무쓰기, 거절·승인 중 등록 변경, 이름 충돌·후보/복제/깨진 정의, 포트 소유권, Gateway 무인증 1008·Origin 403, 병렬 설정 기록과 교체 실패, 재시도·이동 후 옛 경로 실행 거부를 유지한다. 새 topics 6건은 실행 중 토픽 처리까지 연결한다. General의 원격 경로 등록 제거가 로컬 승인 등록 경로까지 제거하지 않았음을 실제 CLI 자식 실행으로 확인했다.
6. **권한·승인: pass.** 새 General 토픽에서 첫 실행 access가 read-only이며 /write 후에는 승인 대기이고 runner 실행 수가 늘지 않는다. flow S-21은 승인 버튼 전 실행 차단과 유효 callback 후 write 시작까지 검사한다. S-6b·S-9b·tester T-3 및 daemon-t05의 승인 저장 실패·재승인 회귀가 통과했다.
7. **이전 함수 전용 시험 제거: 범위 타당.** diff의 daemon-t05 S-20c 제거는 함께 삭제된 `Daemon.addWorkspace`와 `registerLegacyWorkspace` 전용 계약(선해결 인수, 파일 시스템 무호출, legacy General 원격 등록)을 대상으로 한다. 현 코드·시험에서 해당 호출이 남지 않는 것을 검색했다. 같은 이름 멱등·충돌·신원·비밀 형태 경로 거부는 현재 등록 경로의 통합 시험 및 남은 S-7b로 확인한다. 제거된 함수의 내부 계약을 새 registerWorkspace에 그대로 요구하지 않는다. 옛 S-9g의 ‘원격 경로 등록 중 코어 실패 후 재입력’도 폐기된 진입점 시험이며, 현재 로컬 Gateway의 설정 실패→오류·상태 불변→재시도 성공은 `daemon-workspace.test.ts:198`이 지킨다.

## 한계와 signals

- signals: 선택된 80건에서 원인 불명 실패·skip·timeout·관련 없는 출력 회귀 없음. 전체 `npm run check`·타입 검사·다른 플랫폼 실행·실제 Telegram은 이번 임무 밖이며 실행하지 않았다.
- 공개 동작을 CLI·실제 loopback Gateway·가짜 HTTP API·디스크 상태·runner로 검증한다. S-9g의 내부 worker/host 계수는 “호출 자체 금지” 계약을 확인하는 보조 단언이며 독립 통합 상태 대조도 있다. fault injection은 실제 설정·상태 파일 교체 지점과 네트워크 응답에 걸려 있어 무조건 통과하는 단언으로 보이지 않는다. 구현 변이 시험은 수행하지 않았다.
- 1단계가 언급한 40자 경계·대문자 명령·bot suffix·개행 조합의 전수 실행은 지정 시험에 없다. JavaScript `$`가 오직 문자열 맨 끝에서만 일치한다는 1단계 설명은 엄밀하지 않다(마지막 줄 종결자 앞에서도 일치 가능). 이번 판정은 그 설명에 의존하지 않고 입구의 실제 정규식 검사와 현재 7개 거부 입력의 실행을 근거로 한다.
- `/bind`의 추가 인자 무시는 이번 사용자 결정인 General `/new`의 추가 인자 거부 범위 밖이다. `/bind` 전체 인자 정책 변경까지 통과했다고 확장하지 않는다.
- 남은 조치: main이 승인된 대상에서 P-5 실제 증거와 사용자 확인을 회수해야 한다. 그 전에는 모의 pass로 T02 전체 완료를 선언할 수 없다.

## 판정 대상 고정

검사 직후 TASK SHA-256: `5f00e4c017261e8ba92d921c682b2204e1ddcd05dd9722899f37811803100abc`.

| 시험 파일 | SHA-256 |
|---|---|
| daemon-topics.test.ts | d255a2f3b74dd56cf419e7e5f2e43c272a46cefbd2a40f9508fc721bb4d9bda1 |
| daemon-workspace.test.ts | c1cc2ff83fd1adc76f7e168f5fe4139054bad7187d040461d33965d91e1c3b3b |
| daemon-t05.test.ts | bab4e742ae9c1fe5388f1eab7ca64cc20b0648990e32c8567989b1acf376e758 |
| telegram-flow.test.ts | ad10019ca7423129573f209cce64b82ddb33f093332c3c685e562b3d4a0143ad |
| telegram-format.test.ts | a6f802d60e3d533d4b8c477fe241bceb9d495685d8c842c8872c8843b36d74d9 |
| telegram-use.test.ts | 56e33cdd16cbaf0efa330501ebd04b4e9790d1caa297da8600119964c0433d9f |

작성한 산출물은 이 파일 하나다. 코드·설정·시험·다른 증거·프로젝트 상태는 변경하지 않았다.
