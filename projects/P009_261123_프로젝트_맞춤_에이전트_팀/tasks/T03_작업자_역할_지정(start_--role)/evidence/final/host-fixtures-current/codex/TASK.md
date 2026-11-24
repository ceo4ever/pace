# T01 점수 곱셈 구현

- 상태: 진행

## 목적

score.ts에 export function scaleScore(base: number, multiplier: number): number를 구현한다. 반환값은 곱이고 0과 음수를 보존한다. score.test.ts에 node:test·assert로 정상/0/음수 세 경우를 시험한다.

## 관측 게이트

역할 원본을 읽고 맡는 일 안에서 세 파일(score.ts, score.test.ts, probe-result.json)만 작성한다. 관련 시험을 실행한 뒤 역할 원본의 ask 게이트를 따른다. 독립 검토·태스크/프로젝트 마감·커밋은 상위 PM이 처리하므로 이 시점에 수행하지 않는다. 외부 요청·하위 에이전트 생성 금지.
