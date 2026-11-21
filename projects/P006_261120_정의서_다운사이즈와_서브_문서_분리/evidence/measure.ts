#!/usr/bin/env node
/**
 * 정의서 측정 — pace-project-init `references/project-docs.md` "정의서 크기와 분리 기준"의 항목을
 * `references/analysis.md` "정의서 측정"의 방법으로 잰다.
 * 실행: node measure.ts <저장소 루트> [--file <정의서 경로>]   (기준 위반이 있으면 종료 1)
 */
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/** 기준 값 — 정본은 project-docs.md "정의서 크기와 분리 기준". 여기는 측정 도구의 사본이다. */
export const LIMITS = { bytes: 16_384, sectionChars: 3_000, noteChars: 150, subdocBytes: 24 * 1024 };
const TABLE_SECTIONS = new Set(["구성 요소", "문서"]);
const CONFIG_FILES = ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts", "Cargo.toml"];

export interface Measure {
  bytes: number;
  chars: number;
  sections: { name: string; chars: number; ratio: number; overLimit: boolean }[];
  notes: { name: string; chars: number }[];
  longNotes: string[];
  unregisteredDirs: string[];
  unlistedDocs: string[];
  bigSubdocs: string[];
  /** 정의서가 크기 기준을 넘을 때만: 1/4 넘는 절 */
  ratioFirst: string[];
  violations: string[];
}

const chars = (s: string) => [...s].length;
const lf = (s: string) => s.replace(/\r\n/g, "\n");
const trimSlash = (p: string) => p.replace(/\/+$/, "");
const sectionBody = (text: string, name: string) => (text.split(new RegExp(`\\n## ${name}\\n`))[1] ?? "").split(/\n## /)[0]!;
const tableRows = (body: string) => body.split("\n").filter((l) => l.startsWith("|") && !/^\|[-:| ]+\|$/.test(l)).slice(1);
const backticks = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

export function measure(root: string, file = join(root, "docs/README.md")): Measure {
  // 저장소 밖을 읽지 않는다 — docs/나 정의서가 심볼릭 링크면 거부(시험 사례 없음: Windows는 링크 생성에 권한이 필요)
  for (const p of [join(root, "docs"), file]) if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw new Error(`심볼릭 링크는 재지 않는다: ${p}`);
  const text = lf(readFileSync(file, "utf8"));
  const bytes = Buffer.byteLength(text, "utf8"), total = chars(text);
  const sections = text.split(/\n(?=## )/).slice(1).map((s) => {
    const name = s.split("\n")[0]!.slice(3).trim(), c = chars(s);
    return { name, chars: c, ratio: c / total, overLimit: !TABLE_SECTIONS.has(name) && c > LIMITS.sectionChars };
  });
  // 구성 요소: 넷째 칸 = 앞 세 칸 뒤 전부, 경로 칸 = 둘째 칸의 백틱 경로(정확 일치)
  const rows = tableRows(sectionBody(text, "구성 요소")).map((l) => { const c = l.replace(/^\|/, "").replace(/\|\s*$/, "").split(" | "); return { name: c[0]!.trim(), paths: backticks(c[1] ?? "").map(trimSlash), note: c.slice(3).join(" | ").trim() }; });
  const notes = rows.map((r) => ({ name: r.name, chars: chars(r.note) }));
  const registered = new Set(rows.flatMap((r) => r.paths));
  const codeDirs: string[] = [];
  const skip = new Set(["node_modules", "docs", "projects", "backlogs", "dist", "build", "coverage"]);
  for (const top of readdirSync(root)) {
    const p = join(root, top);
    if (skip.has(top) || top.startsWith(".") || !statSync(p).isDirectory()) continue;
    // analysis.md §1: config 파일이 있는 폴더가 코드 폴더, `src/`는 코드 루트라 바로 아래 폴더를 각각 본다
    if (top === "src") { for (const sub of readdirSync(p)) if (statSync(join(p, sub)).isDirectory()) codeDirs.push(`src/${sub}`); }
    else if (CONFIG_FILES.some((c) => existsSync(join(p, c)))) codeDirs.push(top);
  }
  // `src/` 자체가 행으로 등록돼 있어도 하위 폴더는 각각 등록해야 한다(기준: 최상위 코드 폴더마다 한 행)
  // config가 있는 폴더(멀티 패키지 루트)는 그 안의 경로가 등록돼 있어도 등록으로 본다 — 경로 경계 `/`로만(부분 문자열 아님)
  const covered = (d: string) => registered.has(d) || (!d.startsWith("src/") && [...registered].some((r) => r.startsWith(`${d}/`)));
  const unregisteredDirs = codeDirs.filter((d) => !covered(d)).map((d) => `${d}/`);
  // 문서 표: 첫 칸의 백틱 경로, 또는 첫 칸 링크의 대상(정의서 위치 기준으로 푼 경로 — 링크 글자는 보지 않는다)
  const firstCells = tableRows(sectionBody(text, "문서")).map((l) => l.replace(/^\|/, "").split(" | ")[0] ?? "");
  // 링크 표시명([`docs/W.md`](…))의 백틱은 등록이 아니다 — 링크를 뺀 나머지의 백틱 경로와 링크 대상만 본다
  const listed = firstCells.flatMap((c) => [...backticks(c.replace(/\[[^\]]*\]\([^)]*\)/g, "")), ...[...c.matchAll(/\]\(([^)\s#]+)/g)].map((m) => relative(root, resolve(dirname(file), m[1]!)).replaceAll("\\", "/"))]);
  // 폴더를 등록하면(끝 `/` 또는 실제 폴더) 그 아래 문서 전체를 등록으로 본다
  const isListed = (rel: string) => listed.some((l) => trimSlash(l) === rel || ((l.endsWith("/") || (existsSync(join(root, l)) && statSync(join(root, l)).isDirectory())) && rel.startsWith(`${trimSlash(l)}/`)));
  const docsDir = join(root, "docs");
  // 심볼릭 링크는 따라가지 않는다 — docs/ 밖으로 순회하지 않게
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f), st = lstatSync(p); return st.isSymbolicLink() ? [] : st.isDirectory() ? walk(p) : f.endsWith(".md") ? [p] : []; });
  const definition = resolve(file);
  // 시작점도 같다 — docs/ 자체가 심볼릭 링크면 순회하지 않는다
  const docFiles = (existsSync(docsDir) && !lstatSync(docsDir).isSymbolicLink() ? walk(docsDir) : []).filter((p) => resolve(p) !== definition && resolve(p) !== join(docsDir, "README.md")).map((p) => relative(root, p).replaceAll("\\", "/"));
  const unlistedDocs = docFiles.filter((f) => !isListed(f));
  const bigSubdocs = docFiles.filter((f) => Buffer.byteLength(lf(readFileSync(join(root, f), "utf8"))) > LIMITS.subdocBytes);
  const longNotes = rows.filter((r) => chars(r.note) > LIMITS.noteChars).map((r) => `${r.name} ${chars(r.note)}자`);
  const ratioFirst = bytes > LIMITS.bytes ? sections.filter((s) => s.ratio > 0.25).map((s) => s.name) : [];
  const violations = [
    ...(bytes > LIMITS.bytes ? [`크기 ${bytes}B > ${LIMITS.bytes}B`] : []),
    ...sections.filter((s) => s.overLimit).map((s) => `절 ${s.name} ${s.chars}자 > ${LIMITS.sectionChars}자`),
    ...longNotes.map((n) => `비고 ${n} > ${LIMITS.noteChars}자`),
    ...unregisteredDirs.map((d) => `미등록 코드 폴더 ${d}`),
    ...unlistedDocs.map((d) => `미등록 문서 ${d}`),
    ...bigSubdocs.map((d) => `서브 문서 크기 초과 ${d}`),
  ];
  return { bytes, chars: total, sections, notes, longNotes, unregisteredDirs, unlistedDocs, bigSubdocs, ratioFirst, violations };
}

if (import.meta.main) {
  const root = resolve(process.argv[2] ?? ".");
  const at = process.argv.indexOf("--file");
  const file = at > 0 ? resolve(process.argv[at + 1]!) : join(root, "docs/README.md");
  const m = measure(root, file);
  console.log(`정의서 ${file}`);
  console.log(`전체 ${m.bytes}B (LF) · ${m.chars}자 · 절 ${m.sections.length}개 · 구성 요소 ${m.notes.length}행`);
  for (const s of m.sections) console.log(`  절 ${s.name}: ${s.chars}자 (${(s.ratio * 100).toFixed(1)}%)${s.overLimit ? " ← 절 한도 초과" : ""}`);
  console.log(`비고 최대: ${[...m.notes].sort((a, b) => b.chars - a.chars).slice(0, 5).map((n) => `${n.name} ${n.chars}자`).join(" · ") || "—"}`);
  if (m.ratioFirst.length) console.log(`크기 초과 — 1/4 넘는 절부터: ${m.ratioFirst.join(", ")}`);
  console.log(m.violations.length ? `기준 위반 ${m.violations.length}:\n  - ${m.violations.join("\n  - ")}` : "기준 위반 없음");
  process.exit(m.violations.length ? 1 : 0);
}
