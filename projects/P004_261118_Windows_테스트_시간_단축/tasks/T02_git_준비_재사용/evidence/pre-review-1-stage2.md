# T02 사전 검토 — 2단계 최종 판정

## 판정
- **결과: pass (조건부)**
- **blocking: 0**
- **should_fix: 4**

목표, 범위, 기준(T-1~T-3), 테스트(S-1~S-5)가 PROJECT P-2·P-6, BR02, T01 인계와 맞고 막는 결함은 없습니다. 아래 should_fix 4건은 계획 문장을 보강하면 되는 수준입니다. 착수 전에 TASK에 반영하기를 권장합니다.

## 1단계 우려의 해소 현황
| 1단계 우려 | 실제 발췌 대조 | 상태 |
|---|---|---|
| (2) config 범위 | project-harness의 user.name·email·autocrlf는 모두 repo-local(`project-harness.test.ts:50-53`)이라 `.git/config` 복사로 보존됩니다. agent-chain은 호출마다 `-c`를 넘겨 저장소에 설정이 없습니다(`agent-chain.test.ts:35`). | 해소 |
| (4) 형태 키 | 파일마다 형태가 하나씩이고 인자가 없습니다(`repoFixture()`, `repo()`). 모듈 수준 인스턴스 하나로 충분합니다. | 해소(명시 권장) |
| (5) 파일 내 동시성 | 두 fixture 모두 spawnSync 기반 동기 함수입니다. 동기 구현을 유지하면 경합이 없습니다. | 해소 |
| (8) 자기완결성·템플릿 | 원본에 hooks 설정이나 연결형 구성이 없습니다. 템플릿 파일 수는 복사 비용 문제이며 S-4 벤치마크가 다룹니다. | 범위 확장 불필요 |
| 경제성(cpSync 비용) | S-4 대조 측정과 S-5 관측이 이미 계획되어 있습니다. | 구현 후 증거로 남김 |
| (1) SHA·시각 동일성 | 아래 SF-2 | 잔존 |
| (3) HOME/bin 문맥 | 실제 조회 의미와 맞지 않습니다. 아래 SF-1 | 잔존(구체화) |

## should_fix

**SF-1. 원본 문맥 등록이 기존 조회 의미와 맞지 않음**
- 참조: `project-harness.test.ts:13-14`, `:49`, TASK 접근 2·3번째 항목.
- 문제:
  - 기존 조회는 `cwd.startsWith(parent + sep)`, 즉 **부모 디렉터리 접두사**로 문맥을 찾습니다. TASK처럼 원본의 "정확한 경로"를 키로 등록하면 `git -C <원본>`의 cwd는 원본 자체이므로 접두사 조건에 걸리지 않습니다. 그러면 원본 준비가 private HOME 없이 `sessionFreeEnv()`로 실행됩니다.
  - 그 결과 사용자 전역 Git 설정이 원본 생성에 섞일 수 있습니다. 예: `commit.gpgsign`, `init.templateDir`, `core.hooksPath`. 이는 기존 동작과 다르고 PROJECT 보안 설계와도 어긋납니다. 깨끗한 PC에서는 S-1·S-3이 이를 잡지 못합니다.
  - TASK 안에서도 원본 HEAD 확인은 "원본 private HOME"으로, 준비는 "첫 대상의 HOME"으로 적혀 있어 서로 엇갈립니다.
- 조치:
  - 원본에 **전용 부모 tempDir과 전용 private HOME/bin**을 두고, 그 부모를 키로 등록하십시오. 또는 조회를 `cwd === key || startsWith(key + sep)`로 바꾸십시오.
  - 첫 대상의 HOME을 원본에 빌려 쓰지 마십시오. 첫 시험이 자기 HOME에 쓰는 내용(예: `fakeGitFailure`의 hook 파일, `:25`)과 섞이지 않게 하기 위함입니다.
  - 원본 준비 Git 호출이 사용자 HOME을 쓰지 않음을 S-1이나 S-2에서 확인하십시오. 예: 원본 준비 중의 HOME 단언, 또는 가짜 전역 설정 주입.

**SF-2. 복사본 간 SHA·커밋 시각 동일화의 영향 감사 누락**
- 참조: TASK 기준 T-2, 테스트 S-3, T01 인계(호출 위치 66곳).
- 문제:
  - 지금은 fixture마다 커밋 시각이 달라 SHA도 달라질 수 있습니다. 전환 후에는 같은 파일 프로세스 안의 모든 복사본이 같은 SHA와 시각을 가집니다.
  - 이것에 의존하는 시험은 실패하지 않고 **의미 없이 통과**할 수 있습니다. S-3은 판정만 보므로 이를 잡지 못합니다.
- 조치:
  - 66개 호출 위치와 agent-chain의 `repo()` 사용처를 대상으로 감사하십시오. 볼 항목은 다음과 같습니다.
    - HEAD·SHA·커밋 시각·로그 비교
    - 여러 fixture 간 차이를 전제하는 단언
    - index·mtime 의존
  - 감사 결과를 evidence로 남기십시오. 의존 사례는 전환에서 빼거나 근거와 함께 처리합니다. 테스트 설계 보강이며 범위 확장은 아닙니다.

**SF-3. agent-chain의 환경 보존 명시**
- 참조: `agent-chain.test.ts:35-47`, TASK 접근 2·3번째 항목.
- 문제:
  - agent-chain의 git은 `env`를 넘기지 않아 프로세스 환경, 즉 사용자 전역 설정을 상속합니다. 예를 들어 `init.defaultBranch`가 브랜치 이름을 정합니다.
  - TASK의 "원본 private HOME" 문구를 두 파일에 똑같이 적용하면 agent-chain 원본의 브랜치 이름이나 설정이 기존과 달라질 수 있습니다. 이는 판정 보존(T-2) 위반입니다.
- 조치: agent-chain의 prepare는 **기존 `git` 헬퍼와 기존 환경을 그대로** 쓴다고 명시하십시오. private HOME 격리는 project-harness에만 해당합니다.

**SF-4. 대상 경로 형태 보존 명시**
- 참조: `project-harness.test.ts:6`(`basename` import), `:47`, `:49`, `agent-chain.test.ts:41`.
- 문제: 기존 대상 경로는 다음과 같습니다.
  - project-harness: `tempDir("pace-harness-")/app`. 부모가 문맥 키입니다.
  - agent-chain: `tempDir()` 자체가 저장소입니다.

  시험이 `basename`, `dirname`, 형제 경로(worktree 등)에 의존할 수 있습니다.
- 조치: 복사 대상의 경로 배치를 기존과 똑같이 유지한다고 T-2나 접근에 명시하십시오.
  - project-harness는 새 tempDir 아래 `app`으로 두고, 그 부모를 해당 복사본의 HOME/bin으로 등록합니다.
  - agent-chain은 비어 있는 `tempDir()`에 복사합니다.

## 막힘이 아닌 것으로 구분한 항목
- **구현 세부:**
  - cpSync 옵션
  - Git 객체 파일의 읽기 전용 속성과 정리 방식. 기존 저장소에도 같은 조건이 있습니다.
  - 템플릿 hooks 유지 여부
  - 원본을 tempRoot 안에 둘지 여부. TMP 최상위에 새 항목을 만들지 않는 것은 확인만 하면 됩니다.
- **구현 후 증거:**
  - 복사 비용 대 프로세스 기동 비용(S-4)
  - 단회 전체 시간과 시험 판정 보존(S-5)
  - 963건 대비 추가 시험 수의 인벤토리 대조
  - 실제 단축 폭과 P-6 기여도. 성능 미지수는 S-4·S-5로 이미 덮여 있으므로 사전 추정을 요구하지 않습니다.

## 목표 정합성
- PROJECT 목적(전체 검사를 자주 돌림)과 P-2(독립성·판정 보존)에 직접 대응합니다.
- BR02 범위(공용 도우미, 상위 파일 우선, init/commit 검증 경로 제외)와 일치합니다.
- dashboard-init를 제외한 근거도 타당합니다. 비어 있지 않은 대상, unborn 저장소, 경로 거부 검증이 그 근거입니다.
- T01 인계를 지킵니다. 중첩 guard·TMP 가설은 T03 소관으로 남기고, 시험·skip·동시성은 바꾸지 않습니다.
- 단회 관측을 개선율로 주장하지 않는 점은 P-6의 3회 중앙값 판정 구조와 맞습니다.

## 현재 한계
- 발췌는 각 파일의 앞부분뿐입니다. project-harness의 66개 호출 위치, `test/helpers.ts`(`tempDir`, `sessionFreeEnv`, 정리 정책), `.pace/test-map.json`은 보지 못했습니다. SF-2 감사와 helpers 정리 범위는 확인하지 못했습니다.
- `sessionFreeEnv()`가 HOME을 어떻게 다루는지 몰라 SF-1의 실제 영향 크기는 추정입니다. 다만 기존 private HOME 격리를 잃을 수 있다는 점 자체는 코드 구조로 확인됩니다.
- 이번 pass는 **계획의 실현 가능성과 방향**에 대한 판정입니다. 시간 단축 효과와 판정 보존은 구현 후 S-1~S-5 증거로 따로 확인해야 합니다.
