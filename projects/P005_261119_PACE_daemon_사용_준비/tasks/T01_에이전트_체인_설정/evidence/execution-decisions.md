# T01 실행 상세

- 사전 검토 2차의 should_fix는 기존 계획 안의 실행 상세로 다룬다. TASK의 기준·목적·범위는 바꾸지 않는다.
- 검토 제공자는 anthropic, 보고 모델은 claude-opus-5-5다. 작업자와 분리된 같은 검토 세션에서 TASK만 먼저 판단하고, 이후 PROJECT·BR01을 대조했다. 1·2단계가 서로 다른 검토 세션은 아니다.
- `사전 검토: v1`은 기록 형식 버전이므로 유지한다. 첫 fail과 후속 pass는 각각 원본 TASK 스냅샷·원문·정규화 해시로 연결했다.
- 시험과 운영의 PACE는 `%USERPROFILE%/.pace/app/bin/pace.ts`다. S-0 설치본 모듈 해시를 각 시험과 실제 운영 반영 전에 다시 비교한다. Git 객체는 LF, 설치본과 main 체크아웃은 CRLF다. 원본 해시는 실제 체크아웃 파일끼리 비교하고 LF 정규화 해시도 Git 객체와 비교한다.
- 쓰기 양성 대조는 명시한 임시 fixture와 그 형제 합성 폴더만 허용한다. Git 변경은 `git config --local`만 허용하고 전역 설정을 바꾸는 요청은 하지 않는다. 실제 자식 프로세스의 `GIT_CONFIG_GLOBAL` 격리 여부도 확인한 뒤 양성 시험한다.
- 첫 읽기 시험: Codex/p는 합성 표식 읽기와 다섯 쓰기 시도의 권한 오류를 관측했다. Claude/p는 init 도구가 Glob·Grep·Read뿐인 것을 관측했으나 Windows 8.3 짧은 임시 경로를 승인 필요 경로로 분류해 읽지 못했다. 실패를 통과로 처리하지 않고 동일 fixture의 긴 실경로로 재시험한다.
- Claude/p 긴 실경로 재시험에서 합성 표식 읽기에 성공했다. raw init의 실제 도구 목록은 Glob·Grep·Read뿐이었고 쓰기·셸 도구 미노출을 확인했다. 모델의 단순 미시도를 쓰기 차단 근거로 삼지 않는다.
- 설치본 `buildChildEnv`는 부모의 `GIT_CONFIG_GLOBAL`을 자식에게 넘기지 않는다. 양성 대조는 설치본 `p-executor.ts`의 동일 adapter.build와 `process.ts`의 runProcess를 직접 사용해, 실제 실행기 프로세스 환경에 임시 `GIT_CONFIG_GLOBAL`과 `GIT_CONFIG_NOSYSTEM=1`을 extra로 주입한다. 읽기 전용 시험은 설치 CLI로 수행했다. 양성 대조에서만 추가 환경 주입을 했으며 읽기 전용 차단 증거와 구별한다. 요청 프롬프트와 adapter 인자는 같은 합성 시나리오의 쓰기 접근 값만 바꾼다.
- 양성 대조 전후 사용자 전역 Git 파일은 내용 출력 없이 해시만 비교한다. 기존 사용자 전역 파일과 임시 전역 파일을 구분한다. fixture 변경 및 생성 파일의 관측으로 전후 바이트·파일 존재 검사가 실제 변경을 검출함을 확인한다.
