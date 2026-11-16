// S-5r(e2e): Orca 내장 브라우저로 가상 로컬 페이지를 열어 코어 오버레이의 box를 실측하고,
// 창 크기·배율을 바꿔 다시 측정해 boxMatches로 비교하며, 생성된 S0n.html 번호 박스의 렌더 위치도 실측 비교한다.
// Orca CLI가 없거나 실행 중이 아니면 건너뛴다(건너뜀을 출력). 마감 증거는 Orca에서 실행한 결과(evidence/e2e-position.txt).
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,cpSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {overlayScript,cleanupScript,captureRecord,approveStep,boxMatches,sha256Hex} from '../../skills/pace-playbook-maker/tools/capture-core.mjs';
import {buildFlow} from '../../skills/pace-playbook-maker/tools/build.mjs';
import {contentHash} from '../../skills/pace-playbook-maker/tools/agent-map.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const FIX=join(here,'..','fixtures','playbook');
const PAGE=pathToFileURL(join(FIX,'position-page.html')).href;
const exe=process.env.ORCA_EXE||(process.platform==='win32'?join(process.env.LOCALAPPDATA||join(homedir(),'AppData','Local'),'Programs','orca','resources','bin','orca.exe'):'orca');
const sleepMs=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
// 페이지 로드 직후 첫 명령이 응답 없이 끊기는 경우가 있어(daemon EOF) 짧게 재시도한다 — 실패를 삼키지 않고 마지막 오류를 던진다
const orca=(...args)=>{let last;for(let i=0;i<4;i++){try{return orcaOnce(...args);}catch(e){last=e;sleepMs(700);}}throw last;};
const orcaOnce=(...args)=>{
  const r=spawnSync(exe,[...args,'--json'],{encoding:'utf8',timeout:60000});
  if(r.error)throw r.error;
  let j;try{j=JSON.parse(r.stdout);}catch{throw new Error(`orca 출력 해석 실패: ${args[0]} ${r.stdout.slice(0,200)} ${r.stderr.slice(0,200)}`);}
  if(!j.ok)throw new Error(`orca ${args[0]} 실패: ${JSON.stringify(j.error||j).slice(0,200)}`);
  return j.result;
};
const available=process.env.PACE_SKIP_BROWSER_E2E==='1'?false:(()=>{try{orca('tab','list');return true;}catch{return false;}})();
const tmps=[],pages=[];
after(()=>{for(const p of pages){try{orca('tab','close','--page',p);}catch{/* 이미 닫힘 */}}for(const d of tmps)rmSync(d,{recursive:true,force:true});});
const log=(...a)=>console.log('[e2e-position]',...a);

const ELEMENTS=[{n:1,find:'#a'},{n:2,find:'#b'},{n:3,find:'#c'},{n:4,find:'#fixed'},{n:5,find:'td.owner'}];
const evalPage=(page,expr)=>JSON.parse(orca('eval','--page',page,'--expression',`JSON.stringify(${expr})`).result);
function measure(page,{w,h,scale}){
  orca('viewport','--page',page,'--width',String(w),'--height',String(h),'--scale',String(scale));
  const info=evalPage(page,overlayScript({elements:ELEMENTS,mask:['td.owner']}));
  orca('eval','--page',page,'--expression',cleanupScript());
  return info;
}
const asBox=(info,n)=>({...info.boxes[n],vw:info.view.vw,vh:info.view.vh});

test('S-5r 실제 브라우저: 창 크기·배율을 바꿔도 같은 요소를 가리키고, 비비례 요소는 불일치, 번호 박스가 렌더 위치와 일치', {skip:available?false:'Orca 브라우저 CLI를 쓸 수 없어 건너뜀(마감 증거는 Orca에서 실행한 결과)'}, ()=>{
  const page=orca('tab','create','--url',PAGE).browserPageId;pages.push(page);
  orca('wait','--page',page,'--selector','#a');
  const base=measure(page,{w:800,h:600,scale:1});
  log('기준 800x600 dpr1 boxes',JSON.stringify(base.boxes),'view',JSON.stringify(base.view),'masked',JSON.stringify(base.elementsMasked));
  assert.deepEqual(base.view,{vw:800,vh:600,dpr:1});
  assert.equal(base.elementsMasked[5],true,'가림 대상 요소는 전체가 덮인다');
  assert.equal(base.elementsMasked[1],false);
  assert.ok(!JSON.stringify(base).includes('값-자리표시'),'원문 값이 결과에 없다');
  // 창을 키움(비례 레이아웃) — 비례 요소는 일치, 고정 폭 요소는 불일치
  const big=measure(page,{w:1200,h:900,scale:1});
  const results={};
  for(const e of ELEMENTS){const m=boxMatches(asBox(base,e.n),asBox(big,e.n));results[e.find]=+m.iou.toFixed(3);}
  log('1200x900 IoU',JSON.stringify(results));
  for(const n of [1,2,3,5])assert.equal(boxMatches(asBox(base,n),asBox(big,n)).ok,true,`요소 ${n} 비례 일치`);
  assert.equal(boxMatches(asBox(base,4),asBox(big,4)).ok,false,'고정 폭 요소는 비비례 변화로 불일치');
  // 다른 요소의 box와는 일치하지 않는다
  assert.equal(boxMatches(asBox(base,1),asBox(big,2)).ok,false);
  // 배율 2: CSS px 좌표는 같다(캡처 픽셀이 아님)
  const dpr2=measure(page,{w:800,h:600,scale:2});
  assert.equal(dpr2.view.dpr,2);
  for(const n of [1,2,3,4,5])assert.equal(boxMatches(asBox(base,n),asBox(dpr2,n)).ok,true,`dpr2 요소 ${n}`);
  assert.deepEqual(dpr2.boxes[1],base.boxes[1],'box는 CSS px라 배율과 무관');
  // 창을 줄임
  const small=measure(page,{w:640,h:480,scale:1});
  for(const n of [1,2,3,5])assert.equal(boxMatches(asBox(base,n),asBox(small,n)).ok,true,`축소 요소 ${n}`);

  // 번호 박스: 기준 측정으로 승인 기록을 만들어 지도를 생성하고, 생성된 S01.html을 실제로 열어 박스 위치를 실측한다
  const dir=mkdtempSync(join(tmpdir(),'pace-e2e-'));tmps.push(dir);
  cpSync(join(FIX,'sample-flow','shots'),join(dir,'shots'),{recursive:true});
  const shot=readFileSync(join(dir,'shots','S02.jpg'));writeFileSync(join(dir,'shots','S01.jpg'),shot);
  const els=ELEMENTS.map(e=>({n:e.n,label:`요소${e.n}`,find:e.find,action:'읽기',wait:'없음',expect:'보인다',onChange:'멈춘다'}));
  const step={id:'S01',title:'위치 대응',risk:'read',tool:'t.mjs',purpose:'위치 대응',enter:'진입',identify:{anchors:['식별']},elements:els,maskRequire:[],extract:[],success:'성공',escalate:'멈춤',screen:{url:'^/x$',require:['body'],forbid:[]}};
  const rec=captureRecord({info:base,post:{ok:true,reasons:[]},step,shotSha256:sha256Hex(shot)});
  const d={title:'표본',updated:'2026-11-16',purpose:'표본',mask:['td.owner'],allowedOrigins:['https://app.example.test'],allowedPaths:['/x'],agentView:true,
    valueReview:{date:'2026-11-16',reviewer:'검토자',note:'표본',contentHash:'0'.repeat(64)},steps:[approveStep(step,rec,{approvedSha:rec.shotSha256})]};
  d.valueReview.contentHash=contentHash(d);
  writeFileSync(join(dir,'steps.json'),JSON.stringify(d,null,1)+'\n');
  buildFlow(dir);
  const mapUrl=pathToFileURL(join(dir,'agent','S01.html')).href;
  const mapPage=orca('tab','create','--url',mapUrl).browserPageId;pages.push(mapPage);
  orca('wait','--page',mapPage,'--selector','.shot');
  orca('viewport','--page',mapPage,'--width','900','--height','900','--scale','1');
  const dom=evalPage(mapPage,`(()=>{const s=document.querySelector('.shot').getBoundingClientRect();return {shot:{x:s.x,y:s.y,w:s.width,h:s.height},boxes:[...document.querySelectorAll('.b')].map(b=>{const r=b.getBoundingClientRect();return {n:+b.dataset.n,x:r.x,y:r.y,w:r.width,h:r.height};})};})()`);
  log('S01.html 렌더 shot',JSON.stringify(dom.shot),'boxes',dom.boxes.length);
  assert.equal(dom.boxes.length,5);
  const tol=2;   // 렌더 반올림 허용(px)
  for(const b of dom.boxes){
    const rb=base.boxes[b.n];
    const ex={x:dom.shot.x+rb.x/800*dom.shot.w,y:dom.shot.y+rb.y/600*dom.shot.h,w:rb.w/800*dom.shot.w,h:rb.h/600*dom.shot.h};
    for(const k of ['x','y','w','h'])assert.ok(Math.abs(b[k]-ex[k])<=tol,`번호 박스 ${b.n}.${k}: 렌더 ${b[k].toFixed(1)} vs 기대 ${ex[k].toFixed(1)}`);
  }
  assert.ok(Math.abs(dom.shot.w/dom.shot.h-800/600)<0.01,'캡처 영역 종횡비 = 기록 뷰포트 비율');
  log('번호 박스 5개가 기록 좌표를 렌더 비율로 환산한 위치와 일치(허용',tol,'px)');
});
