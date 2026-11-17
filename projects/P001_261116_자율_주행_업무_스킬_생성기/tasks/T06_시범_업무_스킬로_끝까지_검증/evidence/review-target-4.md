# T06 반영 확인 검토 대상(3차 지적 4건)

| 3차 지적 | 처리 | 위치 |
|---|---|---|
| 1 부모의 다른 글자 | 요소마다 '대상 밖 글자'(대상 요소 하위 글자만 빼고 이어 붙인 글자, outText)로 값을 찾는다 — 대상을 품은 조상도 검사. 가장 작은 요소 판정도 대상 밖 글자로 | capture-core.mjs leakScript, 시험 '값 노출 S-2c' |
| 2 짧은 값 | 길이와 무관하게 낱말 단위 일치(앞뒤가 글자·숫자가 아님) — '별: 7' 잡힘, 'v17'은 아님, 'v1.7'은 잡힘(fail-closed 쪽) | leakScript has/tok, 시험 S-2·S-2c |
| 3 커밋 제목 미검사 | 커밋 제목에도 scanSensitive — 결과 종류가 '긴 토큰'뿐일 때만 허용(개수 보고), 그 밖 형식은 위반 | leak-check.mjs stripB |
| 4 픽셀 | box 안 '낯선 픽셀'(가림색↔흰 글자 선분에서 45 넘게 먼 색) 비율 ≤0.05 추가(기준은 결과 전에 정함). 가림 이미지 0.003~0.044, 가림 없는 대조군 0.79~0.85 | leak-check.mjs boxStats·pix, evidence/leak-check.txt |

## capture-core.mjs leakScript·leakTargets·leakProblems 전문
```js
// 값 노출 검사 — 추출 대상 요소가 가려져도 **같은 값이 화면의 다른 곳**(예: 파일 목록의 커밋 제목·About의 별 개수)에 가려지지 않은 채 보이면 캡처 이미지에 값이 남는다.
// 화면에서 각 추출 대상의 현재 값을 읽어, 대상 요소 밖의 보이는 곳 중 mask 규칙(CSS 선택자 안·정규식 일치)에 덮이지 않은 곳에 그 값이 있는지 센다.
//  · 글자: 각 요소의 **대상 밖 글자**(대상 요소 하위 글자를 뺀 글자 — 대상을 품은 부모의 다른 글자도 본다)에서 값을 품은 **가장 작은 요소**를 센다
//    — 값이 여러 노드로 나뉘어(ab<span>cd</span>) 보여도 잡는다. 값은 길이와 무관하게 낱말 단위로 찾는다(짧은 값 '7'도 '별: 7'에서 잡는다).
//  · 입력칸: 다른 입력칸의 value에 같은 값이 있으면 센다.
// 대상마다 결과를 하나씩 낸다 — 대상 요소가 없거나 값이 비었으면 checked:false(검사하지 못함). 결과에는 이름·개수·사유만 있다(값 없음).
export function leakScript({mask,step}){
  const css=(mask||[]).filter(m=>typeof m==='string'&&!m.startsWith('re:'));
  const res=(mask||[]).filter(m=>typeof m==='string'&&m.startsWith('re:')).map(m=>m.slice(3));
  return `(()=>{
const CSS=${JSON.stringify(css)},RES=${JSON.stringify(res)},TG=${JSON.stringify(leakTargets(step))};
// 캡처는 뷰포트만 찍는다 — 화면 밖(스크롤 아래) 요소는 이미지에 남지 않는다
const VW=typeof innerWidth==='number'?innerWidth:Infinity,VH=typeof innerHeight==='number'?innerHeight:Infinity;
const vis=e=>{const r=e.getBoundingClientRect();const right=r.right??(r.left+r.width),bottom=r.bottom??(r.top+r.height);return r.width>0&&r.height>0&&right>0&&bottom>0&&r.left<VW&&r.top<VH&&getComputedStyle(e).visibility!=='hidden';};
const closest=(el,sel)=>{for(let p=el;p;p=p.parentElement){try{if(p.matches&&p.matches(sel))return true;}catch(e){return false;}}return false;};
const isInput=e=>/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName);
const norm=s=>String(s??'').replace(/\\s+/g,' ').trim();
const escRe=s=>s.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&');
const coveredEl=(el,text)=>{for(const m of CSS)if(closest(el,m))return true;for(const r of RES){try{if(new RegExp(r).test(text))return true;}catch(e){}}return false;};
const inside=(a,b)=>{for(let q=b;q;q=q.parentElement)if(q===a)return true;return false;};
const els=[];const walk=n=>{for(const c of n.children||[]){if(c.nodeType!==1)continue;els.push(c);walk(c);}};walk(document.body);
const out=[];
for(const t of TG){
  let el=null;try{el=document.querySelector(t.f);}catch(e){}
  if(!el){out.push({name:t.n,checked:false,reason:'missing'});continue;}
  const v=norm(isInput(el)?el.value:el.textContent);
  if(!v){out.push({name:t.n,checked:false,reason:'empty'});continue;}
  // 값은 낱말 단위로 찾는다(앞뒤가 글자·숫자가 아님) — 'main'이 'domain' 안에서 잡히지 않게. 길이와 무관(짧은 값도 낱말로 있으면 센다 — fail-closed)
  const tok=new RegExp('(^|[^\\\\p{L}\\\\p{N}])'+escRe(v)+'($|[^\\\\p{L}\\\\p{N}])','u');
  const has=s=>tok.test(norm(s));
  // 대상 밖 글자: 대상 요소 하위 글자를 빼고(경계는 공백) 이어 붙인다 — 대상을 품은 조상의 다른 글자도 검사된다
  const memo=new Map();
  const outText=nd=>{if(nd===el)return ' ';if(nd.nodeType===3)return nd.nodeValue||'';if(memo.has(nd))return memo.get(nd);const s=Array.from(nd.childNodes||nd.children||[]).map(outText).join('');memo.set(nd,s);return s;};
  let n=0;
  for(const e of els){
    if(e===el||inside(el,e))continue;   // 대상 자신·대상 안
    if(!vis(e))continue;
    if(isInput(e)){if(e.value!==undefined&&has(e.value)&&!coveredEl(e,String(e.value)))n++;continue;}
    const txt=outText(e);
    if(!has(txt))continue;
    // 더 작은 자식 요소가 값을 품으면 그 자식에서 센다(실제 DOM의 children은 HTMLCollection — 배열 메서드 없음)
    if(Array.from(e.children||[]).some(c=>c.nodeType===1&&c!==el&&!inside(el,c)&&has(outText(c))))continue;
    if(!coveredEl(e,txt))n++;
  }
  out.push({name:t.n,checked:true,exposed:n});
}
return out;
})()`;
}
// 값 노출 검사 대상 — 화면 선택자로 읽는 추출 선언(이름·선택자)
export function leakTargets(step){return ((step&&step.extract)||[]).filter(x=>x&&x.where&&typeof x.where.selector==='string').map(x=>({n:x.name,f:x.where.selector}));}
// 문제 문구 배열(이름·개수·사유만, 값 없음) — fail-closed: 결과가 배열이 아니거나, 대상마다 하나씩 checked 결과가 없거나, 노출이 있으면 문제다
export function leakProblems(res,step){
  if(!Array.isArray(res))return ['값 노출 검사 결과를 읽지 못했다'];
  const probs=[];
  const names=step?leakTargets(step).map(t=>t.n):res.map(x=>x&&x.name);
  for(const name of names){
    const x=res.find(r=>r&&r.name===name);
    const label=`추출 '${String(name).slice(0,40)}'`;
    if(!x||typeof x!=='object'){probs.push(`${label}의 값 노출 검사 결과가 없다`);continue;}
    if(x.checked!==true){probs.push(`${label}의 값 노출을 검사하지 못했다(${x.reason==='missing'?'대상 없음':x.reason==='empty'?'값 없음':'사유 모름'})`);continue;}
    if(!Number.isInteger(x.exposed)||x.exposed<0){probs.push(`${label}의 값 노출 검사 결과를 해석하지 못했다`);continue;}
    if(x.exposed>0)probs.push(`${label}의 값이 대상 밖 ${x.exposed}곳에 가려지지 않고 보인다`);
  }
  return probs;
}

// 단계·흐름 설정이 캡처를 허용하는지 — 아니면 CaptureRefused
```
## orca-adapter.mjs 관문
```js
// 값 노출 검사(캡처 공통 관문): 추출 대상 값이 대상 밖 다른 곳에 가려지지 않은 채 보이면 캡처하지 않는다(대상 요소만 가려서는 부족하다).
// 검사하지 못한 대상(대상 없음·값 없음)·결과 없음도 거부한다(fail-closed). 최초 캡처(captureStep)와 복구 재캡처(recaptureStep)가 같이 쓴다.
export function assertNoValueExposure({browser,doc,step}){
  if(!(step.extract||[]).some(x=>x&&x.where&&typeof x.where.selector==='string'))return;
  // 추출 선택자가 번호 요소에 연결되지 않았으면 그 사유(extract_unlinked)로 먼저 거부한다 — 화면에서 찾지 못한 추출 대상과 같은 원인이다
  const finds=new Set((step.elements||[]).map(e=>e&&e.find));
  if((step.extract||[]).some(x=>x&&x.where&&typeof x.where.selector==='string'&&!finds.has(x.where.selector)))refuse('추출 대상이 번호 요소에 연결되지 않았다','extract_unlinked');
  let leak;try{leak=browser.evalJs(leakScript({mask:doc&&doc.mask,step}));}catch{leak=null;}
  const probs=leakProblems(leak,step);
  if(probs.length)refuse(`캡처하지 않는다 — ${probs.join('; ')}. mask에 그 위치를 더하거나 값이 같은 곳을 가린다`,'value_exposed');
}
// 복구(자가 학습)의 재캡처 — driveWithHealing의 recapture 주입용. 최초 캡처와 같은 값 노출 관문을 거친 뒤 가림 캡처·기록을 만들고 원본 스크린샷은 지운다.
// 반환 {record, bytes}: 기록·이미지는 복구가 반영 트랜잭션에서 쓰고, 새 기준 캡처는 history에 '사람 확인: 대기'로 남는다(healing.md).
export function recaptureStep({browser,doc,step,frames={},delayMs}){
  assertNoValueExposure({browser,doc,step});
  const cap=runCapture({doc,step,frames,browser,...(delayMs!==undefined?{delayMs}:{})});
  try{
    const bytes=readFileSync(cap.path);
    const record=captureRecord({info:cap.info,post:cap.post,step,shotSha256:sha256Hex(bytes),frames});
    return {record,bytes};
  }finally{try{browser.discard(cap.path);}catch{/* 원본 삭제 실패는 결과를 바꾸지 않는다 */}}
}
// pending: 저장소 밖 대기 폴더의 보호 저장소. actions·expects가 주어지면 관찰이 ok일 때만 진행한다.
```
## 시험 test/playbook/capture-core.test.mjs 값 노출 부분
```js
// ---- 값 노출 검사(T06 검토 반영): 추출 대상 밖의 같은 값 노출 위치 ----
import {leakScript,leakProblems} from '../../skills/pace-playbook-maker/tools/capture-core.mjs';
const runLeak=(doc,mask,step)=>new Function('document','NodeFilter','getComputedStyle','return '+leakScript({mask,step}))(doc,{SHOW_TEXT:4},()=>({visibility:'visible'}));

const mkDoc=()=>{const d=new Doc();const mk=(tag,o={},parent=d.body)=>{const e=new El(tag,{rect:{left:0,top:0,width:100,height:20},...o});parent.appendChild(e);return e;};return {d,mk};};

test('값 노출 S-1 같은 값이 가림 밖 다른 곳에 보이면 개수로 잡고, 가려진 곳·대상 자신은 세지 않는다 — 대상마다 결과 하나', ()=>{
  const {d,mk}=mkDoc();
  mk('span',{attrs:{class:'stars'},text:'124k'});            // 추출 대상
  mk('p',{attrs:{class:'about'},text:'About: 124k stars'});   // 같은 값이 다른 곳(가려지지 않음)
  mk('td',{attrs:{class:'row'},text:'124k'});                 // 같은 값이 다른 곳(가려짐)
  const step={extract:[{name:'별',where:{selector:'span.stars'}}]};
  let r=runLeak(d,['td.row'],step);
  assert.deepEqual(r,[{name:'별',checked:true,exposed:1}]);   // about의 124k만(td는 가려짐, 대상 자신 제외)
  assert.deepEqual(leakProblems(r,step),["추출 '별'의 값이 대상 밖 1곳에 가려지지 않고 보인다"]);
  // 정규식 가림 규칙이 덮으면 세지 않는다
  const covered=runLeak(d,['td.row','re:\\d+k stars'],step);
  assert.deepEqual(covered,[{name:'별',checked:true,exposed:0}]);assert.deepEqual(leakProblems(covered,step),[]);
  // 결과는 이름·개수뿐(값 없음)
  assert.ok(!JSON.stringify(r).includes('124k'));
});

test('값 노출 S-2 노드로 나뉜 글자·다른 입력칸의 value·짧은 값(낱말 단위)도 센다', ()=>{
  const {d,mk}=mkDoc();
  mk('span',{attrs:{class:'title'},text:'가상 제목 abcd'});
  const p=mk('p',{attrs:{class:'list'}});mk('b',{text:'가상 제목 ab'},p);mk('i',{text:'cd'},p);   // ab<i>cd</i>로 나뉨 → p에서 한 번
  mk('input',{attrs:{class:'search'},value:'가상 제목 abcd'});                                      // 다른 입력칸의 value
  mk('span',{attrs:{class:'stars'},text:'7'});mk('em',{text:'7'});mk('em',{text:'v1.7 release'});    // 짧은 값도 낱말로: em '7'과 'v1.7'의 '7'(점 뒤 낱말)
  const step={extract:[{name:'제목',where:{selector:'span.title'}},{name:'별',where:{selector:'span.stars'}}]};
  const r=runLeak(d,[],step);
  assert.deepEqual(r,[{name:'제목',checked:true,exposed:2},{name:'별',checked:true,exposed:2}]);
  // 가리면 0
  assert.deepEqual(runLeak(d,['p.list','input.search','em'],step).map(x=>x.exposed),[0,0]);
});

test('값 노출 S-2b 화면(뷰포트) 밖 요소와 다른 낱말 속 부분 일치는 세지 않는다', ()=>{
  const {d,mk}=mkDoc();
  mk('span',{attrs:{class:'branch'},text:'main'});
  mk('p',{text:'custom domain settings'});                                  // 'main'이 낱말 안에만 — 세지 않음
  mk('p',{text:'switch to main now'});                                      // 낱말로 있음 — 셈
  mk('pre',{text:'git checkout main',rect:{left:0,top:2000,width:100,height:20}});   // 뷰포트(800×600) 밖 — 이미지에 없음
  const step={extract:[{name:'브랜치',where:{selector:'span.branch'}}]};
  const run=new Function('document','NodeFilter','getComputedStyle','innerWidth','innerHeight','return '+leakScript({mask:[],step}));
  assert.deepEqual(run(d,{SHOW_TEXT:4},()=>({visibility:'visible'}),800,600),[{name:'브랜치',checked:true,exposed:1}]);
});

test('값 노출 S-2c 대상을 품은 부모의 다른 글자와 주변 글자가 붙은 짧은 값도 센다(검토 3차)', ()=>{
  const {d,mk}=mkDoc();
  const box=mk('div',{attrs:{class:'box'}});
  mk('span',{id:'target',text:'abcd'},box);box.appendChild(new Text(' · abcd'));   // <div><span id=target>abcd</span> · abcd</div>
  mk('span',{attrs:{class:'stars'},text:'7'});mk('p',{text:'별: 7'});mk('p',{text:'v17 release'});   // 짧은 값: '별: 7'만(낱말), 'v17'은 아님
  const step={extract:[{name:'제목',where:{selector:'#target'}},{name:'별',where:{selector:'span.stars'}}]};
  assert.deepEqual(runLeak(d,['#target','span.stars'],step),[{name:'제목',checked:true,exposed:1},{name:'별',checked:true,exposed:1}]);
  // 부모 전체를 가리면 0
  assert.deepEqual(runLeak(d,['div.box','span.stars','p'],step).map(x=>x.exposed),[0,0]);
});

test('값 노출 S-3 fail-closed — 대상 없음·값 없음·결과 없음·불완전·해석 불가는 모두 문제', ()=>{
  const {d,mk}=mkDoc();
  mk('span',{attrs:{class:'empty'},text:''});
  const step={extract:[{name:'없음',where:{selector:'span.none'}},{name:'빈값',where:{selector:'span.empty'}}]};
  const r=runLeak(d,[],step);
  assert.deepEqual(r,[{name:'없음',checked:false,reason:'missing'},{name:'빈값',checked:false,reason:'empty'}]);
  assert.deepEqual(leakProblems(r,step),["추출 '없음'의 값 노출을 검사하지 못했다(대상 없음)","추출 '빈값'의 값 노출을 검사하지 못했다(값 없음)"]);
  assert.equal(leakProblems(undefined,step).length,1);
  assert.equal(leakProblems([],step).length,2);              // 대상마다 결과가 있어야 한다
  assert.equal(leakProblems([{}],step).length,2);
  assert.deepEqual(leakProblems([{name:'없음',checked:true,exposed:'0'},{name:'빈값',checked:true,exposed:0}],step),["추출 '없음'의 값 노출 검사 결과를 해석하지 못했다"]);
});
```
## leak-check.mjs 전문
```js
// 값이 새지 않는 경로 검사(T06 S-5, T-5) — 시범 작성·주행·학습에서 저장된 모든 파일에 민감 형식 실값이 없는지 파일 종류별로 본다.
//  A. 플레이북·지도·상태(steps.json·agent/*·flow/*·SKILL.md·history.md·drive-state·heal-state): scanSensitive를 그대로(생성기와 같은 검사)
//  B. 세션 기록·측정 증거(*.stream.jsonl, 세션 [pn]N.json, sessions-*.json, coexist-session.json, 실페이지 확인 *.jsonl):
//     실행기가 붙이는 메타데이터 종류(식별자·서명·시각·사용량/비용·무결성 해시)를 빼고 scanSensitive — 종류별 개수를 보고한다.
//     공개 정답 값(커밋 제목 등, 필드 output·got·truth·truthStart·truthEnd)은 설계상 증거로 남기는 공개 정보라 뺀다(개수 보고).
//  C. 그 밖 증거 글(.txt·.md): scanSensitive, UUID 실행 id만 메타데이터로 뺀다.
//  모든 종류에 사용자 경로·사용자 이름·토큰 모양 검사를 더한다. (코드 .mjs는 대상이 아니다 — 저장소 비밀 검사가 본다)
//  캡처 이미지: 승인 기록(captureRecord)의 가림 증거(post·elementsMasked·perRule) + 요소 box 안 픽셀 중 가림색(±40) 비율 —
//  가림 이미지는 모든 box가 기준 이상, 같은 화면을 가림 없이 찍은 대조군은 모든 box가 기준 미만이어야 한다(대조군 이미지는 임시 폴더에만, 끝나면 지운다).
// 사용: node leak-check.mjs <출력 파일> <검사 폴더>...   (Orca 게스트 프로필 pace-t06-guest 필요)
import {spawnSync,spawn} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync,existsSync,statSync,rmSync,mkdtempSync} from 'node:fs';
import {join,resolve,dirname,relative,extname,basename} from 'node:path';
import {homedir,userInfo,tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');
const imp=f=>import(pathToFileURL(join(ROOT,'skills','pace-playbook-maker','tools',f)).href);
const {scanSensitive}=await imp('sensitive.mjs');
const {orcaExe}=await imp('orca-adapter.mjs');
const [outFile,...dirs]=process.argv.slice(2);
const lines=[];const say=s=>{lines.push(s);console.log(s);};
const walk=d=>readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?walk(p):[p];});
const user=(()=>{try{return userInfo().username;}catch{return '';}})();
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const PATTERNS=[
  ['사용자 경로',/(?<![A-Za-z])[A-Za-z]:[\\/]+Users[\\/]+(?!<)[^\\/"'\s<]+/i],
  ['홈 경로',new RegExp(esc(homedir()).replace(/\\\\/g,'[\\\\/]+'),'i')],
  ...(user?[['사용자 이름',new RegExp('(^|[^A-Za-z0-9])'+esc(user)+'($|[^A-Za-z0-9])','i')]]:[]),
  ['토큰 모양',/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/],
  ['Bearer 토큰',/bearer\s+[A-Za-z0-9._~+/=-]{20,}/i]
];
const TEXT=new Set(['.json','.jsonl','.md','.txt','.html','.csv']);
const self=outFile?resolve(outFile):'';
const classOf=f=>{
  const p=f.replace(/\\/g,'/');
  if(/\.stream\.jsonl$/.test(p)||/\/[pn]\d\.json$/.test(p)||/\/sessions-(playbook|nomap)\.json$/.test(p)||/\/coexist-session\.json$/.test(p)||/\/round2-longtitle[^/]*\.jsonl$/.test(p))return 'B';
  if(/\/references\/|\/SKILL\.md$|\/(drive|heal)-state\.json$/.test(p))return 'A';
  return 'C';
};
// B의 메타데이터 종류(키 이름) — 값이 아니라 실행기가 붙이는 것
const META_KEYS={
  '식별자':/^(session_id|uuid|id|request_id|tool_use_id|parent_tool_use_id|hook_id)$/,
  '서명':/^signature$/,
  '시각':/^(resetsAt|startedAt|at|timestamp|credential_expires_at|ttft_stream_ms|duration_ms|duration_api_ms|ms)$/,
  '사용량·비용':/^(usage|modelUsage|model_usage_since_last_result|total_cost_usd|costUSD|rate_limit_info|cache_creation|server_tool_use)$/,
  '실행 경로 필드':/^(memory_paths|memoryPaths|messaging_socket_path|persistedOutputPath|wire_tool_inputs|cwd)$/
};
// 공개 정답 값: 답·정답 묶음(output·got·truth·truthStart·truthEnd) 안의 커밋 제목(title)만 뺀다 — 공개 저장소의 커밋 제목은 설계상 증거로 남긴다.
// 같은 묶음의 다른 필드(브랜치·해시·날짜·별 개수)는 그대로 검사한다.
const ANSWER_PARENT=/^(output|got|truth|truthStart|truthEnd)$/;
const META_TEXT={'식별자':[/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,/\b(toolu|msg|req|srvtoolu)_[A-Za-z0-9]{10,}\b/g],'무결성 해시':[/\b[0-9a-f]{64}\b/gi],
  '공개 페이지 16진 값(커밋 SHA 등)':[/\b[0-9a-f]{32,40}\b/gi],'도구 결과 임시 경로':[/-AppData-Local-Temp-[^\s"\\]+(\\{1,2}|\/)[^\s"\\]*(\\{1,2}|\/)tool-results/g]};
const dropped={};const drop=k=>{dropped[k]=(dropped[k]||0)+1;};
const stripB=(v,parent='')=>{
  if(Array.isArray(v))return v.map(x=>stripB(x,parent));
  if(v&&typeof v==='object'){const o={};for(const [k,x] of Object.entries(v)){const m=Object.entries(META_KEYS).find(([,re])=>re.test(k));if(m){drop(m[0]);continue;}
    // 답·정답 묶음의 커밋 제목도 민감 형식 검사를 한다 — 공개 커밋 제목에 흔한 '긴 토큰' 모양(브랜치·PR 이름)만 허용하고 개수를 보고한다(이메일·전화 같은 형식은 그대로 위반)
    if(k==='title'&&ANSWER_PARENT.test(parent)&&typeof x==='string'){let msg='';try{scanSensitive(x);}catch(e){msg=String(e.message);}const kinds=[...msg.matchAll(/\(([^)]+)\)/g)].map(m=>m[1]);if(!kinds.length||kinds.every(kd=>kd==='긴 토큰')){if(kinds.length)drop('공개 커밋 제목의 긴 토큰 모양');o[k]='<title>';continue;}}
    o[k]=stripB(x,k);}return o;}
  if(typeof v==='string'){let n=v;for(const [k,res] of Object.entries(META_TEXT))for(const re of res)n=n.replace(re,()=>{drop(k);return '<id>';});return n;}
  return v;
};
const stripC=t=>t.replace(META_TEXT['식별자'][0],()=>{drop('실행 id(UUID)');return '<id>';});
let files=0,violations=0;const perClass={A:0,B:0,C:0};
for(const d of dirs){
  for(const f of walk(resolve(d))){
    const ext=extname(f).toLowerCase();
    if(!TEXT.has(ext)||resolve(f)===self)continue;
    files++;const cls=classOf(f);perClass[cls]++;
    const text=readFileSync(f,'utf8');const rel=relative(ROOT,f).replace(/\\/g,'/');
    const found=[];
    // scanSensitive는 민감 형식을 찾으면 던진다(메시지에는 경로·종류만, 값 없음)
    const scan=(v,tag='')=>{try{scanSensitive(v);}catch(e){found.push(tag+String(e.message).replace(/^민감 형식 거부 — [^:]*: /,'').slice(0,160));}};
    const parse=s=>{try{return JSON.parse(s);}catch{return undefined;}};
    if(cls==='A'){if(ext==='.json'){const o=parse(text);if(o===undefined)found.push('JSON 파싱 실패');else scan(o);}else scan(text);}
    else if(cls==='B'){
      if(ext==='.jsonl')text.split('\n').forEach((l,i)=>{if(!l.trim())return;const o=parse(l);scan(stripB(o===undefined?l:o),`줄 ${i+1}: `);});
      else{const o=parse(text);if(o===undefined)found.push('JSON 파싱 실패');else scan(stripB(o));}
    }
    else scan(stripC(text));
    for(const [name,re] of PATTERNS)if(re.test(text))found.push(name);
    if(found.length){violations+=found.length;say(`위반 [${cls}] ${rel}: ${found.slice(0,5).join(' / ')}${found.length>5?` 외 ${found.length-5}건`:''}`);}
  }
}
say(`텍스트·JSON 파일 ${files}개 검사(A 플레이북·지도·상태 ${perClass.A} · B 세션·측정 기록 ${perClass.B} · C 그 밖 증거 ${perClass.C}) — 위반 ${violations}건`);
say(`검사 전 뺀 메타데이터(종류별 개수, 값 아님): ${Object.entries(dropped).map(([k,v])=>`${k} ${v}`).join(' · ')||'없음'}`);

// ---- 캡처 이미지 ----
const exe=orcaExe();
const orca=(...a)=>{const r=spawnSync(exe,[...a,'--json'],{encoding:'utf8',timeout:90000});const j=JSON.parse(r.stdout);if(!j.ok)throw new Error('orca '+a[0]+' 실패');return j.result;};
const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
const prof=orca('tab','profile','list').profiles.find(p=>p.label==='pace-t06-guest').id;
const MASK=[71,85,105],TOL=40,MIN_SHARE=0.5,CTL_MAX=0.2;   // 기준은 대조군을 돌리기 전에 정했다
// 낯선 픽셀: 가림 상자 안에 올 수 있는 색(가림색 ↔ 흰 ●●● 글자 사이의 선분, JPEG 번짐 포함)에서 SEG_TOL보다 먼 픽셀 — 가려지지 않은 글자·링크색이 남으면 늘어난다.
// 가림 이미지는 모든 box의 낯선 픽셀 비율 ≤ FOREIGN_MAX여야 한다(검토 3차 should_fix: 가림색 비율만으로는 일부 남은 글자를 못 잡는다). 기준은 결과를 보기 전에 정했다.
const SEG_TOL=45,FOREIGN_MAX=0.05;
const blank=orca('tab','create','--profile',prof,'--url','about:blank').browserPageId;
// 이미지는 명령 줄 길이 한도 때문에 data URL로 넘기지 않고, 별도 프로세스의 로컬 HTTP(CORS 허용)로 내준다 — 임시 폴더, 끝나면 지운다
const imgDir=mkdtempSync(join(tmpdir(),'pace-t06-leak-'));let imgN=0;
const srv=spawn(process.execPath,['-e',"const h=require('http'),fs=require('fs'),p=require('path');const d=process.argv[1];h.createServer((q,r)=>{const f=p.join(d,p.basename(new URL(q.url,'http://x').pathname));if(!fs.existsSync(f)){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':'image/jpeg','access-control-allow-origin':'*'});r.end(fs.readFileSync(f));}).listen(0,'127.0.0.1',function(){console.log('PORT '+this.address().port);});",imgDir],{stdio:['ignore','pipe','ignore']});
const PORT=await new Promise((ok,fail)=>{let b='';srv.stdout.on('data',x=>{b+=x;const m=/PORT (\d+)/.exec(b);if(m)ok(m[1]);});setTimeout(()=>fail(new Error('이미지 서버 시작 실패')),15000);});
// box 안 픽셀 중 가림색(±TOL) 비율과 평균색
const boxStats=(jpeg,boxes)=>{
  const fn='img-'+(++imgN)+'.jpg';writeFileSync(join(imgDir,fn),jpeg);
  const u='http://127.0.0.1:'+PORT+'/'+fn;
  const bs=Object.entries(boxes).map(([n,b])=>({n,x:Math.round(b.x),y:Math.round(b.y),w:Math.max(1,Math.round(b.w)),h:Math.max(1,Math.round(b.h))}));
  const expr=`(async()=>{const img=new Image();img.crossOrigin='anonymous';img.src=${JSON.stringify(u)};await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const M=${JSON.stringify(MASK)},T=${TOL},ST=${SEG_TOL};const W=[255,255,255],D=[W[0]-M[0],W[1]-M[1],W[2]-M[2]],DD=D[0]*D[0]+D[1]*D[1]+D[2]*D[2];const segDist=(r,g2,b2)=>{const p=[r-M[0],g2-M[1],b2-M[2]];let t=(p[0]*D[0]+p[1]*D[1]+p[2]*D[2])/DD;t=Math.max(0,Math.min(1,t));const q=[p[0]-t*D[0],p[1]-t*D[1],p[2]-t*D[2]];return Math.sqrt(q[0]*q[0]+q[1]*q[1]+q[2]*q[2]);};return JSON.stringify({iw:img.width,ih:img.height,boxes:${JSON.stringify(bs)}.map(b=>{const d=g.getImageData(b.x,b.y,b.w,b.h).data;let r=0,gg=0,bb=0,k=0,f=0,n=d.length/4;for(let i=0;i<d.length;i+=4){r+=d[i];gg+=d[i+1];bb+=d[i+2];if(Math.abs(d[i]-M[0])<T&&Math.abs(d[i+1]-M[1])<T&&Math.abs(d[i+2]-M[2])<T)k++;if(segDist(d[i],d[i+1],d[i+2])>ST)f++;}return {n:b.n,share:+(k/n).toFixed(3),foreign:+(f/n).toFixed(3),mean:[r/n,gg/n,bb/n].map(x=>Math.round(x))};})});})()`;
  let v=orca('eval','--page',blank,'--expression',expr).result;v=typeof v==='object'&&v&&'result' in v?v.result:v;while(typeof v==='string')v=JSON.parse(v);return v;
};
const fmt=st=>st.boxes.map(b=>`${b.n}:${b.share}/${b.foreign}`).join(' ');
let capOk=true;let controlDone=false;let checkedShots=0;
try{
  for(const d of dirs)for(const f of walk(resolve(d)).filter(p=>/[\\/]steps\.json$/.test(p))){
    const doc=JSON.parse(readFileSync(f,'utf8'));
    for(const s of doc.steps.filter(x=>x.captureRecord)){
      const shot=join(dirname(f),'shots',s.id+'.jpg');
      if(!existsSync(shot)){say(`캡처 기록이 있는데 이미지가 없다: ${relative(ROOT,shot).replace(/\\/g,'/')}`);capOk=false;continue;}   // 기록과 이미지는 함께여야 한다
      const rec=s.captureRecord,rel=relative(ROOT,shot).replace(/\\/g,'/');
      const nBoxes=Object.keys(rec.boxes||{}).length;
      const allMasked=Object.keys(rec.elementsMasked||{}).length>0&&Object.values(rec.elementsMasked).every(Boolean);
      const reqOk=(s.maskRequire||[]).every(k=>(rec.masking.perRule[k]||0)>0);
      const st=boxStats(readFileSync(shot),rec.boxes);
      const pix=nBoxes>0&&st.boxes.length===nBoxes&&st.boxes.every(b=>b.share>=MIN_SHARE&&b.foreign<=FOREIGN_MAX);   // box가 없으면 통과가 아니다
      checkedShots++;
      say(`캡처 ${rel} (${st.iw}×${st.ih}): post=${rec.post===true} · 요소 전부 가림=${allMasked} · 가림 필수 규칙 충족=${reqOk} · 가린 건수 ${rec.masking.masked} · box별 가림색 비율/낯선 픽셀 비율 ${fmt(st)} → ${pix?`모든 box 가림색 ≥ ${MIN_SHARE}·낯선 픽셀 ≤ ${FOREIGN_MAX}`:'기준 미달 box 있음'}`);
      if(!(rec.post===true&&allMasked&&reqOk&&pix))capOk=false;
      if(controlDone)continue;
      // 대조군(한 번): 같은 화면(만들 때 입력의 공개 페이지, 같은 뷰포트)을 가림 없이 찍으면 같은 픽셀 검사에서 실패해야 한다
      const page=orca('tab','create','--profile',prof,'--url','https://github.com/ceo4ever/pace').browserPageId;
      try{
        for(let i=0;i<30;i++){sleep(700);try{const r=orca('eval','--page',page,'--expression',"!!document.querySelector('[data-testid=\"latest-commit\"]')");if(String(r.result)==='true')break;}catch{}}
        orca('viewport','--page',page,'--width',String(rec.view.vw),'--height',String(rec.view.vh),'--scale',String(rec.view.dpr));sleep(1500);
        const shotRes=orca('screenshot','--page',page,'--format','jpeg');
        const raw=readFileSync(shotRes.path);rmSync(shotRes.path,{force:true});
        const ct=boxStats(raw,rec.boxes);
        const ctlFail=ct.boxes.length>0&&ct.boxes.every(b=>b.share<CTL_MAX);
        say(`대조군(가림 없이 찍은 같은 화면 ${ct.iw}×${ct.ih}, 임시·삭제): box별 가림색 비율/낯선 픽셀 비율 ${fmt(ct)} → 픽셀 검사 ${ctlFail?'실패(기대대로 — 모든 box < '+CTL_MAX+')':'통과 — 검사가 가림을 구별하지 못한다'}`);
        if(!ctlFail)capOk=false;controlDone=true;
      }finally{try{orca('tab','close','--page',page);}catch{}}
    }
  }
}finally{try{orca('tab','close','--page',blank);}catch{}srv.kill();rmSync(imgDir,{recursive:true,force:true});}
if(checkedShots===0||!controlDone){say(`검사한 캡처 ${checkedShots}개 · 대조군 ${controlDone?'있음':'없음'} — 캡처 가림을 확인하지 못했다`);capOk=false;}
const ok=violations===0&&capOk;
say(`판정: 텍스트·JSON 위반 ${violations}건 · 캡처 가림 ${capOk?'확인':'문제'} → ${ok?'통과':'실패'}`);
if(outFile)writeFileSync(resolve(outFile),lines.join('\n')+'\n');
process.exit(ok?0:1);
```
## 증거 evidence/leak-check.txt
```
텍스트·JSON 파일 129개 검사(A 플레이북·지도·상태 42 · B 세션·측정 기록 47 · C 그 밖 증거 40) — 위반 0건
검사 전 뺀 메타데이터(종류별 개수, 값 아님): 시각 571 · 실행 id(UUID) 25 · 공개 커밋 제목의 긴 토큰 모양 2 · 실행 경로 필드 234 · 식별자 2723 · 사용량·비용 336 · 서명 41 · 도구 결과 임시 경로 19 · 공개 페이지 16진 값(커밋 SHA 등) 66 · 무결성 해시 144
캡처 projects/P001_261116_자율_주행_업무_스킬_생성기/tasks/T06_시범_업무_스킬로_끝까지_검증/pilot/github-repo-latest/references/flows/repo-latest/shots/S02.jpg (1280×900): post=true · 요소 전부 가림=true · 가림 필수 규칙 충족=true · 가린 건수 55 · box별 가림색 비율/낯선 픽셀 비율 1:0.923/0.008 2:0.891/0.012 3:0.969/0.004 4:0.688/0.037 5:0.827/0.018 → 모든 box 가림색 ≥ 0.5·낯선 픽셀 ≤ 0.05
대조군(가림 없이 찍은 같은 화면 1280×900, 임시·삭제): box별 가림색 비율/낯선 픽셀 비율 1:0.098/0.85 2:0.146/0.803 3:0.096/0.816 4:0.072/0.793 5:0.081/0.84 → 픽셀 검사 실패(기대대로 — 모든 box < 0.2)
캡처 projects/P001_261116_자율_주행_업무_스킬_생성기/tasks/T06_시범_업무_스킬로_끝까지_검증/evidence/heal-state/playbook/references/flows/repo-latest/shots/S02.jpg (1280×900): post=true · 요소 전부 가림=true · 가림 필수 규칙 충족=true · 가린 건수 55 · box별 가림색 비율/낯선 픽셀 비율 1:0.923/0.008 2:0.891/0.012 3:0.97/0.003 4:0.652/0.044 5:0.978/0.023 → 모든 box 가림색 ≥ 0.5·낯선 픽셀 ≤ 0.05
캡처 projects/P001_261116_자율_주행_업무_스킬_생성기/tasks/T06_시범_업무_스킬로_끝까지_검증/evidence/heal-state/playbook/references/flows/repo-latest/versions/v1/shots/S02.jpg (1280×900): post=true · 요소 전부 가림=true · 가림 필수 규칙 충족=true · 가린 건수 55 · box별 가림색 비율/낯선 픽셀 비율 1:0.923/0.008 2:0.891/0.012 3:0.969/0.004 4:0.688/0.037 5:0.827/0.018 → 모든 box 가림색 ≥ 0.5·낯선 픽셀 ≤ 0.05
캡처 projects/P001_261116_자율_주행_업무_스킬_생성기/tasks/T06_시범_업무_스킬로_끝까지_검증/evidence/sessions-round1/playbook/references/flows/repo-latest/shots/S02.jpg (1280×900): post=true · 요소 전부 가림=true · 가림 필수 규칙 충족=true · 가린 건수 55 · box별 가림색 비율/낯선 픽셀 비율 1:0.923/0.008 2:0.891/0.012 3:0.969/0.004 4:0.688/0.037 5:0.827/0.018 → 모든 box 가림색 ≥ 0.5·낯선 픽셀 ≤ 0.05
캡처 projects/P001_261116_자율_주행_업무_스킬_생성기/tasks/T06_시범_업무_스킬로_끝까지_검증/evidence/sessions-round2/playbook/references/flows/repo-latest/shots/S02.jpg (1280×900): post=true · 요소 전부 가림=true · 가림 필수 규칙 충족=true · 가린 건수 55 · box별 가림색 비율/낯선 픽셀 비율 1:0.923/0.008 2:0.891/0.012 3:0.969/0.004 4:0.688/0.037 5:0.827/0.018 → 모든 box 가림색 ≥ 0.5·낯선 픽셀 ≤ 0.05
판정: 텍스트·JSON 위반 0건 · 캡처 가림 확인 → 통과
```
## 증거 evidence/leak-gate-live.txt
```
시범 화면(만들 때 입력, 게스트 프로필, 1280×900) · 흐름 mask 11개 · 대상별 결과: [{"name":"기본 브랜치","checked":true,"exposed":0},{"name":"별 개수","checked":true,"exposed":0},{"name":"최신 커밋 해시","checked":true,"exposed":0},{"name":"최신 커밋 제목","checked":true,"exposed":0},{"name":"최신 커밋 날짜","checked":true,"exposed":0}]
대조(mask 없음): 대상별 노출 기본 브랜치 3 · 별 개수 0 · 최신 커밋 해시 0 · 최신 커밋 제목 2 · 최신 커밋 날짜 13 → 문제 3건
관문(assertNoValueExposure): 통과 — 노출 0, 검사 못한 대상 0
판정: 강화한 관문을 시범 화면이 통과하고, mask 없이는 같은 관문이 노출을 잡는다
```
## 시험 실행
```
✔ S-1 mask 없음·빈 배열·잘못된 형식·잘못된 re:는 거부 (2.4954ms)
✔ S-2 capture:false 단계는 거부하고 captureNote를 알린다 (0.3556ms)
✔ S-3 거부 대상이면 브라우저 호출 0회 (1.2592ms)
✔ S-4 오버레이 결과 형태가 안전하지 않으면 스크린샷 0회·제거는 호출 (1.1482ms)
✔ S-5 사후 검사 실패면 거부하고 원본을 삭제한다 (0.7894ms)
✔ S-5c 사후 검사 evalJs가 throw해도 원본 삭제·원 오류 전달 (0.2682ms)
✔ S-6 스크린샷이 throw하면 제거 호출·오류 전달 (0.321ms)
✔ S-7 정상 순서: 오버레이 → 스크린샷 → 사후 검사 → 제거 (0.3804ms)
✔ S-8 CSS·re: 규칙은 일치 요소마다 상자를 만들고 뷰포트 밖도 덮는다 (3.9696ms)
✔ S-8b 비일치 요소는 덮지 않고, 크기 0 요소는 건너뛴다 (0.723ms)
✔ S-9 규칙값은 JSON 리터럴로만 들어가고 특수 문자에도 컴파일된다 (1.6419ms)
✔ S-10 값 있는 입력은 규칙 없이도 덮고, 값 없는 입력·체크박스는 덮지 않는다 (2.0917ms)
✔ S-10b 공개 허용 입력: 선택자와 값 전체 패턴이 모두 맞을 때만 덮지 않는다 (2.9113ms)
✔ S-11 frames: 접근 불가·없음·선언 안 된 iframe·중첩 iframe은 오류, 접근되면 안쪽도 덮는다 (2.0112ms)
✔ S-12 잘못된 선택자·정규식은 삼키지 않고 errors로 거부된다 (0.6277ms)
✔ S-13 열린 shadow root 안 일치 요소도 덮는다 (0.4745ms)
✔ S-5b 사후 검사: 시계 텍스트만 통과, 노드 추가·마스킹 대상·규칙 일치 값은 실패 (2.6289ms)
✔ 사후 검사: 스크롤·레이아웃 변경은 실패 (1.1299ms)
✔ 오버레이 제거는 상자와 감시를 정리한다 (0.3656ms)
✔ S-8c 번호 태그: 뷰포트 안 요소만, 없으면 missing (1.7621ms)
✔ 코어 소스에 서비스 문구가 없다 (2.6803ms)
✔ F1 optional frame: 없으면 통과(태그는 missing), 있는데 접근 불가면 거부 (0.951ms)
✔ F3 보이는 object·embed, F6 열린 dialog·popover·html/body transform은 거부 (2.0589ms)
✔ F4 iframe 테두리(clientLeft/Top)만큼 오프셋이 밀린다, F5 iframe 안 re: 글자도 같은 좌표 (1.4688ms)
✔ F2 오버레이 제거 반환이 true가 아니면 cleanupFailed (0.3006ms)
✔ S-5d input name·type을 바꿨다 되돌리면 통과, 남은 변경·다른 속성·다른 요소는 실패 (1.3714ms)
✔ S-5b+ ignore 하위 요소의 childList·attributes는 실패, frame은 해당 옵저버로만 감지, frame 스크롤도 실패 (1.1527ms)
✔ 값 노출 S-1 같은 값이 가림 밖 다른 곳에 보이면 개수로 잡고, 가려진 곳·대상 자신은 세지 않는다 — 대상마다 결과 하나 (4.1112ms)
✔ 값 노출 S-2 노드로 나뉜 글자·다른 입력칸의 value·짧은 값(낱말 단위)도 센다 (11.2977ms)
✔ 값 노출 S-2b 화면(뷰포트) 밖 요소와 다른 낱말 속 부분 일치는 세지 않는다 (2.8595ms)
✔ 값 노출 S-2c 대상을 품은 부모의 다른 글자와 주변 글자가 붙은 짧은 값도 센다(검토 3차) (4.7946ms)
✔ 값 노출 S-3 fail-closed — 대상 없음·값 없음·결과 없음·불완전·해석 불가는 모두 문제 (0.6532ms)
✔ S-4 보호 저장소: 민감 형식 내용은 쓰기 전에 거부하고 파일이 생기지 않으며, 비이미지 바이트·저장소 밖 경로도 거부 (14.124ms)
✔ S-4 observeStep: 정상은 불리언 관찰만 반환, 액션 실패·관찰 실패·브라우저 오류는 ok:false (1.3245ms)
✔ S-4 캡처→대기→승인: 정상은 shots/S02.jpg·captureRecord·shotHash·recordHash를 쓰고 대기·원본이 남지 않으며 대기 메타에는 숫자·해시뿐 (55.1363ms)
✔ S-4 캡처 단계 거부: 사후 검사 실패·오버레이 오류·가림 필수 0건·추출 미가림·수행 관찰 실패는 대기·원본 0개 (66.9571ms)
✔ S-4 승인 거부: 해시 불일치·대기 없음·캡처 금지 단계는 steps.json·shots를 바꾸지 않고, rejectPending이 대기를 지운다 (65.2612ms)
✔ createOrcaBrowser는 page가 없으면 거부한다(지정한 탭만 다룬다) (0.3914ms)
✔ T06 S-14 recaptureStep(복구 재캡처)은 최초 캡처와 같은 값 노출 관문을 거치고, 통과하면 기록·이미지를 돌려주고 원본을 지운다 (13.3956ms)
ℹ tests 39
ℹ suites 0
ℹ pass 39
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 418.0256
```
