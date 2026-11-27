# P015 xhigh 팀 원본 통합 — 마감

- 프로젝트: [PROJECT.md](PROJECT.md) · 마감: 2026-11-27

## 목표 달성 판정

달성. 목표는 "구판 호환 장치 없이 역할 원본을 한 폴더·한 설정 파일로 합친다"이고 상위 목적(캡틴 결정: 구판 호환을 고려하지 않고 신판 하나로 고친다)과 맞는다. 소스에서 xhigh 별도 경로·표지·설정 파일 분기가 사라졌고, troubleshooter는 `.pace/team/agents/`에서 같은 모델·effort로 생성된다. 통합하면서 troubleshooter 원본이 처음으로 공통 계약 문단 시험 대상이 되어 별도 폴더가 검사를 우회하던 상태도 해소됐다. 한계: 옛 경로 `.pace/team/<name>.md` 판독은 다른 저장소의 기존 원본 데이터 문제라 범위 밖으로 남겼다.

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| P-1 | 통과 | `pace team list`에 `pace-troubleshooter … xhigh`, `pace team sync --check` 종료 0, `grep -rn "agents-xhigh\|xhighTeamSourcePath\|worker-tiers-xhigh\|xhigh-generated" src docs skills` 0건 |
| P-2 | 통과 | 재생성 생성물 첫 표지 `# pace-team-generated: .pace/team/agents/pace-troubleshooter.md`, `test/team.test.ts` "team xhigh: same source folder and shared generation marker" |
| P-3 | 통과 | `test/project-role.test.ts` "xhigh settings and start row"(definition이 실제 경로, data `{teamMetricsVersion:1}`), 옛 `agents-xhigh` 경로 시작 행 거부 시험 |
| P-4 | 통과 | `test/team.test.ts` "worker xhigh: CLI defaults, shared tier file overrides and rejection" — 기본값 유지, `worker-tiers.json` 하나에 저장, 손상 파일 거부 |
| P-5 | 통과 | `docs/TEAM.md`·`skills/pace-team/SKILL.md` 단일 위치 설명, `npm run check`(PACE_SKIP_BROWSER_E2E=1) 1525개 중 통과 1508·실패 0·건너뜀 17 |

## 태스크 결과

태스크 없음. 팀·역할 시험 47개 통과, 전체 검사 통과. 기존 troubleshooter 생성물 2개는 옛 xhigh 표지 때문에 사용자 소유로 판정되어, 로컬 수정이 없음을 확인한 뒤 지우고 재생성했다(변경은 표지·원본 경로 줄뿐, 모델·effort 동일). 공통 계약 시험의 HANDOFF 수신자 정규식을 troubleshooter의 `HANDOFF: <호출 PM> | 해결안·검증 계획 또는 결정 요청 | 근거` 형식까지 받도록 넓혔다 — P014에서 검증한 원본 지문을 바꾸지 않기 위해서다. 독립 검토(pace-reviewer, 새 맥락): pass · blocking 0. should_fix 1건 — 넓힌 HANDOFF 정규식이 모든 역할에 적용돼 검출력이 줄었다 → 조건부(해결안 반환) 역할만 정확한 형식을 요구하고 나머지는 옛 정규식으로 되돌림. nit 반영 — `worker set/reset` 파일 선택 문구 명시, 0.1.5 저장소 이전 안내(TEAM.md), TS-09 선행 문구 정리, 사건 판독 양성 대조에 readTeamEvents 추가, 옛 경로 xhigh 허용은 의도로 PROJECT.md에 기록. 반영 뒤 팀·역할 시험 47개·타입 검사 통과.

## 보안

원본 경로 허용 집합과 생성물 표지 종류가 줄어든다(확장 없음). 등급 설정 판독의 링크·크기·UTF-8·값 검사는 그대로 하나의 파일에 적용된다. 민감 경로 변경 없음. 비밀 노출 없음.

## 정본 반영

| 정본 | 반영 | 비고 |
|---|---|---|
| 브레인(`.pace/brain/`) | 해당 없음 | 브레인에 xhigh 분리 설명이 없었다. 원칙은 프로젝트 메모리 rule `구판-호환-설계-금지`에 기록 |
| `docs/TEAM.md`·`skills/pace-team/SKILL.md` | 반영 | 단일 원본 위치·단일 등급 설정 파일 |
| `.pace/team/agents/pace-troubleshooter.md`·생성물 | 반영 | 원본 이동, 생성물 재생성 |

## 남은 일

- 옛 경로 `.pace/team/<name>.md` 판독 제거 여부 — 다른 저장소의 기존 원본 이전과 함께 별도 판단.
- 설치본 반영은 `bash scripts/install.sh` 재실행(main에서).

## 회고

구판 호환을 이유로 만든 별도 폴더가 공통 계약 시험까지 우회시키고 있었다. 호환 장치는 비용이 코드 밖(검사 누락)에서도 생긴다.

## 지표

[지표 집계](METRICS.md)

main에서 단일 세션으로 수행한 태스크 없는 프로젝트라 지표는 참고용이다.

## 배포

해당 없음 — 설치본 갱신은 병합 뒤 `scripts/install.sh`.
