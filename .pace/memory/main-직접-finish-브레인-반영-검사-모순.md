---
name: main 직접 finish 브레인 반영 검사 모순
description: "main 직접 프로젝트 finish가 커밋 안 한 변경만 보고 브레인 반영을 판정해, 브레인을 고친 main 직접 프로젝트는 통과 불가 — 프로젝트 번호 커밋도 보게 고친다"
type: issue
created: 2026-11-18
updated: 2026-11-18
---

src/project/harness.ts:1259 미커밋 검사는 프로젝트 폴더 밖 변경(브레인 포함)을 막고, :1324 브레인 행 검사는 mainDirect면 committed=[]라 이미 커밋한 브레인 변경을 못 본다. P003(2026-11-18)에서 재현 — finish 출력 '브레인을 반영이라 했지만 .pace/brain/pages/가 바뀌지 않았다'. 안: mainDirect일 때 제목에 (P###가 붙은 커밋의 파일도 changed에 넣는다.
