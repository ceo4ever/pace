// 공존 확인 7번째 세션(T06 S-6b, T-6) — 캡틴 결정 A(2026-11-17): 실제 HOME은 읽기만, PACE 현재 소스를 **임시 HOME**에 설치하고 그 스킬 폴더를
// `--add-dir`로 더해 사례 저장소 작업 사본에서 새 `claude -p` 세션을 **1회**(재시도 없음, 허용 도구 Read만) 연다.
// 확인: 세션 init의 스킬 목록·답변이 사례 저장소 프로젝트 스킬 4개와 pace-playbook-maker를 구별하고, 기존 업무 스킬 안내(시작 때 flow/overview.md)를 가리키는가.
// 전후 증거: 실제 ~/.claude/skills 목록·파일별 해시, 사례 저장소 git status·HEAD(값은 남기지 않고 같음만). 기록은 사례 저장소 이름·경로·계정을 가린다.
// --add-dir 스킬이 로드되지 않으면 그 사실을 기록하고 해당 부분은 미확인이다.
// 사용: node coexist-session.mjs <증거 json>
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,existsSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {scrubText} from './scrub.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');
const outFile=resolve(process.argv[2]);
const PRIV=join(homedir(),'.pace-private');
const priv=readFileSync(join(PRIV,'P001-case.md'),'utf8');
const REPO=/사례 저장소 경로:\s*(.+)/.exec(priv)[1].trim();
const banned=readFileSync(join(PRIV,'P001-banned.txt'),'utf8').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
const git=(...a)=>execFileSync('git',['-C',REPO,...a],{encoding:'utf8'}).trim();
// 스킬 폴더에는 심볼릭 링크·정션이 있다 — 링크를 따라가 본다(읽기만)
const walk=d=>readdirSync(d).flatMap(n=>{const p=join(d,n);let st;try{st=statSync(p);}catch{return [];}return st.isDirectory()?walk(p):[p];});
const snap=d=>existsSync(d)?Object.fromEntries(walk(d).map(p=>[relative(d,p).split(sep).join('/'),createHash('sha256').update(readFileSync(p)).digest('hex')])):{};
const nameOf=f=>{const m=/^---\s*[\s\S]*?\bname:\s*([^\n\r]+)/.exec(readFileSync(f,'utf8'));return m&&m[1].trim().replace(/^["']|["']$/g,'');};

// 사례 저장소 프로젝트 스킬 이름(가림 대상 — 번호로 바꾼다)
const projDir=join(REPO,'.claude','skills');
const proj=readdirSync(projDir).filter(n=>existsSync(join(projDir,n,'SKILL.md'))).map(n=>nameOf(join(projDir,n,'SKILL.md')));
const alias=new Map(proj.map((n,i)=>[n,`<프로젝트 스킬 ${i+1}>`]));
const hide=t=>{let s=scrubText(String(t),[[REPO,'<사례 저장소>']]);for(const [n,a] of alias)s=s.split(n).join(a);for(const b of banned)s=s.replace(new RegExp(b,'gi'),'<가림>');return s;};

// 전: 실제 HOME 스킬·사례 저장소
const realSkills=join(homedir(),'.claude','skills');
const realBefore=snap(realSkills);
const headBefore=git('rev-parse','HEAD'),statusBefore=git('status','--porcelain');

// 임시 HOME에 현재 소스 설치 → 그 HOME을 --add-dir로(그 아래 .claude/skills/pace-playbook-maker)
const tmpHome=mkdtempSync(join(tmpdir(),'pace-t06-coexist-'));
mkdirSync(join(tmpHome,'.claude'),{recursive:true});
const inst=spawnSync(process.execPath,['-e',`import(${JSON.stringify(pathToFileURL(join(ROOT,'src','setup','install.ts')).href)}).then(m=>{m.install({home:${JSON.stringify(tmpHome)},repo:${JSON.stringify(ROOT)}});console.log('installed');})`],{encoding:'utf8',cwd:ROOT});
if(!/installed/.test(inst.stdout))throw new Error('임시 HOME 설치 실패');
// --add-dir에는 설치본 스킬 하나만 든 폴더를 준다(임시 HOME의 다른 PACE 스킬이 섞이지 않게)
const addDir=mkdtempSync(join(tmpdir(),'pace-t06-adddir-'));
mkdirSync(join(addDir,'.claude','skills'),{recursive:true});
execFileSync(process.execPath,['-e',`require('fs').cpSync(${JSON.stringify(join(tmpHome,'.claude','skills','pace-playbook-maker'))},${JSON.stringify(join(addDir,'.claude','skills','pace-playbook-maker'))},{recursive:true})`]);

if(process.env.COEXIST_DRY){console.log('dry ok',proj.length,Object.keys(realBefore).length,existsSync(join(addDir,'.claude','skills','pace-playbook-maker','SKILL.md')));rmSync(tmpHome,{recursive:true,force:true});rmSync(addDir,{recursive:true,force:true});process.exit(0);}   // 준비 단계만 확인(세션 호출 없음)
const prompt='이 세션에서 쓸 수 있는 스킬을 모두 이름으로 나열하고, 각각 이 저장소(작업 폴더)의 프로젝트 스킬인지 그 밖(사용자·추가 폴더)의 스킬인지 구분해 한 줄씩 말하라. 그다음 이 저장소의 업무 스킬로 업무를 시작할 때 맨 처음 읽어야 하는 파일이 무엇인지 각 업무 스킬의 SKILL.md를 Read로 확인해 답하라. 파일을 고치거나 다른 도구를 쓰지 마라.';
const args=['-p','--output-format','stream-json','--verbose','--no-session-persistence','--model','sonnet','--tools','Read','--allowedTools','Read','--permission-mode','dontAsk','--add-dir',addDir];
const lines=[];const t0=Date.now();
await new Promise(ok=>{
  const child=spawn('claude',args,{cwd:REPO,stdio:['pipe','pipe','pipe']});
  child.stdin.end(prompt);let buf='';
  child.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){lines.push(buf.slice(0,i));buf=buf.slice(i+1);}});
  const timer=setTimeout(()=>spawnSync('taskkill',['/PID',String(child.pid),'/T','/F']),10*60*1000);
  child.on('close',()=>{clearTimeout(timer);if(buf.trim())lines.push(buf);ok();});child.on('error',()=>{clearTimeout(timer);ok();});
});
const ms=Date.now()-t0;
const events=lines.map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);
const init=events.find(e=>e.type==='system'&&e.subtype==='init')||{};
const result=[...events].reverse().find(e=>e.type==='result')||{};
const answer=String(result.result||'');
const uses=events.flatMap(e=>e.type==='assistant'?(e.message.content||[]).filter(c=>c.type==='tool_use'):[]);
const initSkills=(init.skills||[]).map(s=>typeof s==='string'?s:s.name);
const loaded={playbookMaker:initSkills.includes('pace-playbook-maker'),projectSkills:proj.filter(n=>initSkills.includes(n)).length};
const said={playbookMaker:answer.includes('pace-playbook-maker'),projectSkills:proj.filter(n=>answer.includes(n)).length,overview:/flow\/overview\.md|overview\.md/.test(answer)};

// 후: 실제 HOME·사례 저장소
const realAfter=snap(realSkills);
const realSame=JSON.stringify(Object.keys(realBefore).sort())===JSON.stringify(Object.keys(realAfter).sort())&&Object.keys(realBefore).every(k=>realBefore[k]===realAfter[k]);
const headSame=git('rev-parse','HEAD')===headBefore,statusAfter=git('status','--porcelain');
rmSync(tmpHome,{recursive:true,force:true});rmSync(addDir,{recursive:true,force:true});

const ev={at:new Date(t0).toISOString(),ms,model:init.model||null,claudeVersion:spawnSync('claude',['--version'],{encoding:'utf8'}).stdout.trim(),calls:1,retries:0,
  tools:init.tools||null,toolUses:uses.map(u=>u.name),nonRead:uses.filter(u=>u.name!=='Read').length,
  initSkillCount:initSkills.length,initSkills:initSkills.map(hide),loaded,said,
  realHomeSkills:{files:Object.keys(realBefore).length,dirs:new Set(Object.keys(realBefore).map(f=>f.split('/')[0])).size,sameListAndHashes:realSame},
  caseRepo:{statusBefore:statusBefore?statusBefore.split('\n').length:0,statusAfter:statusAfter?statusAfter.split('\n').length:0,headSame},
  answer:hide(answer),
  verdict:{
    distinguishes:loaded.playbookMaker&&loaded.projectSkills===proj.length&&said.playbookMaker&&said.projectSkills===proj.length,
    overviewGuidance:said.overview,
    playbookMakerLoaded:loaded.playbookMaker?'로드됨':'로드 안 됨 — 그 부분 미확인',
    readOnly:realSame&&headSame&&!statusBefore&&!statusAfter&&uses.every(u=>u.name==='Read')}};
writeFileSync(outFile,JSON.stringify(ev,null,1)+'\n');
writeFileSync(outFile.replace(/\.json$/,'.stream.jsonl'),hide(lines.join('\n'))+'\n');
console.log(JSON.stringify(ev.verdict),JSON.stringify(loaded),JSON.stringify(said),ms);
