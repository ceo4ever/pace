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

const section = (text: string, title: string) =>
  [...text.matchAll(/^## ([^\n]*)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)].find((match) => match[1]!.trim() === title)?.[2] ?? "";
const headings = (text: string) => [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
const withoutComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, "");

test("P017 T01 S-1: TASK 증명 범위에 구현 후 reviewer 줄과 사실 질문, 절 목록 불변", () => {
  const text = read("TASK.md");
  assert.deepEqual(headings(text), ["목적", "재료", "증명 범위", "기준", "테스트", "접근"]);
  const scope = section(text, "증명 범위");
  assert.equal([...scope.matchAll(/^- 구현 후 reviewer:/gm)].length, 1);
  assert.equal([...text.matchAll(/^- 구현 후 reviewer:/gm)].length, 1);
  const questions = [
    "새로 생기거나 바뀐 진입점", "인가 판정이 바뀌나", "개인정보·비밀", "외부 전송·셸·삭제",
    "영속 데이터를 쓰거나 지우나", "스키마·마이그레이션", "감사·변경 이력",
    "동시 쓰기 경로", "잠금·트랜잭션 범위", "여러 단계 중간에 실패", "상태 전이나 허가 분기",
  ];
  for (const question of questions) assert.ok(scope.includes(question), question);
  for (const bundle of ["경계(A)", "상태(B)", "흐름(C)"]) assert.ok(scope.includes(bundle), bundle);
  assert.match(scope, /^- 포함: <!-- 변경 영향 경로[^\n]*기준 T-n은 이 경로로 한정한다 -->$/m);
  assert.match(scope, /^- 범위 밖: <!--[^\n]*변경이 건드리지 않는 기존 동작은 "기존 동작 — 기존 회귀 시험"/m);
  assert.match(scope, /^- 범위 밖: <!--[^\n]*기존 동작 — 기존 회귀 시험/m);
  // 사실 질문은 주석 안에만 있다.
  for (const question of questions) assert.ok(!withoutComments(scope).includes(question), question);
  const generated = fillTemplate(text, VALUES);
  assert.equal([...generated.matchAll(/^- 구현 후 reviewer:/gm)].length, 1);
  assert.deepEqual(headings(generated), headings(text));
});

test("P017 T01 S-1: TASK-CLOSE 리뷰 주석에 역할별 판정·생략·회차 시각, 주석을 지우면 빈 절", () => {
  const text = read("TASK-CLOSE.md");
  assert.deepEqual(headings(text), ["목표 달성 판정", "기준 대조", "단위 테스트", "E2E", "리뷰", "남긴 것"]);
  const review = section(text, "리뷰");
  assert.equal(withoutComments(review).trim(), "");
  const comment = /<!--([\s\S]*?)-->/.exec(review)?.[1] ?? "";
  assert.match(comment, /^tester 판정:/m);
  assert.match(comment, /^reviewer 판정:/m);
  assert.match(comment, /reviewer 생략 — 이유/);
  const header = /^\| 역할 \| 회차 \| 요청 시각 \| 회수 시각 \| 판정 \|$/m;
  assert.match(comment, header);
  assert.match(comment, /요청 시각=PM 검증 요청/);
  assert.match(comment, /회수 시각=판정 결과 수신/);
  assert.match(comment, /배정 시작 회신·검토 등록 시각이 아니다/);
  for (const role of ["tester", "reviewer"]) {
    assert.match(comment, new RegExp(`^\\| ${role} \\| 1 \\| \\| \\| \\|$`, "m"), role);
  }
});
