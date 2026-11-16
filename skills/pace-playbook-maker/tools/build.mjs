// 공통 생성기: <폴더>/steps.json + shots/*.jpg → flow.html(사람 검토용 흐름도·명세서) + flow/overview.md·S0n.md(에이전트 실행용 분할 명세)
// 사용: node <pace-playbook-maker 스킬 폴더>/tools/build.mjs --dir <흐름 폴더>
// 서비스 비의존 — 위험 등급(risks)·승인 관문(단계 gate)·대상 칸(lanes)·안내 경로(base)는 모두 steps.json에서 읽는다.
import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync,unlinkSync} from 'node:fs';
import {join,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateMask} from './capture-core.mjs';
import {scanSensitive,computeAgent,contentHash,sourceHashOf,MANAGED} from './agent-map.mjs';

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const md=s=>String(s??'').replace(/\r?\n/g,' ').replace(/\|/g,'\\|');
const li=a=>(a||[]).map(x=>`<li>${esc(x)}</li>`).join('');

// 기본 위험 등급은 read뿐. 서비스별 등급(서명·발급 등)은 steps.json risks로 정의한다.
export function riskTable(d){
  const all={read:{label:'읽기',color:'#64748b'},...(d.risks||{})};
  return Object.fromEntries(Object.entries(all).map(([k,v])=>{
    const color=v.color||'#64748b';
    if(!/^#[0-9a-f]{3,8}$/i.test(color))throw new Error(`risks.${k}.color: #hex 형식이 아니다 (${color})`);
    return [k,[v.label||k,color]];
  }));
}

export function validate(d,RISK){
  if(!Array.isArray(d.steps)||!d.steps.length)throw new Error('steps.json: steps가 비어 있다');
  // mask는 캡처 마스킹 규칙(없으면 캡처 거부). 있으면 형식·정규식 컴파일을 검사한다
  if(d.mask!==undefined){try{validateMask(d.mask);}catch(e){throw new Error(`steps.json mask: ${e.message}`);}}
  const seen=new Set();
  for(const s of d.steps){
    if(!/^S\d+$/.test(String(s.id)))throw new Error(`단계 id 형식 오류(S + 숫자): ${s.id}`);
    if(seen.has(s.id))throw new Error(`중복 단계 id: ${s.id}`);
    seen.add(s.id);
    if(!Object.hasOwn(RISK,s.risk))throw new Error(`${s.id}: 정의되지 않은 위험 등급 '${s.risk}' (steps.json risks에 추가)`);
    const lanes=d.lanes||{};
    if(s.lane&&Object.keys(lanes).length&&s.lane!=='both'&&!Object.hasOwn(lanes,s.lane))throw new Error(`${s.id}: lanes에 없는 lane '${s.lane}'`);
    // tool은 실행 파일 경로·CLI 이름만 — 함수·부가 설명은 toolNote로(단계표 도구 칸을 읽기 쉽게)
    if(typeof s.tool==='string'&&/[()（）]|—|\s\+\s/.test(s.tool))throw new Error(`${s.id}: tool에는 경로·CLI만 쓴다 — 설명은 toolNote로 (${s.tool})`);
  }
  const order=d.steps.map(s=>s.id),nonEmpty=v=>typeof v==='string'&&v.trim().length>0;
  // run: 여러 단계를 한 명령이 수행하는 운영 실행
  if(d.run!==undefined){
    if(!Array.isArray(d.run)||!d.run.length)throw new Error('run: 비어 있지 않은 배열이어야 한다');
    const labels=new Set();
    for(const r of d.run){
      if(!r||!nonEmpty(r.label)||!nonEmpty(r.command))throw new Error('run: label·command가 비어 있다');
      if(labels.has(r.label))throw new Error(`run: label 중복 '${r.label}'`);labels.add(r.label);
      if(!Array.isArray(r.covers)||r.covers.length!==2)throw new Error(`run '${r.label}': covers는 [첫 단계, 끝 단계]`);
      const [a,b]=r.covers.map(id=>order.indexOf(id));
      if(a<0||b<0)throw new Error(`run '${r.label}': covers에 없는 단계 id`);
      if(a>b)throw new Error(`run '${r.label}': covers 순서가 거꾸로다`);
    }
  }
  // events: 앱이 스스로 여는 탭·늦게 뜨는 공지처럼 순서가 정해지지 않은 화면 이벤트
  if(d.events!==undefined){
    if(!Array.isArray(d.events))throw new Error('events: 배열이어야 한다');
    for(const e of d.events){
      if(!e||!nonEmpty(e.when)||!nonEmpty(e.then))throw new Error('events: when·then이 비어 있다');
      if(e.steps!==undefined&&(!Array.isArray(e.steps)||e.steps.some(id=>!order.includes(id))))throw new Error(`events '${e.when}': steps에 없는 단계 id`);
    }
  }
}
// 단계가 run 범위 안인지
export const runsFor=(d,id)=>{const order=d.steps.map(s=>s.id),i=order.indexOf(id);return (d.run||[]).filter(r=>order.indexOf(r.covers[0])<=i&&i<=order.indexOf(r.covers[1]));};
export const eventsFor=(d,id)=>(d.events||[]).filter(e=>(e.steps||[]).includes(id));

// ---- 에이전트 지도(agent/) — steps.json에서 agentView:true인 흐름만 -------------------------------------
// 민감 형식 검사는 기존 검증보다 먼저 원본 전체에 돌려, 민감 형식이 다른 오류 메시지로 새지 않게 한다.
function planAgent(here,sourceText,d){
  scanSensitive(d);
  validate(d,riskTable(d));
  const files=computeAgent(d,here,sourceText);
  const agentDir=join(here,'agent');
  if(existsSync(agentDir))for(const f of readdirSync(agentDir))if(!MANAGED.test(f))throw new Error('agent/에 관리 밖 파일이 있다 — 직접 제거하라');
  return files;
}
function writeAgent(here,files){
  const agentDir=join(here,'agent');
  mkdirSync(agentDir,{recursive:true});
  for(const f of readdirSync(agentDir))if(MANAGED.test(f)&&!files.has(f))unlinkSync(join(agentDir,f));   // 없어진 단계의 옛 관리 파일 정리
  for(const [name,text] of files)writeFileSync(join(agentDir,name),text);
}
const lf=s=>s.replace(/\r\n/g,'\n');
// 낡았는지 검사(디스크를 고치지 않는다): (a) steps.json 해시 (b) 승인 캡처 해시·기록 해시 (c) 정본에서 메모리로 다시 만든 agent/* 바이트와 디스크 비교 (d) 파일 집합
export function checkAgentFresh(dir){
  const here=resolve(dir);
  const sourceText=readFileSync(join(here,'steps.json'),'utf8');
  const d=JSON.parse(sourceText);
  if(d.agentView!==true)return {ok:true,applicable:false,problems:[]};
  const problems=[];
  let files;
  try{scanSensitive(d);validate(d,riskTable(d));files=computeAgent(d,here,sourceText);}
  catch(e){return {ok:false,applicable:true,problems:[e.message.split('\n')[0]+(e.message.includes('\n')?' …':''),...e.message.split('\n').slice(1)].filter(Boolean)};}
  const agentDir=join(here,'agent');
  const onDisk=existsSync(agentDir)?readdirSync(agentDir):[];
  const idxPath=join(agentDir,'index.json');
  if(existsSync(idxPath)){
    try{if(JSON.parse(readFileSync(idxPath,'utf8')).sourceHash!==sourceHashOf(sourceText))problems.push('steps.json이 바뀌었다 — agent/index.json이 낡았다(재생성 필요)');}catch{problems.push('agent/index.json을 읽을 수 없다');}
  }
  for(const name of files.keys()){
    if(!onDisk.includes(name)){problems.push(`agent/${name}이 없다`);continue;}
    if(lf(readFileSync(join(agentDir,name),'utf8'))!==lf(files.get(name)))problems.push(`agent/${name}이 정본과 다르다(낡았거나 손으로 고쳤다)`);
  }
  for(const name of onDisk)if(!files.has(name))problems.push(MANAGED.test(name)?`agent/${name}은 없어진 단계의 옛 파일이다`:`agent/${name}은 관리 밖 파일이다`);
  return {ok:problems.length===0,applicable:true,problems};
}
export function reviewHash(dir){return contentHash(JSON.parse(readFileSync(join(resolve(dir),'steps.json'),'utf8')));}

export function buildFlow(dir){
  const here=resolve(dir);
  const sourceText=readFileSync(join(here,'steps.json'),'utf8');
  const d=JSON.parse(sourceText);
  const agentPlan=d.agentView===true?planAgent(here,sourceText,d):null;   // agentView 흐름만 — 꺼진 흐름의 동작·출력은 그대로
  if(d.agentView!==undefined&&typeof d.agentView!=='boolean')throw new Error('steps.json agentView는 true/false다');
  const RISK=riskTable(d);
  validate(d,RISK);
  // 생성 명세가 안내하는 경로 접두(흐름 폴더가 스킬의 references 아래 등에 있을 때)
  const base=(d.base||'.').replace(/\/+$/,'');
  const rel=p=>base==='.'?p:`${base}/${p}`;
  const hasLanes=Object.keys(d.lanes||{}).length>0;
  // 단계 대상(lane): 이름은 steps.json lanes에서. both는 공통
  const laneText=l=>l==='both'?`공통(${Object.values(d.lanes||{}).join('·')})`:(d.lanes||{})[l]||l||'';
  const lanesHtml=hasLanes?Object.entries(d.lanes).map(([k,v])=>`<li><code>${esc(k)}</code> ${esc(v)}</li>`).join('')+'<li><code>both</code> 공통</li>':'';
  const nodes=d.steps.map(s=>`<a class="node" style="--c:${RISK[s.risk][1]}" href="#${s.id}"><b>${s.id}</b>${esc(s.title)}</a>`).join('<span class="arr">→</span>');
  const cards=d.steps.map(s=>{
    const shot=existsSync(join(here,'shots',s.id+'.jpg'))?`<img src="shots/${s.id}.jpg" alt="${s.id} 기준 화면(번호 태그=실행 번호)">`:(s.capture===false?`<div class="noshot">캡처 금지${s.captureNote?` — ${esc(s.captureNote)}`:''}</div>`:'<div class="noshot">기준 캡처 없음</div>');
    const rows=(s.elements||[]).map(e=>`<tr><td><span class="tag">${esc(e.n)}</span></td><td>${esc(e.label)}</td><td><code>${esc(e.find)}</code></td><td>${esc(e.action)}</td><td>${esc(e.wait)}</td><td>${esc(e.expect)}</td><td>${esc(e.onChange)}</td></tr>`).join('')||'<tr><td colspan="7" class="muted">실행 요소 없음(캡처 전)</td></tr>';
    const idf=s.identify||{};
    return `<details class="card" id="${s.id}" data-step="${s.id}" data-risk="${s.risk}"><summary><h2><span class="id">${s.id}</span> ${esc(s.title)} <span class="risk" style="--c:${RISK[s.risk][1]}">${esc(RISK[s.risk][0])}</span></h2></summary>
<dl><dt>목적</dt><dd>${esc(s.purpose)}</dd>
${hasLanes?`<dt>대상</dt><dd>${esc(laneText(s.lane))}</dd>\n`:''}${s.gate?`<dt>승인 관문</dt><dd>${esc(s.gate)}</dd>\n`:''}<dt>실행 도구</dt><dd><code>${esc(s.tool)}</code>${s.toolNote?` — ${esc(s.toolNote)}`:''}${runsFor(d,s.id).map(r=>`<br>운영: <code>${esc(r.label)}</code> 명령 안에서 실행 — 이 단계 명령은 진단·재현용`).join('')}${s.command&&s.command!==s.tool?`<br>명령: <code>${esc(s.command)}</code>`:''}</dd>
<dt>진입 조건</dt><dd>${esc(s.enter||'')}</dd>
<dt>화면 식별(하나라도 다르면 UI 변경)</dt><dd>${idf.title?`제목: ${esc(idf.title)}<br>`:''}<ul>${li(idf.anchors)}</ul></dd></dl>
<div class="grid"><div>${shot}<p class="muted">기준 화면 · 확인일 ${esc(s.verified||'미확인')} · ${esc(s.status)}</p></div>
<div><b>실행(번호 = 캡처 태그)</b><table><thead><tr><th>#</th><th>요소</th><th>찾기</th><th>동작</th><th>대기</th><th>기대</th><th>다르면</th></tr></thead><tbody>${rows}</tbody></table></div></div>
<dl><dt>성공 판정·주의</dt><dd>${esc(s.success||'')}</dd>${s.escalate?`<dt>에스컬레이트</dt><dd>${esc(s.escalate)}</dd>`:''}</dl></details>`;}).join('\n');
  const runLine=r=>`**${r.label}** (${r.covers[0]}~${r.covers[1]}): \`${r.command}\`${r.note?` — ${r.note}`:''}`;
  const runHtml=d.run?`<h2>운영 실행</h2><p class="muted">아래 명령 하나가 범위 단계를 모두 수행한다 — 단계별 명령은 진단·재현용</p><ul>${d.run.map(r=>`<li><b>${esc(r.label)}</b> (${esc(r.covers[0])}~${esc(r.covers[1])}): <code>${esc(r.command)}</code>${r.note?` — ${esc(r.note)}`:''}</li>`).join('')}</ul>`:'';
  const eventLine=e=>`${e.when} → ${e.then}${e.steps?.length?` (${e.steps.join(', ')})`:''}`;
  const eventsHtml=d.events?.length?`<h2>비결정 이벤트</h2><ul>${d.events.map(e=>`<li>${esc(eventLine(e))}</li>`).join('')}</ul>`:'';
  const chg=(d.changes||[]).map(c=>`<tr><td>${esc(c.date)}</td><td>${esc(c.step)}</td><td>${esc(c.what)}</td></tr>`).join('')||'<tr><td colspan="3" class="muted">변경 없음</td></tr>';
  writeFileSync(join(here,'flow.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)}</title>
<style>:root{--bg:#fff;--fg:#0f172a;--mu:#64748b;--bd:#e2e8f0;--cd:#f8fafc}@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#e2e8f0;--mu:#94a3b8;--bd:#334155;--cd:#1e293b}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,'Malgun Gothic',sans-serif}main{max-width:1200px;margin:0 auto;padding:16px}
.flow{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--bd);padding:8px 16px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;z-index:5}
.node{border:2px solid var(--c);border-radius:6px;padding:2px 8px;color:var(--fg);text-decoration:none;font-size:12px}.node b{margin-right:4px;color:var(--c)}.arr{color:var(--mu)}
.card{background:var(--cd);border:1px solid var(--bd);border-radius:8px;padding:12px 16px;margin:16px 0}summary{cursor:pointer}summary h2{display:inline;margin:0;font-size:16px}h2{margin:0 0 4px;font-size:16px}.id{color:var(--mu)}.risk{border:1px solid var(--c);color:var(--c);border-radius:4px;padding:0 6px;font-size:12px}
.meta,.muted{color:var(--mu);font-size:12px}.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}@media(max-width:800px){.grid{grid-template-columns:1fr}}
img{max-width:100%;border:1px solid var(--bd);border-radius:4px}.noshot{border:1px dashed var(--bd);padding:40px;text-align:center;color:var(--mu)}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid var(--bd);padding:3px 6px;text-align:left;vertical-align:top}.tag{background:#dc2626;color:#fff;border-radius:50%;display:inline-block;min-width:18px;text-align:center}code{font-size:12px}dt{font-weight:600;margin-top:6px}dd{margin:0 0 0 12px}</style></head>
<body><div class="flow">${nodes}</div><main><h1>${esc(d.title)}</h1><p class="meta">갱신 ${esc(d.updated)} · 이 파일은 steps.json에서 생성됨(직접 고치지 않는다). 읽는 쪽: 사람 검토 — 에이전트는 실행 시 flow/overview.md와 단계별 flow/S0n.md를 읽는다</p>
<p>${esc(d.purpose||'')}</p>${hasLanes?`<h2>대상 구분(lane)</h2><ul>${lanesHtml}</ul>`:''}${runHtml}<h2>UI 변경 시 처리</h2><ol>${li(d.onChangeProcedure)}</ol><h2>규칙</h2><ul>${li(d.rules)}</ul>${eventsHtml}${cards}
<h2>UI 변경 이력</h2><table><thead><tr><th>날짜</th><th>단계</th><th>내용</th></tr></thead><tbody>${chg}</tbody></table></main><script>const o=()=>{const e=document.getElementById(location.hash.slice(1));if(e&&e.tagName==='DETAILS')e.open=true};addEventListener('hashchange',o);o();</script></body></html>`);

  // 에이전트용 분할 명세 — 시작 시 overview.md 1회, 각 단계 실행 직전 S0n.md만 읽는다(대화가 길어지거나 요약돼도 실행 시점에 정확한 명세를 다시 읽게)
  const outDir=join(here,'flow');mkdirSync(outDir,{recursive:true});
  // 머리말에는 실제 --dir(실행한 위치 기준 상대 경로 — 저장소 루트에서 실행하는 것이 기준)을 적는다
  const dirArg=relative(process.cwd(),here).split(sep).join('/')||'.';
  const GEN=`> 생성 파일 — \`steps.json\`에서 \`node <PACE 설치본 app>/skills/pace-playbook-maker/tools/build.mjs --dir ${dirArg}\`로 만든다(\`<PACE 설치본 app>\`은 PACE 데이터 폴더의 \`app\`, 기본 \`~/.pace/app\`). 직접 고치지 않는다.`;
  const ids=new Set(d.steps.map(s=>s.id));
  for(const f of readdirSync(outDir))if(/^S\d+\.md$/.test(f)&&!ids.has(f.slice(0,-3)))unlinkSync(join(outDir,f));   // 없어진 단계 파일 정리
  const gate=s=>s.gate?`· **${s.gate}**`:'';   // 승인 관문은 단계 gate 필드에 명시한다
  writeFileSync(join(outDir,'overview.md'),`# ${d.title} — 개요

${GEN} 갱신 ${d.updated}

${d.purpose||''}

## 읽는 법
- 스킬 시작 시 이 개요를 한 번 읽는다.
- **각 단계를 실행하기 직전에 그 단계 파일(\`${rel('flow/S0n.md')}\`)을 읽는다.** 앞서 읽은 기억으로 실행하지 않는다.
- 화면이 다르면 그 단계의 캡처(\`${rel('shots/S0n.jpg')}\`, 번호 태그 = 요소 번호)를 연다.

## 단계 순서
| 단계 | 제목 |${hasLanes?' 대상 |':''} 위험 | 진입 조건 | 도구 |
|---|---|${hasLanes?'---|':''}---|---|---|
${d.steps.map(s=>`| [${s.id}](${s.id}.md) | ${md(s.title)} |${hasLanes?` ${md(laneText(s.lane))} |`:''} ${md(RISK[s.risk][0])} ${md(gate(s))} | ${md(s.enter)} | \`${md(s.tool)}\` |`).join('\n')}
${d.run?`
## 운영 실행
아래 명령 하나가 범위 단계를 모두 수행한다. 단계별 명령은 진단·재현용이다.
${d.run.map(r=>`- ${runLine(r)}`).join('\n')}
`:''}${hasLanes?`
## 대상 구분(lane)
${Object.entries(d.lanes).map(([k,v])=>`- \`${k}\` ${v}`).join('\n')}
- \`both\` 공통
`:''}
## 규칙
${(d.rules||[]).map(x=>`- ${x}`).join('\n')}
${d.events?.length?`
## 비결정 이벤트
${d.events.map(e=>`- ${eventLine(e)}`).join('\n')}
`:''}
## UI 변경 시 처리
${(d.onChangeProcedure||[]).map((x,i)=>`${i+1}. ${x}`).join('\n')}

## 에스컬레이트(단계별)
${d.steps.filter(s=>s.escalate).map(s=>`- ${s.id}: ${s.escalate}`).join('\n')||'- 없음'}

## 최근 UI 변경
${(d.changes||[]).slice(-5).map(c=>`- ${c.date} ${c.step}: ${c.what}`).join('\n')||'- 없음'}
`);
  d.steps.forEach((s,i)=>{
    const idf=s.identify||{},prev=d.steps[i-1],next=d.steps[i+1];
    const shot=existsSync(join(here,'shots',s.id+'.jpg'))?`\`${rel('shots/'+s.id+'.jpg')}\` (확인일 ${s.verified||'미확인'} · ${s.status||''})`:(s.capture===false?`캡처 금지${s.captureNote?` — ${s.captureNote}`:''}`:'기준 캡처 없음');
    writeFileSync(join(outDir,s.id+'.md'),`# ${s.id} ${s.title}

${GEN}
위험: ${RISK[s.risk][0]} ${gate(s)}${hasLanes?` · 대상: ${laneText(s.lane)}`:''} · 앞: ${prev?prev.id:'없음'} · 다음: ${next?next.id:'없음'}

**목적**: ${s.purpose||''}

**진입 조건**: ${s.enter||''}

**도구**: \`${s.tool}\`${s.toolNote?` — ${s.toolNote}`:''}${s.command&&s.command!==s.tool?`\n\n**명령**: \`${s.command}\``:''}${runsFor(d,s.id).map(r=>`\n\n운영: \`${r.label}\` 명령 안에서 실행 — 이 단계 명령은 진단·재현용`).join('')}

**화면 식별** (하나라도 다르면 UI 변경)${idf.title?`\n- 제목: ${idf.title}`:''}
${(idf.anchors||[]).map(a=>`- ${a}`).join('\n')||'- 없음'}

**기준 캡처**: ${shot}

## 실행 (번호 = 캡처 태그)
| # | 요소 | 찾기 | 동작 | 대기 | 기대 | 다르면 |
|---|---|---|---|---|---|---|
${(s.elements||[]).map(e=>`| ${e.n} | ${md(e.label)} | \`${md(e.find)}\` | ${md(e.action)} | ${md(e.wait)} | ${md(e.expect)} | ${md(e.onChange)} |`).join('\n')||'| - | 실행 요소 없음(캡처 전) | | | | | |'}

${eventsFor(d,s.id).length?`## 이 단계의 비결정 이벤트
${eventsFor(d,s.id).map(e=>`- ${e.when} → ${e.then}`).join('\n')}

`:''}## 성공 판정·주의
${s.success||''}
${s.escalate?`\n## 에스컬레이트\n${s.escalate}\n`:''}`);
  });
  if(agentPlan)writeAgent(here,agentPlan);
  return d.steps.length;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const i=process.argv.indexOf('--dir');
  if(i>=0&&process.argv[i+1]&&process.argv.includes('--review-hash')){console.log(reviewHash(process.argv[i+1]));process.exit(0);}
  if(i>=0&&process.argv[i+1]&&process.argv.includes('--check-agent')){
    const res=checkAgentFresh(process.argv[i+1]);
    if(!res.applicable)console.log('agentView가 꺼진 흐름 — 검사 대상 아님');
    else if(res.ok)console.log('agent/ 최신');
    else{console.error('agent/ 낡음:\n'+res.problems.map(x=>'- '+x).join('\n'));process.exit(1);}
    process.exit(0);
  }
  if(i<0||!process.argv[i+1]){console.error('사용: node build.mjs --dir <흐름 폴더>');process.exit(2);}
  console.log(`flow.html + flow/overview.md + 단계 ${buildFlow(process.argv[i+1])}개 생성`);
}
