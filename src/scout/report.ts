import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fillTemplate, writeFileAtomic } from "../core/fsutil.ts";
import { templatesDir } from "../core/paths.ts";
import { validate, type Schema } from "./schema.ts";
import { ScoutError } from "./source.ts";

// ── report.json 모양 (schema와 같은 이름) ───────────────────────────

export interface Claim { type: "fact" | "opinion"; text: string; quote?: string; time?: string; who?: string }
export interface ReportSource { id: string; title: string; url: string; kind: string; published: string; accessed: string; credibility: string; summary: string; claims: Claim[] }
export interface Signal { id: string; type: string; title: string; description: string; evidence: string[]; agreement: string; conflict?: string }
export interface Idea { id: string; name: string; problem: string; customer: string; solution: string; revenue: string; signals: string[]; kill_assumptions: string[]; estimates?: string[] }
export interface Criterion { id: string; name: string; weight: number }
export interface Score { idea: string; criterion: string; score: number; reason: string; refs: string[]; estimate: boolean }
export interface Check { id: string; name: string; status: "pass" | "fail" | "unknown"; detail?: string }
export interface Report {
  version: 1;
  meta: { title: string; created: string; input: { kind: string; topic?: string; links?: string[] }; note?: string };
  summary: { recommendation: string; reasons: string[]; biggest_assumption: string };
  sources: ReportSource[];
  signals: Signal[];
  ideas: Idea[];
  criteria: Criterion[];
  scores: Score[];
  next_steps: { experiment: { idea: string; what: string; cost: string; success: string }; cards?: string[] };
  unverified: string[];
  dropped?: { name: string; reason: string }[];
  verification?: { run: string; checks: Check[] };
}

export const schemaPath = join(templatesDir, "scout", "report.schema.json");
const templatePath = join(templatesDir, "scout", "report-template.html");

export function loadSchema(): Schema {
  return JSON.parse(readFileSync(schemaPath, "utf8")) as Schema;
}

/** 실행 폴더의 report.json을 읽고 schema로 검사한다. 어긋나면 칸 이름을 모두 담아 실패한다. */
export function readReport(run: string): Report {
  const path = join(run, "report.json");
  if (!existsSync(path)) throw new ScoutError(`report.json이 없다: ${path}`);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ScoutError(`report.json이 JSON이 아니다: ${(error as Error).message}`);
  }
  const errors = validate(loadSchema(), data);
  if (errors.length > 0) throw new ScoutError(`report.json이 schema에 맞지 않다 — 렌더하지 않는다:\n${errors.map((e) => `  ${e}`).join("\n")}`);
  return data as Report;
}

// ── HTML ────────────────────────────────────────────────────────────

/** 데이터의 모든 문자열은 이 함수를 거쳐 글자로만 들어간다(D9). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function anchor(ref: string): string {
  return ref.split(" ")[0]!;
}

function refLink(ref: string): string {
  return `<a class="ref" href="#${escapeHtml(anchor(ref))}">[${escapeHtml(ref)}]</a>`;
}

/** 본문 글 속 `[S2 03:41]` 표기를 출처 카드 링크로. 나머지는 이스케이프. */
function text(value: string): string {
  return escapeHtml(value).replace(/\[(S\d+(?: (?:\d{1,2}:)?\d{1,2}:\d{2})?)\]/g, (_m, ref: string) => refLink(ref));
}

const SIGNAL_TYPES: Record<string, string> = { problem: "문제·불편", behavior: "행동 변화", technology: "기술 변화", regulation: "규제 변화", money: "돈의 흐름" };
const AGREEMENT: Record<string, string> = { agree: "출처 일치", conflict: "출처 충돌", single: "단일 출처" };
const CREDIBILITY: Record<string, string> = { high: "신뢰 높음", medium: "신뢰 중간", low: "신뢰 낮음" };
const KIND: Record<string, string> = { article: "기사", blog: "블로그", video: "영상" };
const STATUS: Record<string, string> = { pass: "통과", fail: "실패", unknown: "확인 못 함" };

/** 가중 합계(5점 만점). 가중치 합이 0이면 단순 평균. */
export function totalScore(report: Report, idea: string): number {
  let sum = 0;
  let weights = 0;
  for (const c of report.criteria) {
    const s = report.scores.find((x) => x.idea === idea && x.criterion === c.id);
    if (!s) continue;
    const w = c.weight > 0 ? c.weight : 1;
    sum += s.score * w;
    weights += w;
  }
  return weights === 0 ? 0 : Math.round((sum / weights) * 100) / 100;
}

function tag(label: string, kind = ""): string {
  return `<span class="tag ${kind}">${escapeHtml(label)}</span>`;
}

export function renderBody(r: Report): string {
  const idea = (id: string) => r.ideas.find((i) => i.id === id);
  const rec = idea(r.summary.recommendation);
  const out: string[] = [];
  const input = [r.meta.input.topic ? `주제: ${r.meta.input.topic}` : "", r.meta.input.links?.length ? `링크 ${r.meta.input.links.length}개` : ""].filter(Boolean).join(" · ");
  out.push(`<header><h1>${escapeHtml(r.meta.title)}</h1><div class="meta muted"><span>작성 ${escapeHtml(r.meta.created)}</span><span>입력 ${escapeHtml(input || r.meta.input.kind)}</span><span>출처 ${r.sources.length}개</span><span>후보 ${r.ideas.length}개</span></div>${r.meta.note ? `<p class="muted">${text(r.meta.note)}</p>` : ""}</header>`);

  out.push(`<section id="glance"><h2>한눈에 보기</h2><div class="card hero"><h3>추천: ${escapeHtml(rec ? `${rec.id} ${rec.name}` : r.summary.recommendation)}</h3><ol>${r.summary.reasons.map((x) => `<li>${text(x)}</li>`).join("")}</ol><p><strong>가장 큰 미확인 가정</strong> — ${text(r.summary.biggest_assumption)}</p></div></section>`);

  out.push(`<section id="sources"><h2>출처 분석</h2>${r.sources.map((s) => `<article class="card" id="${escapeHtml(s.id)}"><h3>${escapeHtml(s.id)} · ${escapeHtml(s.title)}</h3><p class="muted">${tag(KIND[s.kind] ?? s.kind)}${tag(CREDIBILITY[s.credibility] ?? s.credibility)} 발행 ${escapeHtml(s.published || "모름")} · 접근 ${escapeHtml(s.accessed || "모름")} · <a href="${escapeHtml(safeUrl(s.url))}" rel="noreferrer noopener">원문</a></p><p>${text(s.summary)}</p><details><summary>주장 ${s.claims.length}개</summary><ul>${s.claims.map((c) => `<li>${tag(c.type === "fact" ? "사실" : "의견", c.type)}${c.time ? tag(c.time) : ""}${text(c.text)}${c.who ? ` <span class="muted">— ${escapeHtml(c.who)}</span>` : ""}${c.quote ? `<blockquote>${escapeHtml(c.quote)}</blockquote>` : ""}</li>`).join("")}</ul></details></article>`).join("")}</section>`);

  out.push(`<section id="signals"><h2>핵심 신호</h2><div class="grid">${r.signals.map((g) => `<div class="card" id="${escapeHtml(g.id)}"><h3>${escapeHtml(g.id)} · ${escapeHtml(g.title)}</h3><p>${tag(SIGNAL_TYPES[g.type] ?? g.type)}${tag(AGREEMENT[g.agreement] ?? g.agreement, g.agreement === "conflict" ? "conflict" : "")}</p><p>${text(g.description)}</p>${g.conflict ? `<p><strong>충돌</strong> — ${text(g.conflict)}</p>` : ""}<p>${g.evidence.map(refLink).join(" ")}</p></div>`).join("")}</div></section>`);

  out.push(`<section id="ideas"><h2>아이디어 후보</h2>${r.ideas.map((i) => `<article class="card" id="${escapeHtml(i.id)}"><h3>${escapeHtml(i.id)} · ${escapeHtml(i.name)} <span class="muted">${totalScore(r, i.id).toFixed(2)} / 5</span></h3><dl><dt>문제</dt><dd>${text(i.problem)}</dd><dt>대상 고객</dt><dd>${text(i.customer)}</dd><dt>해결 방식</dt><dd>${text(i.solution)}</dd><dt>수익 가설</dt><dd>${text(i.revenue)}</dd><dt>근거 신호</dt><dd>${i.signals.map((g) => `<a class="ref" href="#${escapeHtml(g)}">${escapeHtml(g)}</a>`).join(" ") || "없음"}</dd></dl><details><summary>탈락시킬 가정${i.estimates?.length ? "·추정" : ""}</summary><ul>${i.kill_assumptions.map((a) => `<li>${text(a)}</li>`).join("")}${(i.estimates ?? []).map((e) => `<li>${tag("추정", "estimate")}${text(e)}</li>`).join("")}</ul></details></article>`).join("")}</section>`);

  // 행은 평가 기준, 열은 후보 — 후보가 3~5개라 좁은 화면에서도 열이 덜 쪼개진다.
  const head = r.ideas.map((i) => `<th><a href="#${escapeHtml(i.id)}">${escapeHtml(i.id)}</a> ${escapeHtml(i.name)}</th>`).join("");
  const rows = r.criteria.map((c) => `<tr><th>${escapeHtml(c.name)} <span class="muted">×${escapeHtml(c.weight)}</span></th>${r.ideas.map((i) => {
    const s = r.scores.find((x) => x.idea === i.id && x.criterion === c.id);
    if (!s) return "<td class=\"muted\">—</td>";
    return `<td><div class="bar"><span class="track"><i style="width:${s.score * 20}%"></i></span><strong>${s.score}</strong>${s.estimate ? tag("추정", "estimate") : ""}</div><div class="muted">${text(s.reason)} ${s.refs.map(refLink).join(" ")}</div></td>`;
  }).join("")}</tr>`).join("");
  const totals = `<tr class="total"><th>가중 합계</th>${r.ideas.map((i) => `<td>${totalScore(r, i.id).toFixed(2)} / 5</td>`).join("")}</tr>`;
  out.push(`<section id="scores"><h2>평가 비교</h2><div class="table-wrap"><table><thead><tr><th>기준</th>${head}</tr></thead><tbody>${rows}${totals}</tbody></table></div></section>`);

  const e = r.next_steps.experiment;
  const cards = r.next_steps.cards ?? [];
  out.push(`<section id="next"><h2>추천과 다음 단계</h2><div class="card"><h3>1주 검증 실험 — ${escapeHtml(e.idea)}</h3><dl><dt>할 일</dt><dd>${text(e.what)}</dd><dt>비용</dt><dd>${text(e.cost)}</dd><dt>판정</dt><dd>${text(e.success)}</dd></dl></div>${cards.length ? `<p>아이디어 카드: ${cards.map((c) => `<code>idea-${escapeHtml(c.replace(/^I/, ""))}.md</code>`).join(" ")}</p>` : ""}</section>`);

  const checks = r.verification?.checks ?? [];
  out.push(`<section id="appendix"><h2>부록</h2><h3>검증 결과</h3>${checks.length ? `<p class="muted">${escapeHtml(r.verification!.run)}</p><ul>${checks.map((c) => `<li><span class="status-${escapeHtml(c.status)}">${escapeHtml(STATUS[c.status] ?? c.status)}</span> ${escapeHtml(c.name)}${c.detail ? `<div class="muted">${escapeHtml(c.detail)}</div>` : ""}</li>`).join("")}</ul>` : `<p class="muted">아직 검사하지 않았다 — pace scout verify</p>`}<h3>확인하지 못한 것</h3>${r.unverified.length ? `<ul>${r.unverified.map((u) => `<li>${text(u)}</li>`).join("")}</ul>` : "<p class=\"muted\">없음</p>"}${r.dropped?.length ? `<h3>버린 후보</h3><ul>${r.dropped.map((d) => `<li>${escapeHtml(d.name)} — ${text(d.reason)}</li>`).join("")}</ul>` : ""}<h3>출처 목록</h3><ol>${r.sources.map((s) => `<li>${escapeHtml(s.id)} ${escapeHtml(s.title)} — <a href="${escapeHtml(safeUrl(s.url))}" rel="noreferrer noopener">${escapeHtml(s.url)}</a> <span class="muted">(접근 ${escapeHtml(s.accessed || "모름")})</span></li>`).join("")}</ol></section>`);
  return out.join("\n");
}

/** href에는 http(s)만. 그 밖(javascript: 등)은 빈 링크. */
function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : "#";
}

const PRINT_SCRIPT = 'addEventListener("beforeprint", function () { document.querySelectorAll("details").forEach(function (d) { d.open = true; }); });';

export function renderHtml(report: Report): string {
  const template = readFileSync(templatePath, "utf8");
  const hash = createHash("sha256").update(PRINT_SCRIPT).digest("base64");
  return fillTemplate(template, { title: escapeHtml(report.meta.title), body: renderBody(report), script: PRINT_SCRIPT, scriptHash: hash });
}

/** report.json → report.html. 실행 폴더 밖이나 링크로 쓰지 않는다. */
export function renderRun(run: string): string {
  const report = readReport(run);
  const out = join(run, "report.html");
  if (existsSync(out) && lstatSync(out).isSymbolicLink()) throw new ScoutError("report.html 심볼릭 링크에는 쓰지 않는다");
  writeFileAtomic(out, renderHtml(report));
  return out;
}
