import { accessSync, constants, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";
import { getString, parseFrontmatter, stringifyFrontmatter, type Frontmatter } from "../core/frontmatter.ts";
import { today, writeFileAtomic } from "../core/fsutil.ts";
import { redactSecrets } from "../project/secrets.ts";

export class ScoutError extends Error {}

export type SourceKind = "article" | "blog" | "video";
/**
 * 본문을 얻은 경로: fetch(명령이 받음 — 영상은 공개 자막 주소나 yt-dlp) · browser(LLM 도구의 브라우저로 화면을 읽음 — 영상 '스크립트 표시' 패널)
 * · web-read(LLM 도구 웹 읽기) · pasted(사용자가 붙여넣음) · description(영상 설명란만 — 자막이 정말 없을 때).
 */
export type SourceMethod = "fetch" | "browser" | "web-read" | "pasted" | "description";

export interface SourceMeta {
  id: string;
  url: string;
  title: string;
  author: string;
  published: string;
  accessed: string;
  kind: SourceKind;
  method: SourceMethod;
}

export interface Source {
  meta: SourceMeta;
  body: string;
}

const KINDS: SourceKind[] = ["article", "blog", "video"];
const METHODS: SourceMethod[] = ["fetch", "browser", "web-read", "pasted", "description"];
const ID = /^S(\d+)\.md$/;
export const MAX_BYTES = 5 * 1024 * 1024;
export const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;
const UA = "Mozilla/5.0 (compatible; pace-scout/2; +https://github.com)";

// ── 저장 형식 ───────────────────────────────────────────────────────

export function sourcesDir(run: string): string {
  return join(run, "sources");
}

/** 실행 폴더의 sources/ — 심볼릭 링크면 거부한다(실행 폴더 밖 쓰기 방지). */
function ensureSourcesDir(run: string): string {
  if (!existsSync(join(run, "BACKLOG.md"))) throw new ScoutError(`탐색 실행 폴더가 아니다(BACKLOG.md 없음): ${run}`);
  const dir = sourcesDir(run);
  if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new ScoutError("sources/ 심볼릭 링크는 쓸 수 없다");
  return dir;
}

export function nextSourceId(run: string): string {
  const dir = sourcesDir(run);
  const nums = existsSync(dir) ? readdirSync(dir).map((n) => ID.exec(n)).filter((m) => m !== null).map((m) => Number(m![1])) : [];
  return `S${Math.max(0, ...nums) + 1}`;
}

export function formatSource(source: Source): string {
  const { meta } = source;
  const data: Frontmatter = { ...meta };
  return stringifyFrontmatter(data, `\n${redactSecrets(source.body).trim()}\n`);
}

export function parseSource(text: string): Source {
  const { data, body } = parseFrontmatter(text);
  const meta = {} as Record<keyof SourceMeta, string>;
  for (const key of ["id", "url", "title", "author", "published", "accessed", "kind", "method"] as const) meta[key] = getString(data, key);
  return { meta: meta as SourceMeta, body: body.trim() };
}

export function readSources(run: string): Source[] {
  const dir = sourcesDir(run);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => ID.test(n))
    .sort((a, b) => Number(ID.exec(a)![1]) - Number(ID.exec(b)![1]))
    .map((n) => {
      const source = parseSource(readFileSync(join(dir, n), "utf8"));
      // 번호는 파일 이름이 정본 — 머리말 id가 손상돼도 다른 경로를 가리키지 않는다.
      return { ...source, meta: { ...source.meta, id: n.slice(0, -3) } };
    });
}

// ── HTML에서 메타·본문 뽑기 ─────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function oneLine(text: string): string {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

/** <meta property|name|itemprop="key" content="…">의 content. 여러 키 중 처음 찾은 것. */
function metaContent(html: string, keys: string[]): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop") ?? "").toLowerCase();
    if (keys.includes(key)) {
      const content = attr(tag, "content");
      if (content && content.trim()) return oneLine(content);
    }
  }
  return "";
}

/** JSON-LD의 datePublished·author.name — 형식이 깨졌으면 무시한다. */
function jsonLd(html: string): { published: string; author: string } {
  const out = { published: "", author: "" };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!);
    } catch {
      continue;
    }
    const stack: unknown[] = [data];
    while (stack.length > 0 && (!out.published || !out.author)) {
      const node = stack.pop();
      if (Array.isArray(node)) stack.push(...node);
      else if (node && typeof node === "object") {
        const o = node as Record<string, unknown>;
        if (!out.published && typeof o.datePublished === "string") out.published = o.datePublished;
        if (!out.author) {
          const a = Array.isArray(o.author) ? o.author[0] : o.author;
          if (typeof a === "string") out.author = a;
          else if (a && typeof a === "object" && typeof (a as Record<string, unknown>).name === "string") out.author = (a as Record<string, string>).name!;
        }
        if (o["@graph"]) stack.push(o["@graph"]);
      }
    }
  }
  return { published: oneLine(out.published), author: oneLine(out.author) };
}

/** HTML 조각을 읽을 글로. 스크립트·스타일·탐색·꾸밈 영역은 버리고 블록 경계는 줄바꿈으로. */
export function htmlToText(html: string): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of ["script", "style", "noscript", "svg", "nav", "header", "footer", "aside", "form", "iframe", "template", "button"]) s = dropBlocks(s, tag);
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<li\b[^>]*>/gi, "\n- ").replace(/<\/?(p|div|h[1-6]|li|tr|blockquote|section|article|pre|figcaption|dd|dt)\b[^>]*>/gi, "\n");
  s = decodeEntities(s.replace(/<[^>]+>/g, ""));
  return s.split("\n").map((line) => line.replace(/[ \t ]+/g, " ").trim()).filter((line) => line.length > 0).join("\n");
}

/**
 * <tag …>…</tag>를 지운다. 앞으로만 훑어 선형 시간 — 닫히지 않은 태그가 많은 페이지에서도 멈추지 않는다.
 * 닫는 태그가 없으면 여는 태그만 지운다.
 */
function dropBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  const open = `<${tag}`;
  const close = `</${tag}`;
  let out = "";
  let at = 0;
  let next = -2; // 다음 닫는 태그 위치(-1이면 더 없음, -2는 아직 모름) — 다시 찾지 않아 선형 시간을 지킨다.
  for (;;) {
    let start = lower.indexOf(open, at);
    while (start >= 0 && /[a-z0-9-]/.test(lower[start + open.length] ?? "")) start = lower.indexOf(open, start + 1);
    if (start < 0) break;
    out += html.slice(at, start) + " ";
    if (next !== -1 && next < start) next = lower.indexOf(close, start);
    const end = next;
    const gt = lower.indexOf(">", end >= 0 ? end : start);
    if (gt < 0) return out;
    at = gt + 1;
  }
  return out + html.slice(at);
}

function region(html: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*)<\\/${tag}\\s*>`, "i").exec(html);
  return m ? m[1]! : null;
}

export interface Extracted {
  title: string;
  author: string;
  published: string;
  text: string;
}

export function extractArticle(html: string): Extracted {
  const ld = jsonLd(html);
  const title = metaContent(html, ["og:title", "twitter:title"]) || oneLine(region(html, "title") ?? "") || oneLine(htmlToText(region(html, "h1") ?? ""));
  const author = metaContent(html, ["author", "article:author", "byl", "dable:author"]) || ld.author;
  const time = /<time\b[^>]*>/i.exec(html);
  const published = metaContent(html, ["article:published_time", "datepublished", "date", "pubdate", "og:published_time", "dc.date"]) || ld.published || (time ? oneLine(attr(time[0], "datetime") ?? "") : "");
  const body = region(html, "article") ?? region(html, "main") ?? region(html, "body") ?? html;
  return { title, author, published, text: htmlToText(body) };
}

/** 유튜브 시청 페이지의 공개 메타(제목·채널·게시일·설명란). 자막은 받지 않는다(U4). */
export function extractYouTube(html: string): Extracted {
  const title = metaContent(html, ["og:title", "name", "title"]) || oneLine(region(html, "title") ?? "").replace(/ - YouTube$/, "");
  const author = oneLine(/<link\b[^>]*itemprop=["']name["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? "") || metaContent(html, ["author"]);
  const published = metaContent(html, ["datepublished", "uploaddate"]);
  let description = "";
  const m = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(html);
  if (m) {
    try {
      description = JSON.parse(`"${m[1]}"`) as string;
    } catch {
      description = "";
    }
  }
  if (!description) description = metaContent(html, ["og:description", "description"]);
  return { title, author, published, text: description.trim() };
}

/** 시청 페이지가 알려 주는 공개 자막 트랙 주소들(수동 자막 먼저, 자동 생성은 뒤). 없으면 빈 배열. */
export function captionTracks(html: string): string[] {
  const start = html.indexOf('"captionTracks":[');
  if (start < 0) return [];
  // 트랙 안에도 대괄호(name.runs)가 있으므로 짝을 맞춰 배열 끝을 찾는다(문자열 안은 건너뜀).
  const from = start + '"captionTracks":'.length;
  let depth = 0;
  let end = -1;
  let inString = false;
  for (let i = from; i < html.length && end < 0; i++) {
    const ch = html[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) end = i + 1;
  }
  if (end < 0) return [];
  let tracks: { baseUrl?: string; kind?: string }[];
  try {
    tracks = JSON.parse(html.slice(from, end)) as { baseUrl?: string; kind?: string }[];
  } catch {
    return [];
  }
  return tracks
    .filter((t) => typeof t.baseUrl === "string")
    .sort((a, b) => Number(a.kind === "asr") - Number(b.kind === "asr"))
    .map((t) => t.baseUrl!);
}

function stamp(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 자막 XML(`<text start=…>`) 또는 WebVTT를 `[mm:ss] 글` 줄로. 알아볼 수 없으면 빈 글. */
export function parseCaptions(raw: string): string {
  const lines: string[] = [];
  for (const m of raw.matchAll(/<text\b[^>]*\bstart="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)) {
    const text = decodeEntities(decodeEntities(m[2]!.replace(/<[^>]+>/g, ""))).replace(/\s+/g, " ").trim();
    if (text) lines.push(`[${stamp(Number(m[1]))}] ${text}`);
  }
  if (lines.length > 0) return lines.join("\n");
  if (!/^WEBVTT/.test(raw.trimStart())) return "";
  // 유튜브 자동 자막은 "굴러가는" 형식이다 — 큐마다 앞 줄을 되풀이하고 새 말은 글자 시간 태그(<00:00:01.000>)가 붙은 줄에만 있다.
  const rolling = /<\d{2}:\d{2}:\d{2}\.\d{3}>/.test(raw);
  let last = "";
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const cue = /(?:(\d+):)?(\d{2}):(\d{2})\.\d{3}\s+-->/.exec(block);
    if (!cue) continue;
    const body = block.split(/\r?\n/).filter((l) => !/-->/.test(l) && !/^\d+$/.test(l.trim()));
    const fresh = rolling ? body.filter((l) => /<\d{2}:\d{2}:\d{2}\.\d{3}>/.test(l)) : body;
    const text = fresh.join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!text || text === last) continue;
    last = text;
    lines.push(`[${stamp(Number(cue[1] ?? 0) * 3600 + Number(cue[2]) * 60 + Number(cue[3]))}] ${text}`);
  }
  return lines.join("\n");
}

export function isYouTube(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  return host === "youtube.com" || host === "youtu.be";
}

const BLOG_HOSTS = /(^|\.)(medium\.com|substack\.com|tistory\.com|brunch\.co\.kr|velog\.io|wordpress\.com|blogspot\.com|ghost\.io|hashnode\.dev)$|^blog\.|(^|\.)blog\.naver\.com$/;

export function guessKind(url: URL): SourceKind {
  if (isYouTube(url)) return "video";
  return BLOG_HOSTS.test(url.hostname.toLowerCase()) || /\/blog(\/|$)/i.test(url.pathname) ? "blog" : "article";
}

// ── 받기와 저장 ─────────────────────────────────────────────────────

export function parseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ScoutError(`URL이 아니다: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ScoutError(`http·https URL만 받는다: ${raw}`);
  if (url.username || url.password) throw new ScoutError("자격 증명이 든 URL은 받지 않는다");
  const query = url.search + url.hash;
  if (redactSecrets(query) !== query) throw new ScoutError("비밀로 보이는 값이 든 URL은 받지 않는다 — 쿼리에서 빼고 다시 준다");
  return url;
}

/**
 * 내부 주소(localhost·사설·링크 로컬·루프백 IP)인가. 주제 검색에서 고른 링크나 출처 속 지시로 내부 망을 읽지 않게 한다.
 * 이름 풀이 뒤의 주소(DNS 재바인딩)까지는 보지 않는다.
 */
export function isInternalHost(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (host.includes(":")) return host === "::1" || host === "::" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:");
  return false;
}

/** GET 한 번. 시간 제한·크기 상한·HTML/텍스트만. 리다이렉트 뒤 주소도 http(s)인지 본다. */
export interface FetchOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  /** 내부 주소 허용 — 테스트·사용자가 명시할 때만(--allow-local). */
  allowLocal?: boolean;
}

/** GET 한 번. 시간 제한(본문 읽기까지)·크기 상한·HTML/텍스트만. 리다이렉트 뒤 주소도 다시 검사한다. 받기 중 오류는 모두 ScoutError. */
export async function fetchText(url: URL, options: FetchOptions = {}): Promise<string> {
  try {
    return await fetchTextOnce(url, options);
  } catch (error) {
    if (error instanceof ScoutError) throw error;
    throw new ScoutError(`받지 못했다: ${(error as Error).message}`);
  }
}

async function fetchTextOnce(url: URL, options: FetchOptions): Promise<string> {
  const doFetch = options.fetch ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const signal = AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS);
  // 리다이렉트는 직접 따라가며 홉마다 요청 전에 검사한다 — 내부 주소로는 요청 자체를 보내지 않는다.
  let target = url;
  let response: Response;
  for (let hop = 0; ; hop++) {
    if (!options.allowLocal && isInternalHost(target)) throw new ScoutError(`${hop === 0 ? "내부 주소는 받지 않는다" : "내부 주소로 리다이렉트됐다"}: ${target.hostname}`);
    response = await doFetch(target, { redirect: "manual", signal, headers: { "user-agent": UA, accept: "text/html,text/plain;q=0.9" } });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (location === null) break;
    if (hop >= MAX_REDIRECTS) throw new ScoutError(`리다이렉트가 ${MAX_REDIRECTS}번을 넘는다`);
    await response.body?.cancel();
    target = parseUrl(new URL(location, target).href);
  }
  if (!response.ok) throw new ScoutError(`받지 못했다: HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (type && !/^(text\/html|text\/plain|application\/xhtml\+xml|text\/xml|application\/xml|text\/vtt)/i.test(type)) throw new ScoutError(`HTML·텍스트가 아니다: ${type}`);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ScoutError(`크기 상한(${maxBytes}바이트)을 넘는다`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new ScoutError(`크기 상한(${maxBytes}바이트)을 넘는다`);
      chunks.push(chunk);
    }
  }
  return new TextDecoder(charset(type, chunks)).decode(Buffer.concat(chunks));
}

/** content-type 또는 문서 앞부분의 <meta charset>. 모르는 이름이면 UTF-8. */
function charset(type: string, chunks: Uint8Array[]): string {
  const head = new TextDecoder("latin1").decode(chunks[0]?.subarray(0, 2048) ?? new Uint8Array());
  const name = (/charset=["']?([\w-]+)/i.exec(type)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? "utf-8").toLowerCase();
  try {
    // 바이트로 받은 HTML의 utf-16 선언은 믿지 않는다(본문이 깨진다).
    return new TextDecoder(name).encoding.startsWith("utf-16") ? "utf-8" : name;
  } catch {
    return "utf-8";
  }
}

/** 링크 하나를 받아 출처 내용으로. 영상은 자막을 먼저 받고(공개 자막 주소 → yt-dlp), 못 받으면 설명란(method description)과 실패 이유(notes)를 돌려준다. */
type YtDlp = string | { command: string; args: string[] };

export async function fetchSource(raw: string, options: FetchOptions & { kind?: SourceKind; date?: string; ytDlp?: YtDlp | null } = {}): Promise<Omit<SourceMeta, "id"> & { body: string; notes?: string[] }> {
  const url = parseUrl(raw);
  const html = await fetchText(url, options);
  const video = isYouTube(url);
  const got = video ? extractYouTube(html) : extractArticle(html);
  if (!video && got.text.length === 0) throw new ScoutError("본문을 찾지 못했다 — 웹 읽기로 얻어 pace scout add로 저장한다");
  // 영상은 자막이 먼저다(D15): ① 공개 자막 주소 ② yt-dlp(있으면). 둘 다 못 얻으면 설명란으로 두고 브라우저·붙여넣기를 안내한다.
  const notes: string[] = [];
  const transcript = video ? await fetchTranscript(html, url, options, notes) : "";
  return {
    url: url.href,
    title: got.title || url.href,
    author: got.author,
    published: got.published,
    accessed: options.date ?? today(),
    kind: options.kind ?? guessKind(url),
    method: video && !transcript ? "description" : "fetch",
    // 설명란도 빈 영상은 멈추지 않고 자리 글로 저장한다 — 자막은 add --replace로 붙인다.
    body: transcript || got.text || (video ? "(설명란 없음 — 자막을 붙여 넣는다)" : got.text),
    ...(video && !transcript && notes.length > 0 ? { notes } : {}),
  };
}

/** 영상 자막을 받는다. 차단 회피(토큰 흉내·내부 API)는 하지 않는다 — 공개 주소와 사용자가 설치한 yt-dlp만. */
async function fetchTranscript(html: string, url: URL, options: FetchOptions & { ytDlp?: YtDlp | null }, notes: string[]): Promise<string> {
  const tracks = captionTracks(html).slice(0, 2);
  if (tracks.length === 0) notes.push("공개 자막 트랙 없음");
  for (const track of tracks) {
    try {
      const text = parseCaptions(await fetchText(parseUrl(track), options));
      if (text) return text;
      notes.push("공개 자막 주소가 빈 응답");
    } catch (error) {
      notes.push(`공개 자막 주소 실패(${(error as Error).message})`);
    }
  }
  const ytDlp = options.ytDlp === undefined ? findOnPath("yt-dlp") : options.ytDlp;
  if (!ytDlp) {
    notes.push("yt-dlp 없음");
    return "";
  }
  const text = captionsWithYtDlp(ytDlp, url.href);
  if (!text) notes.push("yt-dlp로도 자막 없음");
  return text;
}

/** PATH에서 실행 파일을 찾는다(설치는 하지 않는다). */
export function findOnPath(name: string, path = process.env.PATH ?? ""): string | null {
  for (const dir of path.split(delimiter)) {
    // 상대 항목(".")은 보지 않는다 — 현재 폴더에 심은 같은 이름 파일을 실행하지 않게.
    if (!dir || !isAbsolute(dir)) continue;
    // Windows에서 확장자 없는 스크립트는 직접 실행되지 않는다. 셸을 거치지 않는 실행 파일만 고른다.
    const names = process.platform === "win32" ? (/\.(?:exe|com)$/i.test(name) ? [name] : [`${name}.exe`, `${name}.com`]) : [name];
    for (const candidate of names) {
      const file = join(dir, candidate);
      try {
        if (statSync(file).isFile()) {
          accessSync(file, constants.X_OK);
          return file;
        }
      } catch {
        // 없거나 실행할 수 없다
      }
    }
  }
  return null;
}

/** yt-dlp로 자막만 받아(영상은 받지 않음) 임시 폴더의 VTT를 읽는다. 실패하면 빈 글. */
export function captionsWithYtDlp(bin: YtDlp, url: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pace-scout-subs-"));
  // 원문만 받는다: 먼저 사람이 단 자막(ko·en), 없으면 영상 원어의 자동 자막(*-orig) — 자동 번역 트랙은 받지 않는다.
  // 사용자 설정(쿠키·로그인)을 읽지 않고, 재생목록이 아니라 영상 하나만.
  const base = ["--ignore-config", "--no-playlist", "--skip-download", "--sub-format", "vtt", "-o", join(dir, "subs")];
  try {
    for (const [i, pass] of [["--write-subs", "--sub-langs", "ko,en"], ["--write-auto-subs", "--sub-langs", ".*-orig"]].entries()) {
      // 종료 코드와 상관없이 받은 파일이 있으면 읽는다(일부 트랙 실패로 비0이 될 수 있다).
      const command = typeof bin === "string" ? bin : bin.command;
      const prefix = typeof bin === "string" ? [] : bin.args;
      spawnSync(command, [...prefix, ...base, ...pass, "--", url], { encoding: "utf8", timeout: 120_000 });
      const files = readdirSync(dir).filter((n) => n.endsWith(".vtt"));
      const pick = i === 0 ? (files.find((n) => n.endsWith(".ko.vtt")) ?? files.find((n) => n.endsWith(".en.vtt"))) : files.find((n) => /-orig\.vtt$/.test(n));
      if (pick) {
        const text = parseCaptions(readFileSync(join(dir, pick), "utf8"));
        if (text) return text;
      }
    }
    return "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 링크 여럿을 받아 차례로 저장한다. 실패한 링크는 이유를 알리고 나머지는 계속한다.
 * 영상이 설명란만 저장되면 다음 수집 경로(브라우저·붙여넣기)를 안내한다. 실패 수를 돌려준다.
 */
export async function fetchSources(run: string, urls: string[], options: FetchOptions & { kind?: SourceKind; ytDlp?: YtDlp | null }, out: { saved: (path: string) => void; note: (message: string) => void }): Promise<number> {
  let failed = 0;
  for (const url of urls) {
    try {
      const { body, notes, ...meta } = await fetchSource(url, options);
      const path = saveSource(run, meta, body);
      out.saved(path);
      if (meta.method === "description") out.note(`${url} — ${notes?.length ? `${notes.join(", ")}. ` : ""}${transcriptHint(run, basename(path, ".md"))}`);
    } catch (error) {
      if (!(error instanceof ScoutError)) throw error;
      failed++;
      out.note(`${url} — ${error.message}`);
    }
  }
  return failed;
}

/** 설명란만 저장한 영상에 자막을 붙이는 다음 경로 안내(따옴표로 감싼 경로). */
export function transcriptHint(run: string, id: string): string {
  const dir = `'${run.replaceAll("'", "'\\''")}'`;
  return `자막을 받지 못해 설명란만 저장했다. 다음은 pace scout transcript ${dir} ${id}(일반 브라우저로 '스크립트 표시' 읽기), 안 되면 LLM 도구 브라우저로 읽어 pace scout add ${dir} --replace ${id} --method browser, 그래도 안 되면 사용자에게 붙여넣기를 받아 --method pasted (yt-dlp를 설치하면 fetch가 직접 받는다)`;
}

/**
 * 실행 폴더에 다음 번호로 저장한다. 같은 URL이 이미 있으면 거부한다.
 * replace(S#)면 그 출처의 번호를 유지하고 본문·주어진 메타로 바꾼다 — 설명란만 받은 영상에 자막을 붙일 때.
 */
export function saveSource(run: string, meta: Omit<SourceMeta, "id">, body: string, replace?: string): string {
  const dir = ensureSourcesDir(run);
  if (!KINDS.includes(meta.kind)) throw new ScoutError(`출처 종류는 ${KINDS.join("·")}: ${meta.kind}`);
  if (!METHODS.includes(meta.method)) throw new ScoutError(`수집 경로는 ${METHODS.join("·")}: ${meta.method}`);
  const url = parseUrl(meta.url).href;
  const sources = readSources(run);
  let id: string;
  if (replace !== undefined) {
    if (!/^S\d+$/.test(replace) || !sources.some((s) => s.meta.id === replace)) throw new ScoutError(`바꿀 출처가 없다: ${replace}`);
    const other = sources.find((s) => s.meta.url === url && s.meta.id !== replace);
    if (other) throw new ScoutError(`같은 URL의 출처가 따로 있다: ${other.meta.id}`);
    id = replace;
  } else {
    const existing = sources.find((s) => s.meta.url === url);
    if (existing) throw new ScoutError(`이미 저장한 출처다: ${existing.meta.id} ${url} — 본문을 바꾸려면 --replace ${existing.meta.id}`);
    id = nextSourceId(run);
  }
  if (body.trim() === "") throw new ScoutError("본문이 비었다");
  const path = join(dir, `${id}.md`);
  const clean = (value: string) => redactSecrets(value).replace(/\s+/g, " ").trim();
  writeFileAtomic(path, formatSource({ meta: { id, url, title: clean(meta.title), author: clean(meta.author), published: clean(meta.published), accessed: meta.accessed, kind: meta.kind, method: meta.method }, body }));
  ensureIgnore(run);
  return path;
}

const STAMP = /^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?(?:\s+(.*))?$/;

/** 자막을 `[mm:ss] 글` 줄로. 유튜브 "스크립트 표시"를 복사하면 시간과 글이 따로 줄에 오므로 합친다. 시간이 없으면 그대로. */
export function normalizeTranscript(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (!lines.some((l) => STAMP.test(l))) return lines.join("\n");
  const out: string[] = [];
  let stamp: string | null = null;
  for (const line of lines) {
    const m = STAMP.exec(line);
    if (m) {
      if (stamp !== null && m[2] === undefined) out.push(`[${stamp}]`);
      stamp = m[1]!.padStart(m[1]!.length < 5 ? 5 : m[1]!.length, "0");
      if (m[2] !== undefined) {
        out.push(`[${stamp}] ${m[2]}`);
        stamp = null;
      }
    } else if (stamp !== null) {
      out.push(`[${stamp}] ${line}`);
      stamp = null;
    } else if (out.length > 0) out[out.length - 1] += ` ${line}`;
    else out.push(line);
  }
  return out.join("\n");
}

/** U2: 전체 원문(sources/)은 git에 넣지 않는다 — 보고서의 인용 발췌만 커밋된다. */
function ensureIgnore(run: string): void {
  const path = join(run, ".gitignore");
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (!/^sources\/$/m.test(text)) writeFileAtomic(path, `${text}${text && !text.endsWith("\n") ? "\n" : ""}sources/\n`);
}
