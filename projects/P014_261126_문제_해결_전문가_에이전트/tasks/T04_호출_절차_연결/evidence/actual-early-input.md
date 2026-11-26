# 격리 실제 문제 해결 요청

워크트리 PM이 실제 verify의 같은 회차 `recurring_area`와 `superficial_fix`를 한 기회로 인수했다. 새 기록 입력의 거절과 기존 기록 보호를 함께 성립시키는 제안을 받고자 한다.

상위 목적은 잘못된 입력을 거부하면서 사용자가 이미 저장한 값을 보존하는 것이다. 원하는 결과는 상위 목적을 만족하는 해결안 및 해소와 재발을 구별하는 검증 계획이다. 여기는 격리 fixture이며 기술 조치 실행·작업본 쓰기·외부 서비스 접속은 작업 범위 밖이다. 제공된 자료는 합성이고 `verify` 판정 흐름은 실제 CLI에서 재현했다. 확인과 추정을 구별하고 역할의 HANDOFF로 호출 PM에게 반환한다.


## 계약

# 격리 호출 예시

- 상태: 진행

## 기준

| # | 완료 기준 |
|---|---|
| T-1 | 빈 값과 유효 값을 같은 JSON 저장 경계에서 구별한다 |
| T-2 | 새 입력을 거부해도 기존 기록 두 개가 유지된다 |

## 정상 도구 결과

```json
[{"kind": "recurring_area", "unit": {"kind": "task", "ref": "T01_early/post"}, "evidence": ["review-records/R1.json", "review-records/R2.json"], "file": "src/codec.ts"}, {"kind": "superficial_fix", "unit": {"kind": "task", "ref": "T01_early/post"}, "evidence": ["review-records/R1.json", "review-records/R2.json"], "file": "src/codec.ts"}]
```

## 직전과 최신 실패 원문

```pace-review
{"version": 2, "findings": [{"id": "F1", "severity": "should_fix", "category": "criteria", "location": "src/codec.ts:12", "scenario": "인접한 입력에서 비어 있는 문자열을 검증 전에 읽는다", "reproduction": "검증 도구에 빈 값을 제공한다", "confidence": "high", "impact": "criterion", "criterion": "T-1", "safety_path": null}], "criteria": [{"id": "T-1", "state": "present", "observation": "Fixture에서 빈 값과 유효값을 비교했다"}]}
```
fail

```pace-review
{"version": 2, "findings": [{"id": "F7", "severity": "should_fix", "category": "criteria", "location": "src/codec.ts:16", "scenario": "직전과 같은 저장 영역에서 빈 문자열을 지우지 않고 통과시킨다", "reproduction": "검증 도구에 빈 값을 제공한다", "confidence": "high", "impact": "criterion", "criterion": "T-1", "safety_path": null}, {"id": "F8", "severity": "blocking", "category": "criteria", "location": "src/storage.ts:5", "scenario": "거절 중 기존 두 기록을 덮는다", "reproduction": "기존 두 기록으로 잘못된 입력을 한 번 저장한다", "confidence": "high", "impact": "criterion", "criterion": "T-2", "safety_path": null}], "criteria": [{"id": "T-1", "state": "present", "observation": "Fixture에서 빈 값과 유효값을 비교했다"}, {"id": "T-2", "state": "present", "observation": "Fixture에서 저장 전에 기존 두 기록을 만들었다"}]}
```
fail

## 바뀐 줄

```diff
diff --git a/src/codec.ts b/src/codec.ts
--- a/src/codec.ts
+++ b/src/codec.ts
@@ -12 +12 @@
-original behavior
+if (input === null) throw new Error("empty")
diff --git a/src/codec.ts b/src/codec.ts
--- a/src/codec.ts
+++ b/src/codec.ts
@@ -12 +12 @@
-original behavior
+if (input === undefined) throw new Error("missing")
```
