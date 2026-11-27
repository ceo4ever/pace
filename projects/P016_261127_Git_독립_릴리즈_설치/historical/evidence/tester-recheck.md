# 압축 회귀 시험 수정 확인

새 Claude Orca 세션은 staged tree `4df119a3cbf9`의 설치 코드 diff가 [독립 보안 재검토](review-records/R2.json)의 대상과 같음을 SHA-256으로 확인했다. `git diff --cached --check` 및 `node --test test/install-script.test.ts test/install-windows-wrapper.test.ts`가 모두 종료 0이었다. 테스트 10건은 통과했고 Windows 전용 4건은 이 호스트에서 실행하지 않았다.

소유한 임시 스냅샷에서 변이 11개가 모두 관련 단언에 걸렸다. 변이 대상은 경로 검사 전체와 콜론 거부, TAR 타입 검사와 각각의 하드링크·심볼릭 링크 허용, 부모 폴더, 중복과 대소문자 충돌, draft와 prerelease 거부, 응답 크기, 리다이렉트 호스트였다. 테스터는 P-3의 경로와 링크 검출력 지적이 해소됐다고 판정했다.

PAX와 잘린 TAR 헤더, 압축 및 해제 후 최대 크기의 개별 경곗값, Windows 파일시스템 특유의 거부 효과는 이 수정 확인에서 별도로 실측하지 않았다.
