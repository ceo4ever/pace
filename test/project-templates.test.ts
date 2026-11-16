import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fillTemplate } from "../src/core/fsutil.ts";
import { templatesDir } from "../src/core/paths.ts";

/** 템플릿마다 D1·D2가 정한 필수 절. 명령(pace project)·스킬이 이 제목을 가리킨다. */
const REQUIRED: Record<string, string[]> = {
  "PROJECT.md": [
    "- 상태: 정의",
    "- 규모:",
    "- 출처:",
    "- 브랜치:",
    "- 작업자:",
    "- 시작:",
    "## 목적",
    "## 재료",
    "## 기준",
    "| P-1 |",
    "## 설계",
    "**바꿀 정본 목록**",
    "## 태스크",
    "| T | 이름 | 상태 | 커밋 |",
    "## 결정·진행 메모",
    "작은 일",
    "태스크 없는 프로젝트",
  ],
  "TASK.md": ["## 목적", "## 재료", "## 기준", "| T-1 |", "## 테스트", "| ID | 유형 | 검증 기준 | 조건 | 행동 | 기대 결과 | 방법 |", "## 접근"],
  "TASK-CLOSE.md": ["## 기준 대조", "| T-1 |", "## 단위 테스트", "## E2E", "## 리뷰", "## 남긴 것"],
  "PROJECT-CLOSE.md": ["## 기준 대조", "| P-1 |", "## 태스크 결과", "## 보안", "## 정본 반영", "## 남은 일", "## 회고", "## 배포"],
  "E2E-SCENARIO.md": ["```yaml", "steps:", "expect:", "value_ref", "fragment"],
};

const VALUES = {
  projectId: "P003",
  projectName: "예약 발송",
  date: "2026-10-24",
  datetime: "2026-10-24 09:30",
  source: "대화 2026-10-24",
  branch: "project/P003",
  worktree: "../app.wt/P003/",
  taskId: "T01",
  taskName: "예약 저장",
  scenarioId: "S-1",
};

const read = (name: string) => readFileSync(join(templatesDir, "project", name), "utf8");

test("프로젝트 템플릿 5종이 필수 절을 모두 가진다", () => {
  for (const [name, parts] of Object.entries(REQUIRED)) {
    const text = read(name);
    for (const part of parts) assert.ok(text.includes(part), `${name}: ${part}`);
  }
});

test("표준 값으로 채우면 자리표시가 남지 않는다", () => {
  for (const name of Object.keys(REQUIRED)) {
    const filled = fillTemplate(read(name), VALUES);
    assert.doesNotMatch(filled, /\{\{|\}\}/, name);
  }
});

test("TASK-CLOSE는 커밋 해시를 쓰지 않는다고 안내한다 (자기 커밋 해시는 같은 커밋에 넣을 수 없음)", () => {
  assert.match(read("TASK-CLOSE.md"), /커밋 해시는 쓰지 않는다/);
});
