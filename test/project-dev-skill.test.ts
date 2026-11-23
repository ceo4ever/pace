import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// BL261109_03 BR02: pace-project-dev 스킬 구조 검사. 행동은 skills/pace-project-dev/evals/scenarios.md로 확인한다.
const root = join(import.meta.dirname, "..");
const skillDir = join(root, "skills", "pace-project-dev");
const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8");
const description = /^description: (.+)$/m.exec(skill)?.[1] ?? "";

// BR03(본문 분리)이 정한 목표치. 본문이 늘면 세부는 references로 옮긴다.
export const SKILL_MAX_BYTES = 10_800;

test("SKILL.md는 크기 상한 이하다 (불릴 때마다 맥락에 올라간다)", () => {
  const bytes = Buffer.byteLength(skill, "utf8");
  assert.ok(bytes <= SKILL_MAX_BYTES, `${bytes}바이트 > ${SKILL_MAX_BYTES}`);
});

test("다른 스킬·테스트가 번호로 가리키는 절이 있다 (§1 규모, §5 기준 문서, §6 멈춤)", () => {
  for (const heading of ["## 1. 발의와 규모", "## 4. finish → merge", "## 5. 기준 문서 고르기", "## 6. 멈춤 조건"]) {
    assert.ok(skill.includes(heading), `${heading} 없음`);
  }
  assert.match(readFileSync(join(root, "skills/pace-intent/SKILL.md"), "utf8"), /`pace-project-dev` §1/);
});

test("SKILL.md가 가리키는 references 파일이 모두 있고, references의 문서는 모두 SKILL.md가 가리킨다", () => {
  const linked = new Set<string>();
  for (const m of skill.matchAll(/`references\/([\w-]+\.md)`/g)) linked.add(m[1]!);
  for (const m of skill.matchAll(/\]\(references\/([\w-]+\.md)\)/g)) linked.add(m[1]!);
  assert.ok(linked.size >= 8, `참조 ${linked.size}개`);
  for (const name of linked) assert.ok(existsSync(join(skillDir, "references", name)), `references/${name} 없음`);
  for (const file of readdirSync(join(skillDir, "references"))) assert.ok(linked.has(file), `references/${file}를 SKILL.md가 가리키지 않음`);
  for (const m of skill.matchAll(/\]\((\.\.\/[\w./-]+\.md)\)/g)) assert.ok(existsSync(join(skillDir, m[1]!)), `${m[1]} 없음`);
});

test("description은 쓰는 때와 단계별 경계를 함께 적는다", () => {
  assert.match(description, /때 쓴다/);
  assert.match(description, /기획을 정리하는 단계는 pace-intent/);
  assert.match(description, /문서 최신화는 pace-project-init이 맡고/);
  assert.match(description, /실행·검증하는 단계에 쓴다/);
  assert.match(description, /실행 인계/, "intent → project-dev 인계를 막지 않는다");
  assert.match(description, /확정[^.]*처음부터 이 스킬/, "확정된 기획의 실행·검증은 문서여도 이 스킬");
});

test("사용자 교정 규칙이 작업자가 읽는 §4 본문에 있다 (병합 대기 중 main 커밋 금지, 자체 판단 대조)", () => {
  const finish = skill.slice(skill.indexOf("## 4. finish"), skill.indexOf("## 5."));
  assert.match(finish, /병합 대기 중 main 커밋 금지[^\n]*main 세션[^\n]*main에 먼저 하지 않는다/);
  const selfCheck = finish.split("\n").find((line) => line.includes("자체 판단 대조")) ?? "";
  for (const part of ["워크트리 PM", "worker_done", "log.jsonl", "§6"]) assert.ok(selfCheck.includes(part), `자체 판단 대조 줄에 ${part} 없음`);
  assert.match(selfCheck, /finish가 통과한 뒤 `worker_done`·완료 보고 전에/, "시점: finish 통과 뒤 보고 전");
  assert.match(selfCheck, /합의를 바꾼 것이 있으면 보고 전에 §6으로 올리고/, "합의 변경 시 보고 전 §6 상신");
});

test("시나리오 문서에 필수 시나리오 S1~S7이 있다", () => {
  const scenarios = readFileSync(join(skillDir, "evals/scenarios.md"), "utf8");
  for (let n = 1; n <= 7; n++) {
    const row = scenarios.split("\n").find((line) => line.startsWith(`| S${n} |`));
    assert.ok(row, `S${n} 없음`);
    const cells = row.split("|").slice(1, -1).map((c) => c.trim());
    assert.equal(cells.length, 4, `S${n}: 번호·상황·필수·금지`);
    assert.ok(cells.every((c) => c.length > 0), `S${n}: 빈 칸`);
  }
});

test("SKILL.md와 references 문서의 상대 링크가 모두 실제 파일을 가리킨다", () => {
  const dirs = [skillDir, join(skillDir, "references")];
  let count = 0;
  for (const dir of dirs) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const text = readFileSync(join(dir, file), "utf8");
      for (const m of text.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
        if (/^[a-z]+:/.test(m[1]!) || m[1] === "METRICS.md") continue; // METRICS.md는 프로젝트 폴더 안 예시 링크
        count++;
        assert.ok(existsSync(join(dir, m[1]!)), `${file}: ${m[1]} 없음`);
      }
    }
  }
  assert.ok(count >= 20, `링크 ${count}개`);
});
