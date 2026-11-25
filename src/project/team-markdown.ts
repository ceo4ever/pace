import { HandoffError } from "./handoff-files.ts";

const opaque = "<!-- opaque block -->";
const blank = (line: string) => /^[ \t]*$/.test(line);
// CommonMark 0.31.2 §4.6: block starts differ from complete inline tags.
const blockTags = new Set("address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul".split(" "));
const rawTags = new Set(["pre", "script", "style", "textarea"]);
const attribute = String.raw`(?:[ \t]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t]*=[ \t]*(?:"[^"]*"|'[^']*'|[^\s"'=<>\x60]+))?)*`;
const openTag = new RegExp(String.raw`^ {0,3}<([A-Za-z][A-Za-z0-9-]*)${attribute}[ \t]*/?>[ \t]*$`);
const closeTag = /^ {0,3}<\/([A-Za-z][A-Za-z0-9-]*)[ \t]*>[ \t]*$/;
function htmlStart(line: string, blockReady: boolean, cautious: boolean): { kind: string; uncertain: boolean } | null {
  const raw = /^ {0,3}<(pre|script|style|textarea)(?=[ \t>]|\/>|$)/i.exec(line);
  if (raw) return { kind: `raw:${raw[1]!.toLowerCase()}`, uncertain: false };
  if (/^ {0,3}<!--/.test(line)) return { kind: "comment", uncertain: false };
  if (/^ {0,3}<\?/.test(line)) return { kind: "pi", uncertain: false };
  if (/^ {0,3}<![A-Za-z]/.test(line)) return { kind: "declaration", uncertain: false };
  if (/^ {0,3}<!\[CDATA\[/.test(line)) return { kind: "cdata", uncertain: false };
  const prefix = /^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?=[ \t>]|\/>|$)/.exec(line);
  if (prefix && blockTags.has(prefix[1]!.toLowerCase())) return { kind: "blank", uncertain: false };
  const opened = openTag.exec(line), closed = closeTag.exec(line);
  if ((closed || opened && !rawTags.has(opened[1]!.toLowerCase())) && (blockReady || cautious)) return { kind: "blank", uncertain: cautious };
  return null;
}
function htmlEnded(kind: string, line: string): boolean {
  return kind === "blank" ? blank(line) : kind.startsWith("raw:") ? line.toLowerCase().includes(`</${kind.slice(4)}>`) : kind === "comment" ? line.includes("-->") : kind === "pi" ? line.includes("?>") : kind === "cdata" ? line.includes("]]>") : line.includes(">");
}
const thematic = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const atx = /^ {0,3}(#{1,6})(?:[ \t]|$)/;
function indentColumns(line: string, column = 0): number {
  for (const char of line) {
    if (char === " ") column++;
    else if (char === "\t") column += 4 - column % 4;
    else break;
  }
  return column;
}
function listItem(line: string): { column: number; delimiter: string } | undefined {
  if (thematic.test(line)) return undefined;
  const marker = /^ {0,3}(?:[-+*]|[0-9]{1,9}[.)])(?=[ \t]|$)/.exec(line)?.[0];
  if (!marker) return undefined;
  const remainder = line.slice(marker.length);
  const content = indentColumns(remainder, marker.length);
  const column = blank(remainder) || content - marker.length > 4 ? marker.length + 1 : content;
  return { column, delimiter: marker.at(-1)! };
}
/** Projection for canonical metadata/ATX tables; uncertain standalone HTML ends a retrospective interval. */
export function teamMarkdown(text: string, scope: "header" | "retrospective", reportAmbiguity?: (message: string) => void): string {
  const headerOnly = scope === "header", atxOnly = scope === "retrospective";
  let fence: { char: string; length: number } | undefined, html: string | undefined, comment = false, indentedCode = false, blockReady = true, pipeBlock = false;
  let headerEnded = false, firstTitle = false, headerParagraph = false;
  let activeList: ReturnType<typeof listItem>;
  const ambiguity = (message: string) => {
    if (reportAmbiguity) reportAmbiguity(message);
    else throw new HandoffError(message);
  };
  const inline = (line: string): string => {
    let out = "", at = 0;
    while (at < line.length) {
      if (comment) {
        const end = line.indexOf("-->", at);
        if (end < 0) return out;
        at = end + 3; comment = false; out += " "; continue;
      }
      if (line[at] === "\\" && at + 1 < line.length) { out += line.slice(at, at + 2); at += 2; continue; }
      if (/^<\/?[a-z][a-z0-9-]*(?:\s|\/?>)/i.test(line.slice(at))) {
        let end = at + 1, quote = "";
        for (; end < line.length; end++) { const char = line[end]!; if (quote) { if (char === quote) quote = ""; } else if (char === "\"" || char === "'") quote = char; else if (char === ">") { end++; break; } }
        out += line.slice(at, end); at = end; continue;
      }
      if (line[at] === "`") {
        const run = /^`+/.exec(line.slice(at))![0]; let end = at + run.length;
        while ((end = line.indexOf(run, end)) >= 0) { if (line[end - 1] !== "`" && line[end + run.length] !== "`") break; end += run.length; }
        if (end >= 0) { out += "x".repeat(end + run.length - at); at = end + run.length; continue; }
        if (line.slice(at + run.length).includes("<!--")) ambiguity("팀 Markdown의 여러 줄/미완성 코드와 주석 혼합은 일반 텍스트로 정리한다");
        out += run; at += run.length; continue;
      }
      if (line.startsWith("<!--", at)) { comment = true; at += 4; out += " "; continue; }
      out += line[at++]!;
    }
    return out;
  };
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => {
    if (headerEnded) return "";
    const priorBlockReady = blockReady; blockReady = blank(line);
    const priorHeaderParagraph = headerParagraph; headerParagraph = false;
    const indentation = indentColumns(line);
    // Inline comments cannot escape their paragraph into a new block. Block comments use html above.
    const interrupt = blank(line) || atx.test(line) || thematic.test(line) || /^ {0,3}(?:`{3,}|~{3,}|>|[-+*][ \t]+\S|0{0,8}1[.)][ \t]+\S)/.test(line) || !!htmlStart(line, false, false);
    let withinList = false;
    const insideOpaqueBlock = fence !== undefined || html !== undefined;
    // An opaque block can end with its containing list; its contents cannot start a list.
    if (!blank(line) && (activeList !== undefined || !insideOpaqueBlock)) {
      const item = listItem(line);
      const sibling = item && item.delimiter === activeList?.delimiter;
      const lazyParagraph = !sibling && !priorBlockReady && !interrupt && !insideOpaqueBlock && !indentedCode;
      withinList = !!activeList && (indentation >= activeList.column || lazyParagraph);
      if (!withinList) {
        // A code or HTML block opened in a list item ends with that item.
        if (activeList) { fence = undefined; html = undefined; comment = false; indentedCode = false; }
        // An ordinary paragraph can only be interrupted by an allowed list opener.
        activeList = priorBlockReady || interrupt || sibling || insideOpaqueBlock ? item : undefined;
      }
    }
    if (!line.startsWith("|")) pipeBlock = false;
    if (fence) {
      const close = /^ {0,3}([`~]+)[ \t]*$/.exec(line);
      if (close && close[1]!.length >= fence.length && [...close[1]!].every((char) => char === fence!.char)) { fence = undefined; blockReady = true; }
      return opaque;
    }
    if (html) { if (htmlEnded(html, line)) { html = undefined; blockReady = true; } return opaque; }
    if (comment && interrupt) comment = false;
    if (!comment && indentation >= 4 && (priorBlockReady || indentedCode)) { indentedCode = true; blockReady = true; return opaque; }
    if (!comment && !blank(line)) indentedCode = false;
    if (headerOnly && !comment) {
      const heading = atx.exec(line);
      if (heading && !withinList) {
        if (heading[1]!.length > 1 || firstTitle) { headerEnded = true; return "## opaque boundary"; }
        firstTitle = true;
      }
    }
    if (!comment && /^ {1,3}#{1,6}(?:[ \t]|$)/.test(line)) return "<!-- unsupported indented heading -->";
    if (!comment) {
      const start = htmlStart(line, priorBlockReady, atxOnly);
      if (start) { html = htmlEnded(start.kind, line) ? undefined : start.kind; if (!html) blockReady = true; return start.uncertain ? "## opaque HTML boundary" : opaque; }
      const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (open && open[1]![0] === "`" && line.slice(open[0].length).includes("`")) ambiguity("팀 Markdown의 backtick fence 정보는 backtick을 포함할 수 없다");
      else if (open) { fence = { char: open[1]![0]!, length: open[1]!.length }; return opaque; }
    }
    const continuedInlineComment = comment, visible = inline(line);
    if (continuedInlineComment) return opaque;
    if (comment) return line;
    // Removing inline HTML must never invent a block marker absent in the source.
    if (atx.test(visible) && !atx.test(line)) return line;
    if (atx.test(visible)) blockReady = true;
    const separator = /^ {0,3}(?:=+|(?:-[ \t]*)+|(?:\*[ \t]*)+|(?:_[ \t]*)+)$/.test(visible);
    if (thematic.test(visible)) blockReady = true;
    if (atxOnly && separator) return "<!-- unsupported underline -->";
    if (headerOnly && /^ {0,3}(?:=+|-+)[ \t]*$/.test(visible)) {
      if (priorHeaderParagraph && !withinList) { headerEnded = true; return "## opaque boundary"; }
      return "<!-- opaque boundary -->";
    }
    if (atxOnly && line.startsWith("|")) {
      if (!pipeBlock && !priorBlockReady) return opaque;
      pipeBlock = true;
      return line;
    }
    headerParagraph = headerOnly && !activeList && !interrupt && indentation < 4 && !blank(visible);
    return visible;
  }).join("\n");
}
