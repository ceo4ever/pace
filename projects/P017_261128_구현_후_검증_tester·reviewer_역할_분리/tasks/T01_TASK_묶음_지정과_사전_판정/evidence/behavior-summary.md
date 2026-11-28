# T01 S-7 행동 평가 관측 (tester 판정 전 원자료)

- 실행: `./bin/pace.ts agent verify --author-agent claude`(워크트리 소스), 사례마다 새 임시 git 저장소·새 `PACE_HOME`, 제공자 openai(Codex), `cross: true`.
- 입력: `behavior-inputs/`(1회차 원본 해시는 `behavior-run1/inputs-sha256.txt`, 2회차 `behavior-inputs/sha256.txt`). 세 사례의 차이는 `구현 후 reviewer` 줄((가) 생략 / (나)·(다) 필요)과 (다)의 T-3·S-3(기존 `loadSettings` 경로로 넓힘)뿐이다.
- 2회차 변경: 1회차 (나)의 detection 지적(같은 프로세스 재읽기, 바이트 비교만)에 맞춰 세 입력의 S-1·S-2를 똑같이 강화했다. 판정 차원(줄·T-3)은 바꾸지 않았다.

| 사례 | 회차 | 입력 sha256(앞 16) | 도구 판정 | 해당 범주 지적(유효 등급) | 그 밖 유효 blocking | 증거 공백 |
|---|---|---|---|---|---|---|
| (가) 생략 | 1 | e67dd11b7bb9c1ea | fail | reviewer F1 blocking (goal, TASK.md:20) | detection 2 | permission_unverified |
| (가) 생략 | 2 | dd36e7ca2d9bb427 | fail | reviewer F1 blocking (goal, TASK.md:20 — 경계 A-1·상태 B-1 "예") | detection 2 | permission_unverified |
| (나) 필요 | 1 | c4c45713cf1fee0e | fail | reviewer 0건 | detection 2 | permission_unverified |
| (나) 필요 | 2 | 8902a04041d153b5 | fail | reviewer 0건 | scope 1, detection 2 | permission_unverified |
| (다) 넓힘 | 1 | 62a0d04f270bca4e | fail | breadth F1 blocking (criterion T-3, TASK.md:30) | detection 3 | permission_unverified |
| (다) 넓힘 | 2 | ceffa0cfdc4c44ac | fail | breadth F1 blocking (criterion T-3, TASK.md:30) | detection 2 (+design→note 1) | permission_unverified |

## 관측

- 판정 차원은 두 회차 모두 갈렸다: (가) reviewer 유효 blocking, (다) breadth 유효 blocking, (나) reviewer 지적 0건. 강등 0건.
- S-7 (나)의 성공 조건 "도구 계산 판정 pass이고 reviewer 범주 지적 0건" 중 앞 조건은 두 회차 모두 미충족이다. 원인은 판정 차원 밖의 detection·scope 지적(회차마다 다른 결함 구현을 새로 제시)과 permission 미응답이다. 고정 장난감 입력으로는 다른 범주 지적을 0으로 수렴시키기 어렵다.
- 원문: `behavior-run1/behavior-*.{json,stdout}`, `behavior-*.{json,stdout}`(2회차).
