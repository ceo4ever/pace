// 마크다운 → Telegram HTML (P035 후속). 에이전트 답변(마크다운)과 시스템 안내를 같은 변환기로 보낸다.
// - 안전한 태그(b·i·s·code·pre·a·blockquote)만 쓰고 모든 텍스트는 이스케이프한다.
// - 구조를 줄·단위(코드 블록·표·인용·본문)로 나눠 단위마다 따로 변환하므로 어느 조각도 태그를 열어 둔 채 끝나지 않는다.
// - 변환 결과가 태그 균형을 어기면(겹치는 강조 등) 그 줄은 평문(이스케이프)으로 보낸다.

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 조각 하나의 길이 상한(HTML 태그 포함) — 4096에서 여유를 둔다 */
export const CHUNK_MAX = 3900;

const TAG_RE = /<(\/?)(b|i|s|code|pre|a|blockquote)(?:\s[^>]*)?>/g;

/** 허용 태그가 올바르게 열리고 닫혔는가 */
export function tagsBalanced(html: string): boolean {
  const stack: string[] = [];
  for (const m of html.matchAll(TAG_RE)) {
    if (m[1] === "") stack.push(m[2]!);
    else if (stack.pop() !== m[2]) return false;
  }
  return stack.length === 0;
}

/** HTML 조각의 평문(태그 제거·엔티티 복원) — 변환 실패 때 서식 없이 다시 보낼 본문 */
export function plainFromHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const escAttr = (t: string): string => escapeHtml(t).replace(/"/g, "&quot;");

/** 이스케이프 뒤 길이 기준으로 줄 경계에서 나눈다. 한 줄이 넘으면 코드 포인트 단위로 자른다 */
export function splitRaw(raw: string, maxEscaped = CHUNK_MAX): string[] {
  const len = (t: string): number => escapeHtml(t).length;
  if (len(raw) <= maxEscaped) return [raw];
  const out: string[] = [];
  let cur = "";
  let curLen = 0;
  const pushCur = (): void => { if (cur !== "") { out.push(cur); cur = ""; curLen = 0; } };
  for (const line of raw.split("\n")) {
    const l = len(line);
    if (l > maxEscaped) {
      pushCur();
      let piece = "";
      let pieceLen = 0;
      for (const ch of line) {
        const cl = len(ch);
        if (pieceLen + cl > maxEscaped) { out.push(piece); piece = ""; pieceLen = 0; }
        piece += ch; pieceLen += cl;
      }
      cur = piece; curLen = pieceLen;
      continue;
    }
    if (cur !== "" && curLen + l + 1 > maxEscaped) { pushCur(); cur = line; curLen = l; }
    else if (cur === "") { cur = line; curLen = l; }
    else { cur = cur + "\n" + line; curLen += l + 1; }
  }
  pushCur();
  return out;
}

/** 인라인: `code` · \이스케이프 · [링크](http…) · **굵게** · __굵게__ · ~~취소~~ · *기울임* · _기울임_ */
export function inline(raw: string): string {
  const stash: { html: string; plain: string }[] = [];
  const hold = (html: string, plain: string): string => `\u0000${stash.push({ html, plain }) - 1}\u0000`;
  const PLACEHOLDER = /\u0000(\d+)\u0000/g;
  // 링크 안에 먼저 보관한 코드·이스케이프가 있으면 라벨은 HTML로, URL은 원문으로 풀어 넣는다(자리표시자가 출력에 남지 않게)
  const labelHtml = (label: string): string => label.split(/(\u0000\d+\u0000)/).map((part) => { const m = /^\u0000(\d+)\u0000$/.exec(part); return m ? (stash[Number(m[1])]?.html ?? "") : escapeHtml(part); }).join("");
  const plainOf = (text: string): string => text.replace(PLACEHOLDER, (_m, i: string) => stash[Number(i)]?.plain ?? "");
  let t = raw.replace(/\u0000/g, "");
  // 백틱 코드와 \이스케이프는 앞에서부터 한 번에 처리한다 — 서로 겹쳐도(\`) 먼저 나온 쪽이 이긴다
  t = t.replace(/\\([\\*_~\[\]()#>|!`-])|(`+)([^`\n]+?)\2(?!`)/g, (_m, esc: string | undefined, _q: string | undefined, code: string | undefined) => hold(esc !== undefined ? escapeHtml(esc) : `<code>${escapeHtml(code ?? "")}</code>`, esc !== undefined ? esc : code ?? ""));
  t = t.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:|tg:\/\/)[^\s)]+)\)/g, (_m, label: string, url: string) => { const href = plainOf(url); return /^(?:https?:\/\/|mailto:|tg:\/\/)[^\s]+$/.test(href) ? hold(`<a href="${escAttr(href)}">${labelHtml(label)}</a>`, plainOf(label)) : _m; });
  t = escapeHtml(t);
  t = t.replace(/\*\*(?=\S)([^\n]+?)(?<=\S)\*\*/g, "<b>$1</b>");
  t = t.replace(/(?<![\w])__(?=\S)([^\n]+?)(?<=\S)__(?![\w])/g, "<b>$1</b>");
  t = t.replace(/~~(?=\S)([^\n]+?)(?<=\S)~~/g, "<s>$1</s>");
  t = t.replace(/(?<![\w*])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?![\w*])/g, "<i>$1</i>");
  t = t.replace(/(?<![\w_])_(?=[^\s_])([^_\n]+?)(?<=[^\s_])_(?![\w_])/g, "<i>$1</i>");
  // 링크 라벨 안의 보관 항목까지 모두 풀릴 때까지 되풀이한다(중첩은 한 단계뿐이지만 안전하게)
  let out = t;
  for (let i = 0; i < 3 && /\u0000\d+\u0000/.test(out); i++) out = out.replace(PLACEHOLDER, (_m, k: string) => stash[Number(k)]?.html ?? "");
  return !/\u0000/.test(out) && tagsBalanced(out) ? out : escapeHtml(raw.replace(/\u0000/g, ""));
}

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const INDENT = "  ";
const levelOf = (ws: string): number => Math.min(3, Math.floor(ws.replace(/\t/g, "  ").length / 2));

/** 마크다운 한 줄 → HTML 한 줄(제목·목록·구분선·본문) */
export function renderLine(raw: string): string {
  let m = HEADING.exec(raw);
  if (m) { const text = inline(m[1]!.replace(/\*\*|__/g, "")); return text === "" ? "" : `<b>${text}</b>`; }
  if (RULE.test(raw)) return "──────────";
  m = BULLET.exec(raw);
  if (m) {
    const level = levelOf(m[1]!);
    const task = /^\[( |x|X)\]\s+(.*)$/.exec(m[2]!);
    const mark = task ? (task[1] === " " ? "☐" : "☑") : ["•", "◦", "▪", "▪"][level]!;
    return `${INDENT.repeat(level)}${mark} ${inline(task ? task[2]! : m[2]!)}`;
  }
  m = NUMBERED.exec(raw);
  if (m) return `${INDENT.repeat(levelOf(m[1]!))}${m[2]}. ${inline(m[3]!)}`;
  return inline(raw);
}

function plainCell(cell: string): string {
  return cell.replace(/`([^`]*)`/g, "$1").replace(/\*\*|__|~~/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
}

/** 표 한 줄의 칸들(마크다운 서식은 그대로 둔다) */
function splitCells(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

/**
 * 표 → 행마다 블록(마크다운 줄). Telegram 화면 폭에서는 고정폭 표가 접혀 구분선·칸이 어긋나므로 쓰지 않는다.
 * 열이 둘이면 한 줄(`**첫열** — 둘째열`), 셋 이상이면 첫 열을 굵게 쓰고 나머지는 `머리글: 값`으로 줄바꿈하며 행 사이는 한 줄 띄운다.
 */
function tableLines(rows: string[][]): string[] {
  const header = rows[0]!;
  const body = rows.slice(1);
  const bold = (cell: string): string => { const t = cell.replace(/\*\*|__/g, "").trim(); return t === "" ? "" : `**${t}**`; };
  const label = (cell: string): string => plainCell(cell).replace(/([\\*_~`\[\]#>|])/g, "\\$1");
  const cols = Math.max(...rows.map((r) => r.length));
  const out: string[] = [];
  body.forEach((row, n) => {
    if (cols <= 2) {
      const first = bold(row[0] ?? "");
      const second = (row[1] ?? "").trim();
      out.push(first !== "" && second !== "" ? `${first} — ${second}` : first !== "" ? first : second);
      return;
    }
    if (n > 0) out.push("");
    const first = bold(row[0] ?? "");
    if (first !== "") out.push(first);
    for (let c = 1; c < cols; c++) {
      const value = (row[c] ?? "").trim();
      if (value === "") continue;
      const name = label(header[c] ?? "");
      out.push(name === "" ? value : `${name}: ${value}`);
    }
  });
  return out.length > 0 ? out : [header.map(bold).filter(Boolean).join(" — ")];
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*[\w+#.-]*\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

interface Unit { kind: "pre" | "text" | "quote"; lines: string[] }

export function parseUnits(md: string): Unit[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const units: Unit[] = [];
  let text: string[] = [];
  const flushText = (): void => {
    while (text.length > 0 && text[text.length - 1]!.trim() === "") text.pop();
    while (text.length > 0 && text[0]!.trim() === "") text.shift();
    if (text.length > 0) units.push({ kind: "text", lines: text });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = FENCE.exec(line);
    if (fence) {
      flushText();
      const marker = fence[1]![0]!;
      const closing = new RegExp(`^\\s{0,3}${marker === "`" ? "`" : "~"}{${fence[1]!.length},}\\s*$`);
      const code: string[] = [];
      for (i++; i < lines.length && !closing.test(lines[i]!); i++) code.push(lines[i]!);
      units.push({ kind: "pre", lines: code });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!) && lines[i + 1]!.includes("-")) {
      flushText();
      const rows = [splitCells(line)];
      let j = i + 2;
      for (; j < lines.length && lines[j]!.includes("|") && lines[j]!.trim() !== ""; j++) rows.push(splitCells(lines[j]!));
      i = j - 1;
      units.push({ kind: "text", lines: tableLines(rows) });
      continue;
    }
    if (QUOTE.test(line)) {
      flushText();
      const q: string[] = [];
      let j = i;
      for (; j < lines.length && QUOTE.test(lines[j]!); j++) q.push(QUOTE.exec(lines[j]!)![1]!);
      i = j - 1;
      units.push({ kind: "quote", lines: q });
      continue;
    }
    if (line.trim() === "" && text.length > 0 && text[text.length - 1]!.trim() === "") continue; // 빈 줄은 하나로
    text.push(line);
  }
  flushText();
  return units;
}

/** 한 줄이 너무 길면 공백에서 잘라(없으면 문자 수로) 조각마다 따로 변환한다. 조각은 줄바꿈 없이 이어 붙는다 */
function splitLongLine(raw: string, maxRaw: number): string[] {
  const out: string[] = [];
  let rest = raw;
  while (rest.length > maxRaw) {
    let cut = rest.lastIndexOf(" ", maxRaw);
    if (cut < maxRaw / 2) cut = maxRaw;
    const code = rest.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut--; // 서로게이트 쌍을 끊지 않는다
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  out.push(rest);
  return out;
}

function unitChunks(unit: Unit, max: number): string[] {
  if (unit.kind === "pre") return splitRaw(unit.lines.join("\n"), max - 20).map((c) => `<pre>${escapeHtml(c)}</pre>`);
  const [open, close] = unit.kind === "quote" ? ["<blockquote>", "</blockquote>"] : ["", ""];
  const room = max - open.length - close.length;
  const items: { html: string; glue: string }[] = [];
  for (const line of unit.lines) {
    const html = renderLine(line);
    if (html.length <= room) { items.push({ html, glue: "\n" }); continue; }
    splitLongLine(line, 600).forEach((piece, k) => items.push({ html: k === 0 ? renderLine(piece) : inline(piece), glue: k === 0 ? "\n" : "" }));
  }
  const out: string[] = [];
  let cur: string | null = null;
  for (const it of items) {
    if (cur === null) cur = it.html;
    else if (cur.length + it.glue.length + it.html.length > room) { out.push(cur); cur = it.html; }
    else cur += it.glue + it.html;
  }
  if (cur !== null) out.push(cur);
  return out.map((c) => `${open}${c}${close}`);
}

/** 마크다운 원문 → HTML 조각들. 각 조각은 max자 이하이고 태그가 모두 닫혀 있다 */
export function markdownChunks(md: string, max = CHUNK_MAX): string[] {
  const out: string[] = [];
  let cur = "";
  for (const unit of parseUnits(md)) {
    for (const html of unitChunks(unit, max)) {
      if (cur !== "" && cur.length + 1 + html.length > max) { out.push(cur); cur = html; }
      else cur = cur === "" ? html : `${cur}\n${html}`;
    }
  }
  if (cur !== "") out.push(cur);
  return out.map((c) => (tagsBalanced(c) ? c : escapeHtml(plainFromHtml(c))));
}
