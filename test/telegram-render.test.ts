import assert from "node:assert/strict";
import test from "node:test";
import { approvalKeyboard, approvalText, escapeHtml, LONG_BLOCK, renderBlocks, splitRaw, TG_MAX } from "../src/daemon/telegram/render.ts";

function tagsClosed(html: string): boolean {
  const open = (html.match(/<pre>/g) ?? []).length;
  const close = (html.match(/<\/pre>/g) ?? []).length;
  return open === close;
}

test("S-10 이스케이프·조각마다 닫힌 태그·4096 이하·긴 출력은 파일", () => {
  const code = Array.from({ length: 500 }, (_, i) => `if (a<b && c>d) { x[${i}] = "&amp;"; }`).join("\n"); // ~17,500자 — 파일
  const r = renderBlocks([{ type: "text", text: "<b>굵게</b> & 끝" }, { type: "code", text: code, lang: "ts" }]);
  assert.equal(r.files.length, 1);
  assert.ok(r.files[0]!.content.includes("a<b && c>d"), "파일에는 원문");
  assert.ok(r.parts.every((p) => p.length <= TG_MAX && tagsClosed(p)));
  assert.ok(r.parts[0]!.includes("&lt;b&gt;굵게&lt;/b&gt; &amp; 끝"));
  // 파일 한도 아래지만 4096을 넘는 코드 — 여러 조각, 각 조각이 닫힌 <pre>
  const mid = Array.from({ length: 150 }, (_, i) => `<<${i}>> & `.repeat(8)).join("\n"); // 이스케이프로 길이가 크게 늘어남
  const r2 = renderBlocks([{ type: "code", text: mid }]);
  assert.ok(mid.length <= LONG_BLOCK + 4000);
  assert.ok(r2.parts.length >= 1 && r2.parts.every((p) => p.length <= TG_MAX && tagsClosed(p)), JSON.stringify(r2.parts.map((p) => p.length)));
  const big = "&".repeat(7000); // 이스케이프 뒤 35,000자
  const r3 = renderBlocks([{ type: "text", text: big }]);
  assert.ok(r3.parts.every((p) => p.length <= TG_MAX));
  assert.equal(r3.parts.join("").replace(/&amp;/g, "&").length >= 7000, true, "손실 없음");
});

test("S-10 diff·table·card·chart·file 블록 렌더와 splitRaw의 코드 포인트 보존", () => {
  const r = renderBlocks([
    { type: "diff", text: "-a\n+b" }, { type: "table", header: ["작업", "상태"], rows: [["t-1", "done"]] },
    { type: "card", title: "제목", text: "본문" }, { type: "chart", title: "차트", data: {} }, { type: "file", path: "/x/y.txt", name: "y.txt" },
  ]);
  const all = r.parts.join("\n");
  assert.ok(all.includes("<pre>-a\n+b</pre>") && all.includes("작업") && all.includes("제목") && all.includes("[차트] 차트") && all.includes("[파일] y.txt"));
  const emoji = "😀".repeat(5000);
  const chunks = splitRaw(emoji, 3900);
  assert.equal(chunks.join(""), emoji, "서로게이트 쌍을 끊지 않는다");
  assert.equal(escapeHtml("a&b<c>"), "a&amp;b&lt;c&gt;");
});

test("S-13 승인 본문에 종류·상세(도구 이름)·범위가 있고 버튼 데이터는 승인 ID뿐이다", () => {
  const id = "0123456789abcdef0123456789abcdef";
  const text = approvalText({ id, taskId: "t-1", kind: "tool", detail: "도구 권한 요청: mcp__pace__write (kind: other) — 제목", expiresAt: Date.now() + 600_000, access: "write", worktree: "/w" });
  assert.ok(text.includes("도구 권한") && text.includes("mcp__pace__write") && text.includes("kind: other") && text.includes("/w") && text.includes("write"));
  const kb = approvalKeyboard(id).inline_keyboard[0]!;
  assert.deepEqual(kb.map((b) => b.callback_data), [`a:${id}:y`, `a:${id}:n`]);
  assert.ok(kb.every((b) => Buffer.byteLength(b.callback_data) <= 64));
});
