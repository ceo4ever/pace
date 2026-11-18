# 함수 전환 구현·검증 기록

최초 typecheck는 disconnect의 optional 호출과 self-test의 realpathSync 참조2곳을 지적했다. 이를 고친 뒤 프로젝트 typecheck가 통과했다. 코드 수정 중의 이 결과를 회귀 전체 통과로 치지 않는다.

실제 helper2개와 대상3블록/신규1건을 구현했다. 원래70블록·runCli helper 및 대상의 단언/분기는 기계 변환 기대본문과 byte 비교로 보존했다. 신규 self-test는 같은fixture main/worktree 재사용·새HOME 세대·A→B→A·복원·실제CLI 오류2/1/1과 원문 stdout/stderr 동등성을 통과했다. 런타임 경고를 정규화하거나 버리지 않았다. 정상 테스트에서는 trace를 켜지 않았다.

전환 전후 동일3건의 단일 관측은121918.0488ms→107391.3875ms,14526.6613ms(약11.915%) 감소다. 원문/argv/환경/소스SHA는 candidate-before/after에 있다. 이 비교는 신규 adapter1건을 제외한 선택 범위이며 전체기여·통계적 효과나 P-6 달성의 증거가 아니다.

M1/M2/M3의 전환 전후8실행 모두 소유 제품 사본의 같은 원래 단언에서 예상 실패했다. 원본 제품은 수정하지 않았다. 원문·제품전후·실행시험 사본/argv/SHA·실제assert행과 원래행 매핑은 function-mutations 폴더에 있다. M1은 gate 제거를 `bad.status===1`이라는 더 앞선 기존 상태 단언에서 검출했다. 뒤의 바이트 무변경 단언까지 도달했다고 쓰지 않는다. 전환 전후 모두 그 같은 단언이며 설정 오류가 아니다.

M2는 BL생명주기 완료 단언 및 EIO 복구 후 최종 완료 단언을 각각 검출했다. EIO의 마지막 DIRECT_PROJECT_CALL이 실제 소유 변이 cli.ts를 향한 main([project,merge,P001,--yes])였음을 확인했다. 앞서 유지한 RETAINED_EIO_CLI 실패 주입과 구별한다. M3은 기존 실제 CLI의 tmp 잔존 검출력 보존이며 직접전환 표본으로 세지 않는다. 새로운 fs 래핑이나 preload 관측기는 만들지 않았다.

실제93개 기존 시험 SHA 불변과 Telegram/harness 정확한2변경, 다른 파일 메타데이터 변경 거부는 function-source-smoke에 연결했다. 이는 metadata 음성검사이며 가짜 전체 통과 표본이 아니다. 실제 하네스 전체와 새 비계측3회는 따로 검증한다.

실제 하네스 전체는74/74 통과·실패취소skip0,494062.9057ms·소스SHA 불변으로 완료됐다. 이는 파일 단독 실행이며 전체 속도 표본이 아니다.

보안 검사는 기존 가짜 비밀값 시험 본문을 복사한 소스 증거9개를 탐지했다. 원래 보안정책/테스트 제외 목록은 바꾸지 않았다.9개 원문 byte는 소유 임시 보관본에 SHA검증 후 유지하고, 기존 .ts.txt 아티팩트 내용은 source-reference JSON으로 바꿨다. 원문 시험 로그와 records는 바꾸지 않았다. source-reference-provenance.json이 각 원문 위치/SHA를 연결한다. 원래 하네스는 Git blob+기록된 줄바꿈으로 재구성해 원래SHA가 같음을 확인하므로 임시 보관본이 없어도 감사할 수 있다. 이후 도구는 source-fixture.mjs를 사용한다. 실행 당시 변이 검증기는 executed-verifier.mjs.txt에 보존했고, 재현용 현재 도구는 처음부터 원문 복사 대신 참조를 쓰도록 바꿨다. 이 도구 수정은 실행시험/제품 소스609개를 바꾸지 않는다.
