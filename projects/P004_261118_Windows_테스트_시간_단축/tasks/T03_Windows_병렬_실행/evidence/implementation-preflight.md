# T03 구현과 장시간 비교 전 검증

기준은 TASK와 `pre-review-disposition.md`다. 아직 동시성 4·8 전체 비교 및 선택 기본값 전체5회는 미완료이며, T03 목적 달성을 주장하지 않는다.

- `runner-red.tap`/`runner-red.json`: 기존 실행기에서 새 옵션·실제 npm/배리어 시험 2건 모두 실패. concurrency2/name filter가 glob 뒤에서 무시돼 GREEN이어야 하는 경로가 실패했고 제외 sentinel도 실행됐다.
- `runner-green.tap`/`runner-green.json`: 수정 후 기존 test-command 포함 8건 모두 통과. 동일 marker 배리어는1에서 RED·2에서 GREEN, 실제 두 PID의 구간 겹침을 단언한다. 실제 npm check의 typecheck sentinel·필터 제외 및 실패 전달도 확인했다.
- 기존 첫 시험 이름을 새 동시성 계약에 맞게 한 건 바꾸고 argv/동시성 검사2건을 추가했다. T02 968건 대비 예상은970건·961통과·skip9다. `observations.ts`가 원래 이름→새 이름 1건과 추가 이름2개를 명시하고 이름/판정 다중집합으로 대조한다. 기본 spec의 중복 이름 파일 귀속은 별도 프로파일에 남긴다.
- `t03-tool-2026-11-18T13-34-58-626Z/self-test.json`: T01 기존16점검 통과. 누락·불완전·시간 변조는 계속 거부한다. `measure-option-validation.json`은 잘못된/누락 concurrency·허용 밖 evidence 경로 거부와 명시4의 실제 npm/Node argv, 기본값 중복 없음,95개 test source manifest를 확인한다. 별도 override self-test 로그는 `measure-override-self-test.log`다.
- `compare.ts --self-test`: 실제 T02 원시와 구성한970개 기대 목록으로 출력 역순은 허용하고 누락/판정 변경은 거부한다. skip 이유와 median도 검사했다. 프로젝트 tools는 기본 tsconfig 밖이므로 strict tsc로 추가 확인했고 `npm run typecheck`도 통과했다.
- `git-evidence-eol-preflight.json`은 autocrlf=true checkout 필터의 SHA 변경 RED, `git-evidence-eol-green.json`은 적용 후 LF checkout·CRLF check-in byte 보존과 경로 범위를 보여 준다. `existing-eol-differences.json`의 기존 evidence 변경 목록은 비어 있다. 원래 blob/해시를 수정하지 않았다.
- 측정은 각 회차의 command/argv·요청값·95개 test 파일 SHA·runner/helper·도구5개 SHA를 남기고 비교 도구 자체2개 SHA도 그룹에 저장한다. 네 회차 소스 fingerprint가 다르면 선택하지 않는다. 각 회차 raw spec·저장 목록/시간·판정·skip 사유를 독립적으로 재대조한다.

`compare.ts`는4→8→8→4를 직렬 실행한다. 하나라도 실패/불완전/범위 차이/소스 변경이면 원문과 그룹을 failed로 보존하고 다음 회차를 시작하지 않는다. 두 값 모두 정상일 때8 중앙값이4보다5% 이상 빠르면8, 아니면4다. 이 수치는 두 표본의 운영 선택 규칙이며 통계적 결론이 아니다. 기본값은 비교 전까지1이며, 선택 뒤 실제 기본값/기대값을 바꾸고 새 연속5회를 수행한다.
