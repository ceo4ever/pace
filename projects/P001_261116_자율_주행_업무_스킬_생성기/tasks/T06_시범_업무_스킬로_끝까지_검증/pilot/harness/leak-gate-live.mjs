// 강화한 값 노출 관문(대상별 fail-closed·나뉜 글자·입력칸·짧은 값)을 시범 캡처 화면(만들 때 입력의 공개 페이지, 게스트 프로필, 같은 뷰포트)에 실제로 적용한다.
// 승인된 시범 캡처가 강화 전 관문으로 찍혔으므로, 같은 화면·같은 mask로 지금 관문도 통과하는지 확인한다. 결과는 이름·개수만.
// 사용: node leak-gate-live.mjs <출력 파일>
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');
const imp=f=>import(pathToFileURL(join(ROOT,'skills','pace-playbook-maker','tools',f)).href);
const {createOrcaBrowser,orcaExe,assertNoValueExposure}=await imp('orca-adapter.mjs');
const {leakScript,leakProblems}=await imp('capture-core.mjs');
const doc=JSON.parse(readFileSync(resolve(here,'..','github-repo-latest','references','flows','repo-latest','steps.json'),'utf8'));
const step=doc.steps.find(s=>s.id==='S02');
const exe=orcaExe();
const orca=(...a)=>{const r=spawnSync(exe,[...a,'--json'],{encoding:'utf8',timeout:90000});const j=JSON.parse(r.stdout);if(!j.ok)throw new Error('orca '+a[0]+' 실패');return j.result;};
const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
const prof=orca('tab','profile','list').profiles.find(p=>p.label==='pace-t06-guest').id;
const page=orca('tab','create','--profile',prof,'--url','https://github.com/ceo4ever/pace').browserPageId;
const lines=[];const say=s=>{lines.push(s);console.log(s);};let ok=false;
try{
  for(let i=0;i<30;i++){sleep(700);try{if(String(orca('eval','--page',page,'--expression',"!!document.querySelector('[data-testid=\"latest-commit\"]')").result)==='true')break;}catch{}}
  orca('viewport','--page',page,'--width','1280','--height','900','--scale','1');sleep(1500);
  const browser=createOrcaBrowser({page});
  let res=browser.evalJs(leakScript({mask:doc.mask,step}));if(typeof res==='string')res=JSON.parse(res);
  say(`시범 화면(만들 때 입력, 게스트 프로필, 1280×900) · 흐름 mask ${doc.mask.length}개 · 대상별 결과: ${JSON.stringify(res)}`);
  // 대조: mask 없이 같은 검사를 하면 노출이 잡혀야 한다(관문이 실제로 값을 찾는다)
  let bare=browser.evalJs(leakScript({mask:[],step}));if(typeof bare==='string')bare=JSON.parse(bare);
  say(`대조(mask 없음): 대상별 노출 ${bare.map(x=>`${x.name} ${x.checked?x.exposed:'검사 못함'}`).join(' · ')} → 문제 ${leakProblems(bare,step).length}건`);
  try{assertNoValueExposure({browser,doc,step});ok=leakProblems(bare,step).length>0;say(`관문(assertNoValueExposure): 통과 — 노출 0, 검사 못한 대상 0`);}
  catch(e){say(`관문: 거부 — ${e.message}`);}
}finally{try{orca('tab','close','--page',page);}catch{}}
say(`판정: ${ok?'강화한 관문을 시범 화면이 통과하고, mask 없이는 같은 관문이 노출을 잡는다':'확인 실패'}`);
writeFileSync(resolve(process.argv[2]),lines.join('\n')+'\n');
process.exit(ok?0:1);
