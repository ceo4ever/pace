# T01 격리 검증 (2026-11-19)

설치본 PACE 0.1.1의 후보 Claude/p·Codex/p를 임시 PACE_HOME과 합성 Git 저장소에서 시험했다. 운영 홈·체인 및 Telegram은 변경하지 않았다. S-1 운영 선택·S-4 운영 반영·S-4c 실제 확정 체인 선택은 결정 대기로 미실행이며 T01은 미완료다.

| 항목 | 관측 | 근거 |
|---|---|---|
| S-0 설치본 | f385e03b가 v0.1.1 조상, unelevated 옵션 포함, 설치본과 main 체크아웃 모듈 원본 SHA-256 일치 | s0-installation.json |
| Claude/p 읽기 | 긴 실경로에서 합성 표식 읽기 성공. 짧은 Windows 8.3 경로는 권한 승인 요구로 읽기 실패했으므로 첫 실행은 성공으로 처리하지 않음 | readonly-observations.json |
| Claude/p 쓰기 차단 | CLI init의 공개 도구 목록이 Glob·Grep·Read로 제한됨. 쓰기·셸 도구 미노출. 모델의 미시도나 자기 거절만으로 판정하지 않음 | readonly-observations.json |
| Codex/p 읽기·차단 | 합성 표식 읽기 성공. 파일 생성·기존 파일 변경·셸 리다이렉트·local git config·형제 합성 폴더 쓰기 모두 권한 오류. sandbox read-only 관측 | readonly-observations.json |
| 양성 대조 Claude/p | 동일 합성 프롬프트에서 기존 파일 변경·probe 및 shell-probe 생성. local Git config와 형제 폴더 쓰기는 별도 승인 요구로 차단 | claude-positive-summary.json |
| 양성 대조 Codex/p | 기존 파일 변경·probe·shell-probe·형제 폴더 파일 생성. local Git config는 권한 오류로 차단 | codex-positive-summary.json |
| 전역 Git 보존 | 양성 대조 자식 환경의 GIT_CONFIG_GLOBAL은 임시 파일로 고정, 기존 전역 Git 파일 전후 해시 동일 | positive-global-guard.json |
| 체인 단위 회귀 | 27 pass·0 fail. 미검증 readOnlyEnforced 제외는 모사 시험으로 검증했으며 실제 default 체인 호출 증거는 아직 없음 | chain-unit-check.md |

S-3p는 실제 파일 생성·변경으로 변화 검출력을 확인했다. Git 설정 쓰기는 양성에서도 차단됐으므로 이 세부 경로의 허용 대조는 미확인이다. 읽기 전용에서의 차단 근거는 각 실행기의 실제 도구 목록·권한 오류이며, 양성에서 모든 경로가 허용된다고 주장하지 않는다.

양성 대조는 실제 프로세스 환경의 Git 격리를 위해 설치본 adapter.build와 runProcess를 직접 사용했다. 읽기 전용 시험은 설치 CLI로 실행했다. 차이와 전제는 execution-decisions.md에 기록했다. 원본 CLI 출력은 사용자 식별자·세션 메타 포함 가능성 때문에 임시 폴더에 두고 저장소에는 비밀 없는 관측만 남겼다.

검증 시 보고 모델은 Claude claude-opus-5-5, Codex gpt-6.2-sol이다. 별도 모델·effort를 지정하지 않았다. Windows 자손 회수 보증은 제품이 보고하는 best-effort-unverified 범위다.

후속: 운영 선택 확인 후 적용 전 설치본 해시 재대조, 기존 설정 보존 대조, 확정 default 체인 읽기, daemon install 계획, 저장소 전체 검사 및 독립 tester·reviewer가 남았다. daemon 로그온 맥락 검증은 T03·T04에서 수행한다.
