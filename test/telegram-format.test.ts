import assert from "node:assert/strict";
import test from "node:test";
import { makeRedactor } from "../src/daemon/secrets.ts";
import { markdownChunks, plainFromHtml, tagsBalanced } from "../src/daemon/telegram/markdown.ts";
import { approvalText, LONG_BLOCK, renderBlocks, TG_MAX } from "../src/daemon/telegram/render.ts";
import { CHAT, tgHarness, U1, until } from "./telegram-helpers.ts";

// P035 실사용 확인 후속 — Telegram 메시지 서식: 마크다운 → 안전한 HTML, 분할 경계, 명령 안내 형식.

const md = (text: string): string => markdownChunks(text).join("\n§\n");

test("F-1 제목·굵게·기울임·취소선·코드·링크·인용·구분선", () => {
  assert.equal(md("# 제목"), "<b>제목</b>");
  assert.equal(md("## 둘째 **강조**"), "<b>둘째 강조</b>", "제목 안의 굵게는 겹치지 않게 한 번만");
  assert.equal(md("**굵게** 와 *기울임* 과 _밑줄기울임_ 과 ~~취소~~"), "<b>굵게</b> 와 <i>기울임</i> 과 <i>밑줄기울임</i> 과 <s>취소</s>");
  assert.equal(md("값은 `a < b && c` 이다"), "값은 <code>a &lt; b &amp;&amp; c</code> 이다");
  assert.equal(md("[문서](https://example.com/a?b=1&c=2)"), '<a href="https://example.com/a?b=1&amp;c=2">문서</a>');
  assert.equal(md("> 인용 한 줄\n> 둘째 줄"), "<blockquote>인용 한 줄\n둘째 줄</blockquote>");
  assert.equal(md("---"), "──────────");
  assert.equal(md("snake_case_name 과 2*3*4 는 그대로"), "snake_case_name 과 2*3*4 는 그대로");
});

test("F-2 목록(중첩·번호·체크)과 코드 블록·표", () => {
  const list = md("- 하나\n  - 안쪽 **굵게**\n1. 첫째\n2) 둘째\n- [ ] 할 일\n- [x] 한 일");
  assert.equal(list, "• 하나\n  ◦ 안쪽 <b>굵게</b>\n1. 첫째\n2. 둘째\n☐ 할 일\n☑ 한 일");
  assert.equal(md("```ts\nconst a = 1 < 2;\n```"), "<pre>const a = 1 &lt; 2;</pre>");
  assert.equal(md("앞\n```\n코드 **그대로**\n```\n뒤"), "앞\n<pre>코드 **그대로**</pre>\n뒤", "코드 안은 변환하지 않는다");
  // 표는 고정폭(<pre>)이 아니라 행마다 블록 — 좁은 화면에서 접혀도 어긋나지 않는다
  assert.equal(md("| 이름 | 값 |\n|---|---|\n| a | **1** |\n| 가나 | 22 |"), "<b>a</b> — <b>1</b>\n<b>가나</b> — 22", "열이 둘이면 한 줄");
  const wide = md("| 항목 | 상태 | 남은 사람 확인 |\n|---|:---:|---|\n| BR01 스파이크 | 완료 | 없음 |\n| BR02 `code` | **진행** | P-4 |\n| BR03 | | 빈 칸은 건너뜀 |");
  assert.equal(wide, "<b>BR01 스파이크</b>\n상태: 완료\n남은 사람 확인: 없음\n\n<b>BR02 <code>code</code></b>\n상태: <b>진행</b>\n남은 사람 확인: P-4\n\n<b>BR03</b>\n남은 사람 확인: 빈 칸은 건너뜀");
  assert.ok(!wide.includes("<pre>") && !wide.includes("---"), "고정폭·구분선 없음");
  assert.equal(md("| a | b | c |\n|---|---|---|\n| x \\| y | 2 | 3 |"), "<b>x | y</b>\nb: 2\nc: 3", "이스케이프된 | 는 칸 안의 글자");
  assert.equal(md("| 하나 |\n|---|\n| a |\n| b |"), "<b>a</b>\n<b>b</b>", "열이 하나");
  assert.equal(md("| a | b | c |\n|---|---|---|"), "<b>a</b> — <b>b</b> — <b>c</b>", "본문 없는 표는 머리글 한 줄");
  assert.equal(md("앞 문단\n\n| k | v |\n|---|---|\n| x | y |\n\n뒤 문단"), "앞 문단\n<b>x</b> — y\n뒤 문단");
});

test("F-3 모든 텍스트는 이스케이프되고 허용 밖 태그·위험 링크는 만들어지지 않는다", () => {
  const out = md("<script>alert(1)</script> & <b>x</b> [나쁨](javascript:alert(1)) [나쁨2](data:text/html,x) ![img](http://a/b.png)");
  assert.ok(out.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;x&lt;/b&gt;"));
  assert.ok(!/<script|<img|href="javascript|href="data/.test(out), out);
  assert.ok(tagsBalanced(out));
  assert.equal(md("\\*별표\\* 와 \\`틱\\`"), "*별표* 와 `틱`", "백슬래시 이스케이프");
  assert.equal(md("a\u0000b **c**"), "ab <b>c</b>", "제어 문자는 자리표시자를 위조하지 못한다");
  // 링크 안의 코드·이스케이프 — 라벨·URL이 자리표시자로 남거나 사라지지 않는다
  assert.equal(md("[`중요`](https://example.com)"), '<a href="https://example.com"><code>중요</code></a>');
  assert.equal(md("[a\\*b](https://example.com)"), '<a href="https://example.com">a*b</a>');
  assert.equal(md("[ok](https://example.com/a\\_b)"), '<a href="https://example.com/a_b">ok</a>');
  assert.equal(md("[x](https://a.com/`b`)"), '<a href="https://a.com/b">x</a>');
  for (const sample of ["[`a`](https://e.com) 와 [b\\*](https://e.com/\\*) 와 `c`", "[**굵게**](https://e.com)", "[열림](https://e.com", "[](https://e.com)"]) assert.ok(!md(sample).includes("\u0000"), sample);
});

test("F-4 겹침·짝이 안 맞는 강조는 평문으로 돌아가고 태그 균형은 항상 지켜진다", () => {
  for (const sample of ["*a **b* c**", "**굵게 *기울임** 끝*", "~~a **b~~ c**", "**a `b** c`", "`열린 코드", "**짝없음", "_ _ __ ** **"]) {
    const chunks = markdownChunks(sample);
    assert.ok(chunks.length >= 1 && chunks.every((c) => tagsBalanced(c)), `${sample} → ${JSON.stringify(chunks)}`);
    assert.equal(plainFromHtml(chunks.join("\n")).replace(/[*_~`]/g, "").replace(/\s+/g, ""), sample.replace(/[*_~`]/g, "").replace(/\s+/g, ""), `글자 손실 없음: ${sample}`);
  }
  assert.equal(md("*a **b* c**"), "*a **b* c**", "겹치는 서식은 서식 없이 원문 그대로");
});

test("F-5 분할 — 긴 본문·긴 한 줄·긴 코드·긴 목록·인용 모두 4096 이하이고 조각마다 태그가 닫힌다", () => {
  const words = Array.from({ length: 3000 }, (_, i) => (i % 7 === 0 ? `**굵${i}**` : i % 11 === 0 ? `\`c<${i}>\`` : `단어${i}`)).join(" ");
  const bigCode = `\`\`\`\n${Array.from({ length: 800 }, (_, i) => `line <${i}> & "x"`).join("\n")}\n\`\`\``;
  const bullets = Array.from({ length: 700 }, (_, i) => `- **항목 ${i}** 설명 & <b>${i}</b>`).join("\n");
  const quote = Array.from({ length: 600 }, (_, i) => `> 인용 ${i} *기울임*`).join("\n");
  const table = `| a | b |\n|---|---|\n${Array.from({ length: 900 }, (_, i) => `| ${i} | 한글${i} |`).join("\n")}`;
  for (const [name, text] of [["한 줄", words], ["코드", bigCode], ["목록", bullets], ["인용", quote], ["표", table], ["혼합", [words, bigCode, bullets, quote, table].join("\n\n")]] as const) {
    const chunks = markdownChunks(text);
    assert.ok(chunks.length > 1, name);
    assert.ok(chunks.every((c) => c.length <= 4096 && tagsBalanced(c)), `${name}: ${JSON.stringify(chunks.map((c) => c.length))}`);
  }
  // 긴 한 줄은 글자 손실 없이 이어 붙는다
  const plain = markdownChunks(words).map(plainFromHtml).join("");
  assert.equal(plain.replace(/\s+/g, ""), words.replace(/\*\*|`/g, "").replace(/\s+/g, ""));
  // 이모지(서로게이트 쌍)를 끊지 않는다
  const emoji = markdownChunks("😀".repeat(5000)).join("");
  assert.equal(emoji, "😀".repeat(5000));
});

test("F-6 renderBlocks — 텍스트는 마크다운, 긴 출력은 파일, 비밀은 변환 전에 제거, 메시지 경계는 4096", () => {
  const token = `123456789:${"A".repeat(35)}`;
  const r = renderBlocks([{ type: "text", text: `**결과**\n- 토큰 ${token}\n\`\`\`\n코드\n\`\`\`` }, { type: "card", title: "카드 *제목*", text: "본문 **굵게**" }], makeRedactor([token]));
  const all = r.parts.join("\n");
  assert.ok(all.includes("<b>결과</b>") && all.includes("<pre>코드</pre>") && all.includes("• 토큰 [비밀 제거됨]"));
  assert.ok(!all.includes(token));
  assert.ok(all.includes("<b>카드 <i>제목</i></b>") || all.includes("<b>카드 제목</b>") || all.includes("카드"), all);
  assert.ok(all.includes("본문 <b>굵게</b>"));
  const long = renderBlocks([{ type: "text", text: "가".repeat(LONG_BLOCK + 10) }]);
  assert.equal(long.files.length, 1, "긴 텍스트는 파일 첨부");
  const many = renderBlocks(Array.from({ length: 80 }, (_, i) => ({ type: "text" as const, text: `**블록 ${i}**\n${"내용 ".repeat(150)}` })));
  assert.ok(many.parts.length > 1 && many.parts.every((p) => p.length <= TG_MAX && tagsBalanced(p)));
  assert.ok(renderBlocks([{ type: "text", text: "" }]).parts.length >= 1);
});

test("F-7 승인 요청 본문도 한 줄에 하나씩이고 상세는 이스케이프된다", () => {
  const text = approvalText({ id: "0123456789abcdef0123456789abcdef", taskId: "t-1", kind: "write_start", detail: "<script>x</script> & 쓰기", expiresAt: Date.now() + 600_000, access: "write", worktree: "/w <x>" });
  assert.ok(text.includes("<b>승인 요청") && text.includes("&lt;script&gt;") && text.includes("<code>/w &lt;x&gt;</code>"));
  assert.ok(tagsBalanced(text));
  assert.ok(text.split("\n").length >= 4);
});

/** 한 줄에 명령이 둘 이상이면 실패 */
function assertOneCommandPerLine(text: string, label: string): void {
  for (const line of text.split("\n")) {
    const found = line.match(/(?:^|[\s(>])\/[a-z]+/g) ?? [];
    assert.ok(found.length <= 1, `${label}: 한 줄에 명령이 ${found.length}개 — ${line}`);
  }
}

test("F-8 명령 안내·사용법·미등록 토픽 안내는 명령 한 줄에 하나(HTML 서식, 인자는 code, 마지막 문장 안내)", async () => {
  const t = await tgHarness();
  try {
    for (const [thread, cmd] of [[undefined, "/help"], [undefined, "/zzz"], [undefined, "/new"], [undefined, "/workspaces"], [undefined, "/status"], [11, "/help"], [11, "/cancel"], [11, "/use"], [11, "/chain x!"], [11, "/access"], [11, "/approve"], [11, "/zzz"], [99, "hello"], [11, "/status"]] as const) t.mock.text(CHAT, thread, U1, cmd);
    await until(() => t.mock.texts().length >= 15, 6000, "안내 메시지");
    const texts = t.mock.texts().filter((x) => !x.includes("연결됨"));
    assert.ok(texts.length >= 14);
    texts.forEach((x, i) => { assertOneCommandPerLine(plainFromHtml(x), `#${i}`); assert.ok(tagsBalanced(x)); });
    assert.ok(t.mock.sent().every((c) => c.params.parse_mode === "HTML"));
    const joined = texts.join("\n§\n");
    // General 도움말: 제목 굵게 + 명령 한 줄 + 인자 code
    assert.match(joined, /<b>General 명령<\/b>\n\/workspaces — [^\n]+\n\/new <code>&lt;이름&gt; &lt;절대경로&gt;<\/code> — [^\n]+\n\/status — /);
    assert.match(joined, /\/held clear <code>&lt;update_id&gt;<\/code> — /);
    // 토픽 도움말: 마지막 한 줄은 에이전트 질문 안내
    const topicHelp = texts.find((x) => x.startsWith("<b>명령</b>") && x.includes("/backlog"))!;
    assert.ok(topicHelp, joined);
    assert.equal(topicHelp.trim().split("\n").at(-1), "그 밖의 문장은 에이전트에게 보내는 질문입니다.");
    assert.ok(topicHelp.split("\n").filter((l) => l.startsWith("/")).length >= 10);
    // 코어 도움말(/zzz)·사용법
    assert.match(joined, /\/cancel <code>&lt;작업 ID&gt;<\/code> — 작업 취소/);
    assert.match(joined, /사용법\n\/access <code>read-only\|write<\/code> — /);
    // 미등록 토픽
    assert.match(joined, /이 토픽은 등록되지 않았다\.\n\/bind <code>&lt;워크스페이스 이름&gt;<\/code> — [^\n]+\nGeneral에서 \/new <code>/);
    // /status는 굵은 제목 + 줄바꿈
    assert.match(joined, /<b>기기 [^<]+<\/b>\n실행 \d+ · 대기 \d+/);
    assert.match(joined, /대상: <code>a\/main<\/code>\n체인: <code>[^<]+<\/code> · 접근: <code>read-only<\/code>/);
    // 워크스페이스 목록
    assert.match(joined, /<b>워크스페이스<\/b>\n- ?|<b>워크스페이스<\/b>\n• <code>a<\/code>/);
  } finally { await t.stop(); }
});

test("F-9 서버가 HTML을 거절(can't parse entities)하면 태그를 지운 평문으로 다시 보낸다 — 답변이 사라지지 않는다", async () => {
  const t = await tgHarness();
  try {
    await until(() => t.mock.texts().some((x) => x.includes("연결됨")), 4000, "연결");
    t.mock.fault("sendMessage", { status: 400, body: { ok: false, error_code: 400, description: "Bad Request: can't parse entities: Can't find end tag corresponding to start tag \"b\"" }, times: 1 });
    t.mock.text(CHAT, undefined, U1, "/help");
    await until(() => t.mock.sent().some((c) => c.params.parse_mode === undefined && String(c.params.text).includes("General 명령")), 4000, "평문 재전송");
    const plain = t.mock.sent().find((c) => c.params.parse_mode === undefined && String(c.params.text).includes("General 명령"))!;
    assert.ok(!/<\/?(b|code|i)>/.test(String(plain.params.text)));
    assert.ok(String(plain.params.text).includes("/new <이름> <절대경로> — "), "평문에서는 엔티티가 복원된다");
  } finally { await t.stop(); }
});

test("F-10 에이전트 답변(마크다운)이 완료 메시지에서 HTML로 보인다", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "질문 md");
    await until(() => t.h.runner.started.includes("질문 md"), 4000, "시작");
    t.h.runner.release("질문 md", { text: "## 결과\n**굵게** 와 `code` 와 [링크](https://example.com)\n\n- 항목 하나\n- 항목 둘\n\n```ts\nconst a = 1 < 2;\n```\n\n| 이름 | 값 |\n|---|---|\n| a | 1 |\n\n> 인용" });
    await until(() => t.mock.allTexts().some((x) => x.includes("완료")), 4000, "완료");
    const done = t.mock.allTexts().find((x) => x.includes("완료"))!;
    assert.match(done, /✅ <b>작업 <code>[^<]+<\/code> 완료<\/b>/);
    assert.ok(tagsBalanced(done));
    for (const piece of ["<b>결과</b>", "<b>굵게</b>", "<code>code</code>", '<a href="https://example.com">링크</a>', "• 항목 하나", "• 항목 둘", "<pre>const a = 1 &lt; 2;</pre>", "<blockquote>인용</blockquote>"]) assert.ok(done.includes(piece), `${piece} ← ${done}`);
    assert.ok(done.includes("<b>a</b> — 1") && !done.includes("<pre>이름"), "표는 행마다 블록(고정폭 아님)");
    assert.equal(t.mock.allTexts().filter((x) => x.includes("완료")).length, 1, "완료 메시지는 한 번");
  } finally { await t.stop(); }
});
