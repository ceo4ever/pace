# 프로젝트 브레인 규약

이 프로젝트에서 일하며 쌓는 지식 위키다. 공식 규칙·구조는 `AGENTS.md`·`docs/`에, 진행 상황·이슈는 프로젝트 메모리에 두고,
여기에는 **결정과 이유, 구성요소, 흐름, 조사 결과, 용어, 겪은 함정**처럼 오래 남길 지식을 둔다.
부트 때 불러오지 않는다 — 필요할 때 `pace brain search`로 찾아 그 절만 읽는다.
코드나 git 이력을 보면 알 수 있는 것은 적지 않는다 — 대신 `file_path:line`으로 가리킨다.

용어: ingest=추가 · query=질의 · lint=점검 · file back=되적립 · stale claims=낡은 주장. raw sources는 근거 원본, wiki는 축적한 지식, schema는 이 규약이다.

## 구조

```
.pace/brain/
  SCHEMA.md    이 규약
  index.md     자동 생성 목차 (pace brain index — 직접 고치지 않음)
  log.md       추가 전용 기록 (pace brain이 남김 — 직접 고치지 않음)
  pages/
    concept/    결정과 이유 — 왜 이렇게 했나, 버린 대안
    entity/     구성요소 — 모듈·서비스·문서·외부 시스템의 역할과 관계
    flow/       흐름 — 업무·데이터·배포 등 단계가 있는 과정
    synthesis/  분석·비교·조사 결과
    term/       용어 — 도메인 용어의 뜻과 쓰임 (초안 `draft`는 검색에서 기본 제외)
  sources/      (선택) 외부 원본 보관 — 웹·PDF 변환본 등
```

## 페이지 형식

파일명은 `kebab-case.md`, 위치는 `pages/<type>/`. 본문은 한국어로 쓰고 `##` 절로 나눈다 — 검색은 절 단위로 꺼낸다.

```yaml
---
type: concept            # concept | entity | flow | synthesis | term (폴더와 같아야 함)
title: 페이지 제목
summary: 목차와 검색 결과에 보일 한 줄 요약
tags: [tag1, tag2]
sources: [code:src/boot.ts, url:https://…, 대화:2026-10-22]
related: [다른-페이지-파일명]
created: 2026-10-22
updated: 2026-10-22
status: active           # active | draft | stale
---
```

- **sources**는 근거와 확인 날짜를 남긴다. 외부 사실(도구 버전별 동작 등)은 언젠가 낡는다.
  - 저장소 상대 경로(브레인 프로젝트 루트 기준)는 `code:`·`doc:`·`backlog:`·`file:`·`test:` 접두사 또는 경로 그대로 쓴다. `/`나 확장자가 있는 경로를 인식한다. 루트의 디렉터리는 `docs/`처럼 `/`를 붙인다.
  - 줄 참조 `src/x.ts:12`·`:10-20`·`:12:3`·`#L12-L20`, 파일 뒤 단순 심볼(`code:src/boot.ts bootNotice`)도 인식한다. 절대 경로·상위 탈출·URL·대화·프로젝트 ID·백로그 약칭은 저장소 파일 검사에서 제외한다.
- 다른 페이지는 `[[파일명]]`이나 `related`로 연결한다. 없는 페이지를 가리키면 lint 오류다.
- 사실이 바뀌면 고치고, 더 맞지 않으면 `status: stale`.
- 아직 실재하지 않는 것(미착수·미확정·향후 계획·TBD)은 브레인이 아니라 메모리(`todo`·`idea`)에 둔다.

## 쓰기 (ingest)

손으로 파일을 만들지 않고 도구로 쓴다 — frontmatter를 도구가 만들고, **lint를 통과해야 쓴다.**

```
pace brain search "<주제>" --list                         같은 주제 페이지가 있는지 먼저
pace brain add --type concept --title "…" --summary "…" --body-file <파일> --sources "…" --related "…"
pace brain update <페이지> --body-file <파일> --append-sources "…"     (created 보존, updated 자동)
```

쓰고 나면 도구가 전체 lint·목차·기록을 갱신한다. 파일을 직접 고쳤다면 `pace brain index`(lint 포함)를 실행하고 오류를 고친다.

## lint

| 종류 | 등급 | 뜻 |
|---|---|---|
| structure_missing | 오류 | SCHEMA.md·pages/ 없음 |
| frontmatter_invalid | 오류 | 필수 키 없음, type≠폴더, 날짜·status 형식 |
| broken_link | 오류 | `[[링크]]`·related 대상이 없음 |
| speculative | 오류 | 제목·절 제목에 미착수·미확정·향후 같은 표지 |
| orphan | 경고 | 들어오고 나가는 링크가 없음 |
| missing_link | 경고 | 다른 페이지 제목이 본문에 나오는데 링크가 없음 |
| unsourced | 경고 | sources가 비었음 |
| summary_missing | 경고 | summary 없음 — 목차·검색은 본문 첫 문단으로 대신 |
| stale | 경고 | 낡음 표시 — 고치거나 지울지 판단 |
| stale-source | 경고 | 근거 경로 없음(missing), 또는 최신 관련 git 커밋의 author 날짜 > 페이지 updated(changed). 디렉터리 하위 변경 포함. 쓰기를 막지 않음 |

`pace brain lint --fix`는 형식만 고친다(블록 목록 → 인라인). 내용 모순은 도구가 못 본다 — lint 결과를 보고 LLM이 판단한다.

`stale-source`는 낡은 주장 **후보**다. 실제 모순인지, 근거 경로만 바뀌었는지 확인하고 페이지를 갱신하거나 그대로인 이유를 남긴다. 날짜는 하루 단위라 같은 날·미커밋 변경은 날짜 비교에 잡히지 않는다. git 이력은 한 번 읽으며, git 저장소가 아니면 날짜 검사만 건너뛰고 다른 git 실패는 안내한다. missing 검사는 계속한다.

## 질의와 되적립 (query → file back)

검색은 파일을 바꾸지 않는다. 답을 위해 코드·문서까지 더 찾았다면 **다시 물을 만한 답**이나 **여러 원본을 엮은 synthesis**를 기존 페이지에 되적립한다(없을 때만 새 페이지). 단순 코드 사실·일시적 상태·개인정보는 적지 않는다.

`pace brain log --op query --summary '질의·발견·되적립 페이지'`로 질의를 명시적으로 기록할 수 있다. log의 공개 op는 `ingest|update|lint|query`이고, 요약의 줄바꿈은 공백으로 바꿔 한 항목만 쓴다. log는 페이지 되적립을 대신하지 않는다.

`pace project finish`는 변경 파일을 sources로 가진 페이지를 갱신 후보로 알린다. PROJECT-CLOSE 브레인 행을 "해당 없음"으로 두려면 각 후보의 전체 상대 페이지 경로와 검토 이유를 비고에 적는다.
