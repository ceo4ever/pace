# 참여 소통 원장

`pace team handoff`는 명시 등록한 업무 메시지의 짧은 JSON 머리와 별도 markdown 본문을 연결한다. 실제 메시지 전달은 기존 Orca 또는 사람이 쓰는 호스트 채널이 맡는다. 직접 도구 호출을 가로채거나 사람의 정체성·자연어 해석의 동일성을 인증하지 않는다.

## 원문과 보존

버전 관리되는 프로젝트 `handoffs.jsonl`에는 protocol/v/id/kind/from/to/task?/requestId?/data와 p/at/seq/bodyHash/bodyRef만 남는다. 본문·캡틴 답 원문·상세 제안/결과/판정·계약 사본·전송 payload는 Git common dir의 `pace/handoffs/<프로젝트-key>/bodies/<SHA256>.md`에만 둔다. UTF-8 bytes를 그대로 보존하며 CRLF나 Unicode를 정규화하지 않는다. bodyRef는 `local:<SHA256>`이다. 기존 log.jsonl의 짧은 결정·질문·답 요약은 계속 커밋한다.

이는 별도 원문 Git 승인 전의 로컬 보존(B)이며 코디네이터의 보수적 지시다. 사용자가 다른 clone 재감사 한계를 승인했다거나 원문 Git 보존을 승인했다고 해석하지 않는다. 같은 Git common dir를 공유하는 worktree와 Claude/Codex는 로컬 본문을 대조할 수 있다. 다른 clone/머신에는 본문이 따라가지 않는다. 백업·삭제·원문의 Git 승격은 별도 결정이다. 패턴 검사는 모든 민감 정보를 알아내지 못하며 짧은 metadata에도 업무 원문을 넣지 않는다. 지문만으로도 짧은 본문의 추측이 가능하므로 비밀 후보를 등록하지 않는다.

`--body-file -`는 한도 안의 표준 입력을 받는다. 파일은 저장소 밖 또는 위 로컬 폴더의 단일 링크 일반 파일만 받는다. working tree 입력은 거부하고 같은 저장소에서 시도한 경로를 로컬 staging 보호 목록에 남긴다. finish는 해당 경로가 아직 staging 후보면 git add 전에 멈춘다. 파일을 자동 이동/삭제하지 않는다. 알려지지 않은 복사본까지 찾아내는 DLP는 아니다. 다른 working tree에서 추적할 수 있는 separate-git-dir 배치도 거부한다.

본문 한도 2MiB, 머리 16KiB, metadata 문자열 400자(출처 locator 240자), 배열 32개, 원장 32MiB다. 중복 JSON 키, 미지원 버전, 링크/하드링크, 손상된 지문, 비밀 후보는 거부한다. 오류로 본문을 자르거나 바꿔 승인 근거로 쓰지 않는다. 본문·전송 stderr는 CLI 오류에 출력하지 않는다.

## 머리와 실행 흐름

```json
{"protocol":"pace-handoff","v":1,"id":"original-one","kind":"captain_input","from":"coordinator","to":"project:P123","requestId":"request-one","data":{"sourceRef":"orca:message-id"}}
```

```sh
pace team handoff record P123 --file header.json --body-file /outside-repo/body.md
pace team handoff list P123
pace team handoff check P123
pace team handoff ready P123 delegate-one
```

actor는 captain/coordinator/agent:<실제 팀 이름>/project:P###다. 송신 주체·출처는 참여자가 보고하는 값이며 인증 서명이 아니다. 모든 record의 상세 본문은 필수다. 특히 decision_reply에는 실제 받은 답의 온전한 원문이 필요하다. 조건부·모호한 답을 자동 승인으로 분류하지 말고 hold/재확인을 요청한다.

| kind | data와 판정 |
|---|---|
| captain_input | sourceRef. 명시 등록한 캡틴 원문과 출처 |
| decision_request | interpretation(boolean), of?(captain_input ID), plan?, relayOf?. 해석이면 of 필수. requestId 필수. 본문에 요청·선택지·추천/이유. 같은 requestId의 중계는 relayOf와 원문/본문/계획이 같아야 한다 |
| decision_reply | re(제안 ID), decision(approve/correct/reject), proposalHash, sourceRef. from=captain, 같은 requestId. 특정 제안 ID·원문 참조·본문/계획의 digest만 승인 |
| delegate | basis, plan. 수신자·본문·태스크와 계획의 일치 확인 |
| scope_check | re(위임 ID), status(within/hold), basisHash, checks:{instruction,decisionOwner,proofScope}. 위임 수신자가 송신자에게 기록. within은 세 항목 true. 상세 대조 이유는 로컬 본문 |
| result | re(위임 ID), status(done/partial/blocked), evidence:[{path,hash}]. 위임 수신자만 기록. done은 범위 within과 실제 파일 증거 필요 |
| close | re(위임 ID), result(결과 ID), proofScope, checked:true. 계획의 decisionOwner만 실제 증거를 확인해 done을 종결 |
| status | re?, sourceRef?. 상태 안내. 실행 승인 근거가 아님 |
| delivery/resource_event | 실제 전송/잠금 경로가 내부 생성. record 입력으로 위조할 수 없음 |

계획은 `{id?,task?,assignee,decisionOwner,proofScope,instructionHash}`다. proofScope는 T-1 같은 기준/절 참조, instructionHash는 위임 지시의 SHA256이다. 구현 API `instructionDigest`는 위임 ID/본문/basis/plan을, `proposalDigest`는 제안 ID/of/본문/plan을 canonical JSON으로 묶는다. 동일한 문구라도 다른 제안의 승인은 재사용하지 못한다.

delegate의 basis는 다음 중 하나다.

| kind | 필드·조건 |
|---|---|
| input | ref(원문 ID), hash(원문 SHA256), policy:{ref,hash,planId}. 지시 bytes가 원문과 동일하고 계획 계약 일치 |
| contract | ref,hash,planId. 프로젝트 계획 계약 파일/본문/배정/판정자/증명 범위 일치 |
| approved | ref(제안 ID), approval(답 ID), hash(proposalDigest). 최신 답이 approve이며 제안의 본문/계획과 위임이 동일 |

none basis로 실행 위임하지 않는다. input/contract 계획 파일은 프로젝트 `handoff-plans.json`의 `{version:1,declaredBy,plans:[...]}`이며 plan.id가 필수다. 상세 지시는 넣지 않는다. sender가 고른 ref만으로 승인되었다고 판단하지 않고 PM/수신자가 실제 계약·출처와 의미를 대조한다. 등록 시 계약 사본을 로컬에 보존하고 metadata에는 작성자·사본 지문·planId를 남긴다.

`ready`는 확인된 현재 범위면0, 미대조/hold/로컬 본문 없음이면1, 원장 손상/잘못된 호출이면2다. 메시지를 먼저 수신하고 수신자가 범위를 대조할 수 있도록 delegate의 전달 자체는 scope_check 전에 가능하다. ready는 실행 도구를 기술적으로 가로채는 경계가 아니다. done/close 때도 현재 근거와 파일 지문을 재확인한다. partial/blocked는 열린 위임으로 남는다. 포기/대체를 완료로 바꾸는 철회 기능은 없다.

같은 승인 제안으로 다른 위임 ID를 만들어 중복 실행하지 못한다. 같은 ID와 동일 머리/본문은 중복 행을 만들지 않는다. 누락한 동일 본문을 명시 재등록해 복원할 수 있다. 다른 내용으로 ID를 재사용하지 못한다. 로컬 사본 없는 clone에서 stats는 metadata-only와 누락 수를 표시하고 finish는 경고한다. ready/send/close는 필요한 원문 대조를 보류한다. 존재하는 본문 지문 변조나 손상 원장은 정상0으로 숨기지 않는다.

등록 뒤 계약 파일에 무관한 plan이 추가돼도 로컬 사본의 선택 plan과 작성자가 현재와 같으면 기존 위임을 유지한다. 선택 plan/작성자 변경은 보류한다. 새 위임의 등록은 파일 전체 지문을 확인한다.

## 기록 선행 전송

```sh
pace team handoff send P123 message-one --route-file route.json --attempt-id attempt-one
pace team handoff prepare-external P123 message-two --route-file human-route.json --attempt-id human-one
pace team handoff receipt P123 human-one --file receipt.json
```

route는 `{transport:"orca"|"external",actor,target,sourceRef,from}`이다. Orca는 명시한 로컬 에이전트 target(`term_…`/`run:…`/`dispatch:…`/`orca_session_id:…`)으로만 handoff를 보내며 actor=captain은 거부한다. 실제 사람 채널이 아니다. 원장과 started 영수증을 fsync한 뒤 guard 밖에서 기존 CLI를 실행한다. 명시 성공 ID/응답은 sent0, 명시 거절/실행 전 ENOENT는 failed1, timeout·모호 응답·최종 기록 실패는 unconfirmed2다. 실제 성공 후 기록 실패는 sentMayHaveOccurred=true로 표시하고 started를 남긴다. started/unconfirmed/sent는 새 ID로 자동 재발송하지 못하며 failed만 새 attemptId로 재시도한다.

prepare-external은 기존 사람 채널의 전달 준비와 로컬 payloadPath만 내고 전송하지 않는다. 기존 호스트 도구를 실행한 참여자가 receipt의 phase/reportedBy/sourceRef를 기록한다. sent에는 실제 응답의 responseHash/responseId가 필요하고 선기록 출처/수신 주체를 바꾸지 못한다. 이것은 새 사람 전송 서비스나 성공 주장 인증이 아니다. 임의 자동 출력에서 성공을 추정하지 않는다.

쓰기 전 검증 오류는 guard를 정리한다. 원장 쓰기/동기화 중 오류는 guard를 보존하며 중단 뒤 자동 회수하지 않는다. 로컬 ledger.guard/owner.json의 소유자를 확인하고 참여자를 중단해 파일과 마지막 행을 대조한 뒤 운영자 승인으로 수동 복구한다. 승인 없이 guard를 지우거나 불명 전송을 반복하지 않는다. 같은 계정의 악의적인 파일/프로그램 교체 방어는 제공하지 않는다.

외부 경로의 unconfirmed 영수증이 뒤늦게 실제 확인되면 같은 시도에 최종 sent/failed 영수증을 추가할 수 있다. 이는 전송을 재실행하지 않는다. 캡틴 전송은 captain 수신으로 명시한 메시지/중계를 먼저 기록한다.

## 자원 사건과 집계

`pace team lock studio --by P123 --project P123 -- <명령>` 및 unlock의 --project는 실제 acquire/release/reclaim 후 사건을 연결한다. intent→상태의 transitionId/지문→applied 확인본→소통 원장 순서다. 선행 audit를 적용 증거로 승격하지 않는다. 프로젝트 기록 실패 시 이미 적용된 active/inactive 상태를 되돌리지 않고 guard/pending을 남기며 새 작업을 실행하지 않는다. `pace team handoff reconcile-resource P123 studio`는 applied 또는 실제 상태/전이 지문이 맞는 intent만 보완한다. 중복을 만들지 않으며 guard 삭제/작업 재개는 하지 않는다. T05의 소유자·그룹 종료/free와 별도 승인 수동 복구 후 새 획득 ID로 진행한다. --project 없는 잠금은 기존 경로다.

`project log ... --request-id request-one`은 question/escalation/answer에서만 공유 식별자를 남긴다. 기존 사건 수·FIFO 대기는 그대로이고 새 handoffs 통계는 요청 ID로 별도 중복 제거한다. 캡틴 답(출처 있는 decision_reply 또는 실제 근거 파일이 있는 by:user answer) > 실제 사람 경로 성공 > 캡틴 경로 실패만 > 미확인 순이다. coordinator 자체/대리 답·사용자 결정 src 표지만으로 캡틴 답이 되지 않는다. Orca coordinator 성공도 캡틴 도달이 아니다. 식별자 없는 과거 질문은 연결 불명 사건으로 따로 남기며 시각/FIFO로 합치지 않는다.

stats는 종류·agent별 기록 수, 요청별 분류와 열린 위임을 표시한다. finish는 partial/blocked를 포함한 열린 위임을 반드시 경고하되 정책상 자동 차단하지 않는다. 손상 원장·알려진 원문 staging 후보는 차단한다. 자연어 범위·실제 캡틴 출처의 현장 감사와 두 호스트 업무 관측은 별도 실행 검증 대상이다.

자원 callback은 원장 guard의 짧은 경합을 최대1초 재시도한다. reconcile은 미적용/옛 intent를 승격 없이 unconfirmed 목록에 보고하고 다른 정상 applied 보완은 계속한다. 미확인이 남으면 CLI는2를 반환한다. 기록 보완이 guard 복구나 작업 재개 승인을 대신하지 않는다.

## 운영 복구와 남는 한계

body로 이미 깨끗하게 추적 중인 공개 파일을 잘못 지정해도 등록은 거부한다. 당시 bytes의 로컬 기준 지문을 남겨 그 공개 내용이 그대로인 경우에는 finish를 막지 않는다. 변경한 내용이나 등록 뒤 추적시킨 원문은 보호한다. 오입력 보호 목록을 해제해야 한다면 파일을 옮기거나 지우기 전에 운영자가 당시 공개 기준/실제 원문 여부와 HEAD/index/working tree를 대조하고, 별도 승인 아래 해당 로컬 항목을 보정한다. 자동 해제/삭제는 하지 않는다.

privacy.guard도 ledger.guard와 같은 수동 경계다. 소유 프로세스와 참여자 중단 여부, staging-protection.json의 완전성, 원내 raw 경로와 HEAD/index/working tree를 먼저 확인하고 보호 목록을 복원한 뒤 별도 승인으로 guard를 회수한다. 불명 상태에서 finish를 우회하지 않는다.

미확인 intent는 자료를 보존해 수동 조사한다. 이미 상태가 바뀌어 적용을 입증할 수 없으면 applied로 꾸미지 않는다. 미확인 목록은 자동 소거되지 않으며 잘린/손상 intent는 조사 전 전체 보완을 보류한다. 운영자가 종료/free와 다른 적용 사건을 확인한 뒤 별도 승인으로 로컬 보관 위치를 나눌 수 있지만, 이 명령은 자료 이동·guard 삭제·실행 재개를 수행하지 않는다.

같은 제안으로 새 위임을 반복하지 않는다. 같은 위임은 정정/재승인과 수신 범위 확인 후 현재 근거로 재대조한다. 새 실행은 새 제안/승인을 연결한다. 내용이 달라진 새 결정 요청은 별도 요청 식별자를 사용하며, 동일 요청의 전달 중계는 relayOf로 명시한다.

캡틴 답/출처 locator는 참여자의 신고다. by:user와 존재하는 ref만으로 사람의 실제 답을 인증하는 것은 아니며 PM/현장 감사가 실제 출처와 대조한다. 원장이 있는 stats는 손상/미지원 metadata나 존재하는 로컬 본문 변조를 오류로 돌려 정상 수치로 숨기지 않는다. 그 결과 해당 stats와 merge 후 지표 갱신이 실패할 수 있으며 기존 병합 후 복구 절차를 따른다. 원장 없는 옛 stats는 그대로다. 원장은 전체 전이를 재생하므로 크기 한도 부근의 비용이 증가한다. 같은 read 안에서 동일 본문 지문을 반복 읽지는 않지만 큰 원장의 인덱싱/회전은 후속 설계 대상이다.

log의 by:user answer 근거 ref는 **짧은 출처 위치·응답 식별자·지문만 담은 영수증**이어야 한다. 실제 답 원문이나 상세 해석을 그 파일에 복사하지 않는다. 원문은 로컬 decision_reply 본문으로 등록하고 영수증에는 그 ID/지문·실제 출처 locator를 연결하는 방식을 권한다. ref 파일의 존재는 stats를 읽는 시점의 관측이며 파일 삭제/변경으로 분류가 달라질 수 있다. 사후 진위 감사는 이 한계를 포함해 실제 출처와 대조한다. route/source metadata도 이메일·이름·업무 문장 대신 필요한 짧은 불투명 채널 별칭/식별자만 쓴다.

종류별 집계와 별도로 coordinator 및 agent:* 송신자를 에이전트별로 집계한다. captain과 장치의 project:* 주체를 에이전트 수에 넣지 않는다. 자원 사건의 header.at/seq는 원장에 들어온 시각/순서이고 data.appliedAt은 상태 쓰기 전 intent 준비 때 생산자가 잡은 전이 기준 시각이다. 이름과 달리 적용 완료 확인 시각은 아니다. 사건의 실제 적용 여부는 이후 상태 쓰기와 applied 확인본으로 판단한다. 보완은 늦거나 다른 순서로 들어올 수 있으므로 시각과 수신 순서를 혼동하지 않는다. transitionId와 상태 지문으로 로컬 applied 자료를 대조한다.

전송 payload는 머리와 본문을 합쳐2MiB 한도다. 한도 근처의 본문은 기록되더라도 머리까지 합친 전송 준비가 거부될 수 있으며 그 경우 전송0이다. 원문을 잘라 맞추지 않는다. --project 전이의 transitionId 필드를 읽지 못하는 옛 설치본과 같은 잠금 상태를 섞어 쓰지 않는다. 병합 뒤 main에서 재설치·버전 일치를 확인하며 worktree에서 설치하지 않는다.
