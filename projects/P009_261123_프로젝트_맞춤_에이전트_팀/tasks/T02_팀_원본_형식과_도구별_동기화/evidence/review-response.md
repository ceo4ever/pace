# T02 검토 처리

- 사전 R1 fail(매핑 재현성)→R2~R6 pass. 고정 계약 문단·설정 지문·JSON 분류·독립 판독/CRLF 검출을 확정했고 PRE-REVIEW에 각 TASK 해시와 원문을 보존했다.
- 구현 1단계의 Unicode·손상 show·constructor 문제는 반영했다. BR09 대조의 q41/68 사유, 근거 수준, 전송 분류 0의 관측 한계를 반영했다. 4칸/탭 코드 문단 오인 회귀를 추가했다.
- 최신 1단계 reviewer impl-review-stage1-indent.json pass, tester tester-indent-stage1.json pass. 2단계 reviewer impl-review-stage2.json blocking0/pass, tester tester-stage2.json은 전체 증거 접근 불가로 fail→동일 tester-stage2-final.json에서 저장소 안 원문을 직접 읽고 pass. 첫 fail은 보존했다.
- reviewer should_fix Markdown 경계: v1 문자열 검증은 CommonMark 전체 판독이 아니며 혼합 들여쓰기·주석/펜스 경계의 오인을 docs/TEAM.md에 공개했다. 고정 책임은 생성물에 보존되고 실제 의미·보류 행동을 보장하는 목표는 T04/T07/T08/T09다. parser 전체 도입은 현재 태스크에서 하지 않고 의미 검토로 인계한다(차단0 판정).
- reviewer should_fix 관리 생성물 손수정 안내: 현재 sync는 관리 생성물을 원본에서 복구하는 명령이고 사용자 소유 충돌은 거부한다. 생성물 직접 편집이 sync에서 덮어써짐은 TEAM에 명시되어 있다. 경로별 출력 개선은 남기며 현재 복구 계약과 사용자 소유 파일 보존을 유지한다.
- tester list 열 값·반복 결정성 권고는 check-list-repeat.py 실제 CLI로 별도 보완해 list-repeat-result.json에 모든 열과 두 번 sync 바이트 일치를 확인했다.
- 독립 검토자는 /tmp 원문과 교본 바깥 경로 접근에 제한이 있었다. PM이 전체 검사 바이트/소스 스냅숏 연결(check-receipt.json)과 실제 메일을 대조했고 독립 tester는 가림 발췌의 thread 연결만 재확인했다. 원본 독립 판독이라고 바꾸어 쓰지 않는다.
- 도구 권한 상속, 무관 native 링크/크기 정책, 임의 host 설정, metadata의 드문 표지 위치 경계는 TEAM의 지원/관리 경계와 차단0 판정 범위에서 남긴다. T03/T04/T08에서 native 실제 적용·권한 한계를 다시 실측한다.
