// 테스트용 가짜 ACP 에이전트 — 첫 인자가 동작: ok | nomodes | perm | hang | stubborn | events | events-many:N | permx:<kind>:<도구>[:<_meta.kind>]
// 여섯째 인자(resume 변형): nomodes(응답에 modes 없음) | seterr(이어간 뒤 set_mode 오류) | err(session/resume 오류)
import { createInterface } from "node:readline";
import { appendFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const requestedBehavior = process.argv[2] ?? "ok";
const delayed = /^delayed:(\d+):(.*)$/.exec(requestedBehavior);
const behavior = delayed?.[2] ?? requestedBehavior;
// 준비 장벽 시험용: ACP 초기화가 요청 제한보다 느릴 수 있음을 결정적으로 만든다.
if (delayed) await new Promise((resolve) => setTimeout(resolve, Number(delayed[1])));
const log = process.argv[3] || undefined;
const note = (s) => log && appendFileSync(log, s + "\n");
const out = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
let promptId;
let resumed = false;
const resumeVariant = process.argv[6] || "";
let permId = 900;
const rl = createInterface({ input: process.stdin });
rl.on("close", () => { note("stdin-eof"); if (behavior !== "stubborn" && behavior !== "stubborn-ready") process.exit(0); });
rl.on("line", (line) => {
  const m = JSON.parse(line);
  note(`recv ${m.method ?? "response"} ${JSON.stringify(m.params ?? m.result ?? {})}`);
  if (m.method === "initialize") out({ id: m.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "fake", version: process.argv[5] || "9.9.9" } } });
  else if (m.method === "session/new") {
    if (behavior === "nomodes-write") writeFileSync(process.argv[4], "세션 생성 중 쓴 파일");
    const modes = behavior.startsWith("nomodes") ? undefined : { currentModeId: "default", availableModes: [{ id: "default" }, { id: "read-only" }, { id: "plan" }] };
    const configOptions = behavior === "effort" ? [{ id: "mode", type: "select", options: [] }, { id: "effort", type: "select", currentValue: "default", options: [{ value: "default" }, { value: "low" }, { value: "high" }, { value: "max" }] }] : undefined;
    out({ id: m.id, result: { sessionId: "sess-1", modes, configOptions, models: { currentModelId: "fake-model", availableModels: [{ modelId: "fake-model" }, { modelId: "other-model" }] } } });
  } else if (m.method === "session/resume") {
    if (resumeVariant === "err") { out({ id: m.id, error: { code: -32000, message: "resume 거부" } }); return; }
    resumed = true;
    const modes = resumeVariant === "nomodes" ? undefined : { currentModeId: "default", availableModes: [{ id: "default" }, { id: "read-only" }, { id: "plan" }] };
    out({ id: m.id, result: { modes, models: { currentModelId: "fake-model", availableModels: [{ modelId: "fake-model" }] } } });
  } else if (m.method === "session/set_mode" && resumed && resumeVariant === "seterr") out({ id: m.id, error: { code: -32000, message: "set_mode 거부" } });
  else if (m.method === "session/set_mode" || m.method === "session/set_model" || m.method === "session/set_config_option") out({ id: m.id, result: {} });
  else if (m.method === "session/prompt") {
    promptId = m.id;
    if (behavior === "hang") return;
    if (behavior === "hang-ready") {
      out({ method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "test_ready" } } });
      return;
    }
    if (behavior === "stubborn" || behavior === "stubborn-ready") {
      const c = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
      writeFileSync(process.argv[4], String(c.pid));
      if (behavior === "stubborn-ready") out({ method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "test_ready", childPid: c.pid } } });
      return;
    }
    if (behavior === "events" || behavior.startsWith("events-many")) {
      const upd = (u) => out({ method: "session/update", params: { sessionId: "sess-1", update: u } });
      if (behavior === "events") {
        upd({ sessionUpdate: "plan", entries: [{ content: "단계 하나", status: "pending" }] });
        upd({ sessionUpdate: "tool_call", toolCallId: "c1", title: "Read file", kind: "read" });
        upd({ sessionUpdate: "tool_call_update", toolCallId: "c1", status: "completed" });
        upd({ sessionUpdate: "x_future_kind", payload: { a: 1 } });
        upd({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "완료" } });
      } else {
        const n = Number(behavior.split(":")[1] || 50);
        for (let i = 0; i < n; i++) upd({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: i === 0 ? "시작" : "." }, seq: i });
      }
      out({ id: promptId, result: { stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 2 } } });
      return;
    }
    if (behavior.startsWith("permx:")) {
      const [, kind, tool, metaKind] = behavior.split(":");
      out({ id: permId, method: "session/request_permission", params: { sessionId: "sess-1", toolCall: { toolCallId: "t1", kind: kind === "none" ? undefined : kind, title: "시험 도구", ...(tool.startsWith("@") ? { name: tool.slice(1) } : tool.includes("|") ? { name: tool.split("|")[1] } : {}), _meta: { kind: metaKind || undefined, claudeCode: tool === "none" || tool.startsWith("@") ? undefined : { toolName: tool.split("|")[0] } } }, options: [{ optionId: "yes", kind: "allow_once", name: "Allow" }, { optionId: "no", kind: "reject_once", name: "Reject" }] } });
      return;
    }
    if (behavior.startsWith("perm")) {
      out({ id: permId, method: "session/request_permission", params: { sessionId: "sess-1", toolCall: { toolCallId: "t1", kind: behavior === "perm-edit" || behavior === "perm-conflict" || behavior === "perm-kind-only" ? "edit" : "execute", _meta: behavior === "perm-edit" || behavior === "perm-conflict" ? { kind: behavior === "perm-conflict" ? "execute" : "edit", claudeCode: { toolName: "Edit" } } : undefined }, options: [{ optionId: "yes", kind: "allow_once", name: "Allow" }, { optionId: "no", kind: "reject_once", name: "Reject" }] } });
      return;
    }
    if (behavior === "many") for (let i = 0; i < 60; i++) out({ method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "x" } } } });
    out({ method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "안녕" } } } });
    out({ method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "하세요" } } } });
    out({ id: promptId, result: { stopReason: "end_turn", usage: { inputTokens: 11, outputTokens: 22 } } });
  } else if (m.id === permId && behavior === "perm-empty") {
    out({ id: promptId, result: { stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 2 } } });
  } else if (m.id === permId) {
    out({ method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `choice=${m.result.outcome.optionId ?? m.result.outcome.outcome}` } } } });
    out({ id: promptId, result: { stopReason: "end_turn", usage: { inputTokens: 11, outputTokens: 22 } } });
  } else if (m.method === "session/cancel") note("cancel");
  else if (m.id !== undefined && m.method) out({ id: m.id, error: { code: -32601, message: "no" } });
});
