import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { intentSkillDir } from "../src/intent/lens.ts";
import { computeContext, loadTemplates, renderDocs, renderPages, type Plan } from "../src/intent/plan.ts";
import { IntentError } from "../src/intent/lens.ts";
import { validate, type Schema } from "../src/intent/schema.ts";
import { runPace, tempDir } from "./helpers.ts";

const templates = join(intentSkillDir, "templates");
const example = (): Plan => JSON.parse(readFileSync(join(templates, "_example", "plan.json"), "utf8")) as Plan;
const KINDS = ["index", "usecase", "ia", "flow", "sequence", "wireframe", "spec"];

function embedded(html: string): unknown {
  const m = /<script type="application\/json" id="pace-data">\r?\n([\s\S]*?)\r?\n<\/script>/.exec(html);
  assert.ok(m, "데이터 블록");
  return JSON.parse(m[1]!);
}

test("일곱 템플릿마다 네 파일이 있고 example.html 데이터가 schema.json을 통과하며 example은 최신이다", () => {
  for (const kind of KINDS) {
    for (const file of ["template.html", "schema.json", "example.html", "GUIDE.md"]) assert.ok(existsSync(join(templates, kind, file)), `${kind}/${file}`);
    const schema = JSON.parse(readFileSync(join(templates, kind, "schema.json"), "utf8")) as Schema;
    assert.deepEqual(validate(embedded(readFileSync(join(templates, kind, "example.html"), "utf8")), schema), [], kind);
    const guide = readFileSync(join(templates, kind, "GUIDE.md"), "utf8");
    for (const section of ["## When to make it", "## First-layer lens questions", "## IDs and links", "## When not to use"]) assert.ok(guide.includes(section), `${kind} ${section}`);
  }
  assert.deepEqual(loadTemplates().map((t) => t.kind), KINDS);
  assert.deepEqual(validate(example(), JSON.parse(readFileSync(join(templates, "_base", "plan.schema.json"), "utf8")) as Schema), []);
  const home = tempDir();
  const fresh = runPace(["intent", "examples", "--check"], { home });
  assert.equal(fresh.status, 0, fresh.stdout);
});

test("시험용 템플릿 폴더를 더하면 공통 코드 수정 없이 탭·목차·ID 경로에 나타난다", () => {
  const skill = join(tempDir("pace-intent-"), "pace-intent");
  cpSync(intentSkillDir, skill, { recursive: true });
  mkdirSync(join(skill, "templates", "datamodel"));
  writeFileSync(
    join(skill, "templates", "datamodel", "template.html"),
    "<!doctype html><title>@TITLE@</title><style>/*@BASE_CSS@*/</style><script type=\"application/json\" id=\"pace-data\">\n@DATA@\n</script><script>/*@BASE_JS@*/\nheader('데이터 모델', []);</script>",
  );
  writeFileSync(
    join(skill, "templates", "datamodel", "schema.json"),
    JSON.stringify({ "x-pace": { title: "데이터 모델", desc: "시험용", order: 55, ids: ["E"], uses: ["screens"], requires: [] }, type: "object", required: ["doc", "nav", "screens"] }),
  );
  const { pages } = renderPages(example(), { skillDir: skill, root: skill, legacyWireframe: true });
  assert.deepEqual(pages.map((p) => p.kind), ["index", "usecase", "ia", "flow", "sequence", "wireframe", "datamodel", "spec"]);
  const nav = pages[0]!.data.nav as { docs: string[][]; route: Record<string, string> };
  assert.ok(nav.docs.some(([file, title]) => file === "datamodel.html" && title === "데이터 모델"));
  assert.equal(nav.route.E, "datamodel.html");
  const docs = pages[0]!.data.docs as { file: string }[];
  assert.ok(docs.some((d) => d.file === "datamodel.html"), "목차 문서 목록");
  assert.ok(pages.find((p) => p.kind === "datamodel")!.html.includes("function hrefFor"), "공통 코드가 들어간다");
});

test("깊이에 맞는 문서만: 흐름·시퀀스·와이어프레임 데이터가 없으면 그 문서를 만들지 않는다", () => {
  const plan = example();
  delete plan.flows;
  delete plan.sequences;
  for (const u of plan.usecases) delete u.sequence;
  const { pages } = renderPages(plan, { root: intentSkillDir, legacyWireframe: true });
  assert.deepEqual(pages.map((p) => p.kind), ["index", "usecase", "ia", "wireframe", "spec"]);
});

test("Canvas 입력은 기본 렌더에서 구 HTML을 보존하고 명시적으로만 호환 렌더한다", () => {
  const home = tempDir();
  const docs = join(home, 'docs'); mkdirSync(docs);
  const plan = example();
  const screen = plan.screens.find((s) => s.data)!;
  plan.canvas = ['기본', '오류', '빈'].map((state, i) => ({ screen: screen.id, document: 'canvas/ui.canvas.json', frame: `frame${i}`, state, refs: [plan.usecases[0]!.id], links: i ? [] : [{ element: 'button1', to: { screen: screen.id, state: '오류' } }] }));
  const oldWireframes = plan.wireframes!;
  delete plan.wireframes;
  writeFileSync(join(docs, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(docs, 'wireframe.html'), '사용자 파일');
  const result = renderDocs(docs, { root: intentSkillDir });
  assert.equal(readFileSync(join(docs, 'wireframe.html'), 'utf8'), '사용자 파일');
  assert.ok(!result.files.some((p) => p.endsWith('wireframe.html')));
  const pages = renderPages(plan, { root: intentSkillDir }).pages;
  assert.equal((pages[0]!.data.nav as { route: Record<string, string> }).route.SCR, 'ia.html');
  assert.match(pages.find((p) => p.kind === 'ia')!.html, /id:n\.screen/);
  assert.deepEqual((pages.find((p) => p.kind === 'ia')!.data.canvas as Plan['canvas'])?.map((c) => c.frame), ['frame0', 'frame1', 'frame2']);
  const cli = runPace(['intent', 'render', docs], { home });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /있으면 보존.*덮어쓴다/);
  assert.ok(result.checks.find((c) => c.id === 'data-states')!.ok);
  const broken = structuredClone(plan); broken.canvas = broken.canvas!.filter((c) => c.state !== '오류');
  assert.ok(!computeContext(broken, intentSkillDir).checks || !(computeContext(broken, intentSkillDir).checks as { id: string; ok: boolean }[]).find((c) => c.id === 'data-states')!.ok);
  writeFileSync(join(docs, 'plan.json'), JSON.stringify(broken));
  assert.equal(runPace(['intent', 'verify', docs], { home }).status, 1);
  assert.throws(() => renderDocs(docs, { root: intentSkillDir, legacyWireframe: true }), /wireframes/);
  plan.wireframes = oldWireframes;
  writeFileSync(join(docs, 'plan.json'), JSON.stringify(plan));
  renderDocs(docs, { root: intentSkillDir, legacyWireframe: true });
  assert.notEqual(readFileSync(join(docs, 'wireframe.html'), 'utf8'), '사용자 파일');
  const legacyPages = renderPages(plan, { root: intentSkillDir, legacyWireframe: true }).pages;
  assert.equal((legacyPages[0]!.data.nav as { route: Record<string, string> }).route.SCR, 'ia.html');
  assert.match(legacyPages.find((p) => p.kind === 'ia')!.html, /id:n\.screen/);
  delete plan.canvas;
  writeFileSync(join(docs, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(docs, 'wireframe.html'), '기존 편집본');
  renderDocs(docs, { root: intentSkillDir });
  assert.equal(readFileSync(join(docs, 'wireframe.html'), 'utf8'), '기존 편집본');
});

test('Canvas 입력의 중복·잘못된 경로·목적지와 참조를 검출한다', () => {
  const base = JSON.parse(readFileSync(join(templates, '_example/canvas-plan.json'), 'utf8')) as Plan;
  const invalid: ((p: Plan) => void)[] = [
    (p) => { p.canvas!.push(structuredClone(p.canvas![0]!)); },
    (p) => { p.canvas![1]!.frame = p.canvas![0]!.frame; },
    (p) => { p.canvas![0]!.links.push(structuredClone(p.canvas![0]!.links[0]!)); },
    (p) => { const link = p.canvas![0]!.links[0]!; if ('to' in link) link.to.state = '없는 상태'; },
    (p) => { p.canvas![0]!.screen = 'SCR-unknown'; },
    (p) => { p.canvas![0]!.refs.push('AC-unknown'); },
    ...['../outside.canvas.json', 'C:/a.canvas.json', '/absolute.canvas.json', '\\\\server\\share\\x.canvas.json', 'a\\b.canvas.json', 'canvas/x.json', '.canvas.json', 'a/.canvas.json', 'a/./x.canvas.json', 'a//x.canvas.json', 'a /x.canvas.json', 'a./x.canvas.json', 'a/\u0000x.canvas.json'].map((path) => (p: Plan) => { p.canvas![0]!.document = path; }),
  ];
  for (const mutate of invalid) {
    const plan = structuredClone(base); mutate(plan);
    const checks = computeContext(plan, intentSkillDir).checks as { id: string; ok: boolean }[];
    assert.equal(checks.find((c) => c.id === 'id-refs')!.ok, false);
  }
  const schema = JSON.parse(readFileSync(join(templates, '_base/plan.schema.json'), 'utf8')) as Schema;
  const extra = structuredClone(base) as Plan & { canvas: (Plan['canvas'] extends (infer E)[] | undefined ? E : never)[] };
  Object.assign(extra.canvas[0]!, { unexpected: true });
  assert.ok(validate(extra, schema).length > 0);
  const named = structuredClone(base); const namedLink = named.canvas![0]!.links[0]!; if ('to' in namedLink) namedLink.to.screen = 'screen name';
  assert.ok(validate(named, schema).length > 0);
  const unlinked = structuredClone(base); unlinked.canvas![0]!.links = [{ element: 'button', unlinked: true }];
  assert.deepEqual(validate(unlinked, schema), []);
  assert.ok((computeContext(unlinked, intentSkillDir).checks as { id: string; ok: boolean }[]).find((c) => c.id === 'id-refs')!.ok);
  for (const link of [{ element: 'x' }, { element: 'x', unlinked: false }, { element: 'x', unlinked: true, to: { screen: base.canvas![0]!.screen, state: '기본' } }, { element: 'x', to: null }]) {
    const invalid = structuredClone(base); (invalid.canvas![0]!.links as unknown[]) = [link];
    assert.ok(validate(invalid, schema).length > 0);
  }
});

type Mutation = (p: Plan) => void;
const failing: Record<string, Mutation> = {
  "usecase-fields": (p) => { p.usecases[0]!.alts = p.usecases[0]!.alts.filter((a) => a.kind !== "예외"); },
  "steps-screens": (p) => {
    const target = p.usecases[0]!.steps[0]!.screen;
    const prune = (nodes: Plan["ia"]): Plan["ia"] => nodes.filter((n) => n.screen !== target).map((n) => (n.children ? { ...n, children: prune(n.children) } : n));
    p.ia = prune(p.ia);
  },
  "no-orphans": (p) => { p.screens.push({ id: "SCR-50", name: "고아", auth: "로그인", data: false }); },
  "data-states": (p) => { const w = p.wireframes!.find((x) => p.screens.find((s) => s.id === x.screen)?.data)!; delete w.states["오류"]; },
  "exception-ac": (p) => { const alt = p.usecases.flatMap((u) => u.alts).find((a) => a.kind === "예외")!; delete alt.ac; },
  "flow-dead-ends": (p) => { const f = p.flows![0]!; const from = f.nodes.find((n) => n.type === "screen")!.id; f.edges = f.edges.filter((e) => e.from !== from); },
  "id-refs": (p) => { p.features![0]!.uc = "UC-77"; },
  "existing-evidence": (p) => { p.screens[0]!.status = "기존"; p.screens[0]!.evidence = "src/없는파일.ts:3"; },
  "sequence-exists": (p) => { p.sequences = []; },
  "sequence-external-alt": (p) => {
    const strip = (list: NonNullable<Plan["sequences"]>[number]["messages"]): typeof list =>
      list.flatMap((m) => ("block" in m ? (m.block === "alt" ? m.cases[0]!.messages : [{ ...m, cases: m.cases.map((c) => ({ ...c, messages: strip(c.messages) })) }]) : [m]));
    p.sequences![0]!.messages = strip(p.sequences![0]!.messages);
  },
  "sequence-async-done": (p) => {
    // 비동기 뒤 사용자 쪽(A-1·C-1)으로 가는 메시지를 모두 서버로 돌린다 — 다른 구조는 그대로
    let seen = false;
    const redirect = (list: NonNullable<Plan["sequences"]>[number]["messages"]): typeof list =>
      list.map((m) => {
        if ("block" in m) return { ...m, cases: m.cases.map((c) => ({ ...c, messages: redirect(c.messages) })) };
        if (m.kind === "async") seen = true;
        return seen && (m.to === "A-1" || m.to === "C-1") ? { ...m, to: "C-2" } : m;
      });
    p.sequences![0]!.messages = redirect(p.sequences![0]!.messages);
  },
  "sequence-docs": (p) => { p.actors!.find((a) => a.id === "A-2")!.docs!.checked = null; },
  "sequence-participants": (p) => { p.components!.push({ id: "C-9", name: "캐시", desc: "쓰지 않음" }); p.sequences![0]!.participants.push("C-9"); },
};

test("증명 검사는 맞는 예시를 통과시키고, 검사마다 일부러 틀린 데이터에서 그 검사만 실패한다", () => {
  const ok = computeContext(example(), intentSkillDir).checks as { id: string; ok: boolean }[];
  assert.deepEqual(ok.filter((c) => !c.ok), []);
  assert.deepEqual(ok.map((c) => c.id).sort(), Object.keys(failing).sort(), "검사마다 틀린 데이터가 있다");
  for (const [id, mutate] of Object.entries(failing)) {
    const plan = example();
    mutate(plan);
    const checks = computeContext(plan, intentSkillDir).checks as { id: string; ok: boolean; detail: string }[];
    const target = checks.find((c) => c.id === id)!;
    assert.equal(target.ok, false, `${id}는 실패해야 한다`);
    assert.ok(target.detail.length > 0, `${id} 실패 이유`);
    assert.deepEqual(checks.filter((c) => !c.ok).map((c) => c.id), [id], `${id}: 그 검사만 실패`);
  }
  const noUrl = example();
  delete noUrl.actors!.find((a) => a.id === "A-2")!.docs!.url;
  assert.equal((computeContext(noUrl, intentSkillDir).checks as { id: string; ok: boolean }[]).find((c) => c.id === "sequence-docs")!.ok, false, "URL 없는 외부 문서");
  const vendor = example();
  vendor.open = [...(vendor.open ?? []), { id: "Q-9", text: "문자 발송 업체 미정", impact: "발송 API", cond: "착수 전 선택" }];
  vendor.actors!.find((a) => a.id === "A-2")!.docs = { title: "문자 발송 API", open: "Q-9" };
  const docsCheck = (p: Plan) => (computeContext(p, intentSkillDir).checks as { id: string; ok: boolean }[]).find((c) => c.id === "sequence-docs")!.ok;
  assert.equal(docsCheck(vendor), true, "업체 미정은 미결 항목을 가리키면 통과");
  const vendorPlanSchema = JSON.parse(readFileSync(join(templates, "_base", "plan.schema.json"), "utf8")) as Schema;
  assert.deepEqual(validate(vendor, vendorPlanSchema), [], "docs.open은 원본 schema가 받는다");
  assert.match((computeContext(vendor, intentSkillDir).checks as { id: string; detail: string }[]).find((c) => c.id === "sequence-docs")!.detail, /미결 표시\(증명 아님\): .+ → Q-9/);
  vendor.actors!.find((a) => a.id === "A-2")!.docs = { title: "문자 발송 API", url: "https://vendor.example/docs", open: "Q-9" };
  assert.equal(docsCheck(vendor), false, "URL이 있는데 미결을 가리키면 우회 — 실패");
  vendor.actors!.find((a) => a.id === "A-2")!.docs = { title: "문자 발송 API", open: "Q-404" };
  assert.equal(docsCheck(vendor), false, "없는 미결 항목");
  const human = example();
  human.components!.find((c) => c.id === "C-1")!.client = false;
  const async = (computeContext(human, intentSkillDir).checks as { id: string; ok: boolean }[]).find((c) => c.id === "sequence-async-done")!;
  assert.equal(async.ok, true, "사람 행위자(A-1)에게 끝을 알려도 통과");
  const unrelated = example();
  unrelated.sequences![0]!.usecase = "UC-01";
  assert.match((computeContext(unrelated, intentSkillDir).checks as { id: string; detail: string }[]).find((c) => c.id === "id-refs")!.detail, /UC-01\(시퀀스 사유\)/);
  const edge = example();
  edge.flows![0]!.edges.push({ from: "없는노드", to: edge.flows![0]!.nodes[0]!.id });
  assert.match((computeContext(edge, intentSkillDir).checks as { id: string; detail: string }[]).find((c) => c.id === "id-refs")!.detail, /없는노드/);
});

test("기존·변경 화면은 제품 저장소의 실제 경로:줄이 있으면 통과하고, 근거가 없거나 저장소 밖이면 실패한다", () => {
  const root = tempDir();
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "Editor.tsx"), "a\nb\nc\n");
  const check = (screen: Partial<Plan["screens"][number]>) => {
    const plan = example();
    Object.assign(plan.screens[0]!, screen);
    return (computeContext(plan, root).checks as { id: string; ok: boolean }[]).find((c) => c.id === "existing-evidence")!.ok;
  };
  assert.equal(check({ status: "기존", evidence: "src/Editor.tsx:3" }), true);
  assert.equal(check({ status: "변경", evidence: "src/Editor.tsx:9" }), false, "줄이 파일보다 길다");
  assert.equal(check({ status: "기존" }), false, "근거 없음");
  assert.equal(check({ status: "기존", evidence: "../etc/passwd:1" }), false, "저장소 밖");
  assert.equal(check({ status: "신규" }), true);
  assert.equal(check({ status: "기존", evidence: "src/Editor.tsx:4" }), false, "끝 줄바꿈 뒤 빈 조각은 줄이 아니다");
  const outside = tempDir();
  writeFileSync(join(outside, "secret.txt"), "x\n");
  symlinkSync(outside, join(root, "link"));
  assert.equal(check({ status: "기존", evidence: "link/secret.txt:1" }), false, "링크로 저장소 밖");
  symlinkSync(join(outside, "secret.txt"), join(root, "file-link.txt"));
  assert.equal(check({ status: "기존", evidence: "file-link.txt:1" }), false, "파일 링크로 저장소 밖");
});

test("데이터 속 <script>는 실행 경로 없이 글자로만 들어간다", () => {
  const plan = example();
  plan.usecases[0]!.name = '<script>window.__x=1</script></script><img src=x onerror="window.__x=2">';
  plan.doc.project = "</title><script>alert(1)</script>";
  const scheme = example();
  scheme.actors![1]!.docs!.url = "javascript:alert(1)";
  const planSchema = JSON.parse(readFileSync(join(templates, "_base", "plan.schema.json"), "utf8")) as Schema;
  assert.deepEqual(validate(scheme, planSchema).map((e) => e.path), ["$.actors[1].docs.url"], "http(s)가 아닌 링크는 원본 단계에서 거부");
  const { pages } = renderPages(plan, { root: intentSkillDir });
  for (const page of pages) {
    assert.equal((page.html.match(/<script\b/g) ?? []).length, 2, `${page.kind}: 데이터 블록과 렌더 코드 두 개뿐`);
    assert.ok(!page.html.includes("<script>window.__x") && !page.html.includes("<img src=x"), page.kind);
    assert.ok(page.html.includes("<title>&#60;/title&#62;&#60;script&#62;alert(1)&#60;/script&#62; · "), `${page.kind}: 제목 이스케이프`);
  }
  const usecase = pages.find((p) => p.kind === "usecase")!;
  assert.ok(usecase.html.includes("\\u003cscript>window.__x=1\\u003c/script>"));
  assert.equal((embedded(usecase.html) as { usecases: { name: string }[] }).usecases[0]!.name, plan.usecases[0]!.name, "글자 그대로 되돌아온다");
  const collide = example();
  collide.doc.project = "@DATA@ /*@BASE_JS@*/";
  const title = /<title>(.*)<\/title>/.exec(renderPages(collide, { root: intentSkillDir }).pages[0]!.html)![1]!;
  assert.equal(title, "@DATA@ /*@BASE_JS@*/ · 목차", "넣은 값 안의 자리 표시는 다시 바꾸지 않는다");
  for (const page of pages) assert.match(page.html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none';[^"]*base-uri 'none'; form-action 'none'">/, `${page.kind} CSP`);
  const injected = example();
  const block = injected.wireframes!.flatMap((w) => Object.values(w.states).flat()).find((b) => (b as { t: string }).t === "progress") as Record<string, unknown>;
  block.value = "1%;position:fixed;background:url(https://x/)";
  const schemaErrors = validate(injected, JSON.parse(readFileSync(join(templates, "_base", "plan.schema.json"), "utf8")) as Schema);
  assert.ok(schemaErrors.length > 0, "와이어프레임 블록 값의 CSS 주입은 원본 단계에서 거부");
  const planSchemaForBlocks = JSON.parse(readFileSync(join(templates, "_base", "plan.schema.json"), "utf8")) as Schema;
  for (const [value, extra] of [[150, {}], [50, { style: "x" }], [-1, {}]] as const) {
    Object.assign(block, { value }, extra);
    assert.ok(validate(injected, planSchemaForBlocks).length > 0, `progress ${value} ${JSON.stringify(extra)} 거부`);
    delete (block as Record<string, unknown>).style;
  }
  const wireframe = readFileSync(join(templates, "wireframe", "template.html"), "utf8");
  assert.match(wireframe, /width:' \+ clampInt\(b\.value, 0, 100\)/);
  assert.match(wireframe, /b\.variant === 'primary' \? 'primary' : 'secondary'/);
  const base = readFileSync(join(templates, "_base", "base.js"), "utf8");
  const safeUrl = new Function(`${/function safeUrl[^\n]+/.exec(base)![0]}; return safeUrl;`)() as (u: unknown) => string | null;
  assert.equal(safeUrl("https://developers.tiktok.com/x"), "https://developers.tiktok.com/x");
  assert.equal(safeUrl("HTTPS://A.B"), "HTTPS://A.B");
  for (const bad of ["javascript:alert(1)", " https://a.b", "data:text/html,x", "//evil.example", null]) assert.equal(safeUrl(bad), null, String(bad));
  assert.doesNotMatch(base + readdirSync(templates).filter((k) => !k.startsWith("_")).map((k) => readFileSync(join(templates, k, "template.html"), "utf8")).join(""), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("CLI: render는 문서와 검사 요약을, verify는 실패 시 종료 1을, 어긋난 plan.json은 칸 경로와 함께 실패한다", () => {
  const home = tempDir();
  const docs = join(home, "docs");
  mkdirSync(docs);
  writeFileSync(join(docs, "plan.json"), JSON.stringify(example()));
  const render = runPace(["intent", "render", docs, "--legacy-wireframe"], { home });
  assert.equal(render.status, 0, render.stderr);
  assert.match(render.stdout, /증명 검사 13\/13 통과/);
  const sizes = /원본 (\d+)바이트 → HTML 7개 (\d+)바이트/.exec(render.stdout);
  assert.ok(sizes && Number(sizes[1]) < Number(sizes[2]), "원본 데이터가 HTML 합계보다 작다(D12)");
  for (const kind of KINDS) assert.ok(existsSync(join(docs, `${kind}.html`)), kind);
  assert.equal(runPace(["intent", "verify", docs], { home }).status, 0);
  const broken = example();
  failing["no-orphans"]!(broken);
  writeFileSync(join(docs, "plan.json"), JSON.stringify(broken));
  const verify = runPace(["intent", "verify", docs], { home });
  assert.equal(verify.status, 1);
  assert.match(verify.stdout, /✘ IA 화면마다 쓰는 유스케이스가 있다\(고아 화면 없음\) — SCR-50/);
  const invalid = example() as unknown as { screens: Record<string, unknown>[] };
  invalid.screens[0]!.data = "yes";
  writeFileSync(join(docs, "plan.json"), JSON.stringify(invalid));
  const bad = runPace(["intent", "render", docs], { home });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /\$\.screens\[0\]\.data: boolean이어야 한다/);
  assert.equal(runPace(["intent", "render", join(home, "없음")], { home }).status, 1);
});

test("schema 검사기는 상속 키·모르는 키워드로 우회되지 않는다", () => {
  const schema: Schema = { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string" } } };
  assert.deepEqual(validate(JSON.parse('{"a":"x","__proto__":{"b":1}}'), schema).map((e) => e.message), ["정의되지 않은 칸이다"]);
  assert.deepEqual(validate({ constructor: "x" }, schema).map((e) => e.path).sort(), ["$.a", "$.constructor"]);
  assert.match(validate("x", { type: "string", format: "date" } as unknown as Schema)[0]!.message, /지원하지 않는 schema 키워드: format/);
  const plan = JSON.parse(readFileSync(join(templates, "_base", "plan.schema.json"), "utf8")) as Schema;
  for (const kind of KINDS) {
    const page = JSON.parse(readFileSync(join(templates, kind, "schema.json"), "utf8")) as Schema;
    assert.deepEqual(page.definitions, plan.definitions, `${kind}: 공통 정의가 plan.schema.json과 같다`);
  }
});

test("템플릿 메타데이터: 접두어 겹침·잘못된 접두어·없는 칸은 거절하고, 깊이를 줄여 다시 만들면 예전 문서를 지운다", () => {
  const copy = () => {
    const skill = join(tempDir("pace-intent-"), "pace-intent");
    cpSync(intentSkillDir, skill, { recursive: true });
    return skill;
  };
  const extra = (skill: string, meta: Record<string, unknown>) => {
    mkdirSync(join(skill, "templates", "extra"));
    writeFileSync(join(skill, "templates", "extra", "template.html"), "<title>@TITLE@</title>/*@BASE_CSS@*//*@BASE_JS@*/@DATA@");
    writeFileSync(join(skill, "templates", "extra", "schema.json"), JSON.stringify({ "x-pace": { title: "추가", uses: ["screens"], ...meta } }));
  };
  const dup = copy();
  extra(dup, { ids: ["UC"] });
  assert.throws(() => loadTemplates(dup), (e: unknown) => e instanceof IntentError && /ID 접두어 UC가/.test(e.message));
  const dash = copy();
  extra(dash, { ids: ["X-Y"] });
  assert.throws(() => loadTemplates(dash), /대문자만/);
  const missing = copy();
  extra(missing, { uses: ["entities"] });
  assert.throws(() => renderPages(example(), { skillDir: missing, root: missing }), /x-pace\.uses에 없는 칸: entities/);
  const docs = join(tempDir(), "docs");
  mkdirSync(docs);
  writeFileSync(join(docs, "plan.json"), JSON.stringify(example()));
  renderDocs(docs, { root: intentSkillDir });
  writeFileSync(join(docs, "notes.html"), "사용자 파일");
  const smaller = example();
  delete smaller.flows;
  delete smaller.sequences;
  for (const u of smaller.usecases) delete u.sequence;
  writeFileSync(join(docs, "plan.json"), JSON.stringify(smaller));
  renderDocs(docs, { root: intentSkillDir });
  assert.ok(!existsSync(join(docs, "flow.html")) && !existsSync(join(docs, "sequence.html")), "예전 문서 삭제");
  assert.ok(existsSync(join(docs, "notes.html")), "템플릿 이름이 아닌 파일은 두고");
});
