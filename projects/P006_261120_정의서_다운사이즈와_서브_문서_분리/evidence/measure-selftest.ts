#!/usr/bin/env node
/**
 * T01 S-4: measure.ts가 기준 위반을 검출하고 대조군은 잡지 않는지 임시 저장소로 확인한다.
 * 실행: node measure-selftest.ts   (실패가 있으면 종료 1)
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIMITS, measure } from "./measure.ts";

const base = mkdtempSync(join(tmpdir(), "p006-measure-"));
const results: string[] = [];
let failed = 0;
const check = (name: string, fn: () => void) => { try { fn(); results.push(`PASS ${name}`); } catch (e) { failed++; results.push(`FAIL ${name}: ${(e as Error).message}`); } };

/** 글자 수가 정확히 n인 절 문자열("## 이름\n" + 채움) */
const section = (name: string, n: number) => { const head = `## ${name}\n`; return head + "a".repeat(n - [...head].length); };
const note = (n: number) => "가".repeat(n);

function repo(name: string, sections: string[], opts: { dirs?: string[]; docs?: string[] } = {}): string {
  const root = join(base, name);
  for (const d of opts.dirs ?? []) mkdirSync(join(root, d), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  for (const f of opts.docs ?? []) writeFileSync(join(root, "docs", f), "# x\n");
  writeFileSync(join(root, "docs/README.md"), ["# 시험", ...sections].join("\n"));
  return root;
}

const components = (rows: string[]) => ["## 구성 요소", "| 요소 | 경로 | 스택·형식 | 요약 · 상세 |", "|---|---|---|---|", ...rows].join("\n");
const docsTable = (rows: string[]) => ["## 문서", "| 문서 | 설명 | 용도 | 적용 범위 | 참조 시점 |", "|---|---|---|---|---|", ...rows].join("\n");

try {
  // 등록·비고: 위반 사례와 대조군을 한 저장소에
  const reg = repo("registration", [
    components([
      `| 대시보드 옛 | \`src/dashboard-old/\` | TS | ${note(LIMITS.noteChars + 1)} |`,
      `| 공통 | \`src/core\` | TS | ${note(LIMITS.noteChars)} |`,
    ]),
    "## 범위\n표 밖 문장에서 `docs/X.md`와 `src/dashboard/`를 언급한다.",
    docsTable(["| `docs/Y.md` | 등록된 문서 | test | `test/**` | 작업 시 |", "| `AGENTS.md` | docs/X.md 설명에서 언급 | — | 전체 | 항상 |"]),
  ], { dirs: ["src/dashboard", "src/dashboard-old", "src/core"], docs: ["X.md", "Y.md"] });
  const r = measure(reg);
  check("유사 경로만 등록된 src/dashboard/ 검출", () => assert.ok(r.unregisteredDirs.includes("src/dashboard/"), JSON.stringify(r.unregisteredDirs)));
  check("대조군: 끝 / 없이 정확히 등록된 src/core는 미등록 아님", () => assert.ok(!r.unregisteredDirs.includes("src/core/")));
  check("대조군: 등록된 src/dashboard-old/는 미등록 아님", () => assert.ok(!r.unregisteredDirs.includes("src/dashboard-old/")));
  check("표 밖·설명 칸에서만 언급된 docs/X.md 검출", () => assert.deepEqual(r.unlistedDocs, ["docs/X.md"]));
  check("대조군: 첫 칸에 등록된 docs/Y.md는 미등록 아님", () => assert.ok(!r.unlistedDocs.includes("docs/Y.md")));
  check("비고 151자 검출, 150자 대조군 제외", () => { assert.equal(r.longNotes.length, 1); assert.match(r.longNotes[0]!, /^대시보드 옛 /); });

  // 링크 형식 등록(첫 칸 링크 — 대상으로만), 하위 폴더 문서, 폴더 등록
  const link = repo("link", [docsTable([
    "| [docs/Z.md](Z.md) | 링크로 등록 | test | `test/**` | 작업 시 |",
    "| [docs/W.md](MISSING.md) | 글자만 W, 대상은 없는 파일 | test | `test/**` | 작업 시 |",
    "| [`docs/V.md`](MISSING2.md) | 백틱 표시명만 V | test | `test/**` | 작업 시 |",
    "| `docs/services/` | 서비스별 문서 폴더 | architecture | `services/**` | 작업 시 |",
  ])], { docs: ["Z.md", "W.md", "V.md"] });
  mkdirSync(join(link, "docs/services/a"), { recursive: true }); writeFileSync(join(link, "docs/services/a/API.md"), "# a\n");
  mkdirSync(join(link, "docs/extra"), { recursive: true }); writeFileSync(join(link, "docs/extra/NOTE.md"), "# n\n");
  const lk = measure(link);
  check("대조군: 첫 칸 링크 대상으로 등록된 docs/Z.md는 미등록 아님", () => assert.ok(!lk.unlistedDocs.includes("docs/Z.md")));
  check("링크 글자만 맞고 대상이 다른 docs/W.md 검출", () => assert.ok(lk.unlistedDocs.includes("docs/W.md"), JSON.stringify(lk.unlistedDocs)));
  check("백틱 표시명만 맞고 대상이 다른 docs/V.md 검출", () => assert.ok(lk.unlistedDocs.includes("docs/V.md"), JSON.stringify(lk.unlistedDocs)));
  check("대조군: 등록된 폴더 docs/services/ 아래 문서는 미등록 아님", () => assert.ok(!lk.unlistedDocs.includes("docs/services/a/API.md")));
  check("하위 폴더의 미등록 docs/extra/NOTE.md 검출", () => assert.ok(lk.unlistedDocs.includes("docs/extra/NOTE.md")));

  // 절 한도: 일반 절 3,001자 검출, 3,000자 대조군, 구성 요소 절 3,001자는 절 한도로 잡지 않음
  const big = components([`| 항목 | \`lib/\` | TS | 짧음 |`]);
  const bigComp = big + "\n" + "b".repeat(LIMITS.sectionChars + 1 - [...big].length - 1);
  const sec = repo("sections", [section("일반 초과", LIMITS.sectionChars + 1), section("일반 경계", LIMITS.sectionChars), bigComp, "## 끝"]);
  const s = measure(sec);
  const over = s.sections.filter((x) => x.overLimit).map((x) => x.name);
  check("일반 절 3,001자 검출", () => assert.ok(over.includes("일반 초과"), JSON.stringify(s.sections)));
  check("대조군: 일반 절 3,000자는 위반 아님", () => assert.ok(!over.includes("일반 경계")));
  check("구성 요소 절은 3,001자여도 절 한도로 잡지 않음", () => { const c = s.sections.find((x) => x.name === "구성 요소")!; assert.ok(c.chars > LIMITS.sectionChars, `${c.chars}`); assert.ok(!over.includes("구성 요소")); });

  // 크기: 16,384바이트 대조군, +1바이트 검출 (절은 모두 한도 안)
  const sizeSections = (extra: number) => {
    const parts = ["# 시험"];
    let used = Buffer.byteLength(parts[0]!);
    let i = 0;
    while (used < LIMITS.bytes + extra) {
      const room = LIMITS.bytes + extra - used - 1; // join의 줄바꿈 1
      const head = `## 채움${i++}\n`;
      const body = Math.min(2_000, room - Buffer.byteLength(head));
      const s = head + "c".repeat(Math.max(0, body));
      parts.push(s); used += 1 + Buffer.byteLength(s);
    }
    return parts.join("\n");
  };
  for (const [name, extra, expect] of [["exact", 0, false], ["over", 1, true]] as const) {
    const root = join(base, `size-${name}`); mkdirSync(join(root, "docs"), { recursive: true });
    const text = sizeSections(extra); writeFileSync(join(root, "docs/README.md"), text);
    const m = measure(root);
    check(`크기 ${m.bytes}B ${expect ? "검출" : "대조군 위반 아님"}`, () => { assert.equal(m.bytes, LIMITS.bytes + extra); assert.equal(m.violations.some((v) => v.startsWith("크기")), expect); assert.ok(!m.sections.some((x) => x.overLimit)); });
  }
  // CRLF 작업본도 LF 바이트로 잰다
  const crlf = join(base, "crlf"); mkdirSync(join(crlf, "docs"), { recursive: true });
  writeFileSync(join(crlf, "docs/README.md"), sizeSections(0).replace(/\n/g, "\r\n"));
  check("CRLF 작업본도 LF 기준 16,384B로 재 위반 아님", () => assert.equal(measure(crlf).bytes, LIMITS.bytes));
} finally {
  rmSync(base, { recursive: true, force: true });
}
console.log(results.join("\n"));
process.exit(failed ? 1 : 0);
