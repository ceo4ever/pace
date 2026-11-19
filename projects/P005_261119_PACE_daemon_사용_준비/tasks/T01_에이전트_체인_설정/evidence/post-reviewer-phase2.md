# P005 T01 독립 리뷰 2단계

## 확인한 범위
- **받은 자료:** 1단계 관측(앞 턴), TASK, PROJECT, BR01, reviewer 역할 기준, p-executor·chain 소스 발췌, 저장소 상태(`git status` 형식), 전체 검사 상태 메모, 코디네이터 직접 관찰.
- **하지 않은 것**
  - 명령 실행은 하지 않았습니다. `npm run check`, `node --test`, `pace` 명령, git 모두 해당됩니다.
  - 파일 읽기, 파일 변경, 다른 세션이나 advisor 호출도 하지 않았습니다.
  - 소스 대조는 받은 발췌에서만 했습니다.
- **보지 못한 것:** codex 인자 구성, `CLAUDE_READ_TOOLS` 값, 실제 diff 본문, evidence 파일 원문, PRE-REVIEW.json.
- **전체 검사:** 원문이 오지 않아 보류합니다.

## 1단계에서 바뀐 판단과 이유

| 1단계 항목 | 2단계 처리 | 이유 |
|---|---|---|
| A. claude 사용자 설정 격리 미기록 | **철회** | 소스상 `claudeP.build`가 항상 `--strict-mcp-config`, `--disable-slash-commands`를 붙이고, 읽기 전용이면 `--tools`로 도구를 제한합니다. 그래서 사용자 MCP가 쓰기 경로가 될 위험은 막힙니다. 또 S-3 기대 결과가 "CLI 도구 공개 목록에서 쓰기·셸 도구 차단 관찰"을 합격 증거로 명시하므로, rawPolicyErrors=null은 결함이 아닙니다. 사용자 hook은 모델이 부를 수 있는 쓰기 경로가 아니라서 기준 밖입니다. |
| B. claude 외부 경로 양성 대조 미검출 | should_fix로 하향 | 쓰기·셸 도구가 아예 노출되지 않았다는 구조적 증거가 있어 T-2 충족에는 영향이 없습니다. 다만 S-3p 검출력 기록으로는 빈칸입니다. |
| C. codex로 넘어가는 경로 라이브 미측정 | handoff | T-1~T-3과 S-4c는 선택된 단계가 검증된 집합에 속하는지만 요구합니다. 합의 기준 밖이므로 합격 조건으로 만들지 않습니다. |
| D. 짧은 경로 읽기 실패 | handoff (T03/T04) | TASK 접근 절이 daemon 로그온 환경 동일성을 T03/T04로 넘겼습니다. |
| E. codex acp 읽기 전용 미강제 | **해소** | `chain.ts`가 `readOnlyEnforced !== true` 단계를 `read_only_unenforceable`로 건너뛰는 것을 소스로 확인했습니다. 단위 시험 S-7과도 연결됩니다. |
| F. 모델·시각 미기록 | 지적 철회 | 기준에 없는 개선입니다. |

## 기준별 판정

**T-1: default 체인 반영, 기존 설정 보존, 순서 기록 (S-1, S-4, S-4c)**
- **개별 실행:** setup exit 0입니다. 적용 기록에 대상 파일, 단계, 감지 상태가 있습니다.
- **선택:** claude/p → codex/p입니다. 16:53 캡틴 결정, 적용 기록, 코디네이터 관찰이 모두 같습니다.
- **충족:** 충족입니다. 대상 파일이 원래 없었고(beforeExisted=false), otherSettingsPreserved=true, 로그인·어댑터 작업은 없었습니다.
- **검출력:** 보존 확인은 파일이 새로 생긴 경우라 거의 자명합니다. 계획을 적용 전에 기록했는지는 받은 자료로 확인할 수 없습니다(F2).
- **약화:** 없습니다.

**T-2: 각 실행기의 정확한 읽기, 쓰기 차단, fixture 보존 (S-0, S-2, S-3, S-3p)**
- **개별 실행:** claude/p와 codex/p 둘 다 따로 실행했습니다.
- **선택:** 체인 후보 전체를 다뤘습니다. ACP는 체인에 넣지 않아 대상이 아닙니다.
- **충족:**
  - S-0: unelevated, 해시 일치, ancestry 0(exit 0으로 해석)을 확인했습니다.
  - S-2: 두 실행기 모두 readExact입니다.
  - S-3: 두 실행기 모두 probe, shellProbe, outsideProbe 부재, git 로컬 변경 없음입니다. codex는 sandbox·권한 거부 원문이 있고, claude는 init 도구 목록이 Glob·Grep·Read뿐입니다. 둘 다 기준이 정한 증거 형태에 맞습니다.
- **검출력:**
  - 양성 대조에서 두 실행기 모두 fixture 변경, probe 생성, shellProbe 생성이 잡혀 검출력이 확인됐습니다.
  - 남은 공백 1: claude의 외부 경로 양성 결과가 false입니다.
  - 남은 공백 2: git 항목은 음성 측정이 로컬 변경을, 양성 측정이 전역 주입을 봐서 관측 대상이 어긋납니다(F1).
  - 실질 차단 근거는 따로 있습니다. claude는 셸 도구가 없고, codex는 gitDenied가 원문에 있습니다.
- **약화:** 없습니다. 도구 목록 증거는 사전 검토 때 합의된 기준이고, 작업자가 사후에 완화한 것이 아닙니다.

**T-3: 설치 계획에서 체인 없음 오류 해소 (S-4)**
- **개별 실행:** install 계획만 실행했습니다(installPlanExit 0). `--yes`, `--start`는 쓰지 않았습니다.
- **충족:** 충족입니다. 계획 출력이 "에이전트 체인(default)은 준비돼 있다."이고, 다른 차단 오류는 없습니다. 시작 항목은 바뀌지 않았다는 코디네이터 관찰이 있습니다.
- **검출력:** 적용 전에는 체인이 없었습니다(PROJECT 재료, beforeExisted=false). 따라서 적용 전후 대비가 성립합니다.
- **약화:** 없습니다.

**S-5: 보류**
- 저장소 검사는 결과 원문이 없어 판정하지 않습니다.
- 사전 검토 pass와 PRE-REVIEW.json 최종 항목도 받은 TASK 본문에서는 확인할 수 없습니다. 본문은 "동일 reviewer 재검토를 요청한다"로 끝납니다. 이 부분은 전체 검사가 확인할 영역이므로 추정하지 않습니다.

## 범위·보안 대조
- 저장소 변경은 프로젝트·메모리·대시보드 기록과 untracked tasks/, log뿐이고 `src/` 변경은 없습니다. "제품 코드 변경 없음", "체인 코드 변경 제외"와 맞습니다.
- diff 본문과 evidence 원문은 보지 못해서, 비밀이 섞이지 않았는지는 확인하지 못했습니다.

## 반환
```
판정: pass (blocking 0) — 단, S-5(전체 검사·PRE-REVIEW 최종 pass) 보류
독립 목표 대조: 맞음 — 1단계 "조건부 달성"의 claude 격리 우려는 p-executor 소스(--strict-mcp-config·--tools)와 S-3 합의 증거 형태로 해소, codex acp 우려는 chain.ts 건너뜀 로직으로 해소
목표 달성: 달성(T01 범위 T-1~T-3) — 마감은 npm run check 원문 통과와 PRE-REVIEW.json 최종 pass·현 해시 일치 확인 뒤
F1 [should_fix] S-3/S-3p 증거 — git 쓰기의 음성(로컬 변경)·양성(전역 주입) 관측 대상 불일치 → 같은 대상(격리 전역 설정 해시)을 음성 측정에도 기록하거나 불일치와 대체 근거(claude 셸 미노출, codex gitDenied)를 evidence에 명시
F2 [should_fix] S-1/T-1 — 적용 전 계획 출력 요약이 적용 기록과 별개로 남았는지 받은 자료상 미확인 → setup 계획 단계 요약을 적용 기록 앞 시점으로 evidence에 연결
F3 [should_fix] S-3p — claude 외부 경로 양성 미생성 사유 미기록 → 원인(작업 폴더 밖 쓰기 권한 거부 추정)을 관찰로 기록, 외부 경로 차단 근거는 도구 목록임을 명시
F4 [should_fix] S-0 — ancestry: 0이 f385e03b 대상 merge-base exit 코드임이 필드명상 불명확 → 대상 커밋과 의미를 evidence에 명시
H1 [handoff] p-executor.ts READ_ONLY_PROVEN — 증거 버전(2.1.322·0.167.1) 주석과 무관하게 정적 true; 버전 변화 시 자동 재시험 장치 없음 → 체인 코드 변경 제외 범위이므로 이슈/새 백로그
H2 [handoff] T03/T04 — claude 짧은 경로 읽기 실패(긴 정식 경로로 성공), 체인 내 codex 대체 실측, daemon 로그온 환경 동일성
교본: 해당 없음 — 코드 diff 없음
```

**마감 전 확인할 것**
- `npm run check` 원문 결과
- PRE-REVIEW.json 마지막 항목이 pass이고 blocking 0인지, 그 해시가 현재 TASK 해시와 같은지

둘 중 하나라도 실패하면 판정을 다시 열어야 합니다.
