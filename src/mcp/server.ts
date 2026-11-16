import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { paceHome, packageRoot } from "../core/paths.ts";
import { addMemory, assertMemoryType, listMemories, profileMemoryDir, projectMemoryDir, readMemory } from "../memory/memory.ts";
import { loadProfile, profileExists, resolveProfileName } from "../profile/profile.ts";
import { formatSearch, searchBrain } from "../project/brain.ts";
import type { Access } from "../agent/contract.ts";
import { MCP_READ_TOOLS, MCP_SERVER_NAME, MCP_WRITE_TOOLS } from "./names.ts";
import { BoundaryError, diffScans, pinRoot, realpathCompare, recheckInside, scan, type RootPin, type ScanOptions } from "./safefs.ts";

// pace mcp — 세션의 워크스페이스·access를 기동 인자로 고정하는 stdio MCP 서버.
// 경계는 서버가 호출 시점마다 강제한다(도구 목록에서 숨기는 것만으로 끝내지 않는다).

export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const MAX_RESULT_CHARS = 20_000;

class ToolRefusal extends Error {}

export interface McpServerConfig {
  workspace: string;
  access: Access;
  env?: NodeJS.ProcessEnv;
  scan?: ScanOptions;
  /** 시험 전용: 모듈 호출 직후(사후 scan 직전)에 불리는 주입점 */
  testHooks?: { afterModuleRead?: (root: string) => void };
}

type Json = Record<string, any>;

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Json;
}

const workspaceProp = { type: "string", description: "선택. 주어지면 이 서버에 고정된 워크스페이스와 같아야 한다(다른 값은 거부)" };
const scopeProp = { type: "string", enum: ["project", "profile"], description: "기본 project. profile은 읽기 전용" };

const TOOL_DEFS: Record<string, ToolDef> = {
  memory_list: { name: "memory_list", description: "메모리 항목 목록(slug·종류·요약)", inputSchema: { type: "object", properties: { scope: scopeProp, workspace: workspaceProp }, additionalProperties: false } },
  memory_show: { name: "memory_show", description: "메모리 항목 하나 읽기", inputSchema: { type: "object", properties: { slug: { type: "string" }, scope: scopeProp, workspace: workspaceProp }, required: ["slug"], additionalProperties: false } },
  project_list: { name: "project_list", description: "이 워크스페이스의 프로젝트(projects/) 상태와 진행 태스크", inputSchema: { type: "object", properties: { workspace: workspaceProp }, additionalProperties: false } },
  backlog_list: { name: "backlog_list", description: "이 워크스페이스의 백로그(backlogs/) 목록", inputSchema: { type: "object", properties: { workspace: workspaceProp }, additionalProperties: false } },
  backlog_show: { name: "backlog_show", description: "백로그 본문 또는 브리프 읽기(목록에 있는 이름만)", inputSchema: { type: "object", properties: { name: { type: "string" }, brief: { type: "string", description: "예: BR03" }, workspace: workspaceProp }, required: ["name"], additionalProperties: false } },
  brain_search: { name: "brain_search", description: "프로젝트 브레인(.pace/brain) 검색", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 10 }, workspace: workspaceProp }, required: ["query"], additionalProperties: false } },
  memory_add: { name: "memory_add", description: "프로젝트 메모리에 새 항목 추가(쓰기 접근에서만)", inputSchema: { type: "object", properties: { type: { type: "string" }, name: { type: "string" }, description: { type: "string" }, body: { type: "string" }, scope: { type: "string", enum: ["project"] }, workspace: workspaceProp }, required: ["type", "name", "description"], additionalProperties: false } },
};

const err = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const ok = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t.length > MAX_RESULT_CHARS ? `${t.slice(0, MAX_RESULT_CHARS)}\n(… ${MAX_RESULT_CHARS}자에서 잘림)` : t }], ...(isError ? { isError: true } : {}) });

function serverVersion(): string {
  try { return String(JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version ?? "0"); } catch { return "0"; }
}

export class PaceMcpServer {
  readonly access: Access;
  private readonly ws: RootPin;
  private readonly profile: { pin: RootPin; memoryDir: string } | null;
  private readonly cfg: McpServerConfig;

  constructor(config: McpServerConfig) {
    this.cfg = config;
    this.access = config.access;
    this.ws = pinRoot(config.workspace);
    let profile: { pin: RootPin; memoryDir: string } | null = null;
    try {
      const env = config.env ?? process.env;
      const home = paceHome(env);
      const name = resolveProfileName(home, env);
      if (name && profileExists(home, name)) {
        const memoryDir = profileMemoryDir(loadProfile(home, name).dir);
        if (existsSync(memoryDir)) profile = { pin: pinRoot(memoryDir), memoryDir };
      }
    } catch { profile = null; }
    this.profile = profile;
  }

  /** 서버가 이 access에서 노출하는 도구 이름 */
  toolNames(): string[] {
    return [...MCP_READ_TOOLS, ...(this.access === "write" ? MCP_WRITE_TOOLS : [])];
  }

  async handle(message: unknown): Promise<Json | null> {
    if (typeof message !== "object" || message === null || Array.isArray(message)) return err(null, -32600, "요청은 JSON 객체여야 한다");
    const m = message as Json;
    const hasId = m.id !== undefined && m.id !== null;
    if (typeof m.method !== "string") return hasId ? err(m.id, -32600, "method가 필요하다") : null;
    if (!hasId) return null; // 알림(notifications/initialized 등)은 응답하지 않는다
    switch (m.method) {
      case "initialize": {
        const asked = m.params?.protocolVersion;
        const protocolVersion = typeof asked === "string" && SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
        return ok(m.id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: MCP_SERVER_NAME, version: serverVersion() } });
      }
      case "ping":
        return ok(m.id, {});
      case "tools/list":
        return ok(m.id, { tools: this.toolNames().map((n) => TOOL_DEFS[n]) });
      case "tools/call": {
        const name = m.params?.name;
        if (typeof name !== "string" || ![...MCP_READ_TOOLS, ...MCP_WRITE_TOOLS].includes(name as never)) return err(m.id, -32602, `알 수 없는 도구: ${typeof name === "string" ? name.slice(0, 60) : "(문자열 아님)"}`);
        try {
          return ok(m.id, text(await this.call(name, m.params?.arguments ?? {})));
        } catch (error) {
          if (error instanceof ToolRefusal || error instanceof BoundaryError) return ok(m.id, text(`거부: ${error.message}`, true));
          return ok(m.id, text(`오류: ${error instanceof Error ? error.message : String(error)}`, true));
        }
      }
      default:
        return err(m.id, -32601, `지원하지 않는 메서드: ${m.method.slice(0, 60)}`);
    }
  }

  private async call(name: string, raw: unknown): Promise<string> {
    if ((MCP_WRITE_TOOLS as readonly string[]).includes(name) && this.access !== "write") throw new ToolRefusal("읽기 전용 세션에서는 변경 도구를 쓸 수 없다");
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ToolRefusal("arguments는 객체여야 한다");
    const args = raw as Json;
    const def = TOOL_DEFS[name]!;
    for (const key of Object.keys(args)) if (!(key in def.inputSchema.properties)) throw new ToolRefusal(`받지 않는 인자: ${key.slice(0, 40)}`);
    if (args.workspace !== undefined) {
      if (typeof args.workspace !== "string") throw new ToolRefusal("workspace는 문자열이어야 한다");
      if (!realpathCompare(args.workspace, this.ws)) throw new ToolRefusal("이 서버에 고정된 워크스페이스가 아니다");
    }
    switch (name) {
      case "memory_list": return this.memoryList(args);
      case "memory_show": return this.memoryShow(args);
      case "memory_add": return this.memoryAdd(args);
      case "project_list": return this.projectList();
      case "backlog_list": return this.backlogList();
      case "backlog_show": return this.backlogShow(args);
      case "brain_search": return this.brainSearch(args);
      default: throw new ToolRefusal("알 수 없는 도구");
    }
  }

  // ---- 공통 계층 ----

  private guarded<T>(root: string, boundary: RootPin, fn: (exists: boolean, files: string[], entries: Map<string, string>) => T): T {
    const before = scan(root, boundary, this.cfg.scan);
    const result = fn(before.exists, before.files, before.entries);
    this.cfg.testHooks?.afterModuleRead?.(root);
    const after = scan(root, boundary, this.cfg.scan);
    const changed = diffScans(before, after);
    if (changed.length > 0) throw new BoundaryError(`호출 중 ${changed.length}개 항목이 바뀌어 결과를 버렸다`);
    return result;
  }

  private readFile(root: string, boundary: RootPin, key: string): string {
    const path = join(root, ...key.split("/"));
    const content = readFileSync(path, "utf8");
    recheckInside(path, boundary);
    return content;
  }

  private memoryTarget(scope: unknown, forWrite: boolean): { dir: string; boundary: RootPin } {
    const s = scope === undefined ? "project" : scope;
    if (s !== "project" && s !== "profile") throw new ToolRefusal("scope는 project|profile");
    if (s === "profile") {
      if (forWrite) throw new ToolRefusal("프로필 메모리는 읽기만 할 수 있다");
      if (!this.profile) throw new ToolRefusal("읽을 수 있는 프로필 메모리가 없다");
      return { dir: this.profile.memoryDir, boundary: this.profile.pin };
    }
    return { dir: projectMemoryDir(this.ws.path), boundary: this.ws };
  }

  // ---- 도구 ----

  private memoryList(args: Json): string {
    const { dir, boundary } = this.memoryTarget(args.scope, false);
    const lines = this.guarded(dir, boundary, (exists) => (exists ? listMemories(dir).map((e) => `${e.slug}\t${e.type}\t${e.description}`) : []));
    return lines.length > 0 ? lines.join("\n") : "(기억 없음)";
  }

  private memoryShow(args: Json): string {
    if (typeof args.slug !== "string") throw new ToolRefusal("slug는 문자열이어야 한다");
    const slug: string = args.slug;
    const { dir, boundary } = this.memoryTarget(args.scope, false);
    const entry = this.guarded(dir, boundary, (exists) => {
      if (!exists) throw new ToolRefusal(`없는 기억: ${slug.slice(0, 60)}`);
      return readMemory(dir, slug);
    });
    return `# ${entry.name} (${entry.type})\n${entry.description}${entry.due ? ` · 마감 ${entry.due}` : ""}\n\n${entry.body}`;
  }

  private memoryAdd(args: Json): string {
    if (this.access !== "write") throw new ToolRefusal("읽기 전용 세션에서는 변경 도구를 쓸 수 없다");
    const { dir, boundary } = this.memoryTarget(args.scope, true);
    for (const key of ["type", "name", "description"]) if (typeof args[key] !== "string") throw new ToolRefusal(`${key}는 문자열이어야 한다`);
    if (args.body !== undefined && typeof args.body !== "string") throw new ToolRefusal("body는 문자열이어야 한다");
    const type = assertMemoryType("project", args.type);
    if (type === "status") throw new ToolRefusal("진행 상황(status)은 이 도구로 바꾸지 않는다");
    const before = scan(dir, boundary, this.cfg.scan);
    let slug: string;
    try {
      slug = addMemory(dir, "project", { type, name: args.name, description: args.description, body: args.body }, {}).slug;
    } catch (error) {
      // 가드 위반 등 — 저장하지 않았다
      throw new ToolRefusal(error instanceof Error ? error.message : String(error));
    }
    this.cfg.testHooks?.afterModuleRead?.(dir);
    const saved = existsSync(join(dir, `${slug}.md`));
    let after;
    try {
      after = scan(dir, boundary, this.cfg.scan);
    } catch (error) {
      throw new ToolRefusal(`저장 뒤 경계 검사에 실패했다(${(error as Error).message}) — 실제 저장 여부: ${saved ? "저장됨" : "저장되지 않음"}`);
    }
    const unexpected = diffScans(before, after).filter((k) => k !== `${slug}.md` && k !== "INDEX.md");
    if (unexpected.length > 0) throw new ToolRefusal(`저장 중 예상 밖 변화가 있었다(${unexpected.slice(0, 3).join(", ")}) — 실제 저장 여부: ${saved ? "저장됨" : "저장되지 않음"}`);
    return `기억 추가: ${slug}`;
  }

  private projectList(): string {
    const root = join(this.ws.path, "projects");
    const lines = this.guarded(root, this.ws, (exists, files, entries) => {
      if (!exists) return [];
      const out: string[] = [];
      for (const [key, kind] of entries) {
        if (!kind.startsWith("dir") || key.includes("/") || !/^P\d{3}_/.test(key)) continue;
        const file = `${key}/PROJECT.md`;
        if (!files.includes(file)) {
          out.push(`${key.slice(0, 4)} · ${key.slice(5)} · (PROJECT.md 없음)`);
          continue;
        }
        const body = this.readFile(root, this.ws, file);
        const state = /^- 상태: (.+)$/m.exec(body)?.[1]?.trim() ?? "?";
        const start = body.search(/^## 태스크\s*$/m);
        const rest = start < 0 ? "" : body.slice(start).split(/\r?\n/).slice(1);
        const rows: string[][] = [];
        for (const line of rest) {
          if (line.startsWith("## ")) break;
          if (line.startsWith("| T")) rows.push(line.split("|").map((c) => c.trim()));
        }
        const running = rows.find((c) => c[3] === "진행");
        out.push(`${key.slice(0, 4)} · ${key.slice(5)} · ${state}${running ? ` · 진행 ${running[1]} ${running[2]}` : ""}`);
      }
      return out;
    });
    return lines.length > 0 ? lines.join("\n") : "(프로젝트 없음)";
  }

  private backlogNames(entries: Map<string, string>): string[] {
    return [...entries].filter(([k, kind]) => kind.startsWith("dir") && !k.includes("/") && /^BL\d{6}_\d{2}_/.test(k)).map(([k]) => k).sort();
  }

  private backlogList(): string {
    const root = join(this.ws.path, "backlogs");
    const lines = this.guarded(root, this.ws, (exists, files, entries) => {
      if (!exists) return [];
      return this.backlogNames(entries).map((n) => {
        const state = files.includes(`${n}/BACKLOG.md`) ? /^- 상태: (.+)$/m.exec(this.readFile(root, this.ws, `${n}/BACKLOG.md`))?.[1]?.trim() ?? "?" : "(BACKLOG.md 없음)";
        return `${n} · ${state}`;
      });
    });
    return lines.length > 0 ? lines.join("\n") : "(백로그 없음)";
  }

  private backlogShow(args: Json): string {
    if (typeof args.name !== "string") throw new ToolRefusal("name은 문자열이어야 한다");
    if (args.brief !== undefined && typeof args.brief !== "string") throw new ToolRefusal("brief는 문자열이어야 한다");
    const name: string = args.name;
    const brief: string | undefined = args.brief;
    const root = join(this.ws.path, "backlogs");
    return this.guarded(root, this.ws, (exists, files, entries) => {
      const names = exists ? this.backlogNames(entries) : [];
      // 디렉터리 목록의 정확 일치만 — 경로 조각을 합쳐 쓰지 않는다
      if (!names.includes(name)) throw new ToolRefusal("목록에 없는 백로그 이름이다");
      let key = `${name}/BACKLOG.md`;
      if (brief !== undefined) {
        const briefs = files.filter((f) => f.startsWith(`${name}/BR`) && f.split("/").length === 2).map((f) => f.split("/")[1]!);
        const hit = briefs.filter((b) => b === brief || b === `${brief}.md` || (/^BR\d{2}$/.test(brief) && b.startsWith(`${brief}_`)));
        if (hit.length !== 1) throw new ToolRefusal("목록에 없는 브리프 이름이다");
        key = `${name}/${hit[0]}`;
      }
      if (!files.includes(key)) throw new ToolRefusal("파일이 없다");
      return this.readFile(root, this.ws, key);
    });
  }

  private brainSearch(args: Json): string {
    if (typeof args.query !== "string" || args.query.trim() === "") throw new ToolRefusal("query는 비지 않은 문자열이어야 한다");
    const query: string = args.query;
    const limit = args.limit === undefined ? 5 : args.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new ToolRefusal("limit은 1~10 정수");
    const root = join(this.ws.path, ".pace", "brain");
    const out = this.guarded(root, this.ws, (exists, files) => {
      if (!exists || !files.includes("SCHEMA.md")) return null;
      // 위로 올라가 찾지 않고 이 워크스페이스의 브레인만 읽는다
      return formatSearch(this.ws.path, searchBrain(this.ws.path, query, { limit, budget: 12_000 }), false);
    });
    return out ?? "브레인 없음";
  }
}
