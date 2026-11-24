import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
const base = "/Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/cli/orchestration/";
const sendPath = base + "messages/message-send-handler.js", viewPath = base + "agent-view.js";
const send = readFileSync(sendPath, "utf8"), view = readFileSync(viewPath, "utf8");
const section = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a); return source.slice(a, b);
};
const functions = [section(send, "function sendFields(value)", "/** `--file`"), section(view, "function printOrchestrationFields(", "/** Receipts"), section(view, "function withNextLast(", "function resolveOrcaCommandsInText(")];
const output = [];
vm.runInNewContext(functions.join("\n") + "\nprintOrchestrationFields(true,sendFields({message:{id:'msg_synthetic_fixture'}}),()=>'',true);", { console: { log: (s) => output.push(s) } }, { timeout: 1000 });
assert.equal(output.length, 1);
const parsed = JSON.parse(output[0]); assert.deepEqual(parsed, { ok: true, result: { messageId: "msg_synthetic_fixture" } });
console.log(JSON.stringify({ version: 1, proofType: "installed formatting functions evaluated with synthetic data", liveSend: false, runtimeAcknowledgmentObserved: false, externalTransports: 0, inspectedFiles: [sendPath, viewPath].map((path) => ({ path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") })), syntheticFormattedResult: parsed, limitation: "The installed CLI output shape is observed from its real formatter. This is not a live orchestration receipt, authorization check, or proof of human delivery. The adapter accepts this messageId shape and still holds opaque or unsupported results." }, null, 2));
