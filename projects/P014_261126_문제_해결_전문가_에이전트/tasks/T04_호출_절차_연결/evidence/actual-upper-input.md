# 격리 실제 문제 해결 요청

허브 PM이 구조 진단 뒤 독립 재실패의 verify `upper_review`를 인수했다. 계약과 설계가 상위 목적과 합성 owner 요구에 맞는지, 허가 경계가 어디서 어긋나는지 근본 대조가 필요하다.

상위 목적은 잘못된 입력을 거부하면서 사용자가 이미 저장한 값을 보존하는 것이다. 원하는 결과는 상위 목적을 만족하는 해결안 및 해소와 재발을 구별하는 검증 계획이다. 여기는 격리 fixture이며 기술 조치 실행·작업본 쓰기·외부 서비스 접속은 작업 범위 밖이다. 제공된 자료는 합성이고 `verify` 판정 흐름은 실제 CLI에서 재현했다. 확인과 추정을 구별하고 역할의 HANDOFF로 호출 PM에게 반환한다.

## 합성 owner 원문 및 백로그 해석

합성 계약 원문. 새 쓰기 입력이 비었으면 거절한다. 거절 응답은 파일이나 저장 레코드 두 개를 변경하지 않는다. 실제 운영과 사용자 결정은 수반하지 않는다.

백로그 해석은 저장 전에 검증을 끝내고 거절 뒤에는 기존 값의 동일성을 관측하는 것이다. 임시 설계는 파서와 저장 분기에서 값 유효성을 따로 검사해 왔다. 이후 구조 진단은 아래와 같다.

원인 초안은 파서의 허용값과 저장 경로가 따로 판정한다는 점이다. 거절 분기에서 저장소를 건드리지 않는 조치로 접근했다. 기존 두 기록과 비어 있는 입력을 같이 시험해 조치의 영향과 재발을 대조한다.

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
{"stage": "upper_review", "next": "upper_review"}
```

## 직전과 최신 실패 원문

```pace-review
{"version": 2, "findings": [{"id": "F8", "severity": "blocking", "category": "criteria", "location": "src/storage.ts:5", "scenario": "거절 중 기존 두 기록을 덮는다", "reproduction": "기존 두 기록으로 잘못된 입력을 한 번 저장한다", "confidence": "high", "impact": "criterion", "criterion": "T-2", "safety_path": null}], "criteria": [{"id": "T-1", "state": "present", "observation": "Fixture에서 빈 값과 유효값을 비교했다"}, {"id": "T-2", "state": "present", "observation": "Fixture에서 저장 전에 기존 두 기록을 만들었다"}]}
```
fail

```pace-review
{"version": 2, "findings": [{"id": "F8", "severity": "blocking", "category": "criteria", "location": "src/storage.ts:5", "scenario": "거절 중 기존 두 기록을 덮는다", "reproduction": "기존 두 기록으로 잘못된 입력을 한 번 저장한다", "confidence": "high", "impact": "criterion", "criterion": "T-2", "safety_path": null}], "criteria": [{"id": "T-1", "state": "present", "observation": "Fixture에서 빈 값과 유효값을 비교했다"}, {"id": "T-2", "state": "present", "observation": "Fixture에서 저장 전에 기존 두 기록을 만들었다"}]}
```
fail

## 바뀐 줄

```diff
diff --git a/src/codec.ts b/src/codec.ts
--- a/src/codec.ts
+++ b/src/codec.ts
@@ -12 +12 @@
-original behavior
+if (input === undefined) records.length = 0
diff --git a/src/codec.ts b/src/codec.ts
--- a/src/codec.ts
+++ b/src/codec.ts
@@ -12 +12 @@
-original behavior
+if (!input) records.splice(0, records.length)
```
