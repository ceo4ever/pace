import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAgentDefinition } from "../src/project/agent-definition.ts";

const valid = "---\npace_agent_version: 2\nworkspace_id: 00000000-0000-4000-8000-000000000000\n---\n\n# Jarvis — project role\n\n## Mission\nHelp.\n\n## Boundaries\nFollow rules.\n\n## Knowledge\nRead memory.\n";

test("BOM과 길이 초과는 수정 가능한 진단을 제공한다", () => {
  assert.throws(() => validateAgentDefinition("\uFEFF" + valid, 1500), /BOM/);
  assert.throws(() => validateAgentDefinition(valid + "x".repeat(1500), 1500), /초과 \d+자/);
});

test("v2 정의는 버전·ID·역할·필수 절을 검사한다", () => {
  assert.equal(validateAgentDefinition(valid, 1500).workspaceId, "00000000-0000-4000-8000-000000000000");
  assert.equal(validateAgentDefinition(valid.replace("Jarvis", "Nova"), 1500).workspaceId, "00000000-0000-4000-8000-000000000000");
  for (const value of [valid.replace("pace_agent_version: 2", "pace_agent_version: 9"), valid.replace("workspace_id:", "wrong:"), valid.replace("## Mission", "## Other"), valid.replace("# Jarvis — project role", "# "), valid.replace("## Mission\nHelp.", "## Mission\n")]) {
    assert.throws(() => validateAgentDefinition(value, 1500));
  }
});

test("중복 표지·비밀·길이 초과는 원문을 반환하지 않고 거부한다", () => {
  const secret = "sk-" + "c".repeat(32);
  for (const value of [valid.replace("pace_agent_version: 2", "pace_agent_version: 2\npace_agent_version: 2"), valid + secret, valid + "x".repeat(1500)]) {
    assert.throws(() => validateAgentDefinition(value, 1500), (error: Error) => !error.message.includes(secret));
  }
});

test("프로젝트의 .pace 심볼릭 링크는 정의로 읽지 않는다", async () => {
  const { mkdirSync, symlinkSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tempDir } = await import("./helpers.ts");
  const { agentKind } = await import("../src/project/agent-definition.ts");
  const root = tempDir("pace-agent-link-"), outside = tempDir("pace-agent-target-");
  mkdirSync(join(outside, "content"));
  writeFileSync(join(outside, "content", "AGENT.md"), valid);
  symlinkSync(join(outside, "content"), join(root, ".pace"));
  assert.equal(agentKind(root), "invalid");
});


test("들여쓴 버전 표지는 v1로 오판해 이동하지 않는다", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tempDir } = await import("./helpers.ts");
  const { agentKind } = await import("../src/project/agent-definition.ts");
  const root = tempDir("pace-agent-indent-"); mkdirSync(join(root, ".pace"));
  writeFileSync(join(root, ".pace", "AGENT.md"), "---\n  pace_agent_version: 9\n---\nfuture\n");
  assert.equal(agentKind(root), "invalid");
});

test("지나치게 큰 정의는 v1로 오판하지 않고 분류 단계에서 거부한다", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tempDir } = await import("./helpers.ts");
  const { agentKind } = await import("../src/project/agent-definition.ts");
  const root = tempDir("pace-agent-large-"); mkdirSync(join(root, ".pace"));
  writeFileSync(join(root, ".pace", "AGENT.md"), "x".repeat(65537));
  assert.equal(agentKind(root), "invalid");
});
