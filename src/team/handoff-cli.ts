import { parseArgs } from "node:util";
import { readSync } from "node:fs";
import { openRepo, findProject, statsRepo } from "../project/harness.ts";
import { HandoffStore } from "../project/handoff-store.ts";
import { BODY_LIMIT, HEADER_LIMIT, HandoffError, regularBytes, strictJson, utf8 } from "../project/handoff-files.ts";
import { readPrivateInput } from "../project/handoff-private.ts";
import { deliveryReceipt, deliveryRoute, prepareDelivery, sendDelivery } from "./handoff-delivery.ts";
import { projectResourceSink } from "./handoff-resources.ts";
import { ResourceLock } from "./resource-lock.ts";

function stdinBytes(): Buffer {
  const buffer = Buffer.alloc(BODY_LIMIT + 1); let length = 0;
  while (length < buffer.length) { const size = readSync(0, buffer, length, buffer.length - length, null); if (!size) break; length += size; }
  if (length > BODY_LIMIT) throw new HandoffError("본문 표준 입력 크기 초과");
  return buffer.subarray(0, length);
}
export async function handoffCommand(args: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { file: { type: "string" }, "body-file": { type: "string" }, "route-file": { type: "string" }, "attempt-id": { type: "string" }, json: { type: "boolean" } } });
    const [command, project, id] = positionals;
    const withId = ["ready", "send", "prepare-external", "receipt", "reconcile-resource"].includes(command ?? "");
    if (!command || !project || !["record", "list", "check", "ready", "send", "prepare-external", "receipt", "reconcile-resource"].includes(command) || positionals.length !== (withId ? 3 : 2)) throw new HandoffError("pace team handoff record|list|check|ready|send|prepare-external|receipt|reconcile-resource P### [ID/자원]");
    const repo = openRepo(process.cwd()), ref = findProject(repo, project), owner = statsRepo(repo, ref);
    const store = new HandoffStore(owner.root, ref.id, `projects/${ref.dir}`);
    const out = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
    if (command === "reconcile-resource") {
      if (Object.keys(values).some((key) => key !== "json")) throw new HandoffError("reconcile-resource에는 별도 파일/전송 옵션이 없다");
      const lock = new ResourceLock(repo.root, id!, { events: projectResourceSink(repo.root, ref.id) });
      const result = lock.reconcileApplied(); out({ ...result, guardRecovered: false, commandResumed: false });
      return result.unconfirmed.length ? 2 : 0;
    } else if (command === "send" || command === "prepare-external") {
      if (!values["route-file"] || !values["attempt-id"] || values.file || values["body-file"]) throw new HandoffError("전송은 --route-file·--attempt-id와 등록된 메시지 ID가 필요하다");
      const route = deliveryRoute(strictJson(utf8(regularBytes(values["route-file"], HEADER_LIMIT))));
      if (command === "send") { const result = sendDelivery(store, id!, values["attempt-id"], route); out(result); return result.code; }
      if (route.transport !== "external") throw new HandoffError("prepare-external은 기존 외부 경로만 준비한다");
      const result = prepareDelivery(store, id!, values["attempt-id"], route); out({ attemptId: values["attempt-id"], payloadPath: result.payloadPath, phase: "started", transportInvoked: false });
    } else if (command === "receipt") {
      if (!values.file || values["body-file"] || values["route-file"] || values["attempt-id"]) throw new HandoffError("receipt P### 시도ID --file <영수증.json>");
      out(deliveryReceipt(store, id!, strictJson(utf8(regularBytes(values.file, HEADER_LIMIT)))));
    } else if (command === "record") {
      if (values["route-file"] || values["attempt-id"]) throw new HandoffError("record에 전송 옵션을 지정할 수 없다");
      if (!values.file || !values["body-file"]) throw new HandoffError("record는 --file·--body-file이 필요하다");
      const input = strictJson(utf8(regularBytes(values.file, HEADER_LIMIT)));
      const body = values["body-file"] === "-" ? stdinBytes() : readPrivateInput(owner.root, values["body-file"]);
      out(store.record(input, body));
    } else {
      if (values.file || values["body-file"] || values["route-file"] || values["attempt-id"]) throw new HandoffError("읽기 명령에 본문/전송 입력을 지정할 수 없다");
      if (command === "list") out(store.read());
      else if (command === "check") out(store.audit());
      else { const result = store.readiness(id!); out(result); return result.ready ? 0 : 1; }
    }
    return 0;
  } catch (error) {
    // Never print a body, transport stderr, or an arbitrary filesystem error path.
    process.stderr.write(`handoff: ${error instanceof HandoffError ? error.message : "검증/저장 실패; 원문과 오류 상세는 출력하지 않는다"}\n`);
    return 2;
  }
}
