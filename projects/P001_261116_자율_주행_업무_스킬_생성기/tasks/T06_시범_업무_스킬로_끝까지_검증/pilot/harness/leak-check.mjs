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
