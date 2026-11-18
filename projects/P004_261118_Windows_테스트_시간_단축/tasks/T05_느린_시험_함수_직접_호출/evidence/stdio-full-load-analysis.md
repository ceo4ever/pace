# stdio 수집으로 축소한 전체 진단1회

마지막 main 판단에 따라 API 래핑/preload를 모두 제외하고 대상8자식의 stdout/stderr/code/signal 수집만 남겼다. 추가 좁은 반복 없이, 원래 첫5회 수집 사본의 SHA를 확인해 사용했다. 원래 대상 블록 바깥 byte는 현재 시험과 같고 어느 시험에도 --import를 추가하지 않았다. 현재 실행607개와 사본의 차이는 이 대상1개 파일의 수집 코드뿐이다.

독립 로컬 Git clone(--no-hardlinks/--no-checkout)에서 원본HEAD와main commit을 확인하고 별도 index를 HEAD로 읽은 뒤 현재 tracked 작업본 byte를 덮어썼다. 원본 사용자 Git 설정은 변경하지 않았다. node_modules는 개발 의존성 junction이다. clone의 독립 Git 문맥은 있지만 원래 worktree의 공유 Git 구조·위치/드라이브와 동일하다고 주장하지 않는다.

실제 `npm run check`, Windows 기본4 전체 결과는 종료0·741697.2036ms,995건 중986통과·실패/취소0·skip9다. 원문은 stdio-full-load.log, 시작/종료/환경/HEAD·main/실행607개 SHA는 stdio-full-load-launch.json과 stdio-full-load-result.json에 있다. 사본의 시작/종료607개 SHA는 모두 같다. 대상8자식은 모두0/signal null/stderr 빈값으로 원래 stale-lock 실패는 재현되지 않았다.

이 실행은 승인된 진단 최대1회이며 최종 시간 세트/중앙값/실패 대체 표본에 포함하지 않는다. 출력 수집이 일정에 영향을 줄 수 있다. API 관측기를 사용하지 않아 lock 단계는 없고, 원래 실패의 자식 오류를 소급해 복원할 수 없다. 첫 비계측 실패의 원인은 여전히 미확정이다. 단독 성공으로 해결이나 재발 방지를 선언하지 않는다.

이전 진단기의 위치/URL/native 오류와 작은 realpath 검사의 status1·실행 순서 실수는 정정 문서와 원문을 그대로 유지한다. 앞선 잘못된 전체 진단의6자식 오류는 진단기 오류로 분류하고, healer viewport 실패는 별도 원인 미확정 관측으로 남긴다. 이번 성공으로 그 기록들을 지우지 않는다.

실제 제품/시험의 추가 변경이나 새 비계측3회·T05마감·finish는 실행하지 않았다. 함수 전환은0건이며 유효한 최종3회/P-6은 아직 미충족이다. 다음 단계는 main의 범위 판단에 따른다.
