# 사전 검토 해시 표기 정정

최초 check에서 PRE-REVIEW 최종 해시 형식 불일치를 확인했다. 현재 TASK의 CRLF→LF 전체 SHA-256은 main이 사전 재검토 대상으로 전달한 1eb6b68f92f799db3d4b68e4ac5fbd8d25963b4a5856a0cae0c5516beebb01a5와 정확히 일치한다. 따라서 이미 검토받은 대상의 내용은 그대로다. 이 일치를 검증한 뒤 현재 파일을 task-reviewed-snapshot.md로 보존했다. 이 스냅숏을 과거 시점에 만들었다고 주장하지 않는다.

하네스의 실제 src/project/pre-review.ts reviewHash는 CRLF뿐 아니라 상태 행 값도 제외한다. 실제 함수를 호출한 결과는 4bdf245936e9d32f25d1c7cb5764af2a35103d966c19f5f6ef8cc43c51fa4393이다. PRE-REVIEW 마지막 실제 pass 시도의 hash를 이 형식으로 정정하고 원래 reportedHash와 이 근거 경로를 함께 남겼다. 기존 검토 원문·제공자·판정·연속성은 바꾸지 않았고 새 검토가 있었다고 기록하지 않았다. 첫 실패 이력도 그대로 보존했다.
