# canvas-skills — Canvas Studio 도구와 문서

이 폴더에는 `canvas-read`, `canvas-wireframe`, 문서 설명서 `document/`와 공용 `runtime/`이 있다. Node 22 이상이 필요하며 렌더·와이어프레임 정규화는 설치된 Google Chrome 또는 `CHROME_PATH`가 필요하다. 각 스킬의 SKILL.md에 명령과 사용법이 있다.

`manifest.json`은 스킬 버전, 지원 문서 버전, 스킬과 도구 목록 및 배포 파일 해시를 담는다. `document/GUIDE.md`는 문서 형식·검사 방법과 키트 안내를 담는다. 폴더를 통째로 설치하고 업데이트할 때 이전 폴더를 완전히 교체해 오래된 파일이 남지 않게 한다.

저장소에서 `skills:check`는 재생성한 파일과 현재 배포물, Git 이력의 같은 버전 최초 배포를 대조한다. 배포 내용이 달라지면 스킬 버전을 올린다. 외부 소비자에게 Git 저장소는 필요하지 않다.
