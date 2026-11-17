---
name: github-repo-latest
description: 공개 GitHub 저장소 페이지에서 기본 브랜치·별 개수·최신 커밋(해시 앞 7자·제목·날짜)을 읽어 표로 낸다 — 로그인 없이 저장소 첫 화면을 읽는 조회까지(쓰기·별 누르기·포크·로그인·API 직접 호출 제외) 이 업무를 자율 주행으로 수행할 때 쓴다.
---

# 공개 GitHub 저장소 페이지에서 기본 브랜치·별 개수·최신 커밋(해시 앞 7자·제목·날짜)을 읽어 표로 낸다 (github-repo-latest)

이 스킬은 `pace-playbook-maker`가 만든 플레이북(업무 스킬)이다. 지도(`references/flows/*/agent/`)를 읽고 주행한다.

## 범위
로그인 없이 저장소 첫 화면을 읽는 조회까지(쓰기·별 누르기·포크·로그인·API 직접 호출 제외)

## 성공 기준
- 표에 기본 브랜치·별 개수·최신 커밋 해시·제목·날짜 다섯 항목이 모두 채워진다
- 값이 저장소 페이지에 보이는 것과 같다

## 안전 규칙
- (밖으로 나가는 위험 행동 없음)
- 읽기는 자율이다. 밖으로 나가는 행동은 지도에 승인 규칙이 있을 때만 자율이고 없으면 사용자에게 확인한다.
- 지도와 화면이 다르면 멈추고 보고한다.

## 시작 조건(서비스·인증)
- github(web) https://github.com — 인증: none(로그인 없음(공개 저장소 익명 열람))

## 입력
- 저장소(문자열) ← user

## 결과와 저장 위치
- 기본 브랜치(문자열, public) → result-table
- 별 개수(문자열, public) → result-table
- 최신 커밋 해시(문자열, public) → result-table
- 최신 커밋 제목(문자열, public) → result-table
- 최신 커밋 날짜(문자열, public) → result-table

## 개인정보 처리
종류: 없음
처리: 공개 정보만 다룬다 — 계정·개인정보 없음. 커밋 작성자 이름은 읽지 않고 화면 캡처에서 가린다

## 예외와 빈도
- 페이지가 늦게 열린다
- 쿠키·알림 안내 창이 뜬다
- 저장소가 없거나 비공개라 404가 나온다
빈도: 필요할 때

## 사람과 함께하는 지점
- S02: ambiguous

## 흐름 색인
| 흐름 | 지도 | 사람용 |
|---|---|---|
| repo-latest | [index.json](references/flows/repo-latest/agent/index.json) | [flow.html](references/flows/repo-latest/flow.html) |

## 주행 규약
`pace-playbook-maker` 스킬의 `references/driving.md`(규약 버전 1)를 따른다. 규약은 이 스킬에 복사하지 않는다.

## 학습 이력
[references/history.md](references/history.md)
