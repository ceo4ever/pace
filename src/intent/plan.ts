import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";
import { IntentError, intentSkillDir } from "./lens.ts";
import { validate, type Schema, type SchemaError } from "./schema.ts";

// ── 원본 데이터(AI가 쓰는 docs/plan.json) ─────────────────────────────

export interface Actor { id: string; name: string; desc: string; external?: boolean; docs?: { title: string; url?: string; checked?: string | null; open?: string } }
export interface Component { id: string; name: string; desc: string; client?: boolean }
export interface Alt { id: string; kind: "대안" | "예외"; text: string; screen: string; ac?: string }
export interface UseCase {
  id: string; name: string; actor: string; secondary?: string[]; goal: string; pre: string[]; post: string[];
  steps: { n: number; text: string; screen: string }[]; alts: Alt[]; features: string[]; sequence?: string;
}
export interface Screen { id: string; name: string; auth: string; data: boolean; status?: "기존" | "변경" | "신규"; evidence?: string }
export interface IaNode { label: string; screen?: string; children?: IaNode[] }
export interface Flow {
  id: string; name: string; usecases: string[];
  nodes: { id: string; type: string; label: string; col: number; row: number; screen?: string }[];
  edges: { from: string; to: string; label?: string; route?: string }[];
}
export interface Wireframe { screen: string; states: Record<string, unknown[]>; notes: { n: number; text: string; refs: string[] }[] }
export type CanvasLink = { element: string; to: { screen: string; state: string } } | { element: string; unlinked: true };
export interface CanvasEntry { screen: string; document: string; frame: string; state: string; refs: string[]; links: CanvasLink[] }
export interface Feature { id: string; name: string; desc: string; priority: string; uc: string; screen: string; ac: string[] }
export interface Criterion { id: string; given: string; when: string; then: string }
export interface Call { from: string; to: string; text: string; kind?: string; screen?: string; ac?: string }
export interface Block { block: "alt" | "loop" | "opt"; label?: string; cases: { label?: string; messages: Message[] }[] }
export type Message = Call | Block;
export interface Sequence { id: string; usecase: string; name: string; participants: string[]; messages: Message[] }
export interface Plan {
  doc: { project: string; version: string; date: string; depth: string; source: string };
  assumptions?: string[];
  open?: { id: string; text: string; impact: string; cond: string }[];
  actors?: Actor[];
  components?: Component[];
  usecases: UseCase[];
  relations?: { from: string; to: string; kind: string }[];
  screens: Screen[];
  ia: IaNode[];
  flows?: Flow[];
  wireframes?: Wireframe[];
  canvas?: CanvasEntry[];
  features?: Feature[];
  criteria?: Criterion[];
  sequences?: Sequence[];
}

export interface Check { id: string; name: string; ok: boolean; detail: string }

// ── 템플릿 폴더 ─────────────────────────────────────────────────────

export interface Template {
  kind: string; // 폴더 이름 = 결과 파일 이름
  title: string;
  desc: string;
  order: number;
  ids: string[]; // 이 문서로 가는 ID 접두어
  uses: string[]; // 문서에 넣을 맥락 칸
  requires: string[]; // 원본에 있어야 만드는 칸(깊이별로 문서를 고른다, D10)
  contents: boolean; // 목차 문서(다른 문서 목록에 넣지 않는다)
  html: string;
  schema: Schema;
  dir: string;
}

const templatesRoot = (skillDir: string) => join(skillDir, "templates");

/** `templates/<종류>/`에 template.html·schema.json이 있으면 템플릿이다. `_`로 시작하는 폴더(공통·예시)는 아니다. 추가는 폴더만. */
export function loadTemplates(skillDir: string = intentSkillDir): Template[] {
  const root = templatesRoot(skillDir);
  if (!existsSync(root)) throw new IntentError(`templates 폴더가 없다: ${root}`);
  const templates: Template[] = [];
  for (const kind of readdirSync(root).sort()) {
    const dir = join(root, kind);
    if (kind.startsWith("_") || !lstatSync(dir).isDirectory()) continue;
    if (!/^[a-z][a-z0-9-]*$/.test(kind)) throw new IntentError(`템플릿 폴더 이름은 소문자·숫자·-만: ${kind}`);
    const htmlPath = join(dir, "template.html");
    const schemaPath = join(dir, "schema.json");
    if (!existsSync(htmlPath) || !existsSync(schemaPath)) continue;
    const schema = readJson(schemaPath) as Schema;
    const meta = (schema["x-pace"] ?? {}) as Partial<Template>;
    if (!meta.title || !Array.isArray(meta.uses)) throw new IntentError(`${kind}/schema.json에 x-pace.title·uses가 없다`);
    templates.push({
      kind, dir, schema, html: readFileSync(htmlPath, "utf8"),
      title: meta.title, desc: meta.desc ?? "", order: meta.order ?? 50,
      ids: meta.ids ?? [], uses: meta.uses, requires: meta.requires ?? [], contents: meta.contents === true,
    });
  }
  const owner = new Map<string, string>();
  for (const t of templates)
    for (const prefix of t.ids) {
      if (!/^[A-Z]+$/.test(prefix)) throw new IntentError(`${t.kind}: ID 접두어는 대문자만(-는 구분자): ${prefix}`);
      if (owner.has(prefix)) throw new IntentError(`ID 접두어 ${prefix}가 ${owner.get(prefix)}와 ${t.kind}에 겹친다`);
      owner.set(prefix, t.kind);
    }
  return templates.sort((a, b) => a.order - b.order || a.kind.localeCompare(b.kind));
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new IntentError(`JSON을 읽지 못했다: ${path} — ${(error as Error).message}`);
  }
}

export function planSchema(skillDir: string = intentSkillDir): Schema {
  return readJson(join(templatesRoot(skillDir), "_base", "plan.schema.json")) as Schema;
}

export function readPlan(docsDir: string, skillDir: string = intentSkillDir): Plan {
  const path = join(docsDir, "plan.json");
  if (!existsSync(path)) throw new IntentError(`plan.json이 없다: ${path}`);
  const plan = readJson(path);
  const errors = validate(plan, planSchema(skillDir));
  if (errors.length > 0) throw new IntentError(`plan.json이 schema와 다르다:\n${formatErrors(errors)}`);
  return plan as Plan;
}

export function formatErrors(errors: SchemaError[], limit = 20): string {
  const lines = errors.slice(0, limit).map((e) => `  ${e.path}: ${e.message}`);
  if (errors.length > limit) lines.push(`  … 외 ${errors.length - limit}개`);
  return lines.join("\n");
}

// ── 연결 계산 ───────────────────────────────────────────────────────

export function flatMessages(list: Message[]): Call[] {
  return list.flatMap((m) => ("block" in m ? m.cases.flatMap((c) => flatMessages(c.messages)) : [m]));
}

function altBlocks(list: Message[]): Block[] {
  return list.flatMap((m) => ("block" in m ? [...(m.block === "alt" ? [m] : []), ...m.cases.flatMap((c) => altBlocks(c.messages))] : []));
}

const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

/** 기존·변경 화면의 근거 `경로:줄`이 root 안의 실제 파일·줄을 가리키는가. 링크를 풀어 실제 경로로 root 포함을 본다. */
function evidenceExists(root: string, evidence: string | undefined): boolean {
  const m = /^(.+?):(\d+)$/.exec(evidence ?? "");
  if (!m || Number(m[2]) < 1) return false;
  try {
    const realRoot = realpathSync(root);
    const file = realpathSync(resolve(root, m[1]!));
    const rel = relative(realRoot, file);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return false;
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > EVIDENCE_MAX_BYTES) return false;
    const lines = readFileSync(file, "utf8").split("\n");
    if (lines.at(-1) === "") lines.pop(); // 끝 줄바꿈 뒤 빈 조각은 줄이 아니다
    return lines.length >= Number(m[2]);
  } catch {
    return false;
  }
}

export function computeContext(plan: Plan, root: string): Record<string, unknown> {
  const actors = plan.actors ?? [];
  const components = plan.components ?? [];
  const flows = plan.flows ?? [];
  const wireframes = plan.wireframes ?? [];
  const features = plan.features ?? [];
  const criteria = plan.criteria ?? [];
  const sequences = plan.sequences ?? [];
  const screens = plan.screens.map((s) => ({ ...s, path: [] as string[], depth: 0, usecases: [] as string[], features: [] as string[] }));
  const byId = new Map(screens.map((s) => [s.id, s]));
  const walk = (nodes: IaNode[], path: string[]) => {
    for (const n of nodes) {
      const p = [...path, n.label];
      const s = n.screen ? byId.get(n.screen) : undefined;
      if (s) Object.assign(s, { path: p, depth: p.length });
      if (n.children) walk(n.children, p);
    }
  };
  walk(plan.ia, []);
  for (const u of plan.usecases)
    for (const id of [...u.steps.map((s) => s.screen), ...u.alts.map((a) => a.screen)]) {
      const s = byId.get(id);
      if (s && !s.usecases.includes(u.id)) s.usecases.push(u.id);
    }
  for (const f of features) byId.get(f.screen)?.features.push(f.id);
  const orphans = screens.filter((s) => s.usecases.length === 0).map((s) => s.id);
  const maxDepth = Math.max(0, ...screens.map((s) => s.depth));
  const canvas = plan.canvas ?? [];
  const canvasScreens = new Set(canvas.map((c) => c.screen));
  const legacyMissingStates = wireframes.filter((w) => !canvasScreens.has(w.screen))
    .filter((w) => byId.get(w.screen)?.data)
    .map((w) => ({ screen: w.screen, missing: [!w.states["오류"] && "오류", !(w.states["빈"] || w.states["로딩"]) && "빈 또는 로딩"].filter((x): x is string => Boolean(x)) }))
    .filter((m) => m.missing.length > 0);
  const canvasMissingStates = [...canvasScreens].flatMap((id) => {
    const states = canvas.filter((c) => c.screen === id).map((c) => c.state);
    const missing = [!states.includes('기본') && '기본', byId.get(id)?.data && !states.includes('오류') && '오류', byId.get(id)?.data && !states.includes('빈') && !states.includes('로딩') && '빈 또는 로딩'].filter((s): s is string => Boolean(s));
    return missing.length ? [{ screen: id, missing }] : [];
  });
  const missingStates = [...legacyMissingStates, ...canvasMissingStates];
  const deadEnds = flows.flatMap((f) => f.nodes.filter((x) => x.type !== "end" && !f.edges.some((e) => e.from === x.id)).map((x) => `${f.id} ${x.id}`));
  const altsNoAc = plan.usecases.flatMap((u) => u.alts.filter((a) => a.kind === "예외" && !a.ac).map((a) => `${u.id} ${a.id}`));

  // 참조 검사: 문서끼리 잇는 ID가 모두 있는가
  const has = (list: { id: string }[], id: string) => list.some((x) => x.id === id);
  const participantIds = new Set([...actors.map((a) => a.id), ...components.map((c) => c.id)]);
  const badRefs: string[] = [];
  const ref = (where: string, ok: boolean, id: string) => ok || badRefs.push(`${where}→${id}`);
  const iaScreens: string[] = [];
  const collect = (nodes: IaNode[]) => nodes.forEach((n) => { if (n.screen) iaScreens.push(n.screen); if (n.children) collect(n.children); });
  collect(plan.ia);
  for (const id of iaScreens) ref("IA", byId.has(id), id);
  for (const r of plan.relations ?? []) for (const id of [r.from, r.to]) ref("관계", has(plan.usecases, id), id);
  for (const u of plan.usecases) {
    ref(u.id, has(actors, u.actor) || actors.length === 0, u.actor);
    for (const a of u.secondary ?? []) ref(u.id, has(actors, a), a);
    for (const a of u.alts) ref(`${u.id} ${a.id}`, byId.has(a.screen), a.screen);
    for (const a of u.alts) if (a.ac) ref(`${u.id} ${a.id}`, has(criteria, a.ac), a.ac);
    for (const f of u.features) ref(u.id, has(features, f), f);
  }
  for (const f of features) {
    ref(f.id, has(plan.usecases, f.uc), f.uc);
    ref(f.id, byId.has(f.screen), f.screen);
    for (const ac of f.ac) ref(f.id, has(criteria, ac), ac);
  }
  for (const fl of flows) {
    for (const n of fl.nodes) if (n.screen) ref(`${fl.id} ${n.id}`, byId.has(n.screen), n.screen);
    for (const e of fl.edges) for (const id of [e.from, e.to]) ref(`${fl.id} 연결`, fl.nodes.some((n) => n.id === id), id);
    for (const u of fl.usecases) ref(fl.id, has(plan.usecases, u), u);
  }
  for (const w of wireframes) ref("와이어프레임", byId.has(w.screen), w.screen);
  const canvasKeys = new Set<string>(), frames = new Set<string>();
  for (const c of canvas) {
    const key = JSON.stringify([c.screen, c.state]);
    const frame = JSON.stringify([c.document, c.frame]);
    ref('Canvas 화면', byId.has(c.screen), c.screen);
    ref('Canvas 상태 중복', !canvasKeys.has(key), key);
    ref('Canvas 프레임 중복', !frames.has(frame), frame);
    canvasKeys.add(key); frames.add(frame);
    const parts = c.document.split('/');
    ref('Canvas 경로', !c.document.startsWith('/') && !/[\\:\x00-\x1f\x7f]/.test(c.document) && parts.every((p) => p !== '' && p !== '.' && p !== '..' && !/[. ]$/.test(p)) && c.document.endsWith('.canvas.json') && parts.at(-1)! !== '.canvas.json', c.document);
    const elements = new Set<string>();
    for (const link of c.links) {
      ref('Canvas 요소 중복', !elements.has(link.element), link.element);
      elements.add(link.element);
      if ('to' in link) ref('Canvas 이동 대상', canvas.some((target) => target.screen === link.to.screen && target.state === link.to.state), `${link.to.screen}/${link.to.state}`);
    }
    for (const id of c.refs) {
      const found = id.startsWith('UC-') ? has(plan.usecases, id) : id.startsWith('AC-') ? has(criteria, id) : id.startsWith('F-') ? has(features, id) : /^BR[0-9]+$/.test(id);
      ref('Canvas 추적', found, id);
    }
  }
  for (const q of sequences) {
    ref(q.id, plan.usecases.some((u) => u.id === q.usecase && u.sequence), `${q.usecase}(시퀀스 사유)`);
    for (const p of q.participants) ref(q.id, participantIds.has(p), p);
    for (const m of flatMessages(q.messages)) for (const p of [m.from, m.to]) ref(q.id, q.participants.includes(p), p);
  }

  const notGrounded = screens.filter((s) => (s.status === "기존" || s.status === "변경") && !evidenceExists(root, s.evidence)).map((s) => `${s.id} ${s.evidence ?? "(근거 없음)"}`);

  const checks: Check[] = [
    { id: "usecase-fields", name: "유스케이스마다 행위자·사전 조건·기본 흐름·예외 흐름이 있다", ok: plan.usecases.every((u) => u.actor && u.pre.length && u.steps.length && u.alts.some((a) => a.kind === "예외")), detail: plan.usecases.filter((u) => !u.alts.some((a) => a.kind === "예외") || !u.pre.length || !u.steps.length).map((u) => u.id).join(", ") },
    { id: "steps-screens", name: "유스케이스 단계마다 IA 화면을 가리킨다", ok: plan.usecases.every((u) => u.steps.every((s) => (byId.get(s.screen)?.depth ?? 0) > 0)), detail: plan.usecases.flatMap((u) => u.steps.filter((s) => !((byId.get(s.screen)?.depth ?? 0) > 0)).map((s) => `${u.id} ${s.n}→${s.screen}`)).join(", ") },
    { id: "no-orphans", name: "IA 화면마다 쓰는 유스케이스가 있다(고아 화면 없음)", ok: orphans.length === 0, detail: orphans.join(", ") },
    { id: "data-states", name: "화면의 기본 상태와 데이터 화면의 오류·빈(또는 로딩) 상태가 있다", ok: missingStates.length === 0, detail: missingStates.map((m) => `${m.screen}(${m.missing.join("·")})`).join(", ") },
    { id: "exception-ac", name: "예외 흐름마다 완료 기준(AC)이 있다", ok: altsNoAc.length === 0, detail: altsNoAc.length ? `없음: ${altsNoAc.join(", ")}` : "" },
    { id: "flow-dead-ends", name: "흐름에 막다른 길이 없다(끝이 아닌 노드는 나가는 길이 있다)", ok: deadEnds.length === 0, detail: deadEnds.join(", ") },
    { id: "id-refs", name: "문서끼리 잇는 ID가 모두 있다", ok: badRefs.length === 0, detail: badRefs.join(", ") },
    { id: "existing-evidence", name: "기존·변경 화면은 실제로 있는 코드 근거(경로:줄)를 갖는다", ok: notGrounded.length === 0, detail: notGrounded.join(", ") },
  ];

  // 시퀀스 검사(D13)
  const external = new Set(actors.filter((a) => a.external).map((a) => a.id));
  const userSide = new Set([...actors.filter((a) => !a.external).map((a) => a.id), ...components.filter((c) => c.client).map((c) => c.id)]);
  const need = plan.usecases.filter((u) => u.sequence);
  const missingSeq = need.filter((u) => !sequences.some((q) => q.usecase === u.id)).map((u) => u.id);
  const altFail = sequences.filter((q) => {
    if (!flatMessages(q.messages).some((m) => external.has(m.to))) return false;
    return !altBlocks(q.messages).some((a) => a.cases.length >= 2 && a.cases.slice(1).some((c) => flatMessages(c.messages).some((m) => m.ac)));
  }).map((q) => q.id);
  const asyncNoDone = sequences.filter((q) => {
    const all = flatMessages(q.messages);
    const i = all.findIndex((m) => m.kind === "async");
    return i >= 0 && !all.slice(i + 1).some((m) => userSide.has(m.to));
  }).map((q) => q.id);
  const used = new Set(sequences.flatMap((q) => q.participants).filter((p) => external.has(p)));
  // 외부 전제는 공식 문서(URL·확인일)로 확인했거나, 아직 정할 수 없으면 미결 항목으로 남아 있어야 한다(가정으로 숨기지 않는다).
  const openIds = new Set((plan.open ?? []).map((o) => o.id));
  // 미결로 남긴 업체는 증명이 아니라 표시다 — URL·확인일과 함께 쓸 수 없고, 통과해도 detail에 남긴다.
  const pending = (a: Actor) => a.docs?.open !== undefined && openIds.has(a.docs.open) && !a.docs.url && !a.docs.checked;
  const confirmed = (a: Actor) => (a.docs?.open === undefined && Boolean(a.docs?.checked && /^https?:\/\//.test(a.docs.url ?? ""))) || pending(a);
  const noDocs = actors.filter((a) => used.has(a.id) && !confirmed(a)).map((a) => a.name);
  const pendingDocs = actors.filter((a) => used.has(a.id) && pending(a)).map((a) => `${a.name} → ${a.docs!.open}`);
  const idle = sequences.flatMap((q) => q.participants.filter((p) => !flatMessages(q.messages).some((m) => m.from === p || m.to === p)).map((p) => `${q.id} ${p}`));
  const sequenceChecks: Check[] = [
    { id: "sequence-exists", name: "시퀀스 대상 유스케이스마다 시퀀스가 있다", ok: !missingSeq.length, detail: missingSeq.join(", ") },
    { id: "sequence-external-alt", name: "외부 시스템 호출에 실패 분기(alt)와 완료 기준이 있다", ok: !altFail.length, detail: altFail.join(", ") },
    { id: "sequence-async-done", name: "비동기 메시지 뒤에 사용자 쪽으로 끝을 알린다", ok: !asyncNoDone.length, detail: asyncNoDone.join(", ") },
    { id: "sequence-docs", name: "외부 서비스 참여자마다 공식 문서 URL과 확인일이 있다(정할 수 없으면 미결 항목)", ok: !noDocs.length, detail: [noDocs.length ? `확인 전: ${noDocs.join(", ")}` : "", pendingDocs.length ? `미결 표시(증명 아님): ${pendingDocs.join(", ")}` : ""].filter(Boolean).join(" · ") },
    { id: "sequence-participants", name: "참여자는 모두 메시지를 주고받는다", ok: !idle.length, detail: idle.join(", ") },
  ];
  checks.push(...sequenceChecks);

  const trace = plan.usecases.map((u) => ({
    uc: u.id,
    name: u.name,
    screens: [...new Set([...u.steps, ...u.alts].map((s) => s.screen))],
    features: u.features,
    ac: [...new Set(features.filter((f) => f.uc === u.id).flatMap((f) => f.ac).concat(u.alts.map((a) => a.ac).filter((x): x is string => Boolean(x))))].sort(),
    issues: u.alts.filter((a) => a.kind === "예외" && !a.ac).map((a) => `예외 ${a.id} 기준 없음`),
    sq: sequences.find((q) => q.usecase === u.id)?.id ?? null,
  }));
  const sequenceOf = Object.fromEntries(trace.filter((t) => t.sq).map((t) => [t.uc, t.sq]));

  return {
    doc: plan.doc,
    assumptions: plan.assumptions ?? [],
    open: plan.open ?? [],
    actors,
    components,
    usecases: plan.usecases,
    relations: plan.relations ?? [],
    ia: plan.ia,
    screens,
    orphans,
    maxDepth,
    flows,
    deadEnds: deadEnds.length,
    wireframes,
    canvas,
    missingStates,
    features,
    criteria: criteria.map((c) => ({ ...c, features: features.filter((f) => f.ac.includes(c.id)).map((f) => f.id) })),
    sequences,
    sequenceChecks,
    sequenceOf,
    sequenceUsecases: Object.fromEntries(need.map((u) => [u.id, { name: u.name, reason: u.sequence }])),
    participants: [...actors.map((a) => ({ ...a, kind: "actor" })), ...components.map((c) => ({ ...c, kind: "component" }))],
    status: Object.fromEntries(plan.screens.filter((s) => s.status).map((s) => [s.id, s.status])),
    checks,
    trace,
    counts: [["유스케이스", plan.usecases.length], ["화면", screens.length], ["흐름", flows.length], ["시퀀스", sequences.length], ["기능", features.length], ["완료 기준", criteria.length]],
  };
}

// ── HTML ───────────────────────────────────────────────────────────

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** 데이터는 <script type="application/json"> 안에만 넣는다. `<`·줄 구분자를 이스케이프해 태그를 닫거나 끊을 수 없다. */
export function embedJson(data: unknown): string {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  return JSON.stringify(data).replace(/</g, "\\u003c").replaceAll(LS, "\\u2028").replaceAll(PS, "\\u2029");
}

/** 자리 표시를 한 번에 바꾼다 — 넣은 값(제목·데이터) 안의 자리 표시 글자는 다시 바꾸지 않는다. */
function fill(html: string, values: Record<string, string>): string {
  for (const key of Object.keys(values)) if (!html.includes(key)) throw new IntentError(`템플릿에 자리 표시가 없다: ${key}`);
  const pattern = new RegExp(Object.keys(values).map((k) => k.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|"), "g");
  return html.replace(pattern, (key) => values[key]!);
}

export interface RenderResult {
  files: string[];
  checks: Check[];
  bytes: { plan: number; html: number };
  legacyAvailable: boolean;
}

/** 깊이에 맞는 문서만: 원본에 requires 칸이 있는 템플릿만 만든다. */
function selected(plan: Plan, templates: Template[], legacyWireframe: boolean): Template[] {
  return templates.filter((t) => (t.kind !== 'wireframe' || legacyWireframe) && t.requires.every((k) => {
    const v = (plan as unknown as Record<string, unknown>)[k];
    return Array.isArray(v) ? v.length > 0 : v !== undefined;
  }));
}

export function renderPages(plan: Plan, options: { skillDir?: string; root: string; legacyWireframe?: boolean }): { pages: { kind: string; html: string; data: Record<string, unknown> }[]; checks: Check[] } {
  const skillDir = options.skillDir ?? intentSkillDir;
  if (options.legacyWireframe && !plan.wireframes?.length) throw new IntentError('호환 렌더에는 wireframes 입력이 필요하다');
  const templates = selected(plan, loadTemplates(skillDir), options.legacyWireframe === true);
  if (templates.length === 0) throw new IntentError("만들 문서가 없다 — 템플릿 폴더를 확인한다");
  const context = computeContext(plan, options.root);
  const nav = {
    docs: templates.map((t) => [`${t.kind}.html`, t.title]),
    route: Object.fromEntries(templates.flatMap((t) => t.ids.map((prefix) => [prefix, `${t.kind}.html`]))),
  };
  context.docs = templates.filter((t) => !t.contents).map((t) => ({ file: `${t.kind}.html`, title: t.title, desc: t.desc }));
  const css = readFileSync(join(templatesRoot(skillDir), "_base", "base.css"), "utf8");
  const js = readFileSync(join(templatesRoot(skillDir), "_base", "base.js"), "utf8");
  const pages = templates.map((t) => {
    const data: Record<string, unknown> = { doc: plan.doc, nav };
    for (const key of t.uses) {
      if (!Object.hasOwn(context, key)) throw new IntentError(`${t.kind}/schema.json x-pace.uses에 없는 칸: ${key} — 새 칸은 plan.schema.json과 연결 계산에 먼저 더한다`);
      data[key] = context[key];
    }
    const errors = validate(data, t.schema);
    if (errors.length > 0) throw new IntentError(`${t.kind} 문서 데이터가 schema와 다르다:\n${formatErrors(errors)}`);
    const html = fill(t.html, {
      "@TITLE@": escapeHtml(`${plan.doc.project} · ${t.title}`),
      "/*@BASE_CSS@*/": css,
      "/*@BASE_JS@*/": js,
      "@DATA@": embedJson(data),
    });
    return { kind: t.kind, html, data };
  });
  return { pages, checks: context.checks as Check[] };
}

/** docs/plan.json → docs/<종류>.html. 검사 결과는 index에 들어가고 호출자에게 돌려준다(실패해도 문서는 만든다). */
export function renderDocs(docsDir: string, options: { skillDir?: string; root?: string; legacyWireframe?: boolean } = {}): RenderResult {
  const skillDir = options.skillDir ?? intentSkillDir;
  const plan = readPlan(docsDir, skillDir);
  const { pages, checks } = renderPages(plan, { skillDir, root: options.root ?? process.cwd(), legacyWireframe: options.legacyWireframe });
  mkdirSync(docsDir, { recursive: true });
  // 깊이를 줄여 다시 만들면 이번에 만들지 않는 종류의 예전 문서를 지운다(템플릿 종류 이름의 .html만).
  const made = new Set(pages.map((p) => p.kind));
  for (const t of loadTemplates(skillDir)) {
    if (t.kind === 'wireframe' && !options.legacyWireframe) continue;
    const old = join(docsDir, `${t.kind}.html`);
    if (!made.has(t.kind) && existsSync(old) && lstatSync(old).isFile()) rmSync(old);
  }
  const files: string[] = [];
  let html = 0;
  for (const page of pages) {
    const path = join(docsDir, `${page.kind}.html`);
    writeFileAtomic(path, page.html);
    files.push(path);
    html += Buffer.byteLength(page.html);
  }
  return { files, checks, bytes: { plan: Buffer.byteLength(readFileSync(join(docsDir, "plan.json"))), html }, legacyAvailable: Boolean(plan.wireframes?.length) || existsSync(join(docsDir, 'wireframe.html')) };
}

export function verifyDocs(docsDir: string, options: { skillDir?: string; root?: string } = {}): Check[] {
  const skillDir = options.skillDir ?? intentSkillDir;
  return computeContext(readPlan(docsDir, skillDir), options.root ?? process.cwd()).checks as Check[];
}

/** 템플릿을 고치면 example.html도 다시 만든다 — 예시 데이터(_example/plan.json)로 각 폴더의 example.html. */
export function writeExamples(skillDir: string = intentSkillDir, check = false): string[] {
  const plan = readPlan(join(templatesRoot(skillDir), "_example"), skillDir);
  const { pages } = renderPages(plan, { skillDir, root: skillDir, legacyWireframe: true });
  const stale: string[] = [];
  for (const page of pages) {
    const path = join(templatesRoot(skillDir), page.kind, "example.html");
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (current === page.html) continue;
    stale.push(path);
    if (!check) writeFileAtomic(path, page.html);
  }
  return stale;
}
