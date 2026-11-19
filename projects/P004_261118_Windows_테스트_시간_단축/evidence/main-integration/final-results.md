# main Vitest 통합 후 새 전체 3회

통합 소스 a5d1115의 새 세트는 `evidence/t05-integrated-final-v2-2026-11-19T00-15-58-729Z/`다. main35d0da6의 Vitest file/unit과 P004 changed/Node/Python/all 경계를 함께 보존한610개 고정 소스로 원래 `npm run check`를 Windows 기본4·무override/profile·회차별 임시 환경에서 실행했다. 통합 전609/996의 결과나 집중40건, finish를 표본에 합산하지 않았다.

| 회차 | 벽시계 원값 ms | 종료 | tests/pass/fail/cancel/skip |
|---|---:|---:|---|
| 1 | 698136.3187000001 | 0 | 1000/991/0/0/9 |
| 2 | 703222.1800999999 | 0 | 1000/991/0/0/9 |
| 3 | 702115.5500999999 | 0 | 1000/991/0/0/9 |

유효3회 중앙702115.5500999999ms×2=1404231.1001999998ms는 원래 T01 비계측3회 중앙1425464.3326999997ms 이하다. 기준선의49.25521698393598%, 감소율50.74478301606402%이며 절반 한계보다10616.616249999963ms 낮다. P-6을 충족했고 통합 후 최종 독립 reviewer는 P-1~6/보안 blocking0·should_fix0, tester는 통합 P-6/계약 pass·blocking0으로 수락했다. 원문과 연속성/노출/해시는 final-independent-review에 연결했다.3회와 단일 Windows PC의 관측으로 일반 속도 보장이나 T05/통합 변경의 단독 인과 기여를 주장하지 않는다.

`integrated-final-verification.json`은 원문/저장 통계/실제 회차 시간을 재검증하고 기존996에서 명시한 main 이름1건 대체·새main3건/통합sentinel1건을 적용한 정확한1000건 이름/판정과 기존skip사유를 세회 각각 대조했다. preflight-source.json의610개와 실행 환경의 시험 소스·helper/runner SHA가 일치했다. 최초963건 대비37건을 추가했고 원래 판정/범위를 덜 실행해 시간을 줄인 결과가 아니다. 알려진 두 이름 대체(T03 Windows 동시성 기대, main Vitest 미지원→로컬 부재)는 그 태스크/통합에서 검토받았다.

`final-launch-v2.json`, `final-binding-v2.json`과 T04 runtime-t05-integrated-v2 스냅숏은 측정 시작/종료610개 파일 SHA·도구9개·HEADa5d1115·main35d0da6 동일을 확인했다. files 배열 외 차이는 captured 시각뿐이다. snapshot은 연속 감시나 호스트 부하 동결이 아니다. 다른 시험·진단·소스/도구 편집은 겹치지 않았으며1·2회 뒤 원문 기반 읽기 범위 대조만 수행했다. 그 부하는 정량화하지 않았다.

`environment-comparison.json`은 원래 기준선과 Node/npm/Git/Python·OS/CPU·전원·Defender·명령·계측 상태가 기록상 같음을 확인했다. 최종 argv는 원래 npm run check이고 requestedConcurrency는 도구가 직렬화하는 `default`, 실제 Node 기본은4다. 초기 읽기 보조 단언이 빈 문자열을 기대한 오판은 실제 직렬화 값/argv를 읽어 정정했고 시험·시간을 반복하지 않았다. 초기 기준선에 없던 후속 소스/도구 메타데이터는 소급해 만들어 내지 않았다.

## 시작 전 출력 경로 오류의 분리

첫 launcher는 원래 측정 도구의 출력 폴더가 `evidence`라는 이름이어야 한다는 조건을 어겨 측정 시작 전에 종료1이었다. 실제 npm check는0회이고 결과 폴더/시간 표본도 없었다. startup-directory-error.json과 startup-failed-*.mjs.txt, final-launch.json 및 첫 snapshot에 원문 도구/인자·에러 요약을 보존했다. 전체 stderr 파일은 남기지 않았고 콘솔 응답에 있다.

실행 소스/수락 기준을 바꾸지 않고 소유 evidence 하위의 evidence 폴더와 새 고유label/v2snapshot으로 경로만 정정한 뒤 위 실제3회를 시작했다. 읽기 판독기에는 실제 freeze label을 전달하도록 했다. 두 도구의 바뀐 버전은 실제 측정 전 새 도구 스냅숏에 고정했고 이후 SHA가 같다. 최초 시도/스냅숏을 덮어쓰거나 성공 회차를 다시 선택하지 않았다. 기존 Telegram/stale-lock/Windows 경로 실패 세트와 각 진단/판독 오류도 그대로 보존한다.

## 다음 게이트

동일 독립 프로젝트 reviewer의 통합 읽기 pass(blocking0/should_fix0)는 independent-review.md에 있다. 그 뒤 실행 소스의 의미 변경은 없고 현재610개와 커밋 blob의 연결도 유지한다. 실제 Vitest 엔진과 Windows 임의 자손 회수 실기, 로컬 경로 메타데이터 공개 경계는 기존 handoff다. 이번 결과가 과거 불안정 실패의 원인을 확정하지 않는다.

통합 후 새3회와 목표/보안 증가분의 최종 독립 결과 대조를 받아 마감 문서를 확정했다. finish 필수 전체 검사는 별도 게이트로 수행하며 결과는 프로젝트 상태와 명령 기록으로 확인한다. 그 결과는 이 세 시간 표본에 합산하지 않는다. 병합/설치/푸시는 이 작업의 승인 범위에 포함하지 않는다.
