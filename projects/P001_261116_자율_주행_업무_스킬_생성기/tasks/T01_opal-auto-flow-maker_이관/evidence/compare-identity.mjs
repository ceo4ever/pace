// P-1 동일성 비교: fin-link dd68b5b의 steps.json·shots를 저장소 밖 빈 폴더에 내려받아(읽기 전용 git show)
// 이관본 생성기로 다시 만들고, dd68b5b 생성물과 파일 목록·바이트를 비교한다. 머리말 생성 명령 줄만 자리표시.
// 사용: node compare-identity.mjs <fin-link 작업 사본> <기준 커밋> <생성기 build.mjs>
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
const [repo,commit,build]=process.argv.slice(2);
const git=(...a)=>execFileSync('git',['-C',repo,...a],{maxBuffer:1<<28});
const tree=git('ls-tree','-r','--name-only',commit).toString().split('\n').filter(Boolean);
const flows=tree.filter(p=>p.endsWith('/steps.json')&&/\.claude\/skills\/[^/]+\/references\//.test(p)).map(p=>dirname(p));
const GEN=/^> 생성 파일 — `steps\.json`에서 .*$/m;
const norm=b=>b.toString('utf8').replace(GEN,'> 생성 파일 — <GEN>');
const walk=d=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?walk(p).map(x=>f+'/'+x):[f];});
const out=mkdtempSync(join(tmpdir(),'identity-'));
let bad=0,files=0;
for(const flow of flows){
  const work=join(out,flow.replace(/\//g,'__'));
  const mine=tree.filter(p=>p.startsWith(flow+'/'));
  const isGen=p=>{const r=p.slice(flow.length+1);return r==='flow.html'||r.startsWith('flow/');};
  for(const p of mine.filter(p=>!isGen(p))){const t=join(work,p.slice(flow.length+1));mkdirSync(dirname(t),{recursive:true});writeFileSync(t,git('show',`${commit}:${p}`));}
  execFileSync(process.execPath,[resolve(build),'--dir',work],{cwd:out});
  const want=mine.filter(isGen).map(p=>p.slice(flow.length+1)).sort();
  const got=walk(work).filter(r=>r==='flow.html'||r.startsWith('flow/')).sort();
  const same=JSON.stringify(want)===JSON.stringify(got);
  let diff=[];
  if(same)for(const r of want){files++;const a=git('show',`${commit}:${flow}/${r}`),b=readFileSync(join(work,r));if(norm(a)!==norm(b))diff.push(r);}
  const ok=same&&!diff.length;if(!ok)bad++;
  console.log(`${ok?'OK  ':'FAIL'} ${flow} 생성물 ${want.length}개${same?'':` 목록 다름: want=${want} got=${got}`}${diff.length?` 바이트 다름: ${diff}`:''}`);
}
console.log(`흐름 ${flows.length}개, 파일 ${files}개 비교, 불일치 흐름 ${bad}`);
rmSync(out,{recursive:true,force:true});
process.exit(bad||flows.length!==9?1:0);
