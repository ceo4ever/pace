# merge 뒤 복구

SKILL.md §4에서 옮긴 문서다.

## merge FF 성공 뒤 완료 기록 실패

실제 merge의 FF가 성공한 뒤 완료 기록이 실패하고 worktree가 없으면, main의 실패 로그만 확인해 보존·커밋하고 `pace project start P### --no-launch`로 worktree를 복구한다. worktree에서 `pace project finish P###`를 다시 실행한 뒤 main에서 merge를 미리 본다. 프로젝트는 병합 대기 상태를 유지하며, 복구 start는 start와 착수 결정 사건을 다시 기록한다. 다른 사용자 초안은 함께 커밋하지 않는다.
