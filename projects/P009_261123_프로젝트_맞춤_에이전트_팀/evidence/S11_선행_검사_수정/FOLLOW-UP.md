# 운영 경로 후속 이슈

프로젝트 메모리 issue: orca-캡처-래스터-배율의-운영-경로-대조. 실제 .pace/memory/orca-캡처-래스터-배율의-운영-경로-대조.md로 등록했으며 P009 태스크 메모리 커밋에서 함께 보존한다.

임의 viewport를 쓰는 운영 어댑터에서 DOM view·요소 box와 JPEG 래스터 배율이 일치하는지 실측한다. 시험은 매 캡처 전 고정 viewport를 재설정하므로 운영 경로의 같은 배율 흔들림을 그대로 검출하지 못한다. 사용자 실제 화면 크기를 강제로 바꾸거나 승인 해시를 느슨하게 하지 않는다. 관련 경로: skills/pace-playbook-maker/tools/orca-adapter.mjs, test/playbook/healer-e2e.test.mjs.
