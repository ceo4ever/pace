# 설치 프로젝트 번호 이관

실행 당시 프로젝트는 P015였다. 원격 main에 별개 P015가 먼저 공개되어 현재 등록 번호만 P016으로 분리한다. 원본 P015의 모든 파일은 historical/ 아래에 바이트 그대로 남는다. 옛 TEAM-FINISH.json의 project·tree·checkedParent와 review·calls·log·지표는 당시 검증의 근거이며 현재 P016의 새 검증 영수증으로 해석하지 않는다.

| 항목 | 원래 값 |
|---|---|
| 설치 프로젝트 옛 경로 | projects/P015_261127_Git_독립_릴리즈_설치/ |
| 원본 보존 위치 | historical/ |
| 완료 당시 HEAD | 991af89e7c230e28211646fcf44a1216ab8d40fb |
| 원래 검증 커밋 | 5e0c8449bc0bfd3cf7e8be5fcf475e6eef64dba0 |
| 먼저 공개된 팀 P015 HEAD | 430bd7516e803235b55986b245a0788e426af9ad |

historical/의 상대 링크와 절대 경로·옛 worktree 이름도 원문 보존 대상이다. 당시 링크는 위 원래 HEAD와 옛 경로를 기준으로 읽는다. 현재 위치에서는 [원본 계약](historical/PROJECT.md), [원본 마감](historical/PROJECT-CLOSE.md), [원본 실행 검증](historical/evidence/install-verification.md), [독립 검사](historical/evidence/tester-recheck.md), [보안 검토](historical/evidence/review-records/R2.json), [원본 지표](historical/METRICS.md)를 직접 열 수 있다.

원격 P015의 완료 당시 지표를 보존하고 다시 집계하지 않는다. 과거 양쪽 커밋 제목에 P015가 포함되므로 현재 Git 이력에서 P015를 재집계하면 다른 실행이 섞일 수 있다. 현재 P016 지표는 새 통합 작업만 대상으로 한다. 과거 설치 실행 수치는 historical/METRICS.md에만 있으며 P016의 수치로 재작성하지 않는다.

확인 스크립트는 original commit의 전체 파일 집합·blob과 historical/를 대조하고 승인한 설치 코드와 원격 팀 변경, 프로젝트 ID 유일성, 두 원본 조상을 검사한다. 이번 통합은 일반 푸시로만 반영하며 추가 커밋을 포함한 대상을 사용자에게 제시한다.
