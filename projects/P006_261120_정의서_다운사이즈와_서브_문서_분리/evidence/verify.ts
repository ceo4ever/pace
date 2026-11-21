#!/usr/bin/env node
/**
 * P006 정의서 다운사이즈 대조 — 착수 커밋의 정의서(기준선)와 반영본을 비교한다(T02 S-1~S-4).
 * 실행: node verify.ts [--self-test]
 *   기본: 반영본을 대조한다(실패 있으면 종료 1).
 *   --self-test: 결함 사본(고정 절 삭제·중복 라벨·대상 문단 이동·적용 범위 넓힘·옛 브레인 근거)이 각각 실패하는지도 본다.
 * 이동 대응표: tasks/T02_…/evidence/move-map.json
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { declaredCommand, resolveAgent, type ProjectRef, type Repo } from "../../../src/project/harness.ts";
import { measure } from "./measure.ts";

const root = resolve(import.meta.dirname, "../../..");
const project = resolve(import.meta.dirname, "..");
const lf = (s: string) => s.replace(/\r\n/g, "\n");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const read = (rel: string) => lf(readFileSync(join(root, rel), "utf8"));
const mapFile = readdirSync(join(project, "tasks")).map((d) => join(project, "tasks", d, "evidence", "move-map.json")).find(existsSync)!;
const map = JSON.parse(readFileSync(mapFile, "utf8")) as { baseline: string; moves: { line: number; target: string; section: string }[]; exceptions: { line: number; before: string; after: string; in: string }[] };
const LABELS = ["검사", "보안 검사", "worktree 준비", "의존성 감사"];
const FIXED = ["개요", "원칙과 기준", "범위", "구성 요소", "환경", "작업 프로세스", "문서", "용어"];
const USES = new Set(["convention", "security", "architecture", "api", "test", "e2e", "ops"]);

/** 대조할 상태 — 결함 사본은 이 객체를 바꿔 만든다 */
interface State { before: string; after: string; docs: Map<string, string>; other: Map<string, string> }
function current(): State {
  const docs = new Map<string, string>();
  for (const f of readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md") && f !== "README.md")) docs.set(`docs/${f}`, read(`docs/${f}`));
  const other = new Map<string, string>();
  for (const f of ["AGENTS.md", ...readdirSync(join(root, ".pace/brain/pages"), { recursive: true }).map(String).filter((f) => f.endsWith(".md")).map((f) => `.pace/brain/pages/${f.replaceAll("\\", "/")}`)]) other.set(f, read(f));
  return { before: lf(execFileSync("git", ["show", `${map.baseline}:docs/README.md`], { cwd: root, encoding: "utf8" })), after: read("docs/README.md"), docs, other };
}

/** 줄의 대조 단위: 표 행은 칸, 그 밖은 문장 */
function units(line: string): string[] {
  const l = line.trim();
  if (!l || l.startsWith("#") || /^\|[-:| ]+\|$/.test(l)) return [];
  if (l.startsWith("|")) return l.slice(1, l.endsWith("|") ? -1 : undefined).split(/ \| /).map((c) => c.trim()).filter(Boolean);
  return l.replace(/^[-*]\s+/, "").split(/(?<=[.다])\s+(?=\S)/).map((s) => s.trim()).filter((s) => s.length > 1);
}
/** 문서의 `## 절` 본문(빈 이름이면 첫 `## ` 앞) */
function section(text: string, name: string): string | null {
  if (name === "") return text.split(/\n## /)[0]!;
  const at = text.indexOf(`\n## ${name}\n`);
  if (at < 0) return null;
  return text.slice(at).split(/\n## /)[1]!;
}
const tableRows = (body: string) => body.split("\n").filter((l) => l.startsWith("|") && !/^\|[-:| ]+\|$/.test(l));
const cellsOf = (l: string) => l.replace(/^\|/, "").replace(/\|\s*$/, "").split(" | ").map((c) => c.trim());
const backticks = (s: string) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
const labelHead = (label: string) => new RegExp(`^\\s*(?:\\|\\s*|[-*]\\s+)(?:\\*\\*)?${label}(?:\\*\\*)?\\s*(?:\\||:)`, "gm");

function withRepo<T>(readme: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "p006-verify-"));
  try {
    mkdirSync(join(dir, "docs")); writeFileSync(join(dir, "docs/README.md"), readme);
    mkdirSync(join(dir, "projects", "P001_260101_시험"), { recursive: true });
    writeFileSync(join(dir, "projects", "P001_260101_시험", "PROJECT.md"), "# P001 시험\n\n- 상태: 진행\n- 작업자:\n\n## 목적\n");
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const agentOf = (dir: string) => resolveAgent({ root: dir, mainRoot: dir, inWorktree: false } as Repo, { id: "P001", dir: "P001_260101_시험", name: "시험", branch: "project/P001", worktree: "" } as ProjectRef, { env: {} } as Parameters<typeof resolveAgent>[2]);

let trackedFiles: string[] | null = null;
const repoFiles = () => (trackedFiles ??= execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean));
const globRe = (g: string) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`);

/** 대조 — 이름: 실패 사유 목록 */
function verify(s: State): Record<string, string[]> {
  const r: Record<string, string[]> = { "S-1 고정 절": [], "S-2 하네스 선언": [], "S-3 원문 보존": [], "S-4 문서 표": [], "S-4 링크": [], "S-4 참조 대조": [] };
  // S-1 고정 절
  for (const name of FIXED) if (!new RegExp(`^## ${name}$`, "m").test(s.after)) r["S-1 고정 절"]!.push(`절 없음: ${name}`);
  // S-2 라벨 값·유일성, 작업자 선택
  const [b, a] = [withRepo(s.before, (d) => ({ cmds: LABELS.map((l) => declaredCommand(d, l)), agent: agentOf(d) })), withRepo(s.after, (d) => ({ cmds: LABELS.map((l) => declaredCommand(d, l)), agent: agentOf(d) }))];
  LABELS.forEach((l, i) => { if (b.cmds[i] === null || b.cmds[i] !== a.cmds[i]) r["S-2 하네스 선언"]!.push(`${l}: ${b.cmds[i]} → ${a.cmds[i]}`); });
  for (const l of LABELS) { const n = (s.after.match(labelHead(l)) ?? []).length; if (n !== 1) r["S-2 하네스 선언"]!.push(`${l} 머리 행 ${n}개`); }
  if (JSON.stringify(b.agent) !== JSON.stringify(a.agent)) r["S-2 하네스 선언"]!.push(`작업자 선택 ${JSON.stringify(b.agent)} → ${JSON.stringify(a.agent)}`);
  // S-3 대응표 기반 원문 대조
  const after = norm(s.after);
  const lines = s.before.split("\n");
  lines.forEach((line, i) => {
    const n = i + 1;
    const ex = map.exceptions.find((e) => e.line === n);
    const text = ex ? line.replace(ex.before, ex.after) : line;
    if (ex && text === line) r["S-3 원문 보존"]!.push(`${n}행 예외 전 값 없음`);
    const missing = units(text).filter((u) => !after.includes(norm(u)));
    if (!missing.length) return;
    if (ex) { r["S-3 원문 보존"]!.push(`${n}행(예외) 반영본에 없음: ${missing[0]!.slice(0, 60)}`); return; }
    const mv = map.moves.find((m) => m.line === n);
    if (!mv) { r["S-3 원문 보존"]!.push(`${n}행 대응표 없음: ${missing[0]!.slice(0, 60)}`); return; }
    const target = s.docs.get(mv.target);
    const body = target === undefined ? null : section(target, mv.section);
    if (body === null) { r["S-3 원문 보존"]!.push(`${n}행 대상 ${mv.target} §${mv.section} 없음`); return; }
    for (const u of missing) if (!norm(body).includes(norm(u))) r["S-3 원문 보존"]!.push(`${n}행 → ${mv.target} §${mv.section || "머리"}에 없음: ${u.slice(0, 60)}`);
  });
  // S-4 문서 표 — 머리글 이름으로 열을 찾는다
  const docTable = tableRows(section(s.after, "문서") ?? "");
  const head = cellsOf(docTable[0] ?? "");
  const col = (n: string) => head.indexOf(n);
  for (const need of ["문서", "용도", "적용 범위", "참조 시점"]) if (col(need) < 0) r["S-4 문서 표"]!.push(`머리글 없음: ${need}`);
  for (const [file] of s.docs) {
    const row = docTable.slice(1).map(cellsOf).find((c) => backticks(c[col("문서")] ?? "").includes(file));
    if (!row) { r["S-4 문서 표"]!.push(`미등록: ${file}`); continue; }
    const use = row[col("용도")] ?? "", scope = row[col("적용 범위")] ?? "", when = row[col("참조 시점")] ?? "";
    if (!USES.has(use)) r["S-4 문서 표"]!.push(`${file} 용도 '${use}'`);
    if (!when || when === "—") r["S-4 문서 표"]!.push(`${file} 참조 시점 없음`);
    const globs = backticks(scope);
    if (!globs.length || /전체/.test(scope)) r["S-4 문서 표"]!.push(`${file} 적용 범위 '${scope}'`);
    for (const g of globs) {
      if (/^\*\*/.test(g) || g === "*") r["S-4 문서 표"]!.push(`${file} 저장소 전체를 덮는 범위 ${g}`);
      else if (!repoFiles().some((f) => globRe(g).test(f))) r["S-4 문서 표"]!.push(`${file} 범위 ${g}에 맞는 경로 없음`);
    }
  }
  // S-4 링크·앵커 (정의서·서브 문서·AGENTS·ARCHITECTURE)
  const slug = (h: string) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
  const texts = new Map<string, string>([["docs/README.md", s.after], ...s.docs, ["AGENTS.md", s.other.get("AGENTS.md")!]]);
  for (const [file, text] of texts) for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1]!; if (/^[a-z]+:/i.test(href)) continue;
    const [p, hash] = href.split("#");
    const target = p ? resolve(dirname(join(root, file)), decodeURIComponent(p)) : join(root, file);
    const rel = target.slice(root.length + 1).replaceAll("\\", "/");
    const content = texts.get(rel) ?? (existsSync(target) && target.endsWith(".md") ? read(rel) : existsSync(target) ? "" : null);
    if (content === null) { r["S-4 링크"]!.push(`${file} → ${href} 파일 없음`); continue; }
    if (hash && target.endsWith(".md") && !content.split("\n").filter((l) => /^#{1,6} /.test(l)).map((l) => slug(l.replace(/^#+ /, ""))).includes(decodeURIComponent(hash))) r["S-4 링크"]!.push(`${file} → ${href} 앵커 없음`);
  }
  // S-4 참조 대조표: 새 위치가 내용을 담고 옛 참조는 없다
  const agents = s.other.get("AGENTS.md")!, arch = s.docs.get("docs/ARCHITECTURE.md") ?? "";
  const refs: [string, boolean][] = [
    ["AGENTS 더 보기: 작업 시작 때 정의서", agents.includes("- 작업 시작 때: `docs/README.md`")],
    ["AGENTS 더 보기: 경로를 고칠 때 서브 문서", agents.includes("- 경로를 고칠 때: 정의서 문서 표에서")],
    ["AGENTS 옛 나열 제거", !agents.includes("정의서: 개요·구성 요소·환경·작업 프로세스·보안(민감 경로)·문서 표")],
    ["ARCHITECTURE 선언 경계 → WORK-PROCESS", arch.includes("`docs/WORK-PROCESS.md` \"선언 명령과 커밋 게이트\"") && (section(s.docs.get("docs/WORK-PROCESS.md") ?? "", "선언 명령과 커밋 게이트") ?? "").includes("선언 명령:")],
    ["ARCHITECTURE 24행 근거: 구성 요소 + 서브 문서 안내", /^근거: `docs\/README\.md` 구성 요소\(모듈별 상세는 문서 표의 서브 문서\), 각 경로 및 `src\/cli\.ts` import\.$/m.test(arch) && !/^근거: `docs\/README\.md` 구성 요소, 각 경로/m.test(arch) && /^## 문서$/m.test(s.after)],
    ["ARCHITECTURE 옛 근거 제거", !arch.includes("명령 선언 경계는 `docs/README.md` 작업 프로세스를 따른다")],
  ];
  const page = (name: string) => [...s.other].find(([f]) => f.endsWith(`/${name}.md`))?.[1] ?? "";
  const canvas = page("canvas-추출-도구-봉인과-설치-경계"), dash = page("백로그-대시보드-자동-갱신과-git-경계");
  refs.push(["브레인 Canvas 근거 → SETUP", /sources:.*doc:docs\/SETUP\.md/.test(canvas) && (section(s.docs.get("docs/SETUP.md") ?? "", "Canvas 묶음 설치") ?? "").includes("manifest.json")]);
  refs.push(["브레인 대시보드 근거 → DASHBOARD", /sources:.*doc:docs\/DASHBOARD\.md/.test(dash) && (s.docs.get("docs/DASHBOARD.md") ?? "").includes("local.js") && dash.includes("`docs/DASHBOARD.md`")]);
  refs.push(["브레인 옛 근거 doc:docs/README.md 없음", ![...s.other].some(([f, t]) => f.startsWith(".pace/brain/") && /sources:.*doc:docs\/README\.md/.test(t))]);
  refs.push(["브레인 대시보드 본문 옛 언급 제거", !dash.includes("현재 `docs/README.md`와")]);
  // 민감 경로를 다루는 서브 문서는 SECURITY로 이어진다(경로로 서브 문서를 찾아온 작업자가 보안 지침에 닿게)
  for (const f of ["docs/TESTING.md", "docs/PLAYBOOK.md", "docs/SETUP.md", "docs/PLANNING-TOOLS.md", "docs/WORK-PROCESS.md"]) refs.push([`${f} → SECURITY 링크`, (s.docs.get(f) ?? "").includes("](SECURITY.md)")]);
  for (const [name, ok] of refs) if (!ok) r["S-4 참조 대조"]!.push(name);
  return r;
}

const report = (r: Record<string, string[]>) => Object.entries(r).map(([k, v]) => `${v.length ? "FAIL" : "PASS"} ${k}${v.length ? `\n  - ${v.join("\n  - ")}` : ""}`).join("\n");
const failed = (r: Record<string, string[]>) => Object.values(r).some((v) => v.length);

const state = current();
const result = verify(state);
const m = measure(root);
console.log(report(result));
console.log(`${m.violations.length ? "FAIL" : "PASS"} S-1 측정 ${m.bytes}B${m.violations.length ? `\n  - ${m.violations.join("\n  - ")}` : " · 기준 위반 없음"}`);
let bad = failed(result) || m.violations.length > 0;

if (process.argv.includes("--self-test")) {
  const clone = (): State => ({ before: state.before, after: state.after, docs: new Map(state.docs), other: new Map(state.other) });
  const cases: [string, string, (s: State) => void][] = [
    ["고정 절 `용어` 삭제", "S-1 고정 절", (s) => { s.after = s.after.replace("\n## 용어\n", "\n"); }],
    ["같은 라벨 `검사` 행을 뒤에 추가", "S-2 하네스 선언", (s) => { s.after += "\n- 검사: `npm test`\n"; }],
    ["대상 SETUP의 Canvas 문단을 ARCHITECTURE로 옮김", "S-3 원문 보존", (s) => {
      const setup = s.docs.get("docs/SETUP.md")!, para = section(setup, "Canvas 묶음 설치")!.split("\n").find((l) => l.includes("manifest.json"))!;
      s.docs.set("docs/SETUP.md", setup.replace(para, "")); s.docs.set("docs/ARCHITECTURE.md", s.docs.get("docs/ARCHITECTURE.md") + "\n" + para + "\n");
    }],
    ["DAEMON 적용 범위를 `전체`로", "S-4 문서 표", (s) => { s.after = s.after.replace("| architecture | `src/daemon/**` |", "| architecture | 전체 |"); }],
    ["DAEMON 적용 범위를 `**/*`로", "S-4 문서 표", (s) => { s.after = s.after.replace("| architecture | `src/daemon/**` |", "| architecture | `**/*` |"); }],
    ["ARCHITECTURE 24행을 기준선 문구로 되돌림", "S-4 참조 대조", (s) => { s.docs.set("docs/ARCHITECTURE.md", s.docs.get("docs/ARCHITECTURE.md")!.replace("근거: `docs/README.md` 구성 요소(모듈별 상세는 문서 표의 서브 문서)", "근거: `docs/README.md` 구성 요소")); }],
    ["24행을 되돌리고 안내 문장을 문서 끝에 붙임", "S-4 참조 대조", (s) => { const d = s.docs.get("docs/ARCHITECTURE.md")!; s.docs.set("docs/ARCHITECTURE.md", d.replace("근거: `docs/README.md` 구성 요소(모듈별 상세는 문서 표의 서브 문서)", "근거: `docs/README.md` 구성 요소") + "\n근거: `docs/README.md` 구성 요소(모듈별 상세는 문서 표의 서브 문서)\n"); }],
    ["TESTING의 SECURITY 링크 제거", "S-4 참조 대조", (s) => { s.docs.set("docs/TESTING.md", s.docs.get("docs/TESTING.md")!.replace("](SECURITY.md)", "](ARCHITECTURE.md)")); }],
    ["브레인에 옛 근거 doc:docs/README.md를 남김", "S-4 참조 대조", (s) => { const [f, t] = [...s.other].find(([f]) => f.endsWith("/canvas-추출-도구-봉인과-설치-경계.md"))!; s.other.set(f, t.replace("doc:docs/SETUP.md", "doc:docs/SETUP.md, doc:docs/README.md")); }],
  ];
  for (const [name, key, mutate] of cases) {
    const s = clone(); mutate(s);
    const caught = (verify(s)[key] ?? []).length > 0;
    if (!caught) bad = true;
    console.log(`${caught ? "PASS" : "FAIL"} 결함 사본 — ${name} → ${key}${caught ? " 실패로 잡음" : " 못 잡음"}`);
  }
}
process.exit(bad ? 1 : 0);
