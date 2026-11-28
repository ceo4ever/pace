# T01 사전 검토 전체 재검토 1회(2차) — owner 결정

- 결정 주체: owner (2026-11-28 허브 대화, 허브 Orca 회신 msg_c8b09a6e8a8a로 전달)
- 원문 선택지: "전체 재검토 1회 + 도구는 병합 뒤 (Recommended)"
- 대상: P017 T01 `TASK.md` reviewHash 0563020389e379188ecdba318cb80d159cadb59d4b729763f16556e7e7ec5b44 (R8 한정 확인 pass와 같은 판)
- 범위: 독립 전체 사전 검토 1회. pass면 review-pre로 PRE-REVIEW를 만들고 T01을 마감한다. fail이면 수정하지 않고 원문을 허브에 보고한다.
- 경위: R7 전체 재검토 fail(F1·F2) 뒤 반영·R8 한정 확인 pass. 한정 확인은 PRE-REVIEW 생성기·게이트가 세지 않아(`src/agent/review-pre.ts:79-80`, `src/project/pre-review.ts:186`) 최종 시도가 R7 fail로 남았다. 한정 확인을 허가로 인정하는 도구 수정은 병합 뒤 별도로 다룬다(허브).
