---
name: Windows 설치 스킬 교체 EPERM
description: Windows 설치가 스킬 폴더 교체 중 EPERM으로 실패하면 잠근 프로세스를 확인하고 재시도·이름 바꾼 뒤 지우기를 검토한다
type: issue
created: 2026-11-11
updated: 2026-11-11
---

2026-11-11 install.cmd가 ~/.cursor/skills/pace-project-dev 교체(remove) 중 EPERM 실패, 직후 재실행은 성공 — 일시 잠금(다른 프로세스 핸들·백신 추정, 원인 미확인). 대상: copySkill src/setup/install.ts:425
