import type { ApprovalKind, ApprovalPrompt, Block } from "../types.ts";
import { escapeHtml, markdownChunks, splitRaw } from "./markdown.ts";

export { escapeHtml, splitRaw };

// 블록 → Telegram HTML 메시지. 4096자 제한은 어댑터가 나눈다(코어는 richBlocks=true·maxLength=Infinity로 자르지 않는다).
// 분할은 이스케이프 전 원문을 줄 경계로 나눈 뒤 조각마다 따로 이스케이프·<pre>로 감싸 모든 조각의 태그가 닫히게 한다.
// 텍스트·카드 블록은 마크다운으로 보고 markdown.ts가 안전한 HTML 태그로 바꾼다(단위마다 따로 변환·태그 균형 검사, 실패하면 평문).

export const TG_MAX = 4096;
/** 한 블록의 원문이 이 길이를 넘으면 메시지 대신 파일로 첨부한다 */
export const LONG_BLOCK = 8000;
/** 조각 하나의 이스케이프 뒤 길이 상한 — `<pre>`·여백을 뺀 여유를 둔다 */
const CHUNK_ESCAPED = 3900;

interface Segment { pre: boolean; raw: string; md?: boolean }

export interface Rendered {
  /** 순서대로 보낼 HTML 메시지 */
  parts: string[];
  /** 파일로 첨부할 긴 출력(원문) */
  files: { name: string; content: string }[];
}

function tableText(header: string[], rows: string[][]): string {
  const all = [header, ...rows];
  const widths = header.map((_, c) => Math.max(...all.map((r) => (r[c] ?? "").length)));
  return all.map((r) => r.map((cell, c) => (cell ?? "").padEnd(widths[c] ?? 0)).join(" | ").trimEnd()).join("\n");
}

function toSegments(block: Block): { segs: Segment[]; fileName?: string; fileRaw?: string } {
  switch (block.type) {
    case "text": return { segs: [{ pre: false, md: true, raw: block.text }], fileRaw: block.text, fileName: "text.txt" };
    case "table": { const raw = tableText(block.header, block.rows); return { segs: [{ pre: true, raw }], fileRaw: raw, fileName: "table.txt" }; }
    case "code": return { segs: [{ pre: true, raw: block.text }], fileRaw: block.text, fileName: `code${block.lang ? `.${block.lang.replace(/[^A-Za-z0-9]/g, "")}` : ".txt"}` };
    case "diff": return { segs: [{ pre: true, raw: block.text }], fileRaw: block.text, fileName: "changes.diff" };
    case "card": return { segs: [{ pre: false, md: true, raw: `# ${block.title.replace(/\s+/g, " ")}\n${block.text}` }], fileRaw: `${block.title}\n${block.text}`, fileName: "card.txt" };
    case "chart": return { segs: [{ pre: false, raw: `[차트] ${block.title}` }] };
    case "file": return { segs: [{ pre: false, raw: `[파일] ${block.name ?? block.path}` }] };
  }
}

/** 블록들을 메시지 조각·첨부 파일로 만든다 */
export function renderBlocks(blocks: Block[], redact: (t: string) => string = (t) => t): Rendered {
  const parts: string[] = [];
  const files: { name: string; content: string }[] = [];
  let cur = "";
  const flush = (): void => { if (cur) { parts.push(cur); cur = ""; } };
  const push = (html: string): void => {
    if (cur && cur.length + 2 + html.length > TG_MAX) flush();
    cur = cur ? `${cur}\n\n${html}` : html;
  };
  let fileNo = 0;
  for (const block of blocks) {
    const { segs, fileRaw, fileName } = toSegments(block);
    const raw = segs[0]!.raw;
    if (raw.length > LONG_BLOCK && fileRaw !== undefined) {
      fileNo++;
      files.push({ name: `${fileNo}-${fileName ?? "output.txt"}`, content: redact(fileRaw) });
      push(escapeHtml(`(긴 출력 ${raw.length.toLocaleString("en-US")}자는 첨부 파일 ${fileNo}번으로 보냈습니다)`));
      continue;
    }
    for (const seg of segs) {
      const clean = redact(seg.raw);
      if (seg.md) { for (const html of markdownChunks(clean)) push(html); continue; }
      for (const chunk of splitRaw(clean)) {
        const esc = escapeHtml(chunk);
        push(seg.pre ? `<pre>${esc}</pre>` : esc);
      }
    }
  }
  flush();
  if (parts.length === 0) parts.push(escapeHtml("(내용 없음)"));
  return { parts, files };
}

function clamp(text: string, max: number): string { return text.length > max ? `${text.slice(0, max)}…(잘림)` : text; }

export const KIND_LABEL: Record<ApprovalKind, string> = { write_start: "쓰기 시작", tool: "도구 권한", handoff: "인계" };

/** 승인 요청 본문 — 종류·상세(도구 이름 포함)·범위·만료를 보여 준다 */
export function approvalText(p: ApprovalPrompt, redact: (t: string) => string = (t) => t): string {
  const mins = Math.max(0, Math.round((p.expiresAt - Date.now()) / 60000));
  return [
    `<b>승인 요청 — ${KIND_LABEL[p.kind]}</b>`,
    escapeHtml(clamp(redact(p.detail), 600)), // 긴 상세가 4096자를 넘겨 승인 버튼을 못 받는 일이 없게 자른다(전체 상세는 코어에 남아 있다)
    `대상: <code>${escapeHtml(clamp(redact(p.worktree), 300))}</code> (${p.access})`,
    `작업: <code>${escapeHtml(p.taskId)}</code> · 약 ${mins}분 안에 응답`,
  ].join("\n");
}

/** callback_data는 승인 ID뿐 — 형식 `a:<32hex>:y|n`(38바이트) */
export function callbackData(id: string, decision: "y" | "n"): string { return `a:${id}:${decision}`; }
export const CALLBACK_RE = /^a:([0-9a-f]{32}):(y|n)$/;

export function approvalKeyboard(id: string): { inline_keyboard: { text: string; callback_data: string }[][] } {
  return { inline_keyboard: [[{ text: "✅ 승인", callback_data: callbackData(id, "y") }, { text: "❌ 거부", callback_data: callbackData(id, "n") }]] };
}
