#!/usr/bin/env node
/**
 * P006 기준 P-1~P-4 대조 — 착수 커밋의 정의서(기준선)와 현재 작업본을 비교한다.
 * 실행: node projects/P006_…/evidence/verify.ts [기준선 커밋=a2488d9]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { declaredCommand } from "../../../src/project/harness.ts";

const root = resolve(import.meta.dirname, "../../..");
const base = process.argv[2] ?? "a2488d9";
const lf = (s: string) => s.replace(/\r\n/g, "\n");
const before = lf(execFileSync("git", ["show", `${base}:docs/README.md`], { cwd: root, encoding: "utf8" }));
const after = lf(readFileSync(join(root, "docs/README.md"), "utf8"));
const subdocs = readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md") && f !== "README.md");
const results: string[] = [];
let failed = 0;
const report = (id: string, ok: boolean, detail: string) => { if (!ok) failed++; results.push(`${ok ? "PASS" : "FAIL"} ${id} ${detail}`); };

// P-1 크기
const bytes = Buffer.byteLength(after, "utf8"), baseBytes = Buffer.byteLength(before, "utf8");
report("P-1", bytes * 2 <= baseBytes, `docs/README.md ${bytes}B (LF) / 기준선 ${baseBytes}B — 상한 ${Math.floor(baseBytes / 2)}B`);

// P-2 하네스 선언
const tmp = mkdtempSync(join(tmpdir(), "p006-verify-"));
try {
  for (const [name, text] of [["before", before], ["after", after]] as const) { mkdirSync(join(tmp, name, "docs"), { recursive: true }); writeFileSync(join(tmp, name, "docs/README.md"), text); }
  for (const label of ["검사", "보안 검사", "worktree 준비", "의존성 감사"]) {
    const a = declaredCommand(join(tmp, "before"), label), b = declaredCommand(join(tmp, "after"), label);
    report("P-2", a !== null && a === b, `${label}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }

// P-3 빠진 문장·표 칸이 서브 문서에 그대로 있는가
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const corpusAfter = norm(after);
const corpusSub = norm(subdocs.map((f) => lf(readFileSync(join(root, "docs", f), "utf8"))).join("\n"));
function units(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || /^\|[-| ]+\|$/.test(line)) continue;
    if (line.startsWith("|")) {
      // 비고 칸에 백틱 안 `|`가 있어 앞 칸 수만큼만 나눈다
      const body = line.slice(1, line.endsWith("|") ? -1 : undefined);
      const cells = body.split(/ \| /);
      out.push(...cells.map((c) => c.trim()).filter(Boolean));
      continue;
    }
    const item = line.replace(/^[-*]\s+/, "");
    out.push(...item.split(/(?<=[.다])\s+(?=\S)/).map((s) => s.trim()).filter((s) => s.length > 1));
  }
  return out;
}
const missing = units(before).filter((u) => !corpusAfter.includes(norm(u)) && !corpusSub.includes(norm(u)));
report("P-3", missing.length === 0, `빠진 단위 ${missing.length}개${missing.length ? ":\n  - " + missing.map((m) => m.slice(0, 120)).join("\n  - ") : ""}`);

// P-4 문서 표 등록·상대 링크
const table = (after.split("## 문서")[1] ?? "").split("\n## ")[0]!;
for (const f of subdocs) {
  const row = table.split("\n").find((l) => l.includes(`\`docs/${f}\``));
  const cells = row?.split("|").map((c) => c.trim()) ?? [];
  report("P-4", !!row && !!cells[3] && cells[3] !== "—" && !!cells[4] && cells[4] !== "—", `문서 표 docs/${f}: ${row ? `용도 ${cells[3]} · 범위 ${cells[4]}` : "없음"}`);
}
const slug = (h: string) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
const anchors = (file: string) => lf(readFileSync(file, "utf8")).split("\n").filter((l) => /^#{1,6} /.test(l)).map((l) => slug(l.replace(/^#+ /, "")));
const linkFiles = ["README.md", ...subdocs].map((f) => join(root, "docs", f)).concat([join(root, "AGENTS.md"), join(root, "docs/ARCHITECTURE.md")]);
let links = 0;
for (const file of [...new Set(linkFiles)]) {
  for (const m of lf(readFileSync(file, "utf8")).matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1]!;
    if (/^[a-z]+:/i.test(href)) continue;
    links++;
    const [path, hash] = href.split("#");
    const target = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
    const exists = existsSync(target);
    const anchorOk = !hash || !exists || !target.endsWith(".md") || anchors(target).includes(decodeURIComponent(hash));
    if (!exists || !anchorOk) report("P-4", false, `${file.slice(root.length + 1)} → ${href} (${exists ? "앵커 없음" : "파일 없음"})`);
  }
}
report("P-4", true, `상대 링크 ${links}개 대조`);

console.log(results.join("\n"));
process.exit(failed ? 1 : 0);
