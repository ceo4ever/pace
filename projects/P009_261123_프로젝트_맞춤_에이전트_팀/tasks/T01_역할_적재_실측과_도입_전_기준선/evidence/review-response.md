# T01 구현 후 지적 처리

각 최초 판정은 별도 JSON에 보존했다. 이 문서는 작성자의 대응 기록이며 독립 판정 입력으로 쓰지 않는다.

| 출처·지적 | 등급 | 처리·근거 |
|---|---|---|
| 초기 코드 검토: 전달 질문의 열린 대기 | blocking | 전달 질문의 coordinator answer와 원질문의 agent answer를 각각 기록. 21초 합집합 회귀 시험 추가. impl-review-stage1-2 이후 pass |
| tester-stage2 B1: Claude effort 표와 원시 근거 불일치 | blocking | native high 선언과 실제 API 요청 medium을 분리. host-model-metadata의 params.output_config 추출. tester-stage2-final/closed/settled에서 해소·pass |
| reviewer-stage2의 실측 trace·receipt·기준선 미확인·구간 겹침 | should_fix | 복구 영수증의 출처 한계 보존, Codex 역할 적재 전 인사 구분, 메타 추출·실호출 trace, 손작업 null/관측0 분리, duration_comparable=false |
| reviewer-stage2-final S1 / tester S6: Read 실호출 근거 없음 | should_fix | host-loading 9·14행의 확인 실호출은 Bash만으로 정정. Read와 전체 노출은 자기 보고로 구별 |
| reviewer-stage2-final S2: 41·68행의 안내 전달 분류 불일치 | should_fix | 두 행 모두 unknown으로 통일. 최종 captain10/coordinator4/unknown2, captain 범위10~12. 메일 도달과 실제 질문/결정 요청 도달을 구분 |
| reviewer-stage2-final S3: 연결파일 예시 경로 | should_fix | 태스크 예시에 tasks/T01_이름/evidence/question-links.md 사용, 실제 T## 폴더 경로로 교체하는 규약·연결 표 추가 |
| reviewer-stage2-final S4: 질문/승인 중복 합산 위험 | should_fix | counting.md에서 같은 요청의 질문·승인을 각 설명 열로만 보존하고 단일 개입 총수에서는 한 번만 세도록 고정 |
| reviewer-stage2-final S5: 시도 status·근거 경로 누락 | should_fix | baseline quality.post_assessments에 명시적 status·차수·근거 경로 추가. 원본 TASK-CLOSE 리뷰절·SHA256과 T03 verdict 발췌를 별도 보존. 외부 원본 접근 제한은 독립 판정의 한계로 유지 |
| 코드 검토의 비교표 주석·미응답 경고 | should_fix | counting.md와 TASK-CLOSE의 T06 인계. 자동 집계/출력 계약은 BR06에서 구현하고 기존 stats 사건 수 의미를 T01에서 변경하지 않음 |
| by/to 조합·연결 기계 검증 없음 | note/should_fix | by는 기록자, to는 수신자. 일반 직접 CLI 질문 허용 계약을 유지. 원질문/전달 중복은 연결 근거의 사람 대조로 확인하며 자동 보장을 주장하지 않음 |
| 실제 tools 지시 위반·native effort 미반영 | handoff T03 | prompt와 native 모두 행동 지시와 호스트 권한을 분리. 실제 model/effort는 실행 인자로 전달 |
| FIFO 짝 의미·잘못된 to 행 폐기·구버전 CLI | handoff T06 / note | 대기 합집합과 의미상 연결을 분리. 잘못된 행은 엄격 검증 유지, 구버전과 새 스킬을 섞지 않도록 main 재설치 때 함께 갱신 |

코드/시험은 전체 검사 통과 뒤 바뀌지 않았다. should_fix 문서·근거 보완마다 별도 결과를 보존했고 최종 tester는 blocking0·should_fix0·목표 달성으로 판정했다. reviewer의 최종 2단계 결과는 별도 reviewer-stage2-settled.json에 연결한다.

최종 reviewer-stage2-settled: 기존 S1~S5 모두 해소, blocking0·목표 달성. 새 S-a는 baseline-roblox.md의 지난 수치 한 문장을 10/2로 정정했다. 구조화 원장·표·결론은 바뀌지 않았으므로 추가 실행 검사는 하지 않았다. 일반 T01 경로는 예시이며 실제 태스크 경로 규약으로 대체한다는 note는 마감에 명시했다.
