const DATA = JSON.parse(document.getElementById('pace-data').textContent);
const DOCS = DATA.nav.docs;
const ROUTE = DATA.nav.route;
function el(tag, attrs, ...kids){
  const n = document.createElementNS(tag.startsWith('svg:') ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag.replace('svg:',''));
  for (const [k,v] of Object.entries(attrs||{})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.setAttribute('class', v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}
// ID 접두어 → 문서 파일은 템플릿 폴더(schema.json x-pace.ids)에서 명령이 만든다. 문서끼리는 이 경로로만 잇는다.
function hrefFor(id){
  const prefix = String(id).split('-')[0];
  const file = Object.hasOwn(ROUTE, prefix) ? ROUTE[prefix] : null;
  const here = location.pathname.split('/').pop() || 'index.html';
  return file ? (file === here ? '' : file) + '#' + id : null;
}
function docHref(kind, id){ return DOCS.some(([f]) => f === kind + '.html') ? kind + '.html#' + id : null; }
// 외부 링크는 http(s)만 — 다른 스킴은 링크로 만들지 않는다.
function safeUrl(u){ return /^https?:\/\//i.test(String(u || '')) ? String(u) : null; }
function statusBadge(s){ return s && s.status ? el('span', {class:'st st-' + s.status, title:s.evidence || ''}, s.status) : null; }
function idLink(id){
  if (!id) return null;
  const href = hrefFor(id);
  if (href === null) return el('span', {class:'id plain'}, id);
  return el('a', {class:'id', href, title:id}, id);
}
function ids(list){ return el('span', {class:'ids'}, (list||[]).map(idLink)); }
function header(kind, badges){
  const d = DATA.doc, here = location.pathname.split('/').pop() || 'index.html';
  document.title = d.project + ' · ' + kind;
  const h = el('header', {class:'top'}, el('div', {class:'wrap'},
    el('div', {class:'row1'},
      el('span', {class:'proj'}, d.project),
      el('span', {class:'kind'}, '· ' + kind),
      el('span', {class:'meta'}, d.version + ' · ' + d.date + ' · 깊이 ' + d.depth + ' · ' + d.source)),
    el('nav', {class:'tabs'}, DOCS.map(([f, t]) => el('a', {href:f, class: f === here ? 'on' : null}, t))),
    el('div', {class:'badges'}, (badges||[]).map(([t, cls]) => el('span', {class:'badge ' + (cls||'')}, t)))
  ));
  document.body.prepend(h);
}
function footer(){
  document.body.append(el('footer', {class:'foot'}, el('div', {class:'wrap'},
    'pace-intent 템플릿 · 데이터는 이 파일 안 pace-data 데이터 블록(JSON)에 있고, 화면은 그 데이터로 그립니다.')));
}
