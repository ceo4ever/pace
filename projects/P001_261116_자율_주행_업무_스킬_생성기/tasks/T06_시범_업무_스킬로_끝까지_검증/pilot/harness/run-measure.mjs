// 측정 6회(T06) — 입력 3종 × 두 군(플레이북·지도 없음), 입력별 인접 실행·순서 교차, 순차. 끝나면 중앙값 판정(score.mjs)을 evidence에 쓴다.
// 사용: node run-measure.mjs <증거 폴더> [--only <label>]   (세션 호출은 승인된 6회 — 이 러너가 6개만 만든다)
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {summarize} from './score.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');
const evidence=resolve(process.argv[2]||join(here,'..','..','evidence'));
const only=process.argv.indexOf('--only')>0?process.argv[process.argv.indexOf('--only')+1]:null;
const PLAYBOOK=resolve(here,'..','github-repo-latest');
const DRIVING=join(ROOT,'skills','pace-playbook-maker','references','driving.md');
const dir=join(evidence,'sessions');mkdirSync(dir,{recursive:true});
// 입력1: 플레이북→지도 없음, 입력2: 지도 없음→플레이북, 입력3: 플레이북→지도 없음
const PLAN=[
  ['p1','playbook','anthropics/claude-code'],['n1','nomap','anthropics/claude-code'],
  ['n2','nomap','microsoft/vscode'],['p2','playbook','microsoft/vscode'],
  ['p3','playbook','nodejs/node'],['n3','nomap','nodejs/node']];
for(const [label,mode,repo] of PLAN){
  if(only&&only!==label)continue;
  if(existsSync(join(dir,label+'.json'))){console.log(label,'이미 있음 — 건너뜀');continue;}
  const args=[join(here,'run-session.mjs'),'--mode',mode,'--repo',repo,'--out',dir,'--label',label,...(mode==='playbook'?['--playbook',PLAYBOOK,'--driving',DRIVING]:[])];
  console.log(new Date().toISOString(),label,mode,repo,'시작');
  const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:20*60*1000,maxBuffer:1<<26});
  console.log((r.stdout||'').trim().split('\n').pop(),r.status===0?'':'(종료코드 '+r.status+') '+(r.stderr||'').slice(-300));
}
const load=l=>{const f=join(dir,l+'.json');return existsSync(f)?JSON.parse(readFileSync(f,'utf8')):null;};
const pb=['p1','p2','p3'].map(load).filter(Boolean),nm=['n1','n2','n3'].map(load).filter(Boolean);
if(pb.length&&nm.length){
  const toSample=s=>({ok:s.ok,ms:s.ms,toolCalls:s.toolCalls,screenExplorations:s.screenExplorations,mapBytes:s.mapBytes,mapRead:s.mapRead,timedOut:s.timedOut});
  const s=summarize(pb.map(toSample),nm.map(toSample));
  writeFileSync(join(evidence,'sessions-playbook.json'),JSON.stringify(pb.map(x=>({label:x.label,repo:x.repo,ok:x.ok,ms:x.ms,toolCalls:x.toolCalls,screenExplorations:x.screenExplorations,mapBytes:x.mapBytes,mapRead:x.mapRead,profileViolation:x.profileViolation,fields:x.judge.fields,model:x.model})),null,1)+'\n');
  writeFileSync(join(evidence,'sessions-nomap.json'),JSON.stringify(nm.map(x=>({label:x.label,repo:x.repo,ok:x.ok,ms:x.ms,toolCalls:x.toolCalls,screenExplorations:x.screenExplorations,profileViolation:x.profileViolation,fields:x.judge.fields,model:x.model})),null,1)+'\n');
  writeFileSync(join(evidence,'score.txt'),JSON.stringify(s,null,1)+'\n');
  console.log(JSON.stringify(s));
}
