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
  assert.match(finish, /병합 대기 중 main 커밋은 병합 뒤로 미룬다[^\n]*메모리 파일은 갱신하되[^\n]*\[B의 도구 수정\][^\n]*커밋을 미룬다/);
  const selfCheck = finish.split("\n").find((line) => line.includes("자체 판단 대조")) ?? "";
  for (const part of ["워크트리 PM", "worker_done", "log.jsonl", "§6"]) assert.ok(selfCheck.includes(part), `자체 판단 대조 줄에 ${part} 없음`);
  assert.match(selfCheck, /finish가 통과한 뒤 `worker_done`·완료 보고 전에/, "시점: finish 통과 뒤 보고 전");
  assert.match(selfCheck, /합의를 바꾼 것이 있으면 보고 전에 §6으로 올리고/, "합의 변경 시 보고 전 §6 상신");
});

test("시나리오 문서에 필수 시나리오 S1~S9가 있다", () => {
  const scenarios = readFileSync(join(skillDir, "evals/scenarios.md"), "utf8");
  for (let n = 1; n <= 9; n++) {
    const row = scenarios.split("\n").find((line) => line.startsWith(`| S${n} |`));
    assert.ok(row, `S${n} 없음`);
    const cells = row.split("|").slice(1, -1).map((c) => c.trim());
    assert.equal(cells.length, 4, `S${n}: 번호·상황·필수·금지`);
    assert.ok(cells.every((c) => c.length > 0), `S${n}: 빈 칸`);
  }
});

test("축소한 검토 안내는 독립 맥락과 실제 승인 정본을 연결한다", () => {
  const refs = join(skillDir, "references");
  const cross = readFileSync(join(refs, "cross-verify.md"), "utf8");
  assert.match(cross, /작성자와 다른 제공자의 새 맥락/);
  assert.match(cross, /A-3을 적용.*\n.*\[A-1\]\(decision-rights\.md#a-결정-주체\)/s);
  const coordinator = readFileSync(join(refs, "coordinator.md"), "utf8");
  assert.match(coordinator, /\[A\]\(decision-rights\.md#a-결정-주체\)/);
  assert.match(coordinator, /\[B\]\(decision-rights\.md#b-허브의-장애-대응\)/);
  const calls = readFileSync(join(root, "docs", "AGENT-CALL.md"), "utf8");
  assert.match(calls, /다른 제공자의 새 읽기 전용 맥락/);
  assert.match(calls, /합의 변경\(A-1\).*검증 생략·완화\(A-3\).*decision-rights\.md#a-결정-주체/);
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

test('반복 실패 원장 단계와 결정 권한 정본을 연결한다', () => {
  const reviewer = readFileSync(join(skillDir, 'references/reviewer.md'), 'utf8');
  for (const part of ['모든 수정 직전', '확인한 증거와 남은 불확실성', '--decision --by pm', '--decision --by user', 'TASK-CLOSE 리뷰 절과 [C의 사후 요약]', 'normal 단계에서 새 위험', 'unknown(미확인)']) assert.ok(reviewer.includes(part), part);
  assert.match(reviewer, /decision-rights\.md#실행-전-승인-확인/);
  for (const file of ['SKILL.md', 'references/task-steps.md', 'references/tools.md', 'references/coordinator.md']) {
    const text = readFileSync(join(skillDir, file), 'utf8');
    assert.match(text, /reviewer\.md#반복-실패-진단과-사용자-결정/);
    assert.doesNotMatch(text, /진단 뒤에도 fail이면 사용자 결정|진단 뒤에도 fail일 때/);
  }
  assert.match(reviewer, /^## 반복 실패: 진단과 사용자 결정$/m);
  const scenarios = readFileSync(join(skillDir, 'evals/scenarios.md'), 'utf8');
  for (const id of ['E', 'E′', 'H', 'J']) assert.ok(scenarios.includes(`| ${id} |`));
});

test("검토 상한 뒤 필수 수정 확인과 A-3 승인 요청을 구분한다", () => {
  const rights = readFileSync(join(skillDir, "references/decision-rights.md"), "utf8");
  assert.match(rights, /필요한 독립 재검증을 수행하는 조치.*‘아니오’다/u);
  assert.match(rights, /검증을 생략·완화하거나.*‘예’다/u);
  assert.doesNotMatch(rights, /BL261124_04 적용 전에는|예산 소진 뒤 위험 수용/u);
  assert.match(rights, /수정 확인[\s\S]*직전 독립 지적, 최신 변경 해시, 재현 조건[\s\S]*사후 요약/u);
  assert.match(rights, /같은 지적\(직전 독립 지적 ID·원래 위치\)당 1회 또는 태스크 사전·사후 합산과 백로그 폴더마다 2회를 사용하면/u);
  assert.match(rights, /합의한 목표·범위·완료 기준을 실제로 바꾸려면 A-1, 필수 검증을 생략·완화하거나 증거 공백·잔여 blocking을 안고 진행하려면 A-3/u);
  const steps = readFileSync(join(skillDir, "references/task-steps.md"), "utf8");
  assert.match(steps, /상한 뒤 수정 확인.*decision-rights\.md.*결과를 사후 보고한다.*A-3/u);
  const scenarios = readFileSync(join(skillDir, "evals/scenarios.md"), "utf8");
  assert.match(scenarios, /\| D16 \|.*독립 재검증을 수행하고 사후 보고.*A-3 결정 요청/u);
  assert.match(scenarios, /\| H05 \|.*초안 확정을 보류하고 허브와 독립 검토를 복구한다.*생략·완화할 때 A-3/u);
  const team = readFileSync(join(root, "skills/pace-team/SKILL.md"), "utf8");
  assert.match(team, /양쪽이 미실행이면 관문을 보류하고 허브와 독립 검토를 복구한다.*생략·완화하거나 증거 공백을 안고 진행할 때 A-3/u);
});

test("검토 정본은 단계별 판정 질문과 새 반환 형식을 연결한다", () => {
  const reviewer = readFileSync(join(skillDir, "references/reviewer.md"), "utf8");
  assert.match(reviewer, /이 계획이 목적을 증명할 수 있는가\?/u);
  assert.match(reviewer, /이 변경을 내보내도 되는가\?/u);
  assert.match(reviewer, /이 백로그로 프로젝트에 착수하면.*합의한 목표까지 갈 수 있는가\?/u);
  assert.match(reviewer, /`pace-review` JSON 블록/u);
  assert.doesNotMatch(reviewer, /^\| `handoff` \|/m);
  for (const name of ["tools", "security"]) {
    assert.match(readFileSync(join(skillDir, `references/${name}.md`), "utf8"), /blocking·should_fix·note/u);
  }
  assert.match(readFileSync(join(skillDir, "references/task-steps.md"), "utf8"), /질문 밖 note의 인계/u);
  const tester = readFileSync(join(skillDir, "references/tester.md"), "utf8");
  assert.match(tester, /기준마다 증거로 통과하는가\?/u);
  const cross = readFileSync(join(skillDir, "references/cross-verify.md"), "utf8");
  assert.match(cross, /질문별 구조화된 지적으로 판정을 계산/u);
});

test("모든 변경 대상에서 기존 올림 기준을 제거하고 결정 권한 정본을 연결한다", () => {
  const team = readdirSync(join(root, ".pace/team/agents")).filter((name) => name.endsWith(".md"));
  const refs = ["coordinator", "verification", "reviewer", "goal-review", "cross-verify", "e2e"];
  const targets = [
    "skills/pace-project-dev/SKILL.md",
    ...refs.map((name) => `skills/pace-project-dev/references/${name}.md`),
    "skills/pace-team/SKILL.md", "templates/team/member.md", "templates/RULES.md", "docs/WORK-PROCESS.md",
    ...team.map((name) => `.pace/team/agents/${name}`),
    "src/project/harness.ts", "src/team/store.ts", "src/agent/verify.ts", "src/agent/review-log.ts",
  ];
  const old = /크게 갈리는|판단이 서지 않는|비용이 드는|미승인 영향이 큰 선택|심각한 오류|보안·비밀·사용자 데이터·비용|검토\(교차 아님 기록\)로 대체할지|기록하고 사용자에게 묻는다|조치 전 사용자 결정|고치기 전 사용자 결정|정본: skills\/pace-project-dev\/references\/reviewer\.md/;
  for (const file of targets) {
    const text = readFileSync(join(root, file), "utf8");
    assert.match(text, /decision-rights\.md/, file);
    assert.doesNotMatch(text, old, file);
  }
  const coordinator = readFileSync(join(skillDir, "references/coordinator.md"), "utf8");
  assert.match(coordinator, /verification\.md#역할과-검증-책임/);
  const rules = readFileSync(join(root, "templates/RULES.md"), "utf8");
  assert.match(rules, /프로필 `rule`이 우선한다\.\n하네스 결정\(S1 포함\)에는 프로필 `rule`·확인 규칙보다 `decision-rights\.md`가 우선/);
});
