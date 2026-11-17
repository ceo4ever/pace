---
type: concept
title: pace-playbook-maker — 구조와 결정
summary: "원본은 steps.json과 사람이 확인한 캡처뿐, 지도·사람용 문서는 생성물. 설치 스킬은 하나, 만든 플레이북은 업무 저장소. 값은 지도·기록에 쓰지 않고 sink로만 — 학습은 위치 필드만 고친다"
tags: [playbook, skill, agent-map]
sources: [대화:2026-11-17, code:skills/pace-playbook-maker/SKILL.md, code:skills/pace-playbook-maker/references/driving.md, code:skills/pace-playbook-maker/references/healing.md]
related: [playbook-주행-복구-함정, canvas-추출-도구-봉인과-설치-경계]
created: 2026-11-17
updated: 2026-11-17
status: active
---

## 구조
- **원본은 둘뿐**: `steps.json`과 사람이 확인한 해시로 승인된 `shots/S0n.jpg`(+ `captureRecord`). `agent/`(지도: `index.json`·`S0n.json`·`S0n.html`)·`flow.html`·`flow/*.md`는 생성물이라 직접 고치지 않는다 — 고치면 최신 확인(`checkAgentFresh`)이 낡음으로 거른다.
- **필드 분류**: 위치(`find`·`screen.*`·`extract.where`·`api.endpoint` 경로·`api.response[].path`)·행동(`tool`·`command`·`api.method`·`run`)·토큰(id·해시)은 복구가 사람 재확인 없이 고칠 수 있고, 서술·합의(`gate`·`risk`·`expect`·`success`·`rules`·`mask`·`allowedOrigins`·`deliverTo`·`sensitivity`…)는 `contentHash`(사람 검토 결합)에 들어 학습이 바꾸지 못한다.
- **도구**(`skills/pace-playbook-maker/tools/*.mjs`, 무빌드·런타임 의존성 없음): 생성(`build`·`agent-map`·`capture-core`·`interview`·`scaffold`·`orca-adapter`·`playbook`), 주행(`driver`), 복구(`healer`·`heal-web`), 민감 형식(`sensitive`). 규약 문서는 주행 v1·복구 v1 한 곳 — 플레이북은 복사하지 않고 경로·버전만 적는다.

## 결정
- **설치 스킬은 `pace-playbook-maker` 하나**, 만든 플레이북은 업무 저장소가 갖는다(`~/.claude/skills`에 추가되는 것은 이 하나 — 사례 저장소 무영향 기준).
- **실값은 기록하지 않는다, 수집은 막지 않는다**: 지도·명세·주행 기록·history에는 값 대신 이름·형식·건수·해시만, 값은 `perform` 반환에서 `sink`(결과 저장 위치)로만 흐른다. 민감 형식 검사는 탐지 가능한 형식만 막고 이름·주소 같은 형식 없는 값의 완전 차단은 보장하지 않는다(사용자 결정).
- **캡처는 사람이 이미지를 연 뒤 말한 해시로만 승인**한다. 학습이 만든 새 기준 캡처만 코드 검사(가림 사후·maskRequire·추출 값 노출 검사)로 승인하고 history에 '사람 확인 대기'를 남긴다(사용자 결정).
- **관문**: 읽기는 자율, 비읽기는 지도에 `gate`가 있고 사용자 승인 기록(단계·행동·원본 해시, 복구 맥락에서는 계정·업무·흐름 키)이 맞을 때만. 지도에 `gate`가 없으면 외부 기록이 있어도 멈춘다(`no-map-rule`).
- **복구 안전장치**: 허용 경로만 수정, 검증(`expectChecked`)·회귀 통과분만, 비가역 후보는 승인 뒤 실행 한정 임시 지도로 첫 수행이 검증이고 성공하면 정본 승격, 반영은 저널로 원자적, 결과 불명 단계는 치유가 다시 실행하지 않는다.
