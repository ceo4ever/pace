//#region src/editor/sizeLimits.ts
const SIZE_LIMIT_FIELDS = [
	"minWidth",
	"maxWidth",
	"minHeight",
	"maxHeight"
];
function sizeLimitProblem(n) {
	for (const k of SIZE_LIMIT_FIELDS) {
		const v = n[k];
		if (v !== void 0 && (!Number.isFinite(v) || v < 0 || v > 1e7)) return "크기 제한은 0 이상 10000000 이하의 숫자여야 합니다.";
	}
	if ((n.type === "group" || n.type === "vector") && (n.maxWidth === 0 || n.maxHeight === 0)) return "그룹·벡터 최대 크기는 0보다 커야 합니다.";
	if (n.minWidth !== void 0 && n.maxWidth !== void 0 && n.minWidth > n.maxWidth) return "너비 최소값은 최대값 이하여야 합니다.";
	if (n.minHeight !== void 0 && n.maxHeight !== void 0 && n.minHeight > n.maxHeight) return "높이 최소값은 최대값 이하여야 합니다.";
	return null;
}
//#endregion
//#region src/editor/geometry.ts
function isPage(doc, id) {
	return id in doc.pages;
}
//#endregion
//#region src/editor/types.ts
const MAX_BLUR = 1e3;
const MAX_SHADOW_OFFSET = 1e4;
const MAX_DASH = 1e4;
const MAX_GRADIENT_FRACTION = 1e3;
const MAX_ANGLE = 3600;
const MAX_LINE_HEIGHT_PX = 1e4;
const MAX_LINES = 1e4;
const MAX_PATHS = 1e3;
const MAX_PATH_LENGTH = 1e6;
const MAX_TRACKS = 1e3;
/** Node fields a variable can drive, and the variable type each takes. */
const BINDABLE_FIELDS = {
	minWidth: "number",
	maxWidth: "number",
	minHeight: "number",
	maxHeight: "number",
	opacity: "number",
	strokeWidth: "number",
	cornerRadius: "number",
	fontFamily: "font",
	fontSize: "number",
	fontWeight: "number",
	lineHeight: "number",
	letterSpacing: "number",
	text: "string",
	gap: "number",
	counterGap: "number",
	paddingTop: "number",
	paddingRight: "number",
	paddingBottom: "number",
	paddingLeft: "number",
	/** A text style: drives font family, size, weight, line height and letter spacing together. */
	typography: "typography"
};
const MAX_VARIABLES = 5e3;
//#endregion
//#region src/editor/path.ts
const PARAMS = {
	M: 2,
	L: 2,
	T: 2,
	H: 1,
	V: 1,
	C: 6,
	S: 4,
	Q: 4,
	A: 7,
	Z: 0
};
const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/y;
/** Cubic segments for an SVG elliptical arc (SVG 1.1 implementation notes F.6.5), or a line when a radius is 0. */
function arcToCubics(x1, y1, rxIn, ryIn, angle, large, sweep, x2, y2) {
	if (x1 === x2 && y1 === y2) return [];
	let [rx, ry] = [Math.abs(rxIn), Math.abs(ryIn)];
	if (!rx || !ry) return [[
		"L",
		x2,
		y2
	]];
	const chord = Math.hypot(x2 - x1, y2 - y1);
	const big = Math.max(rx, ry);
	const target = Math.min(Math.max(big, chord * 1e-6), chord * 1e6);
	[rx, ry] = [rx / big * target, ry / big * target];
	const phi = angle * Math.PI / 180;
	const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
	const [dx, dy] = [(x1 - x2) / 2, (y1 - y2) / 2];
	const x1p = cos * dx + sin * dy;
	const y1p = -sin * dx + cos * dy;
	const lambda = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
	if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];
	const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
	const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
	const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
	const cxp = coef * rx * y1p / ry;
	const cyp = -coef * ry * x1p / rx;
	const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
	const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
	const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
	const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
	let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
	if (!sweep && dt > 0) dt -= 2 * Math.PI;
	if (sweep && dt < 0) dt += 2 * Math.PI;
	const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
	const d = dt / n;
	const k = 4 / 3 * Math.tan(d / 4);
	const map = (ux, uy) => [cx + cos * rx * ux - sin * ry * uy, cy + sin * rx * ux + cos * ry * uy];
	const out = [];
	for (let i = 0; i < n; i++) {
		const [a1, a2] = [t1 + i * d, t1 + (i + 1) * d];
		const [c1x, c1y] = map(Math.cos(a1) - k * Math.sin(a1), Math.sin(a1) + k * Math.cos(a1));
		const [c2x, c2y] = map(Math.cos(a2) + k * Math.sin(a2), Math.sin(a2) - k * Math.cos(a2));
		const [ex, ey] = i === n - 1 ? [x2, y2] : map(Math.cos(a2), Math.sin(a2));
		out.push([
			"C",
			c1x,
			c1y,
			c2x,
			c2y,
			ex,
			ey
		]);
	}
	return out.every((c) => c.slice(1).every((v) => Number.isFinite(v))) ? out : [[
		"L",
		x2,
		y2
	]];
}
/** Most commands a path may have after parsing (arcs add up to 4 each); document files also cap a vector's total. */
const MAX_PATH_COMMANDS = 5e4;
/** Parse SVG path data into absolute M / L / C / Z commands. Null when the data is not valid path syntax or too long. */
function parsePath(d, maxCommands = MAX_PATH_COMMANDS) {
	const out = [];
	let i = 0;
	const skip = () => {
		while (i < d.length && /[\s,]/.test(d[i])) i++;
	};
	const number = () => {
		skip();
		NUMBER.lastIndex = i;
		const m = NUMBER.exec(d);
		if (!m) return null;
		i += m[0].length;
		const v = parseFloat(m[0]);
		return Number.isFinite(v) ? v : null;
	};
	const flag = () => {
		skip();
		if (d[i] !== "0" && d[i] !== "1") return null;
		return d[i++] === "1";
	};
	let [x, y, sx, sy] = [
		0,
		0,
		0,
		0
	];
	const last = { prev: null };
	let cmd = "";
	skip();
	if (i < d.length && d[i] !== "M" && d[i] !== "m") return null;
	while (true) {
		skip();
		if (i >= d.length) break;
		const ch = d[i];
		if (/[A-Za-z]/.test(ch)) {
			if (!(ch.toUpperCase() in PARAMS)) return null;
			cmd = ch;
			i++;
		} else if (!cmd || cmd === "Z" || cmd === "z") return null;
		else if (cmd === "M") cmd = "L";
		else if (cmd === "m") cmd = "l";
		const up = cmd.toUpperCase();
		const rel = cmd !== up;
		if (up === "Z") {
			out.push(["Z"]);
			[x, y] = [sx, sy];
			last.prev = null;
			continue;
		}
		const p = [];
		for (let k = 0; k < PARAMS[up]; k++) {
			const v = up === "A" && (k === 3 || k === 4) ? flag() : number();
			if (v === null) return null;
			p.push(typeof v === "boolean" ? v ? 1 : 0 : v);
		}
		const ax = (v) => rel ? x + v : v;
		const ay = (v) => rel ? y + v : v;
		let next = null;
		switch (up) {
			case "M":
				[x, y] = [ax(p[0]), ay(p[1])];
				[sx, sy] = [x, y];
				out.push([
					"M",
					x,
					y
				]);
				break;
			case "L":
				[x, y] = [ax(p[0]), ay(p[1])];
				out.push([
					"L",
					x,
					y
				]);
				break;
			case "H":
				x = rel ? x + p[0] : p[0];
				out.push([
					"L",
					x,
					y
				]);
				break;
			case "V":
				y = rel ? y + p[0] : p[0];
				out.push([
					"L",
					x,
					y
				]);
				break;
			case "C": {
				const c = [
					"C",
					ax(p[0]),
					ay(p[1]),
					ax(p[2]),
					ay(p[3]),
					ax(p[4]),
					ay(p[5])
				];
				out.push(c);
				next = {
					cmd: "C",
					cx: c[3],
					cy: c[4]
				};
				[x, y] = [c[5], c[6]];
				break;
			}
			case "S": {
				const [r1x, r1y] = last.prev?.cmd === "C" ? [2 * x - last.prev.cx, 2 * y - last.prev.cy] : [x, y];
				const c = [
					"C",
					r1x,
					r1y,
					ax(p[0]),
					ay(p[1]),
					ax(p[2]),
					ay(p[3])
				];
				out.push(c);
				next = {
					cmd: "C",
					cx: c[3],
					cy: c[4]
				};
				[x, y] = [c[5], c[6]];
				break;
			}
			case "Q":
			case "T": {
				const [qx, qy] = up === "Q" ? [ax(p[0]), ay(p[1])] : last.prev?.cmd === "Q" ? [2 * x - last.prev.cx, 2 * y - last.prev.cy] : [x, y];
				const [ex, ey] = up === "Q" ? [ax(p[2]), ay(p[3])] : [ax(p[0]), ay(p[1])];
				out.push([
					"C",
					x + (qx - x) * 2 / 3,
					y + (qy - y) * 2 / 3,
					ex + (qx - ex) * 2 / 3,
					ey + (qy - ey) * 2 / 3,
					ex,
					ey
				]);
				next = {
					cmd: "Q",
					cx: qx,
					cy: qy
				};
				[x, y] = [ex, ey];
				break;
			}
			case "A": {
				const [ex, ey] = [ax(p[5]), ay(p[6])];
				out.push(...arcToCubics(x, y, p[0], p[1], p[2], !!p[3], !!p[4], ex, ey));
				[x, y] = [ex, ey];
				break;
			}
		}
		last.prev = next;
		if (out.length > maxCommands) return null;
		if (!Number.isFinite(x) || !Number.isFinite(y) || !out.at(-1).every((v) => typeof v === "string" || Number.isFinite(v))) return null;
	}
	return out;
}
/** Largest absolute coordinate (for validation). */
const pathExtent = (cmds) => cmds.reduce((m, c) => Math.max(m, ...c.slice(1).map(Math.abs)), 0);
//#endregion
//#region src/editor/doc.ts
/** Deep copy that also works on immer drafts (structuredClone rejects Proxies). */
const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj$1 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
/**
* Accept a stored or imported document and bring it to the current version.
* Version 1 had solid-only paints without a `type`; version 2 had no effects, only centered solid strokes
* and text line heights as a plain multiplier without decoration or line limit; version 3 had no variables.
* Returns null for anything unrecognised.
*/
function migrateDoc(raw) {
	if (!isObj$1(raw) || raw.version !== 1 && raw.version !== 2 && raw.version !== 3 && raw.version !== 4) return null;
	if (!isObj$1(raw.pages) || !isObj$1(raw.nodes) || !Array.isArray(raw.pageOrder) || !raw.pageOrder.length) return null;
	if (!raw.pageOrder.every((p) => typeof p === "string" && isObj$1(raw.pages[p]))) return null;
	if (!Object.values(raw.nodes).every((n) => isObj$1(n) && Array.isArray(n.fills) && Array.isArray(n.strokes))) return null;
	if (raw.version === 4) {
		if (!isObj$1(raw.collections) || !isObj$1(raw.variables) || !Array.isArray(raw.collectionOrder)) return null;
		if (!Object.values(raw.nodes).some((n) => n.type === "frame" && isObj$1(n.layout) && !("counterGap" in n.layout))) return raw;
		const fixed = clone(raw);
		for (const n of Object.values(fixed.nodes)) {
			const l = n.type === "frame" ? n.layout : void 0;
			if (n.type === "frame" && typeof l === "object" && l !== null && !("counterGap" in l)) n.layout = {
				...n.layout,
				counterGap: n.layout.gap
			};
		}
		return fixed;
	}
	const from = raw.version;
	const doc = clone(raw);
	if (from < 3) for (const n of Object.values(doc.nodes)) {
		if (from === 1) {
			const solid = (p) => ({
				type: "solid",
				...p
			});
			n.fills = n.fills.map(solid);
			n.strokes = n.strokes.map(solid);
		}
		n.effects = [];
		n.strokeAlign = "center";
		n.strokeDash = null;
		if (n.type === "vector") n.paths = [];
		if (n.type === "text") {
			n.lineHeight = {
				unit: "multiplier",
				value: n.lineHeight
			};
			n.textDecoration = "none";
			n.maxLines = null;
		}
	}
	for (const n of Object.values(doc.nodes)) if (n.type === "frame") n.layout = {
		...n.layout,
		counterGap: n.layout.gap
	};
	doc.collections = {};
	doc.collectionOrder = [];
	doc.variables = {};
	doc.version = 4;
	return doc;
}
const isContainer = (n) => !!n && (n.type === "frame" || n.type === "group");
/** Ancestor container ids from the node's parent up to (not including) the page. */
function ancestors(doc, id) {
	const out = [];
	let cur = doc.nodes[id].parentId;
	while (!isPage(doc, cur)) {
		out.push(cur);
		cur = doc.nodes[cur].parentId;
	}
	return out;
}
//#endregion
//#region src/editor/kitVersion.ts
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function versionParts(value) {
	if (typeof value === "number") return Number.isSafeInteger(value) && value >= 1 && value <= 1e9 ? [
		value,
		0,
		0
	] : null;
	if (typeof value !== "string") return null;
	const match = SEMVER.exec(value);
	if (!match) return null;
	const parts = match.slice(1).map(Number);
	return parts.every((part) => Number.isSafeInteger(part) && part <= 1e9) ? parts : null;
}
//#endregion
//#region src/editor/variables.ts
const MAX_ABS$1 = 1e7;
const MAX_STRING = 1e5;
const VAR_COLOR = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
const ALIAS_ID = /^[A-Za-z0-9_-]{1,64}$/;
const isAlias = (v) => typeof v === "object" && v !== null && "alias" in v;
const aliasShape = (v) => isAlias(v) && Object.keys(v).length === 1 && typeof v.alias === "string" && ALIAS_ID.test(v.alias);
/** Parts of a text style: the variable type an alias must have and the accepted range. */
const TYPOGRAPHY_PARTS = {
	fontFamily: {
		type: "font",
		min: 0,
		max: 0
	},
	fontSize: {
		type: "number",
		min: .01,
		max: 1e4
	},
	fontWeight: {
		type: "number",
		min: 1,
		max: 1e3
	},
	lineHeight: {
		type: "number",
		min: 0,
		max: 100
	},
	letterSpacing: {
		type: "number",
		min: -1e4,
		max: 1e4
	}
};
const PARTS = Object.keys(TYPOGRAPHY_PARTS);
const validPart = (k, v) => {
	const spec = TYPOGRAPHY_PARTS[k];
	return spec.type === "font" ? validLiteral("font", v) : typeof v === "number" && Number.isFinite(v) && v >= spec.min && v <= spec.max;
};
/** Is `v` a literal value of this variable type (whole-value aliases are checked separately)? Text styles may alias their parts. */
function validLiteral(type, v) {
	switch (type) {
		case "typography": return typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === PARTS.length && PARTS.every((k) => k in v && (aliasShape(v[k]) || validPart(k, v[k])));
		case "color": return typeof v === "string" && VAR_COLOR.test(v);
		case "number": return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_ABS$1;
		case "string": return typeof v === "string" && v.length <= MAX_STRING;
		case "font": return typeof v === "string" && v.trim().length > 0 && v.length <= 200;
	}
}
const prefixes = (name) => {
	const segs = name.split("/");
	return segs.slice(0, -1).map((_, i) => segs.slice(0, i + 1).join("/"));
};
function nameIndex(doc) {
	const index = {
		byName: /* @__PURE__ */ new Map(),
		groups: /* @__PURE__ */ new Map()
	};
	for (const v of Object.values(doc.variables)) indexAdd(index, v.name, v.id);
	return index;
}
function indexAdd(index, name, id) {
	index.byName.set(name, id);
	for (const p of prefixes(name)) index.groups.set(p, (index.groups.get(p) ?? 0) + 1);
}
/** Group or token names that would walk into Object.prototype members when used as keys. */
const reserved = (s) => s === "__proto__" || s in Object.prototype;
/**
* Why `name` cannot name a variable, or null. Segments are DTCG group/token names: not empty, no ".", "{", "}"
* and no leading "$"; a name cannot also be a group of another name (DTCG cannot hold both).
*/
function nameProblem(doc, name, exceptId, index = nameIndex(doc)) {
	if (!name || name.length > 200) return `Name must be 1 to 200 characters`;
	const segs = name.split("/");
	if (segs.some((s) => !s || s !== s.trim())) return "Name parts cannot be empty";
	if (segs.some((s) => /[.{}]/.test(s) || s.startsWith("$"))) return "Name parts cannot contain \".\", \"{\", \"}\" or start with \"$\"";
	if (segs.some(reserved)) return `"${segs.find(reserved)}" is a reserved name`;
	const same = index.byName.get(name);
	if (same !== void 0 && same !== exceptId) return `"${name}" already exists`;
	const own = exceptId && doc.variables[exceptId]?.name;
	if ((index.groups.get(name) ?? 0) - (own && own.startsWith(`${name}/`) ? 1 : 0) > 0) return `"${name}" clashes with a group of that name`;
	for (const p of prefixes(name)) {
		const other = index.byName.get(p);
		if (other !== void 0 && other !== exceptId) return `"${name}" clashes with "${p}"`;
	}
	return null;
}
/**
* The literal value of a variable, following aliases. `modes` picks a mode per collection (the collection's
* default otherwise). Null when an alias is missing, of another type, or loops.
*/
function resolveVariable(doc, id, modes = {}) {
	let cur = doc.variables[id];
	const type = cur?.type;
	for (let depth = 0; cur && depth <= 64; depth++) {
		if (cur.type !== type) return null;
		const c = doc.collections[cur.collectionId];
		if (!c) return null;
		const mode = modes[c.id] && c.modes.some((m) => m.id === modes[c.id]) ? modes[c.id] : c.defaultModeId;
		const val = cur.values[mode];
		if (val === void 0) return null;
		if (isAlias(val)) {
			cur = doc.variables[val.alias];
			continue;
		}
		if (typeof val !== "object") return val;
		const out = {};
		for (const k of PARTS) {
			const part = val[k];
			const r = isAlias(part) ? doc.variables[part.alias]?.type === TYPOGRAPHY_PARTS[k].type ? resolveVariable(doc, part.alias, modes) : null : part;
			if (r === null || !validPart(k, r)) return null;
			out[k] = r;
		}
		return out;
	}
	return null;
}
/** Why a variable's aliases cannot resolve (missing target, other type, loop), or null. */
function aliasProblem(doc, id) {
	const v = doc.variables[id];
	for (const [mode, val] of Object.entries(v.values)) {
		if (v.type === "typography" && typeof val === "object" && !isAlias(val)) for (const k of PARTS) {
			const part = val[k];
			if (!isAlias(part)) continue;
			const t = doc.variables[part.alias];
			if (!t) return `"${v.name}" refers to a missing variable`;
			if (t.type !== TYPOGRAPHY_PARTS[k].type) return `"${v.name}" ${k} refers to "${t.name}" of another type`;
		}
		if (!isAlias(val)) continue;
		const seen = /* @__PURE__ */ new Set([id]);
		let cur = val;
		for (let depth = 0; isAlias(cur); depth++) {
			const t = doc.variables[cur.alias];
			if (!t) return `"${v.name}" refers to a missing variable`;
			if (t.type !== v.type) return `"${v.name}" refers to "${t.name}" of another type`;
			if (seen.has(t.id) || depth >= 64) return `"${v.name}" refers to itself through aliases`;
			seen.add(t.id);
			cur = t.values[t.collectionId === v.collectionId ? mode : doc.collections[t.collectionId]?.defaultModeId];
			if (cur === void 0) return `"${t.name}" has no value`;
		}
	}
	return null;
}
/** Can this layer's `field` follow a variable? */
function fieldApplies(n, field) {
	switch (field) {
		case "minHeight":
		case "maxHeight": return n.type !== "line";
		case "cornerRadius": return n.type === "frame" || n.type === "rect";
		case "fontFamily":
		case "fontSize":
		case "fontWeight":
		case "lineHeight":
		case "letterSpacing":
		case "text":
		case "typography": return n.type === "text";
		case "gap":
		case "counterGap":
		case "paddingTop":
		case "paddingRight":
		case "paddingBottom":
		case "paddingLeft": return n.type === "frame";
		default: return true;
	}
}
/** Resolve all limit bindings together before writing any field or variable-driven geometry. */
function sizeLimitBindingProblem(doc, n, modes) {
	if (!SIZE_LIMIT_FIELDS.some((f) => n.bindings?.[f])) return sizeLimitProblem(n);
	modes ??= modesFor(doc, n.id);
	const values = {
		type: n.type,
		minWidth: n.minWidth,
		maxWidth: n.maxWidth,
		minHeight: n.minHeight,
		maxHeight: n.maxHeight
	};
	for (const f of SIZE_LIMIT_FIELDS) {
		const id = n.bindings?.[f];
		if (!id) continue;
		const v = resolveVariable(doc, id, modes);
		if (typeof v !== "number") return "크기 제한 변수의 숫자 값을 확인할 수 없습니다.";
		values[f] = v;
	}
	return sizeLimitProblem(values);
}
/**
* Variable mode per collection for a layer: the nearest frame (itself included) or the page that sets one wins;
* collections nobody sets use their default mode (left out). `memo` (container id → modes) speeds up many calls.
*/
function modesFor(doc, id, memo) {
	const chain = [];
	let base = {};
	for (let cur = id; cur;) {
		const hit = memo?.get(cur);
		if (hit) {
			base = hit;
			break;
		}
		chain.push(cur);
		const n = doc.nodes[cur];
		if (!n) {
			base = doc.pages[cur]?.variableModes ?? {};
			chain.pop();
			if (doc.pages[cur]) memo?.set(cur, base);
			break;
		}
		cur = n.parentId;
	}
	for (let i = chain.length - 1; i >= 0; i--) {
		const n = doc.nodes[chain[i]];
		if (n.type === "frame" && n.variableModes && Object.keys(n.variableModes).length) base = {
			...base,
			...n.variableModes
		};
		memo?.set(chain[i], base);
	}
	return base;
}
/** A layer inside a copy (its id carries the copy's id). */
const isSublayer = (id) => id.includes(";");
const isComponent = (n) => n?.type === "frame" && !!n.component;
const isInstance = (n) => n?.type === "frame" && !!n.instanceOf;
/** Fields a copy may set differently from its main and keep when the main changes. */
const OVERRIDABLE = [
	"minWidth",
	"maxWidth",
	"minHeight",
	"maxHeight",
	"text",
	"fills",
	"strokes",
	"strokeWidth",
	"visible",
	"opacity",
	"effects",
	"cornerRadius",
	"fontFamily",
	"fontSize",
	"fontWeight",
	"lineHeight",
	"letterSpacing",
	"textDecoration",
	"textAlign",
	"bindings"
];
/** A copy's own root may also be resized. */
const ROOT_OVERRIDABLE = [
	...OVERRIDABLE.filter((f) => f !== "visible"),
	"w",
	"h",
	"sizing",
	"sizeBasis",
	"variableModes"
];
/** Every id in a layer's subtree (itself first). */
function subtree(doc, id) {
	const out = [];
	const walk = (x) => {
		const n = doc.nodes[x];
		if (!n) return;
		out.push(x);
		if (isContainer(n)) n.children.forEach(walk);
	};
	walk(id);
	return out;
}
/**
* Past the limits? Copies may not take a document past MAX_EXPANDED_NODES layers (a document of plain layers is
* never refused for its size here), copies may not nest past MAX_COPY_DEPTH, and layers (copies expanded) not past
* MAX_TREE_DEPTH.
*/
const overLimit = (doc, size) => size.nodes > 1e5 && size.nodes > Object.keys(doc.nodes).length || size.depth > 15 || size.height > 1e3;
/** Deepest layer nesting once copies are expanded (far beyond any design; keeps recursive walks safe). */
const MAX_TREE_DEPTH = 1e3;
/** Most layers a document may hold once every copy is expanded (a few nested copies can multiply quickly). */
const MAX_EXPANDED_NODES = 1e5;
/**
* Layers a document will hold once every copy is expanded, the deepest copy nesting and the deepest layer nesting —
* computed from the mains without expanding anything (memoized per main, so each layer is visited once). Counts are
* exact up to the layer nesting limit; past MAX_TREE_DEPTH counting stops and the result is Infinity (such a document
* is over the limit, and comparing two such sizes says nothing). `extra` adds copies about to be placed.
*/
function expandedSize(doc, extra = []) {
	const memo = /* @__PURE__ */ new Map();
	const visiting = /* @__PURE__ */ new Set();
	const past = {
		nodes: Infinity,
		depth: Infinity,
		height: Infinity
	};
	const ofMain = (m, level) => {
		const hit = memo.get(m);
		if (hit) return hit;
		if (visiting.has(m) || !doc.nodes[m]) return {
			nodes: 1,
			depth: 0,
			height: 1
		};
		visiting.add(m);
		const r = ofTree(m, level, true);
		visiting.delete(m);
		memo.set(m, r);
		return r;
	};
	const ofTree = (id, level, isMainRoot = false) => {
		const n = doc.nodes[id];
		if (!n) return {
			nodes: 0,
			depth: 0,
			height: 0
		};
		if (level > 1e3) return past;
		if (!isMainRoot && isInstance(n)) {
			const m = ofMain(n.instanceOf, level);
			let { nodes, depth, height } = {
				nodes: m.nodes,
				depth: m.depth + 1,
				height: m.height
			};
			for (const p of propsOf(doc, n.instanceOf)) if (p.type === "swap") {
				const t = n.propValues?.[p.id];
				if (typeof t === "string" && doc.nodes[t] && t !== n.instanceOf) {
					const sz = ofMain(t, level + 1);
					nodes += sz.nodes;
					depth = Math.max(depth, m.depth + 1 + sz.depth);
					height = Math.max(height, m.height + sz.height);
				}
			}
			return {
				nodes,
				depth,
				height
			};
		}
		if (!isMainRoot && isComponent(n)) return ofMain(id, level);
		let nodes = 1;
		let depth = 0;
		let height = 0;
		if (isContainer(n)) for (const c of n.children) {
			const r = ofTree(c, level + 1);
			nodes += r.nodes;
			depth = Math.max(depth, r.depth);
			height = Math.max(height, r.height);
		}
		return {
			nodes,
			depth,
			height: height + 1
		};
	};
	let nodes = 0;
	let depth = 0;
	let height = 0;
	for (const pid of doc.pageOrder) for (const c of doc.pages[pid]?.children ?? []) {
		const r = ofTree(c, 1);
		nodes += r.nodes;
		depth = Math.max(depth, r.depth);
		height = Math.max(height, r.height);
	}
	for (const m of extra) {
		const r = ofMain(m, 1);
		nodes += r.nodes;
		depth = Math.max(depth, r.depth + 1);
		height = Math.max(height, r.height);
	}
	return {
		nodes,
		depth,
		height
	};
}
/** The variant set a main belongs to (its parent frame), or null. */
const variantSetOf = (doc, mainId) => {
	const p = doc.nodes[doc.nodes[mainId]?.parentId];
	return p?.type === "frame" && p.variantSet ? p : null;
};
/** Properties a main offers (a variant set's are shared by all its variants). */
function propsOf(doc, mainId) {
	const main = doc.nodes[mainId];
	if (main?.type !== "frame") return [];
	return variantSetOf(doc, mainId)?.componentProps ?? main.componentProps ?? [];
}
/** What kind of link a layer can have: its words (text), its visibility (any), which main it shows (a nested copy). */
const PROP_LINKS = {
	text: "text",
	visible: "boolean",
	swap: "swap"
};
//#endregion
//#region src/editor/docfile.ts
const FILE_FORMAT = "canvas-studio";
const FILE_EXTENSION = ".canvas.json";
var DocFileError = class extends Error {};
/** Every image hash the document references: paints (hidden ones included) and frame originals. */
function imageHashesOf(doc) {
	const out = /* @__PURE__ */ new Set();
	for (const n of Object.values(doc.nodes)) {
		for (const p of n.fills) if (p.type === "image") out.add(p.imageHash);
		if (n.type === "frame" && n.reference) out.add(n.reference.imageHash);
	}
	return [...out];
}
function buildDocFile(doc, images) {
	return {
		format: FILE_FORMAT,
		version: 4,
		doc,
		images
	};
}
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
/** Ids become object keys; names that collide with Object.prototype members are never valid. */
const ID = { test: (s) => ID_SHAPE.test(s) && ![
	"__proto__",
	"constructor",
	"prototype"
].includes(s) };
/** Layer ids: an id, or `${copyId};${sourceId}` inside component copies (nested at most 16 deep). */
const NODE_ID = { test: (s) => typeof s === "string" && s.length <= 1100 && s.split(";").length <= 16 && s.split(";").every((p) => ID.test(p)) };
/** Largest coordinate/size accepted from a file — far beyond any real canvas, small enough for Konva. */
const MAX_ABS = 1e7;
/** Imported files larger than this are refused before reading (keeps a bad file from freezing the tab). */
const MAX_FILE_BYTES = 104857600;
const HASH = /^[0-9a-f]{64}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const IMAGE_DATA_URL = /^data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/]*={0,2}$/;
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function fail(path, what) {
	throw new DocFileError(`${path}: ${what}`);
}
function obj(v, path) {
	return isObj(v) ? v : fail(path, "expected an object");
}
function num(o, k, path) {
	if (typeof o[k] !== "number" || !Number.isFinite(o[k])) fail(`${path}.${k}`, "expected a number");
}
function bool(o, k, path) {
	if (typeof o[k] !== "boolean") fail(`${path}.${k}`, "expected true/false");
}
function str(o, k, path) {
	if (typeof o[k] !== "string") fail(`${path}.${k}`, "expected text");
}
function oneOf(o, k, values, path) {
	if (!values.includes(o[k])) fail(`${path}.${k}`, `expected one of ${values.join(", ")}`);
}
/** Reject keys outside the model, so unknown data (or "__proto__") never reaches the document. */
function onlyKeys(o, allowed, path) {
	for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${path}.${k.slice(0, 32)}`, "unknown field");
}
const BASE_KEYS = [
	"minWidth",
	"maxWidth",
	"minHeight",
	"maxHeight",
	"sizeBasis",
	"id",
	"type",
	"name",
	"parentId",
	"x",
	"y",
	"w",
	"h",
	"rotation",
	"opacity",
	"visible",
	"locked",
	"fills",
	"strokes",
	"strokeWidth",
	"strokeAlign",
	"strokeDash",
	"effects",
	"sizing",
	"bindings",
	"absolute",
	"gridCell",
	"alignSelf",
	"propRefs"
];
const NODE_KEYS = {
	frame: [
		"detachedFrom",
		"children",
		"cornerRadius",
		"clipContent",
		"layout",
		"reference",
		"component",
		"instanceOf",
		"overrides",
		"variantSet",
		"variant",
		"componentProps",
		"propValues",
		"variableModes"
	],
	group: ["children"],
	rect: ["cornerRadius"],
	ellipse: [],
	line: [],
	vector: [
		"points",
		"closed",
		"paths"
	],
	text: [
		"text",
		"fontFamily",
		"fontSize",
		"fontWeight",
		"lineHeight",
		"letterSpacing",
		"textAlign",
		"textAutoResize",
		"textDecoration",
		"maxLines",
		"autoName"
	]
};
function range(o, k, min, max, path) {
	num(o, k, path);
	const v = o[k];
	if (v < min || v > max) fail(`${path}.${k}`, `expected a number from ${min} to ${max}`);
}
function match(o, k, re, path, what) {
	if (typeof o[k] !== "string" || !re.test(o[k])) fail(`${path}.${k}`, what);
}
function ids(o, k, path, re = ID) {
	const v = o[k];
	if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && re.test(x))) fail(`${path}.${k}`, "expected a list of ids");
	return v;
}
const PAINT_KEYS = {
	solid: [
		"type",
		"id",
		"color",
		"opacity",
		"visible",
		"variable"
	],
	image: [
		"type",
		"id",
		"imageHash",
		"scaleMode",
		"opacity",
		"visible"
	],
	"gradient-linear": [
		"type",
		"id",
		"stops",
		"angle",
		"opacity",
		"visible"
	],
	"gradient-radial": [
		"type",
		"id",
		"stops",
		"center",
		"radius",
		"opacity",
		"visible"
	]
};
function checkStops(p, path) {
	const v = p.stops;
	if (!Array.isArray(v) || v.length < 2 || v.length > 64) fail(`${path}.stops`, `expected 2 to 64 color stops`);
	let last = 0;
	v.forEach((x, i) => {
		const sp = `${path}.stops[${i}]`;
		const s = obj(x, sp);
		onlyKeys(s, [
			"position",
			"color",
			"opacity"
		], sp);
		range(s, "position", 0, 1, sp);
		if (s.position < last) fail(`${sp}.position`, "stops must be in order");
		last = s.position;
		match(s, "color", COLOR, sp, "expected a #RRGGBB color");
		range(s, "opacity", 0, 1, sp);
	});
}
function checkPaint(v, path, solidOnly) {
	const p = obj(v, path);
	onlyKeys(p, Object.hasOwn(PAINT_KEYS, p.type) ? PAINT_KEYS[p.type] : PAINT_KEYS.solid, path);
	match(p, "id", ID, path, "invalid id");
	range(p, "opacity", 0, 1, path);
	bool(p, "visible", path);
	if (p.type === "solid") {
		match(p, "color", COLOR, path, "expected a #RRGGBB color");
		if (p.variable !== void 0) match(p, "variable", ID, path, "invalid variable id");
	} else if (p.type === "image" && !solidOnly) {
		match(p, "imageHash", HASH, path, "expected a SHA-256 image hash");
		oneOf(p, "scaleMode", [
			"fill",
			"fit",
			"crop",
			"tile"
		], path);
	} else if ((p.type === "gradient-linear" || p.type === "gradient-radial") && !solidOnly) {
		checkStops(p, path);
		if (p.type === "gradient-linear") range(p, "angle", -3600, MAX_ANGLE, path);
		else {
			const c = obj(p.center, `${path}.center`);
			onlyKeys(c, ["x", "y"], `${path}.center`);
			for (const k of ["x", "y"]) range(c, k, -1e3, MAX_GRADIENT_FRACTION, `${path}.center`);
			const r = obj(p.radius, `${path}.radius`);
			onlyKeys(r, ["x", "y"], `${path}.radius`);
			for (const k of ["x", "y"]) range(r, k, 0, MAX_GRADIENT_FRACTION, `${path}.radius`);
		}
	} else fail(`${path}.type`, solidOnly ? "strokes must be solid" : "unknown paint type");
}
function checkEffect(v, path) {
	const e = obj(v, path);
	oneOf(e, "type", [
		"drop-shadow",
		"inner-shadow",
		"layer-blur"
	], path);
	onlyKeys(e, e.type === "layer-blur" ? [
		"type",
		"id",
		"radius",
		"visible"
	] : [
		"type",
		"id",
		"color",
		"opacity",
		"x",
		"y",
		"blur",
		"spread",
		"visible"
	], path);
	match(e, "id", ID, path, "invalid id");
	bool(e, "visible", path);
	if (e.type === "layer-blur") return range(e, "radius", 0, MAX_BLUR, path);
	match(e, "color", COLOR, path, "expected a #RRGGBB color");
	range(e, "opacity", 0, 1, path);
	for (const k of [
		"x",
		"y",
		"spread"
	]) range(e, k, -1e4, MAX_SHADOW_OFFSET, path);
	range(e, "blur", 0, MAX_BLUR, path);
}
/** One radius, or four (one per corner). */
function checkRadius(o, path) {
	const v = o.cornerRadius;
	if (Array.isArray(v)) {
		if (v.length !== 4 || !v.every((r) => typeof r === "number" && Number.isFinite(r) && r >= 0 && r <= MAX_ABS)) fail(`${path}.cornerRadius`, `expected a number or 4 numbers from 0 to ${MAX_ABS}`);
	} else range(o, "cornerRadius", 0, MAX_ABS, path);
}
function checkVec(v, path, keys = ["x", "y"]) {
	const p = obj(v, path);
	onlyKeys(p, keys, path);
	range(p, "x", -1e7, MAX_ABS, path);
	range(p, "y", -1e7, MAX_ABS, path);
}
function checkNode(v, key) {
	const path = `nodes.${key}`;
	const n = obj(v, path);
	if (n.id !== key) fail(`${path}.id`, "does not match its key");
	oneOf(n, "type", [
		"frame",
		"group",
		"rect",
		"ellipse",
		"line",
		"vector",
		"text"
	], path);
	str(n, "name", path);
	match(n, "parentId", NODE_ID, path, "invalid id");
	for (const k of [
		"x",
		"y",
		"rotation"
	]) range(n, k, -1e7, MAX_ABS, path);
	for (const k of [
		"w",
		"h",
		"strokeWidth"
	]) range(n, k, 0, MAX_ABS, path);
	range(n, "opacity", 0, 1, path);
	for (const k of [
		"minWidth",
		"maxWidth",
		"minHeight",
		"maxHeight"
	]) if (n[k] !== void 0) range(n, k, 0, MAX_ABS, path);
	if (n.type === "line" && (n.minHeight !== void 0 || n.maxHeight !== void 0)) fail(path, "line height limits are not supported");
	const limitError = sizeLimitProblem(n);
	if (limitError) fail(path, limitError);
	if (n.sizeBasis !== void 0) {
		const basis = obj(n.sizeBasis, path + ".sizeBasis");
		onlyKeys(basis, ["w", "h"], path + ".sizeBasis");
		for (const d of ["w", "h"]) if (basis[d] !== void 0) {
			const b = obj(basis[d], path + ".sizeBasis." + d);
			onlyKeys(b, ["requested", "resolved"], path + ".sizeBasis." + d);
			range(b, "requested", 0, MAX_ABS, path);
			range(b, "resolved", 0, MAX_ABS, path);
			if (Math.abs(Number(b.resolved) - Number(n[d])) > 1e-7) fail(path + ".sizeBasis", "resolved size does not match geometry");
		}
	}
	if (!(n.type === "frame" || n.type === "group") && "children" in n) fail(`${path}.children`, "only frames and groups have children");
	onlyKeys(n, [...BASE_KEYS, ...NODE_KEYS[n.type]], path);
	bool(n, "visible", path);
	bool(n, "locked", path);
	if (!Array.isArray(n.fills)) fail(`${path}.fills`, "expected a list");
	n.fills.forEach((p, i) => checkPaint(p, `${path}.fills[${i}]`, false));
	if (!Array.isArray(n.strokes)) fail(`${path}.strokes`, "expected a list");
	n.strokes.forEach((p, i) => checkPaint(p, `${path}.strokes[${i}]`, true));
	oneOf(n, "strokeAlign", [
		"inside",
		"center",
		"outside"
	], path);
	if (n.strokeDash !== null) {
		const d = n.strokeDash;
		if (!Array.isArray(d) || d.length !== 2 || !d.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1e4) || d[0] + d[1] <= 0) fail(`${path}.strokeDash`, `expected null or [dash, gap] from 0 to ${MAX_DASH}, not both 0`);
	}
	if (!Array.isArray(n.effects)) fail(`${path}.effects`, "expected a list");
	if (n.effects.length > 64) fail(`${path}.effects`, `at most 64 effects`);
	n.effects.forEach((e, i) => checkEffect(e, `${path}.effects[${i}]`));
	const sizing = obj(n.sizing, `${path}.sizing`);
	onlyKeys(sizing, ["horizontal", "vertical"], `${path}.sizing`);
	oneOf(sizing, "horizontal", [
		"fixed",
		"hug",
		"fill"
	], `${path}.sizing`);
	oneOf(sizing, "vertical", [
		"fixed",
		"hug",
		"fill"
	], `${path}.sizing`);
	if (n.absolute !== void 0) bool(n, "absolute", path);
	if (n.alignSelf !== void 0) {
		const a = obj(n.alignSelf, `${path}.alignSelf`);
		onlyKeys(a, ["horizontal", "vertical"], `${path}.alignSelf`);
		for (const k of ["horizontal", "vertical"]) if (a[k] !== void 0) oneOf(a, k, [
			"start",
			"center",
			"end"
		], `${path}.alignSelf`);
	}
	if (n.propRefs !== void 0) {
		const r = obj(n.propRefs, `${path}.propRefs`);
		onlyKeys(r, [
			"text",
			"visible",
			"swap"
		], `${path}.propRefs`);
		for (const k of Object.keys(r)) match(r, k, ID, `${path}.propRefs`, "invalid property id");
	}
	if (n.gridCell !== void 0) {
		const c = obj(n.gridCell, `${path}.gridCell`);
		onlyKeys(c, [
			"column",
			"row",
			"columnSpan",
			"rowSpan"
		], `${path}.gridCell`);
		for (const k of [
			"column",
			"row",
			"columnSpan",
			"rowSpan"
		]) {
			range(c, k, 1, MAX_TRACKS, `${path}.gridCell`);
			if (!Number.isInteger(c[k])) fail(`${path}.gridCell.${k}`, "expected a whole number");
		}
		if (c.column + c.columnSpan - 1 > 1e3 || c.row + c.rowSpan - 1 > 1e3) fail(`${path}.gridCell`, `the area must end within ${MAX_TRACKS} tracks`);
	}
	if (n.bindings !== void 0) {
		const b = obj(n.bindings, `${path}.bindings`);
		onlyKeys(b, Object.keys(BINDABLE_FIELDS), `${path}.bindings`);
		for (const k of Object.keys(b)) match(b, k, ID, `${path}.bindings`, "invalid variable id");
	}
	switch (n.type) {
		case "frame": {
			ids(n, "children", path, NODE_ID);
			checkRadius(n, path);
			bool(n, "clipContent", path);
			const l = obj(n.layout, `${path}.layout`);
			const lp = `${path}.layout`;
			onlyKeys(l, [
				"mode",
				"gap",
				"counterGap",
				"padding",
				"primaryAlign",
				"counterAlign",
				"wrap",
				"grid"
			], lp);
			oneOf(l, "mode", [
				"none",
				"horizontal",
				"vertical",
				"grid"
			], lp);
			if (l.grid !== void 0) {
				const g = obj(l.grid, `${lp}.grid`);
				onlyKeys(g, ["columns", "rows"], `${lp}.grid`);
				for (const k of ["columns", "rows"]) {
					const tp = `${lp}.grid.${k}`;
					const list = g[k];
					if (!Array.isArray(list) || list.length > 1e3) fail(tp, `expected a list of at most ${MAX_TRACKS} tracks`);
					list.forEach((t, i) => {
						const o = obj(t, `${tp}[${i}]`);
						onlyKeys(o, ["kind", "value"], `${tp}[${i}]`);
						oneOf(o, "kind", [
							"px",
							"fr",
							"auto"
						], `${tp}[${i}]`);
						range(o, "value", 0, MAX_ABS, `${tp}[${i}]`);
					});
				}
			}
			range(l, "gap", -1e7, MAX_ABS, lp);
			range(l, "counterGap", -1e7, MAX_ABS, lp);
			const pad = obj(l.padding, `${lp}.padding`);
			onlyKeys(pad, [
				"top",
				"right",
				"bottom",
				"left"
			], `${lp}.padding`);
			for (const k of [
				"top",
				"right",
				"bottom",
				"left"
			]) range(pad, k, 0, MAX_ABS, `${lp}.padding`);
			oneOf(l, "primaryAlign", [
				"start",
				"center",
				"end",
				"space-between"
			], lp);
			oneOf(l, "counterAlign", [
				"start",
				"center",
				"end"
			], lp);
			bool(l, "wrap", lp);
			if (n.component !== void 0 && n.component !== true) fail(`${path}.component`, "expected true");
			if (n.instanceOf !== void 0) {
				match(n, "instanceOf", ID, path, "invalid component id");
				if (n.component) fail(`${path}.instanceOf`, "a main component cannot also be a copy");
			}
			if (n.overrides !== void 0) {
				if (!n.instanceOf) fail(`${path}.overrides`, "only copies have overrides");
				const o = obj(n.overrides, `${path}.overrides`);
				if (Object.keys(o).length > 1e4) fail(`${path}.overrides`, "too many entries");
				for (const [k, v] of Object.entries(o)) {
					if (!NODE_ID.test(k)) fail(`${path}.overrides`, "invalid layer id");
					if (!Array.isArray(v) || v.length > 64 || !v.every((f) => typeof f === "string")) fail(`${path}.overrides.${k.slice(0, 32)}`, "expected a list of fields");
				}
			}
			if (n.detachedFrom !== void 0) {
				const origin = obj(n.detachedFrom, `${path}.detachedFrom`);
				onlyKeys(origin, ["name", "kitId"], `${path}.detachedFrom`);
				str(origin, "name", `${path}.detachedFrom`);
				if (!origin.name.trim() || origin.name.length > 200) fail(`${path}.detachedFrom.name`, "expected 1 to 200 characters");
				if (origin.kitId !== void 0) match(origin, "kitId", ID, `${path}.detachedFrom`, "invalid kit id");
				if (n.instanceOf || n.component) fail(`${path}.detachedFrom`, "only detached frames have an origin");
			}
			checkVariantShape(n, path);
			if (n.reference !== void 0) {
				const r = obj(n.reference, `${path}.reference`);
				onlyKeys(r, ["imageHash"], `${path}.reference`);
				match(r, "imageHash", HASH, `${path}.reference`, "expected a SHA-256 image hash");
			}
			break;
		}
		case "group":
			ids(n, "children", path, NODE_ID);
			break;
		case "rect":
			checkRadius(n, path);
			break;
		case "vector":
			if (!Array.isArray(n.points)) fail(`${path}.points`, "expected a list");
			n.points.forEach((pt, i) => {
				const pp = `${path}.points[${i}]`;
				checkVec(pt, pp, [
					"x",
					"y",
					"in",
					"out"
				]);
				const o = pt;
				if (o.in !== void 0) checkVec(o.in, `${pp}.in`);
				if (o.out !== void 0) checkVec(o.out, `${pp}.out`);
			});
			bool(n, "closed", path);
			if (!Array.isArray(n.paths) || n.paths.length > 1e3) fail(`${path}.paths`, `expected a list of at most ${MAX_PATHS} paths`);
			{
				let chars = 0;
				let commands = 0;
				n.paths.forEach((v, i) => {
					const pp = `${path}.paths[${i}]`;
					const p = obj(v, pp);
					onlyKeys(p, ["d", "windingRule"], pp);
					str(p, "d", pp);
					chars += p.d.length;
					if (chars > 1e6) fail(`${path}.paths`, `path data longer than ${MAX_PATH_LENGTH} characters`);
					const cmds = parsePath(p.d);
					if (!cmds) fail(`${pp}.d`, `not valid SVG path data (or more than ${MAX_PATH_COMMANDS} commands)`);
					if (!(pathExtent(cmds) <= MAX_ABS)) fail(`${pp}.d`, `coordinates beyond ${MAX_ABS}`);
					commands += cmds.length;
					if (commands > 5e4) fail(`${path}.paths`, `more than ${MAX_PATH_COMMANDS} path commands in one vector`);
					oneOf(p, "windingRule", ["nonzero", "evenodd"], pp);
				});
			}
			break;
		case "text":
			str(n, "text", path);
			str(n, "fontFamily", path);
			range(n, "fontSize", .01, 1e4, path);
			range(n, "fontWeight", 1, 1e3, path);
			{
				const lh = obj(n.lineHeight, `${path}.lineHeight`);
				onlyKeys(lh, ["unit", "value"], `${path}.lineHeight`);
				oneOf(lh, "unit", ["multiplier", "px"], `${path}.lineHeight`);
				range(lh, "value", 0, lh.unit === "px" ? MAX_LINE_HEIGHT_PX : 100, `${path}.lineHeight`);
			}
			oneOf(n, "textDecoration", [
				"none",
				"underline",
				"line-through"
			], path);
			if (n.maxLines !== null && !(Number.isInteger(n.maxLines) && n.maxLines >= 1 && n.maxLines <= 1e4)) fail(`${path}.maxLines`, `expected null or a whole number from 1 to ${MAX_LINES}`);
			range(n, "letterSpacing", -1e4, 1e4, path);
			oneOf(n, "textAlign", [
				"left",
				"center",
				"right"
			], path);
			oneOf(n, "textAutoResize", [
				"width-and-height",
				"height",
				"none"
			], path);
			bool(n, "autoName", path);
	}
	return n;
}
/** Validate one layer as an imported file would be (throws DocFileError). */
const validateNode = (n) => checkNode(JSON.parse(JSON.stringify(n)), n.id);
/** Structural validation of a migrated document: field types, formats and a consistent tree. */
function validateDoc(doc) {
	onlyKeys(doc, [
		"version",
		"name",
		"pages",
		"pageOrder",
		"nodes",
		"counters",
		"collections",
		"collectionOrder",
		"variables",
		"kit",
		"libraries"
	], "doc");
	str(doc, "name", "doc");
	onlyKeys(obj(doc.counters, "doc.counters"), [
		"frame",
		"group",
		"rect",
		"ellipse",
		"line",
		"vector",
		"text",
		"page"
	], "doc.counters");
	for (const [k, v] of Object.entries(doc.counters)) if (typeof v !== "number" || !Number.isFinite(v)) fail(`doc.counters.${k}`, "expected a number");
	if (new Set(doc.pageOrder).size !== doc.pageOrder.length || doc.pageOrder.length !== Object.keys(doc.pages).length) fail("doc.pageOrder", "must list every page exactly once");
	for (const [key, v] of Object.entries(doc.nodes)) checkNode(v, key);
	const depthOf = /* @__PURE__ */ new Map();
	const total = Object.keys(doc.nodes).length;
	for (const id of Object.keys(doc.nodes)) {
		const chain = [];
		let cur = id;
		while (cur && doc.nodes[cur] && !depthOf.has(cur) && chain.length <= total) {
			chain.push(cur);
			cur = doc.nodes[cur].parentId;
		}
		if (chain.length > total) fail(`nodes.${id.slice(0, 64)}`, "its parent chain loops");
		let d = cur && depthOf.has(cur) ? depthOf.get(cur) : 0;
		for (let i = chain.length - 1; i >= 0; i--) depthOf.set(chain[i], ++d);
		if (d > 1e3) fail(`nodes.${id.slice(0, 64)}`, `layers nested more than ${MAX_TREE_DEPTH} deep`);
	}
	const seen = /* @__PURE__ */ new Set();
	const walk = (parentId, children, path) => {
		for (const id of children) {
			const n = doc.nodes[id];
			if (!n) fail(path, `child ${id} does not exist`);
			if (n.parentId !== parentId) fail(`nodes.${id}.parentId`, `expected ${parentId}`);
			if (seen.has(id)) fail(path, `child ${id} appears more than once`);
			seen.add(id);
			if (n.type === "frame" || n.type === "group") walk(id, n.children, `nodes.${id}.children`);
		}
	};
	for (const pid of doc.pageOrder) {
		const path = `pages.${pid}`;
		if (!ID.test(pid)) fail("doc.pageOrder", `invalid page id ${pid.slice(0, 16)}`);
		const p = obj(doc.pages[pid], path);
		onlyKeys(p, [
			"id",
			"name",
			"children",
			"background",
			"variableModes",
			"library"
		], path);
		if (p.id !== pid) fail(`${path}.id`, "does not match its key");
		str(p, "name", path);
		match(p, "background", COLOR, path, "expected a #RRGGBB color");
		if (pid in doc.nodes) fail(path, "id is also used by a layer");
		walk(pid, ids(p, "children", path, NODE_ID), `${path}.children`);
	}
	if (seen.size !== Object.keys(doc.nodes).length) fail("nodes", "some layers are not reachable from any page");
	checkVariants(doc);
	checkComponents(doc);
	checkVariables(doc);
	checkModes(doc);
	checkLibraries(doc);
}
/** Every copy points at an existing main; no main contains a copy of itself (directly or through other mains). */
function checkComponents(doc) {
	const uses = /* @__PURE__ */ new Map();
	const layersOf = /* @__PURE__ */ new Map();
	const inMain = (main, id) => {
		let set = layersOf.get(main);
		if (!set) layersOf.set(main, set = new Set(subtree(doc, main)));
		return set.has(id);
	};
	for (const n of Object.values(doc.nodes)) {
		if (n.type !== "frame" || !n.instanceOf) continue;
		const main = doc.nodes[n.instanceOf];
		if (main?.type !== "frame" || !main.component) fail(`nodes.${n.id}.instanceOf`, "refers to a missing main component");
		for (const [k, fields] of Object.entries(n.overrides ?? {})) {
			const isRoot = k === n.instanceOf;
			if (!isRoot && !inMain(n.instanceOf, k)) fail(`nodes.${n.id}.overrides`, "refers to a layer that is not in its main");
			for (const f of fields) if (!(isRoot ? ROOT_OVERRIDABLE : OVERRIDABLE).includes(f)) fail(`nodes.${n.id}.overrides`, `"${f.slice(0, 32)}" cannot be overridden`);
		}
		let cur = n.parentId;
		while (doc.nodes[cur]) {
			const a = doc.nodes[cur];
			if (a.type === "frame" && a.component) {
				const u = uses.get(a.id) ?? /* @__PURE__ */ new Set();
				u.add(n.instanceOf);
				for (const p of propsOf(doc, n.instanceOf)) if (p.type === "swap" && typeof n.propValues?.[p.id] === "string") u.add(n.propValues[p.id]);
				uses.set(a.id, u);
			}
			cur = a.parentId;
		}
	}
	for (const n of Object.values(doc.nodes)) {
		const owner = n.id.includes(";") ? n.id.slice(0, n.id.indexOf(";")) : null;
		let top = null;
		for (let cur = n.parentId; doc.nodes[cur]; cur = doc.nodes[cur].parentId) {
			const a = doc.nodes[cur];
			if (a.type === "frame" && a.instanceOf && !a.id.includes(";")) top = a.id;
		}
		if (owner !== top) fail(`nodes.${n.id.slice(0, 64)}`, owner ? "is named for a copy it is not in" : "a layer inside a copy must be named for it");
	}
	const state = /* @__PURE__ */ new Map();
	const visit = (m) => {
		if (state.get(m) === 1) fail(`nodes.${m}`, "a component contains a copy of itself");
		if (state.get(m) === 2) return;
		state.set(m, 1);
		for (const u of uses.get(m) ?? []) visit(u);
		state.set(m, 2);
	};
	for (const m of uses.keys()) visit(m);
	const size = expandedSize(doc);
	if (size.height > 1e3) fail("nodes", `layers nested more than ${MAX_TREE_DEPTH} deep once copies are expanded`);
	if (size.depth > 15) fail("nodes", `copies nested more than 15 deep`);
	if (overLimit(doc, size)) fail("nodes", `copies would expand to more than ${MAX_EXPANDED_NODES} layers`);
}
const label = (o, k, path) => {
	str(o, k, path);
	if (!o[k].trim() || o[k].length > 200) fail(`${path}.${k}`, `expected 1 to 200 characters`);
};
const unique = (list, path, what) => {
	if (new Set(list).size !== list.length) fail(path, `${what} must be unique`);
};
/** Shapes of variant sets, variant values, component properties and property values (links checked later). */
function checkVariantShape(n, path) {
	if (n.variantSet !== void 0) {
		const v = obj(n.variantSet, `${path}.variantSet`);
		onlyKeys(v, ["properties"], `${path}.variantSet`);
		const props = v.properties;
		if (!Array.isArray(props) || !props.length || props.length > 32) fail(`${path}.variantSet.properties`, `expected 1 to 32 properties`);
		props.forEach((p, i) => {
			const pp = `${path}.variantSet.properties[${i}]`;
			const o = obj(p, pp);
			onlyKeys(o, ["name", "values"], pp);
			label(o, "name", pp);
			const vals = o.values;
			if (!Array.isArray(vals) || !vals.length || vals.length > 256) fail(`${pp}.values`, `expected 1 to 256 values`);
			vals.forEach((_, j) => label(vals, String(j), `${pp}.values`));
			unique(vals, `${pp}.values`, "values");
		});
		unique(props.map((p) => p.name), `${path}.variantSet.properties`, "property names");
	}
	if (n.variant !== void 0) {
		const v = obj(n.variant, `${path}.variant`);
		if (Object.keys(v).length > 32) fail(`${path}.variant`, `at most 32 values`);
		for (const k of Object.keys(v)) str(v, k, `${path}.variant`);
	}
	if (n.componentProps !== void 0) {
		const list = n.componentProps;
		if (!Array.isArray(list) || list.length > 64) fail(`${path}.componentProps`, `expected a list of at most 64`);
		list.forEach((p, i) => {
			const pp = `${path}.componentProps[${i}]`;
			const o = obj(p, pp);
			onlyKeys(o, [
				"id",
				"name",
				"type"
			], pp);
			match(o, "id", ID, pp, "invalid id");
			label(o, "name", pp);
			oneOf(o, "type", [
				"text",
				"boolean",
				"swap"
			], pp);
		});
		unique(list.map((p) => p.id), `${path}.componentProps`, "property ids");
		unique(list.map((p) => p.name), `${path}.componentProps`, "property names");
	}
	if (n.propValues !== void 0) {
		if (!n.instanceOf) fail(`${path}.propValues`, "only copies have property values");
		const v = obj(n.propValues, `${path}.propValues`);
		if (Object.keys(v).length > 64) fail(`${path}.propValues`, `at most 64 values`);
		for (const [k, x] of Object.entries(v)) {
			if (!ID.test(k)) fail(`${path}.propValues`, "invalid property id");
			if (typeof x === "string" ? x.length > 1e5 : typeof x !== "boolean") fail(`${path}.propValues.${k}`, "expected text or true/false");
		}
	}
}
/** Variant sets hold mains with one distinct value per property; links and values name properties of the right type. */
function checkVariants(doc) {
	for (const n of Object.values(doc.nodes)) {
		const path = `nodes.${n.id.slice(0, 64)}`;
		const parent = doc.nodes[n.parentId];
		const inSet = parent?.type === "frame" && !!parent.variantSet;
		if (n.type === "frame" && n.variantSet) {
			if (n.component || n.instanceOf) fail(`${path}.variantSet`, "a variant set is not itself a component or a copy");
			if (isSublayer(n.id)) fail(`${path}.variantSet`, "a variant set cannot be inside a copy");
			const props = n.variantSet.properties;
			const seen = /* @__PURE__ */ new Set();
			for (const c of n.children) {
				const v = doc.nodes[c];
				if (!isComponent(v)) fail(`${path}.children`, "a variant set holds only main components");
				const values = v.variant ?? {};
				if (Object.keys(values).length !== props.length || props.some((p) => !p.values.includes(values[p.name]))) fail(`nodes.${c}.variant`, "needs one listed value for each property of its set");
				const key = JSON.stringify(props.map((p) => values[p.name]));
				if (seen.has(key)) fail(`nodes.${c}.variant`, "another variant has the same values");
				seen.add(key);
			}
		}
		if (n.type !== "frame") {
			if (n.propRefs && !isSublayer(n.id)) checkPropRefs(doc, n);
			continue;
		}
		if (n.variant && !(inSet && n.component)) fail(`${path}.variant`, "only a main inside a variant set has variant values");
		if (n.componentProps && !(n.variantSet || n.component && !inSet)) fail(`${path}.componentProps`, "only a main or a variant set has properties");
		if (n.propRefs && !isSublayer(n.id)) checkPropRefs(doc, n);
		if (n.propValues && !isSublayer(n.id)) {
			const props = propsOf(doc, n.instanceOf);
			for (const [k, x] of Object.entries(n.propValues)) {
				const p = props.find((q) => q.id === k);
				if (!p) fail(`${path}.propValues`, "names a property its main does not have");
				if (typeof x !== (p.type === "boolean" ? "boolean" : "string")) fail(`${path}.propValues.${k}`, `expected a ${p.type} value`);
				if (p.type === "swap" && !isComponent(doc.nodes[x])) fail(`${path}.propValues.${k}`, "swaps to a missing main component");
			}
		}
	}
}
function checkPropRefs(doc, n) {
	const path = `nodes.${n.id.slice(0, 64)}.propRefs`;
	const main = ancestors(doc, n.id).find((a) => isComponent(doc.nodes[a]));
	if (!main) fail(path, "only layers inside a main component link to properties");
	const props = propsOf(doc, main);
	for (const [link, id] of Object.entries(n.propRefs)) {
		const p = props.find((q) => q.id === id);
		if (!p || p.type !== PROP_LINKS[link]) fail(path, `${link} links to a missing ${PROP_LINKS[link]} property`);
		if (link === "text" && n.type !== "text") fail(path, "only a text layer links its words");
		if (link === "swap" && !isInstance(n)) fail(path, "only a copy can be swapped");
	}
}
/** Kit info, and linked libraries whose page and collections say they belong to them (and nothing else does). */
function checkLibraries(doc) {
	const d = doc;
	if (d.kit !== void 0) {
		const k = obj(d.kit, "doc.kit");
		onlyKeys(k, [
			"id",
			"name",
			"version",
			"source"
		], "doc.kit");
		match(k, "id", ID, "doc.kit", "invalid id");
		str(k, "name", "doc.kit");
		if (k.source !== void 0 && (typeof k.source !== "string" || k.source.length > 2048)) fail("doc.kit.source", "expected text up to 2048 characters");
		if (!versionParts(k.version)) fail("doc.kit.version", "expected major.minor.patch or a legacy whole number from 1 to 1000000000");
	}
	const libs = d.libraries === void 0 ? {} : obj(d.libraries, "doc.libraries");
	if (Object.keys(libs).length > 100) fail("doc.libraries", "at most 100 libraries");
	const pagesOf = /* @__PURE__ */ new Map();
	const collectionsOf = /* @__PURE__ */ new Map();
	for (const [kid, raw] of Object.entries(libs)) {
		const path = `doc.libraries.${kid.slice(0, 32)}`;
		if (!ID.test(kid)) fail("doc.libraries", "invalid kit id");
		const l = obj(raw, path);
		onlyKeys(l, [
			"name",
			"version",
			"source",
			"pageId",
			"collectionIds"
		], path);
		str(l, "name", path);
		if (!versionParts(l.version)) fail(`${path}.version`, "expected major.minor.patch or a legacy whole number from 1 to 1000000000");
		oneOf(l, "source", ["builtin", "file"], path);
		if (l.source === "file" && kid === "basic-kit") fail(`${path}.source`, "the built-in kit cannot come from a file");
		match(l, "pageId", ID, path, "invalid page id");
		if (!doc.pageOrder.includes(l.pageId) || doc.pages[l.pageId]?.library !== kid) fail(`${path}.pageId`, "is not this library's page");
		pagesOf.set(l.pageId, kid);
		for (const cid of ids(l, "collectionIds", path)) {
			if (doc.collections[cid]?.library !== kid) fail(`${path}.collectionIds`, "names a collection that is not this library's");
			collectionsOf.set(cid, kid);
		}
	}
	for (const pid of doc.pageOrder) {
		const lib = doc.pages[pid].library;
		if (lib !== void 0 && pagesOf.get(pid) !== lib) fail(`pages.${pid}.library`, "names a library the document does not link");
	}
	for (const cid of doc.collectionOrder) {
		const lib = doc.collections[cid].library;
		if (lib !== void 0 && collectionsOf.get(cid) !== lib) fail(`collections.${cid}.library`, "names a library the document does not link");
	}
	if (doc.pageOrder.every((pid) => doc.pages[pid].library)) fail("doc.pageOrder", "needs a page of its own (not only library pages)");
}
/** Frames and pages set modes of collections the document has, one listed mode each. */
function checkModes(doc) {
	const check = (o, path) => {
		if (o.variableModes === void 0) return;
		const m = obj(o.variableModes, `${path}.variableModes`);
		for (const [cid, mid] of Object.entries(m)) {
			const c = Object.hasOwn(doc.collections, cid) ? doc.collections[cid] : void 0;
			if (!c) fail(`${path}.variableModes`, "names a collection the document does not have");
			if (typeof mid !== "string" || !c.modes.some((x) => x.id === mid)) fail(`${path}.variableModes.${cid}`, "is not a mode of that collection");
		}
	};
	for (const pid of doc.pageOrder) check(doc.pages[pid], `pages.${pid}`);
	for (const n of Object.values(doc.nodes)) if (n.type === "frame") check(n, `nodes.${n.id.slice(0, 64)}`);
}
/** Collections, variables (names, values, aliases) and every layer binding pointing at a variable of the right type. */
function checkVariables(doc) {
	const cols = obj(doc.collections, "doc.collections");
	const vars = obj(doc.variables, "doc.variables");
	const order = ids(doc, "collectionOrder", "doc");
	if (order.length > 100) fail("doc.collectionOrder", `at most 100 collections`);
	if (new Set(order).size !== order.length || order.length !== Object.keys(cols).length || !order.every((c) => Object.hasOwn(cols, c))) fail("doc.collectionOrder", "must list every collection exactly once");
	if (Object.keys(vars).length > 5e3) fail("doc.variables", `at most ${MAX_VARIABLES} variables`);
	const listed = /* @__PURE__ */ new Set();
	for (const cid of order) {
		const path = `collections.${cid}`;
		const c = obj(cols[cid], path);
		onlyKeys(c, [
			"id",
			"name",
			"modes",
			"defaultModeId",
			"variableIds",
			"library"
		], path);
		if (c.id !== cid) fail(`${path}.id`, "does not match its key");
		str(c, "name", path);
		if (!Array.isArray(c.modes) || !c.modes.length || c.modes.length > 20) fail(`${path}.modes`, `expected 1 to 20 modes`);
		const modeIds = c.modes.map((m, i) => {
			const mp = `${path}.modes[${i}]`;
			const o = obj(m, mp);
			onlyKeys(o, ["id", "name"], mp);
			match(o, "id", ID, mp, "invalid id");
			str(o, "name", mp);
			return o.id;
		});
		if (new Set(modeIds).size !== modeIds.length) fail(`${path}.modes`, "mode ids must be unique");
		if (new Set(c.modes.map((m) => m.name)).size !== modeIds.length) fail(`${path}.modes`, "mode names must be unique");
		if (!modeIds.includes(c.defaultModeId)) fail(`${path}.defaultModeId`, "is not one of its modes");
		for (const vid of ids(c, "variableIds", path)) {
			const v = vars[vid];
			if (!isObj(v) || v.collectionId !== cid) fail(`${path}.variableIds`, `variable ${vid} does not belong here`);
			if (listed.has(vid)) fail(`${path}.variableIds`, `variable ${vid} is listed twice`);
			listed.add(vid);
			const vp = `variables.${vid}`;
			onlyKeys(v, [
				"id",
				"name",
				"type",
				"collectionId",
				"values"
			], vp);
			if (v.id !== vid) fail(`${vp}.id`, "does not match its key");
			oneOf(v, "type", [
				"color",
				"number",
				"string",
				"font",
				"typography"
			], vp);
			str(v, "name", vp);
			const values = obj(v.values, `${vp}.values`);
			onlyKeys(values, modeIds, `${vp}.values`);
			for (const m of modeIds) {
				const val = values[m];
				if (isObj(val) && "alias" in val) {
					onlyKeys(val, ["alias"], `${vp}.values.${m}`);
					match(val, "alias", ID, `${vp}.values.${m}`, "invalid variable id");
				} else if (!validLiteral(v.type, val)) fail(`${vp}.values.${m}`, `not a ${v.type} value`);
			}
		}
	}
	if (listed.size !== Object.keys(vars).length) fail("doc.variables", "some variables are not in any collection");
	const index = nameIndex(doc);
	for (const v of Object.values(doc.variables)) {
		const why = nameProblem(doc, v.name, v.id, index) ?? aliasProblem(doc, v.id);
		if (why) fail(`variables.${v.id}`, why);
		for (const val of Object.values(v.values)) if (isAlias(val) && !doc.variables[val.alias]) fail(`variables.${v.id}`, "refers to a missing variable");
	}
	for (const n of Object.values(doc.nodes)) {
		const problem = sizeLimitBindingProblem(doc, n);
		if (problem) fail(`nodes.${n.id}`, problem);
		for (const [f, vid] of Object.entries(n.bindings ?? {})) {
			const v = doc.variables[vid];
			if (!v) fail(`nodes.${n.id}.bindings.${f}`, "refers to a missing variable");
			if (v.type !== BINDABLE_FIELDS[f] || !fieldApplies(n, f)) fail(`nodes.${n.id}.bindings.${f}`, `cannot follow a ${v.type} variable`);
		}
		for (const p of [...n.fills, ...n.strokes]) if (p.type === "solid" && p.variable !== void 0 && doc.variables[p.variable]?.type !== "color") fail(`nodes.${n.id}`, "a paint refers to a missing or non-color variable");
	}
}
/** Parse and validate an imported file. Throws DocFileError with a short reason. */
function parseDocFile(text) {
	let raw;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new DocFileError("Not a JSON file");
	}
	const f = obj(raw, "file");
	if (f.format !== "canvas-studio") fail("file.format", `expected "${FILE_FORMAT}"`);
	if (f.version !== 1 && f.version !== 2 && f.version !== 3 && f.version !== 4) fail("file.version", `unsupported version ${String(f.version)}`);
	const doc = migrateDoc(f.doc);
	if (!doc) fail("file.doc", "not a valid document");
	validateDoc(doc);
	const images = obj(f.images ?? {}, "file.images");
	for (const [hash, url] of Object.entries(images)) {
		if (!HASH.test(hash)) fail(`images.${hash.slice(0, 16)}`, "expected a SHA-256 image hash");
		if (typeof url !== "string" || !IMAGE_DATA_URL.test(url)) fail(`images.${hash.slice(0, 16)}`, "expected a base64 image data URL");
	}
	return {
		doc,
		images
	};
}
/** Point image paints and frame originals at new hashes (e.g. the hash of the stored bytes when a file's key was wrong). */
function remapImageHashes(doc, map) {
	for (const n of Object.values(doc.nodes)) {
		n.fills = n.fills.map((p) => p.type === "image" && map[p.imageHash] && map[p.imageHash] !== p.imageHash ? {
			...p,
			imageHash: map[p.imageHash]
		} : p);
		if (n.type === "frame" && n.reference && map[n.reference.imageHash]) n.reference = { imageHash: map[n.reference.imageHash] };
	}
}
function dataUrlToBlob(url) {
	const [head, body] = url.split(",", 2);
	const type = head.slice(5, head.indexOf(";"));
	const bin = atob(body);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new Blob([bytes], { type });
}
//#endregion
export { DocFileError, FILE_EXTENSION, FILE_FORMAT, MAX_FILE_BYTES, buildDocFile, dataUrlToBlob, imageHashesOf, parseDocFile, remapImageHashes, validateDoc, validateNode };
