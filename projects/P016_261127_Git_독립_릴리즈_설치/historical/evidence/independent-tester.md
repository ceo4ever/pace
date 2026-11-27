# 독립 설치 시험

Claude의 별도 Orca 세션이 `project/P015`의 staged tree `6956caaccb785d36d9285610c402560d79d915fd`를 격리 사본으로 검증했다. `node --test test/install-script.test.ts test/install-windows-wrapper.test.ts`는 종료 0, 통과 10건, Windows 전용 4건 미실행이었다. `git archive`로 생성한 v0.1.5 아카이브의 698개 파일은 시스템 TAR 추출과 일치했다. 격리 설치에서 프로그램 버전과 부트 출력을 확인했고 기존 캐시와 사용자 프로필이 보존됐다.

P-1, P-2, POSIX와 문서·형식의 P-4를 통과로 판정했다. P-3 오류 경로의 실제 동작은 통과했다. 아카이브 테스트가 공통 오류 접두사만 비교해 경로 검사와 링크 금지를 없앤 변이를 잡지 못하는 점을 blocking 1건으로 판정했다. 이 외에 미정식 릴리즈, 부모 폴더, 중복, 응답 크기 검출 공백을 기록했다. `TMPDIR`이 링크일 때 이전 설치 준비 도구가 실행을 건너뛴 결함은 해당 후보에서 수정됐고 변이 시험으로 검출을 확인했다.

이 세션은 Windows 또는 PowerShell을 실행하지 않았다. 이전 후보 진단 중 공개 GitHub API와 공개 릴리즈 아카이브를 요청했으며 사용자 입력·자격 증명과 운영 설치는 사용하지 않았다. 마감의 별도 macOS PowerShell 7 및 공개 아카이브 실행 기록은 [릴리즈 설치 검증](install-verification.md)에 있다.
