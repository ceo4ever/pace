import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../src/core/paths.ts";
import { runPace, tempDir } from "./helpers.ts";

const read = (name: string) => readFileSync(join(packageRoot, name), "utf8").replace(/\r\n/g, "\n");

function opalSection(): string {
  const readme = read("README.md");
  const start = readme.indexOf("## OPAL에서 넘어올 때");
  assert.ok(start >= 0, "README.md에 'OPAL에서 넘어올 때' 절이 없다");
  const next = readme.indexOf("\n## ", start + 5);
  return readme.slice(start, next < 0 ? undefined : next);
}

test("S-3 README의 OPAL에서 넘어올 때 절은 여섯 단계를 순서대로 담는다", () => {
  const section = opalSection();
  const steps = ["OPAL 제거", "PACE 설치", "pace onboard", "pace adopt opal", "직접 커밋", "pace backlog refresh"];
  let at = -1;
  for (const step of steps) {
    const found = section.indexOf(step, at + 1);
    assert.ok(found > at, `단계 '${step}'가 없거나 순서가 다르다`);
    at = found;
  }
  assert.match(section, /--apply/);
  assert.match(section, /미리보기/);
  assert.match(section, /~\/\.opal[^\n]*옮기지 않는다/);
});

test("S-3 이름 대응표·멈춤 대처·참조 목록 사용법이 있다", () => {
  const section = opalSection();
  assert.match(section, /\| `opal …` 명령[^\n]*\| `pace …` \|/);
  assert.match(section, /\| `opal-\*` 스킬[^\n]*\| `pace-\*`/);
  assert.match(section, /\| `opi` \| `pace-project-init` 스킬 \|/);
  for (const reason of [".pace/`가 이미 있음", "커밋 안 한 변경", "OPAL v1 형식", "저장소 루트가 아님", "workspace_id"]) assert.ok(section.includes(reason), `멈춤 이유 '${reason}' 설명이 없다`);
  assert.match(section, /`파일:줄` 목록/);
  assert.match(section, /pace boot --host plain/);
});

test("S-3 정의서는 상세 절차를 중복하지 않고 README로 연결하며 adopt 모듈 행이 있다", () => {
  const docs = read("docs/README.md");
  assert.match(docs, /\| OPAL 가져오기 \| `src\/project\/adopt-opal\.ts` \|/);
  assert.match(docs, /\(\.\.\/README\.md#opal에서-넘어올-때\)/);
  assert.match(docs, /\| `README\.md` \| 소개·설치·사용·OPAL에서 넘어올 때/);
  assert.doesNotMatch(docs, /## OPAL에서 넘어올 때/);
  // 하네스가 읽는 환경 라벨은 이름을 바꾸지 않았다
  const hasLabel = (text: string, label: string) => new RegExp(`^\\| ${label} \\|`, "m").test(text);
  assert.equal(hasLabel(docs.replace("| 검사 |", "| 점검 |"), "검사"), false, "라벨 삭제를 잡지 못하는 검사다");
  for (const label of ["검사", "보안 검사", "worktree 준비"]) assert.ok(hasLabel(docs, label), `하네스 라벨 '${label}' 행이 없다`);
});

test("S-4 문서의 pace adopt opal 사용 예가 실제 CLI 인자와 일치한다", () => {
  const help = runPace(["--help"], { home: tempDir("pace-docs-home-") }).stdout;
  assert.match(help, /pace adopt opal \[--cwd <폴더>\] \[--apply\]/);
  const allowed = new Set(["--apply", "--cwd"]);
  const lines = [...opalSection().split("\n"), ...read("README.md").split("\n")].filter((l) => /pace adopt opal/.test(l));
  assert.ok(lines.length >= 2);
  for (const line of lines) for (const flag of line.match(/--[a-z-]+/g) ?? []) assert.ok(allowed.has(flag), `문서의 알 수 없는 인자 ${flag}: ${line}`);
});
