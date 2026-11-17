# 공개 GitHub 저장소 페이지에서 기본 브랜치·별 개수·최신 커밋(해시 앞 7자·제목·날짜)을 읽어 표로 낸다 — 개요

> 생성 파일 — `steps.json`에서 `node <PACE 설치본 app>/skills/pace-playbook-maker/tools/build.mjs --dir <흐름 폴더>`로 만든다(`<PACE 설치본 app>`은 PACE 데이터 폴더의 `app`, 기본 `~/.pace/app`). 직접 고치지 않는다. 갱신 2026-11-16

공개 GitHub 저장소 페이지에서 기본 브랜치·별 개수·최신 커밋(해시 앞 7자·제목·날짜)을 읽어 표로 낸다

## 읽는 법
- 스킬 시작 시 이 개요를 한 번 읽는다.
- **각 단계를 실행하기 직전에 그 단계 파일(`references/flows/repo-latest/flow/S0n.md`)을 읽는다.** 앞서 읽은 기억으로 실행하지 않는다.
- 화면이 다르면 그 단계의 캡처(`references/flows/repo-latest/shots/S0n.jpg`, 번호 태그 = 요소 번호)를 연다.

## 단계 순서
| 단계 | 제목 | 위험 | 진입 조건 | 도구 |
|---|---|---|---|---|
| [S02](S02.md) | 저장소 요약 읽기 | 읽기  | 공개 저장소 첫 화면이 열려 있다 — 열기: `orca tab create --url https://github.com/<owner/repo> --json`(출력 result.browserPageId가 이후 <page>) | `orca` |

## 규칙


## UI 변경 시 처리


## 에스컬레이트(단계별)
- S02: 선택자가 하나라도 없다 — 화면이 바뀐 것이다

## 최근 UI 변경
- 없음
