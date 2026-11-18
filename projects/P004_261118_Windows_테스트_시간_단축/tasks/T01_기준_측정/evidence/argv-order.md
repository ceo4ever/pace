# 보조 reporter 인자 순서 검증

2026-11-18, Node 24.22.3 Windows에서 통과 fixture를 사용했다.

- `node --test <pass.test.cjs> --test-reporter=nonexistent-reporter`는 종료 코드 0으로 기본 spec 출력(시험 1·통과 1)을 냈다. 존재하지 않는 reporter인데도 오류가 없으므로 파일 뒤 옵션은 계측 옵션으로 적용되지 않았다.
- 기존 `scripts/test.ts`의 `testArguments(platform, extra)`는 extra를 glob 뒤에 놓는다. 따라서 이 위치로 reporter를 넘긴 보조 실행은 상세 이벤트 수집에 유효하지 않다.
- 수정 측정 도구는 `[reporter 옵션, ...testArguments(platform)]` 순서로 실행한다. `self-test-final-2026-11-18T09-13-16-012Z/fixture-profile.log`에 outer sentinel의 JSON test:pass와 파일/전체 summary가 기록됐고 자식 시험 출력에는 reporter가 상속되지 않았다.
- 평가 기준 3회는 처음부터 옵션을 추가하지 않은 `npm run check`이므로 위 보조 경로 수정으로 시간·환경·실행 대상을 바꾸지 않는다. 완성된 기준선은 그대로 보존하고 보조 관측만 `--profile-only`로 보완할 수 있다.

소스 도구와 시험은 T01 범위에서 수정하지 않았다. 모든 최종 비교에서도 계측 없는 벽시계 중앙값만 평가 기준으로 사용한다.

## 원래 보조 실행 중단과 보완

비계측 기준 3회가 모두 종료 코드 0이고 summary.valid=true인 뒤, 오래 실행 중이던 초기 측정 프로세스가 이전 인자 순서로 보조 실행을 시작했다. 이 보조 실행은 기본 spec만 출력해 필요한 이벤트를 얻을 수 없으므로 직접 소유한 프로파일 Node와 그 자손만 taskkill /T로 중단했다. 대상의 부모가 측정 프로세스이고 argv가 이전 보조 순서인 것을 확인했다. taskkill의 자손 1개 종료 경고 뒤 관련 PID 전부가 남아 있지 않음을 CIM 조회로 확인했다.

원래 `baseline-2026-11-18T08-56-17-364Z/profile-summary.json`에는 보조 실행 종료 코드 1과 약 41초가 그대로 남는다. 원래 복합 측정 명령도 이 보조 중단 때문에 종료 코드 1이다. 이는 성공한 기준 3회의 결과와 구별하며, 실패한 보조 시간을 중앙값에 넣지 않는다.

`measure.ts --runs 3 --label baseline-profile --profile-only <원래 기준선 폴더>`를 실행해 기준 결과를 재사용하고 보조 프로파일만 수정 경로로 보완했다. `baseline-profile-2026-11-18T10-08-53-748Z/`의 fixture 3종과 비상속 fixture는 모두 기대 판정을 통과했고, 실제 profile.log에 test:pass·파일별 test:summary 이벤트가 기록되는 것을 확인했다. 최종 완료 판정은 이 보완 실행이 끝난 뒤의 결과를 따른다.
