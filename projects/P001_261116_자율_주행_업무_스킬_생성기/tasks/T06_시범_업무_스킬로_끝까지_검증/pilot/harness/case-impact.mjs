// 사례 저장소 무영향 검사(T06 S-6, P-7) — PACE 현재 소스를 **임시 HOME**에 설치한 상태에서:
//  ① 사례 저장소 흐름 9개 생성물 바이트 동일(T01 compare-identity.mjs, 설치본 생성기로) ② 사례 저장소 테스트 4종 건수 ③ 작업 사본 git status 0줄·HEAD 불변
//  ④ 실제 ~/.claude/skills 불변 ⑤ 공존: 기존 항목 파일별 해시 불변·추가는 pace-playbook-maker 하나·스킬 이름 서로 다름
// 사례 저장소 경로·기준 커밋은 저장소 밖 ~/.pace-private/P001-case.md에서 읽는다. 출력은 비식별 — 서비스·스킬 이름은 번호·개수만.
// 사용: node case-impact.mjs <출력 파일> [--skip-tests]
import {spawnSync,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,readdirSync,existsSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');
const out=resolve(process.argv[2]||join(here,'..','..','evidence','case-impact.txt'));
const skipTests=process.argv.includes('--skip-tests');
const lines=[];const say=s=>{lines.push(s);console.log(s);};
const priv=readFileSync(join(homedir(),'.pace-private','P001-case.md'),'utf8');
const REPO=/사례 저장소 경로:\s*(.+)/.exec(priv)[1].trim();
const BASE=/동일성 비교 기준 커밋:\s*(\S+)/.exec(priv)[1].trim();
const git=(...a)=>execFileSync('git',['-C',REPO,...a],{encoding:'utf8'}).trim();
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]);
const snap=d=>existsSync(d)?Object.fromEntries(walk(d).map(p=>[relative(d,p).split(sep).join('/'),createHash('sha256').update(readFileSync(p)).digest('hex')])):{};

// ④ 실제 HOME 기준 상태(설치하지 않는다)
const realSkills=join(homedir(),'.claude','skills');
const realBefore=existsSync(realSkills)?readdirSync(realSkills).sort():[];
const headBefore=git('rev-parse','--short','HEAD'),statusBefore=git('status','--porcelain');
say(`사례 저장소 작업 사본 HEAD 기록(값은 비식별로 남기지 않음), git status ${statusBefore?statusBefore.split('\n').length:0}줄 (검사 전)`);

// 임시 HOME: 실제 홈 스킬을 복사해 둔 뒤 현재 소스를 설치한다
const tmpHome=mkdtempSync(join(tmpdir(),'pace-t06-home-'));
mkdirSync(join(tmpHome,'.claude'),{recursive:true});
if(existsSync(realSkills))cpSync(realSkills,join(tmpHome,'.claude','skills'),{recursive:true});
const before=snap(join(tmpHome,'.claude','skills'));
const beforeNames=new Set(Object.keys(before).map(f=>f.split('/')[0]));
const bundle=JSON.parse(readFileSync(join(ROOT,'skills','pace-canvas-skills','manifest.json'),'utf8')).skills;
const own=new Set([...readdirSync(join(ROOT,'skills')).filter(n=>existsSync(join(ROOT,'skills',n,'SKILL.md'))),...Object.keys(bundle)]);
const inst=spawnSync(process.execPath,['-e',`import(${JSON.stringify(pathToFileURL(join(ROOT,'src','setup','install.ts')).href)}).then(m=>{m.install({home:${JSON.stringify(tmpHome)},repo:${JSON.stringify(ROOT)}});console.log('installed');})`],{encoding:'utf8',cwd:ROOT});
if(!/installed/.test(inst.stdout))throw new Error('임시 HOME 설치 실패: '+(inst.stderr||'').slice(-300));
const after=snap(join(tmpHome,'.claude','skills'));
const afterNames=new Set(Object.keys(after).map(f=>f.split('/')[0]));
const added=[...afterNames].filter(n=>!beforeNames.has(n));
const changedNonPace=Object.keys(before).filter(f=>!own.has(f.split('/')[0])&&after[f]!==before[f]);
const changedPace=[...new Set(Object.keys(before).filter(f=>own.has(f.split('/')[0])&&after[f]!==before[f]).map(f=>f.split('/')[0]))];
say(`임시 HOME 설치: 추가된 스킬 ${added.length}개(${added.join(', ')}) — PACE 스킬 목록 밖 추가 ${added.filter(n=>!own.has(n)).length}개`);
say(`기존 항목(PACE 소유가 아닌 것) 파일별 해시 변경 ${changedNonPace.length}개 (PACE 소유로 새 버전이 덮은 스킬 ${changedPace.length}개)`);
const ok5a=added.length===1&&added[0]==='pace-playbook-maker'&&changedNonPace.length===0;

// ⑤ 이름 5개 구별(사례 저장소 프로젝트 스킬 + 설치 스킬)
const nameOf=f=>{const m=/^---\s*[\s\S]*?\bname:\s*([^\n\r]+)/.exec(readFileSync(f,'utf8'));return m&&m[1].trim().replace(/^["']|["']$/g,'');};
const projSkillsDir=join(REPO,'.claude','skills');
const proj=existsSync(projSkillsDir)?readdirSync(projSkillsDir).filter(n=>existsSync(join(projSkillsDir,n,'SKILL.md'))).map(n=>nameOf(join(projSkillsDir,n,'SKILL.md'))):[];
const inst2=nameOf(join(tmpHome,'.claude','skills','pace-playbook-maker','SKILL.md'));
const names=[...proj,inst2];
say(`사례 저장소 프로젝트 스킬 ${proj.length}개 + 설치 스킬 pace-playbook-maker — 이름 ${new Set(names).size===names.length?'모두 서로 다름':'중복 있음'}(총 ${names.length}개)`);
const ok5b=proj.length===4&&new Set(names).size===names.length&&inst2==='pace-playbook-maker';

// ① 생성물 바이트 동일 — 설치본 생성기로
const installedBuild=join(tmpHome,'.pace','app','skills','pace-playbook-maker','tools','build.mjs');
const idr=spawnSync(process.execPath,[join(ROOT,'projects',readdirSync(join(ROOT,'projects')).find(n=>n.startsWith('P001')),'tasks',readdirSync(join(ROOT,'projects',readdirSync(join(ROOT,'projects')).find(n=>n.startsWith('P001')),'tasks')).find(n=>n.startsWith('T01')),'evidence','compare-identity.mjs'),REPO,BASE,installedBuild],{encoding:'utf8',cwd:tmpdir(),maxBuffer:1<<26});
say('--- 흐름 생성물 동일성(설치본 생성기) ---');
say((idr.stdout||'').trim());
const ok1=idr.status===0&&/불일치 흐름 0/.test(idr.stdout);

// ② 사례 저장소 테스트 4종(번호로만 표기)
// 테스트 폴더 이름은 사례 저장소 서비스 이름이라 비공개 파일에서 읽는다(순서: flow·서비스 A·B·C). baseline 건수는 T01 evidence/case-baseline.txt와 같다
const testDirs=/사례 저장소 테스트 4종:\s*(.+?)\s*에서/.exec(priv)[1].split('·').map(x=>x.trim());
const pkgs=[['flow',testDirs[0],47],['service-a',testDirs[1],35],['service-b',testDirs[2],619],['service-c',testDirs[3],119]];
let ok2=true;
if(!skipTests){
  say('--- 사례 저장소 테스트 ---');
  for(const [label,dir,want] of pkgs){
    const r=spawnSync('npm',['test'],{cwd:join(REPO,dir),encoding:'utf8',shell:true,maxBuffer:1<<28});
    const pass=Number(/(?:^|\n)\s*(?:ℹ|#)\s*pass\s+(\d+)/.exec(r.stdout||'')?.[1]),fail=Number(/(?:^|\n)\s*(?:ℹ|#)\s*fail\s+(\d+)/.exec(r.stdout||'')?.[1]);
    const good=r.status===0&&pass===want&&fail===0;if(!good)ok2=false;
    say(`${good?'OK  ':'FAIL'} ${label} tests pass ${pass} fail ${fail} (baseline ${want})`);
  }
}else say('(테스트 4종은 이번 실행에서 건너뜀)');

// ③ 작업 사본 불변, ④ 실제 HOME 불변
const headAfter=git('rev-parse','--short','HEAD'),statusAfter=git('status','--porcelain');
const realAfter=existsSync(realSkills)?readdirSync(realSkills).sort():[];
const ok3=headAfter===headBefore&&statusAfter==='';
const ok4=JSON.stringify(realAfter)===JSON.stringify(realBefore);
say(`사례 저장소 작업 사본 HEAD ${ok3?'불변':'변경됨'}, git status ${statusAfter?statusAfter.split('\n').length:0}줄 (검사 후)`);
say(`실제 ~/.claude/skills 목록 ${ok4?'불변':'변경됨'}(${realAfter.length}개)`);
const all=ok1&&(skipTests||ok2)&&ok3&&ok4&&ok5a&&ok5b;
say(`판정: 흐름 동일 ${ok1?'OK':'FAIL'} · 테스트 ${skipTests?'건너뜀':ok2?'OK':'FAIL'} · 작업 사본 불변 ${ok3?'OK':'FAIL'} · 실제 HOME 불변 ${ok4?'OK':'FAIL'} · 공존(해시·추가·이름) ${ok5a&&ok5b?'OK':'FAIL'} → ${all?'통과':'실패'}`);
writeFileSync(out,lines.join('\n')+'\n');
rmSync(tmpHome,{recursive:true,force:true});
process.exit(all?0:1);
