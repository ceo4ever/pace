# P005 T01 독립 tester 1단계 판정

## 받은/읽은 범위
- **받은 것:** 메시지에 붙은 비식별 관측 9개(s0-installation, readonly-observations, claude/codex positive summary, positive-global-guard, chain-unit-check, operational-chain-apply, live-chain-observations, daemon-install-plan).
- **읽은 것:** 없음. 파일과 저장소를 열지 않았습니다. TASK, PROJECT, BR, 작업자 판정도 보지 않았습니다. 파일 변경, 보조 호출(advisor 포함), 민감정보 출력도 하지 않았습니다.

## 판정: **조건부 달성**
목표와는 맞습니다. 기본 체인 준비와 각 실행기의 읽기 성공·쓰기 차단 검증이 범위이고, Telegram과 daemon 실제 등록은 이 태스크 밖입니다. 핵심은 근거로 달성됐지만, 아래 한계 때문에 완결로 보기는 어렵습니다.

## 근거
1. **설치 무결성:** moduleHash와 mainHash가 같습니다. gitObjectHash와 installedNormalizedHash도 같고, ancestry는 0, 관리자 권한 없이 실행됐습니다. apply와 live 관측의 moduleHash도 같은 값이라, 설치본과 실행본이 일치합니다.
2. **읽기 성공:** claude와 codex(둘 다 p 모드) 모두 readExact=true입니다.
3. **쓰기 차단:** 두 실행기 모두 fixture가 그대로이고, probe·shellProbe·outsideProbe가 생기지 않았으며, git 로컬 변경도 없습니다. codex는 sandbox read-only 거부, unauthorizedAccess, git 거부가 raw 기록으로 남아 있어 실제로 막힌 것이 확인됩니다.
4. **양성 대조:** 쓰기를 허용한 실행에서는 두 실행기 모두 fixture를 바꿨고 probe와 shellProbe를 만들었습니다. 그래서 차단 결과가 "원래 아무것도 못 쓰는 테스트"라서 나온 것이 아닙니다. 실제 사용자 git 전역 설정은 실행 전후 해시가 같아 오염되지 않았습니다.
5. **체인 준비:** default 프로필에 agent-chains.json이 새로 만들어졌습니다(이전 파일 없음). 순서는 claude p → codex p이고, 다른 설정은 유지됐으며, 로그인이나 어댑터 설치는 하지 않았습니다.
6. **live 체인:** exit 0, status ok, claude가 1단계에서 성공했고 readExact=true, fixture도 그대로입니다. 체인에 쓰는 p 모드 두 개는 모두 readOnlyEnforced=true입니다.
7. **단위 회귀:** 27개 모두 통과했습니다.
8. **daemon 등록:** 계획만 출력됐고 실제 등록에는 사람이 --yes를 붙여야 합니다. 이 태스크 범위에 맞습니다.

## 한계
- **claude의 차단은 OS 샌드박스가 아닙니다.** 내장 도구 목록을 Read, Grep, Glob으로 줄인 것뿐입니다. rawPolicyErrors가 null이라 "시도했다가 거부됨" 기록은 없고 "쓸 도구가 없었음"만 확인됩니다. 사용자 설정의 hook이나 MCP 서버가 이 제한을 우회할 수 있는지는 관측에 없습니다. 실제로 이 세션에서도 SessionStart hook이 동작했습니다.
- **claude의 외부 경로 차단은 근거가 되지 못합니다.** 양성 대조에서도 claude는 outsideProbe를 만들지 못했습니다. 그래서 읽기 전용 실행에서 outsideProbe가 없다는 결과로는 아무것도 구분할 수 없습니다.
- **codex는 live 체인에서 한 번도 실행되지 않았습니다.** claude가 1단계에서 성공해 넘어가지 않았기 때문입니다. 대체(fallback) 실행 근거는 단위 테스트 S-7뿐이고, 이것도 mock입니다.
- **짧은 경로 문제:** claude는 처음에 Windows 짧은 경로(8.3)로 읽기에 실패했고 긴 정식 경로로 바꿔서 성공했습니다. daemon 경로에서도 항상 긴 경로로 바꾸는지는 live 결과(readExact=true)로 간접적으로만 보입니다.
- **결과를 설치본과 묶을 근거가 부족합니다.** readonly와 positive 관측에는 moduleHash가 없어 이 설치본으로 실행했다고 직접 확인할 수 없습니다. 모델 이름도 실행기가 스스로 보고한 값이고, live attempts의 model은 null입니다.
- **codex acp는 readOnlyEnforced=false입니다.** 지금 체인에서는 쓰지 않지만 위험 요소로 남습니다.
- 어댑터는 두 실행기 모두 사용 불가(adapterUsable=false)입니다. p 모드 체인에는 영향이 없습니다.

## 필요한 보완
1. claude를 강제로 실패시키거나 건너뛰게 해서, live 체인에서 codex 2단계의 읽기 성공과 쓰기 차단을 한 번 확인합니다.
2. readonly와 positive 관측에 moduleHash를 기록해 같은 설치본으로 실행했음을 묶습니다.
3. claude의 외부 경로 쓰기 양성 대조를 고치고 다시 측정합니다. 아니면 hook·MCP를 끈 상태에서의 차단을 명시적으로 확인합니다.
4. 읽기 전용 작업에 readOnlyEnforced=false인 단계(codex acp)를 고르지 못하게 막는 장치가 있는지 확인합니다.
5. live attempts에 실제로 쓴 모델 이름을 기록합니다.
6. 체인 실행 경로가 항상 긴 정식 경로로 바꾸는지 단위 테스트나 관측으로 고정합니다.

참고로 전체 저장소 검사는 별도로 진행 중이라, 그 결과는 이 판정에 반영하지 않았습니다.
