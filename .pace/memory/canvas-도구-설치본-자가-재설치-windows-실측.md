---
name: Canvas 도구 설치본 자가 재설치 Windows 실측
description: Windows에서 설치본 CLI가 구버전을 치우도록 자기 app 폴더를 교체할 때 rename 성공 여부를 확인한다
type: issue
created: 2026-11-09
updated: 2026-11-16
---

설치 정책 변경으로 설치본에서 실행 중에도 app 폴더 교체가 가능하다. macOS 격리 시험은 통과했으나 Windows 실행 중 폴더 rename은 실측하지 못했다. 근거 src/setup/install.ts.
