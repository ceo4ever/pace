# 선언 검사 중 동시 실행 관측

코디네이터의 main 러너 종료 확인 뒤 P008 T02의 npm run check를 시작했다. 실행 도중 node scripts/test.ts 두 개를 관측했고 lsof의 cwd 조회로 각각 /Volumes/Data/AiStudio/workspace/pace.wt/P008 및 /Volumes/Data/AiStudio/workspace/pace임을 확인했다. 당시 P008 쪽은 약 2분41초, main 쪽은 약 1분53초 경과 상태였다. 다른 검사의 제어·중단은 하지 않았다. 동시 실행이 실패의 원인인지는 미확인이고, 이번 관측을 완전히 격리된 실행의 증거로 쓰지 않는다.
