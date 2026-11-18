# Windows 래퍼 최소 수정과 집중 검증

동일 사전 reviewer의 현재 TASK 해시 `492ef2ab5b79e6bbeab52d3a9f7754d77cb098a9550325ccb4f92d786a794e02` 판정은 pass, blocking 0, should_fix 2다. 원문 `pre-review-wrapper-round.md`와 PRE-REVIEW 마지막 시도에 연결했다. 검토자의 기존 문자열 비교 설명은 계획 검토 의견이며, 과거 전체 실패의 실제 파일 동일성/발생 조건은 여전히 미확정이다.

실행 원본에서는 `test/install-windows-wrapper.test.ts`의 대상1건과 필요한 import 두 줄만 바꿨다. 파일 SHA는 `3662b08e03855d6aa84afcea2a05afdfd7d61d78649ec2face67cdd77b96e658`에서 `253993658e31df3e2681c07773781b32769597b303e35d69f565069cf3e0f175`로 바뀌었다. command-v의 실제 출력은 같은 Bash에서 Windows 경로로 변환하고 원래 stdout 첫 줄/마지막 버전 줄 계약을 지킨다. 원래 표기는 stderr 진단에 남기고 PATH 설정·조회·진단·변환·버전을 명시적 `&&`로 이어 실패를 전달한다(SF-2).

Node 단언은 관측 경로 자체의 lstat 일반 파일 여부, 설치 bin의 native 부모 동일성, 예상 설치 래퍼의 native 경로 동일성 및 bigint dev/ino 동일성을 확인한다(SF-1). 부모 동일성도 확인하므로 다른 폴더의 같은 내용이나 링크를 PATH 앞에서 찾은 결과를 허용하지 않는다. 버전·실제 Git 훅·특수문자 인자·이름·skip·timeout은 그대로다. 제품/설치 스크립트/사용자 설치 설정은 바꾸지 않았다.

`wrapper-source-change.json`의 정확한 예상 변환 감사는 해당 블록/필수 import 밖 byte가 같고 기존 버전/훅/인자 단언이 유지됨을 확인했다. 다른 변경이나 inode 단언 약화도 거부했다. 기존 함수/Telegram 감사 본문은 유지했고, source matching/comparator에 정확한 Windows SHA 쌍을 세 번째 예외로 추가했다. 변경 전 도구는 `before-wrapper-*.mjs.txt`에 보존했다. `wrapper-source-smoke.json`은 T03 기존95개 중92개 byte 불변·예외3개 정확 일치와 임의 다른 SHA/잘못된 wrapper SHA 거부를 확인했다. 전체 판정/skip 목록 검증은 향후 유효 전체 실행이 있어야 가능하다.

| 집중 실행 | 결과 | 벽시계 ms |
|---|---|---:|
| 수정 소스와 같은 SHA의 소유 사본에서 파일 전체1회 | 종료0, 10건 통과, 실패/취소/skip0 | 24766.7214 |
| 같은 소유 사본에서 관측 경로만 실제 app/bin/pace.ts로 오지정1회 | 종료1, 1건 실패, 통과/취소/skip0 | 1754.283800000001 |

음성 검사는 `wrong-file.test.ts.txt`의 124행 `realpathSync.native(dirname(resolvedWrapper))` 부모 단언에서 실제 ERR_ASSERTION으로 실패했다. 원래 command-v 표기는 오류 메시지에 남았으며, 그 앞의 status0/lstat 단언을 통과했다. native 파일/dev/ino 단언에는 아직 도달하지 않았으므로 inode 단독 음성 검출로 세지 않는다. 다른 파일의 정체성 거부는 별도의 승인된 별칭 대조 관측에도 연결된다. 원문과 인자/소스 SHA는 `wrapper-validation/records.json`, `file-full.log`, `wrong-file.log`에 있다. `npm run typecheck`도 종료0이었다.

## 결과 판독기 오류와 재실행 없는 정정

두 요청 실행이 완료·저장된 뒤 validate-wrapper.mjs가 음성 로그에 단언 코드 식이 인쇄될 것으로 가정해 자체 정규식 단언에서 종료1이었다. 실제 새 단언은 stderr를 사용자 메시지로 주므로 Node는 `generatedMessage:false`로 코드 식 대신 그 메시지를 표시한다. 실제 시험이 잘못 실패했거나 설정 오류였던 것이 아니다. 실행한 판독기 원문은 `wrapper-validation/executed-validator.mjs.txt`에 그대로 보존했다. 이 단회 도구의 알려진 판독 오류는 전체/제품 결과에 합산하지 않는다.

`reconcile-wrapper-validation.mjs`는 새 시험 실행 없이 보존된 두 소스 SHA·원문 통계·실제 사본 URL/124행/열10 스택·정확한 음성 치환을 대조했다. 그 결과는 `reconciled-manifest.json`에 `verifiedFromPreservedRuns:true`, `newTestExecutions:0`과 원래 도구 오류/한계로 남겼다. 원래 로그/기록/시험 소스는 덮어쓰지 않았고 집중 검사는 반복하지 않았다.

이 결과는 T-2의 해당 시험 집중 증거이며 새 전체3회나 P-6 성공 표본이 아니다. 앞선 함수 세트의 실패와 모든 기존 무효 세트·진단은 보존한다. 새 전체3회는 main 판단 전 시작하지 않으며 T05 마감/finish는 미완료다.
