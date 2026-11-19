# T01 운영 반영과 실체인 확인

## 승인 및 반영

2026-11-19 새 main 코디네이터가 캡틴의 명시 승인과 범위를 전달했다. 허용 범위는 운영 기본 프로필의 default 체인을 새 어댑터 설치 없이 Claude/p → Codex/p로 반영하고, 실제 default 합성 읽기 및 daemon install 계획만 확인하는 것이다. Telegram 연결·전송, Windows 로그온 등록, 신규 어댑터 설치는 제외했다. 프로젝트의 answer·사용자 결정 로그에 기록했다.

설치본 `%USERPROFILE%/.pace/app/bin/pace.ts`로 `agent setup --agents claude,codex --yes`를 수행했다. 이 `--yes`는 승인된 agent setup 적용에만 사용했으며 daemon install에는 사용하지 않았다.

- 실제 기본 프로필은 default, 대상은 `%USERPROFILE%/.pace/profiles/default/agent-chains.json`으로 확인했다.
- 적용 전 이 체인 파일은 없었다. 설치된 CLI 둘 모두 공식 상태 명령으로 로그인됨을 확인했고 Claude ACP 사용 가능 감지는 false였다.
- 설치본 p-executor 원본 SHA-256은 격리 시험 S-0 값과 적용 직전·직후 일치했다.
- 적용 후 steps는 시험한 두 실행기와 정확히 같은 순서·방식이며 다른 설정의 보존 비교가 통과했다.
- setup 종료 0. 신규 로그인·어댑터 설치는 수행하지 않았다.
- 근거: operational-chain-apply.json. 승인 원문 자체나 계정 식별자는 증거에 복제하지 않는다.

## 실제 default 체인 읽기

운영 홈을 지정한 설치 CLI에서 `agent run --chain default --cwd <합성 Git 저장소> --prompt-file <합성 읽기 요청> --raw-dir <임시 원본 보관> --timeout-ms 180000`을 수행했다. `--chain-file`로 대상을 바꾸지 않았다.

종료 0, status ok, 실제 선택은 step 1 Claude/p였다. 합성 표식 `PACE_CHAIN_SYNTHETIC_86420`을 읽었고 원본 fixture 바이트는 그대로였다. 등록된 Claude/p·Codex/p 모두 readOnlyEnforced=true임을 실제 설치본 registry에서 확인했다. Codex/p의 실제 fallback 발생은 유도하지 않았으며 읽기 적격 확인은 기존 개별 실측과 chain 회귀 27건(S-7의 미검증 단계 제외 모사 시험 포함)에 연결한다.

근거: live-chain-observations.json. raw_path는 임시 원본을 가리키는 비식별 표기로 바꾸고 운영 결과의 세션 식별자는 저장하지 않았다.

## daemon 설치 계획

설치 CLI로 `daemon install`만 실행했다. 종료 0, 출력은 “에이전트 체인(default)은 준비돼 있다.”이며 계획 전용임을 표시했다. default 체인 없음 오류가 해소됐고 출력에 다른 차단 오류는 없었다. 로그온 등록·런처 생성은 실행하지 않았다.

근거: daemon-install-plan.txt. 이 결과는 Telegram 연결이나 실서비스 준비 완료 판정을 뜻하지 않는다. T02~T04의 실제 연결·기동·요청 검증이 남아 있다.

## 검사와 마감

선언 전체 검사 `npm run check`를 임시 PACE_HOME에서 1회 실행해 exit 0, 991 pass·0 fail·9 skipped(총 1,000건)를 확인했다. 원문과 집계는 repository-check.log 및 repository-check-result.json에 보존했다. 독립 tester·reviewer 최종 판정은 모두 pass blocking 0이며 TASK-CLOSE 확정 및 project check·done도 통과했다. 최종 원문은 post-tester-final.md 및 post-reviewer-final.md다. 앞선 isolated-test-summary.md와 resume-checklist.md의 승인 대기 문구는 적용 전의 이력이며 현재 운영 반영 상태는 이 문서와 프로젝트 로그를 따른다.
