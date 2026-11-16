/**
 * 최소 YAML frontmatter 파서. PACE 파일이 쓰는 형태만 지원한다:
 * `key: scalar`, `key: [a, b]`, `key:` 다음 줄의 `- item` 목록(들여쓰기 있든 없든). 주석(#)과 빈 줄은 무시한다.
 */
export type FrontmatterValue = string | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export interface Parsed {
  data: Frontmatter;
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function parseFrontmatter(text: string): Parsed {
  const match = FENCE.exec(text);
  if (!match) return { data: {}, body: text };
  return { data: parseYamlLite(match[1] ?? ""), body: text.slice(match[0].length) };
}

export function parseYamlLite(source: string): Frontmatter {
  const data: Frontmatter = {};
  let listKey: string | null = null;
  for (const raw of source.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (line.trim().length === 0) continue;
    // 목록 항목은 들여쓰기가 없어도 된다(v1 브레인 페이지가 `- tag` 형식).
    const item = /^\s*-(?:\s+(.*))?$/.exec(line);
    if (item && listKey !== null) {
      (data[listKey] as string[]).push(unquote(item[1] ?? ""));
      continue;
    }
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1] as string;
    const value = (pair[2] ?? "").trim();
    if (value === "") {
      data[key] = [];
      listKey = key;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      data[key] = inner === "" ? [] : inner.split(",").map((v) => unquote(v.trim()));
      listKey = null;
    } else {
      data[key] = unquote(value);
      listKey = null;
    }
  }
  return data;
}

export function stringifyFrontmatter(data: Frontmatter, body: string): string {
  const lines = Object.entries(data).map(([key, value]) =>
    Array.isArray(value) ? `${key}: [${value.map(quoteIfNeeded).join(", ")}]` : `${key}: ${quoteIfNeeded(value)}`,
  );
  return `---\n${lines.join("\n")}\n---\n${body.startsWith("\n") ? body : `\n${body}`}`;
}

export function getString(data: Frontmatter, key: string, fallback = ""): string {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}

export function getList(data: Frontmatter, key: string): string[] {
  const value = data[key];
  if (Array.isArray(value)) return value;
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

function stripComment(line: string): string {
  // 따옴표 밖의 " #" 이후를 주석으로 본다.
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1] ?? ""))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function unquote(value: string): string {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
    const inner = value.slice(1, -1);
    return value[0] === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : inner.replace(/''/g, "'");
  }
  return value;
}

function quoteIfNeeded(value: string): string {
  if (value === "" || /^[\s\-[\]{}#&*!|>'"%@`]|:\s|\s#|,|\s$/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}
