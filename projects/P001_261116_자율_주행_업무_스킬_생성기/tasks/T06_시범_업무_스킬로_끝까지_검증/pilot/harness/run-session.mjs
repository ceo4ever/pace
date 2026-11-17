// 측정 세션 한 번(T06) — 헤드리스 `claude -p` 세션을 격리 폴더에서 돌리고 stream-json을 모아 지표·정답 대조를 낸다.
// 사용: node run-session.mjs --mode playbook|nomap --repo owner/name --out <증거 폴더> --label <이름> [--playbook <플레이북 폴더>] [--driving <driving.md>]
// 두 군(playbook·nomap)은 프롬프트 틀·모델·허용 도구·시간 제한이 같고 플레이북 군만 플레이북 안내 한 문단이 더 있다.
// 원본 기록은 scrub.mjs로 사용자 경로·토큰을 가려 저장한다. 세션이 연 Orca 탭은 끝난 뒤 닫는다.
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,cpSync,writeFileSync,readFileSync,readdirSync,existsSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchTruth} from './truth.mjs';
import {judge,TIME_LIMIT_MS} from './score.mjs';
import {scrubText,scrubStreamLines} from './scrub.mjs';
import {analyze} from './analyze.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:undefined;};
const mode=arg('--mode'),repo=arg('--repo'),out=arg('--out'),label=arg('--label');
const playbook=arg('--playbook')&&resolve(arg('--playbook')),driving=arg('--driving')&&resolve(arg('--driving'));
if(!['playbook','nomap'].includes(mode)||!/^[\w.-]+\/[\w.-]+$/.test(String(repo))||!out||!label){console.error('사용: --mode playbook|nomap --repo owner/name --out <폴더> --label <이름> [--playbook <폴더>] [--driving <driving.md>]');process.exit(2);}
const MODEL=process.env.PILOT_MODEL||'sonnet';
const SKILL='github-repo-latest';

const PROFILE=process.env.PILOT_PROFILE||(()=>{const r=spawnSync('orca',['tab','profile','list','--json'],{encoding:'utf8',timeout:30000});try{const p=JSON.parse(r.stdout).result.profiles.find(x=>x.label==='pace-t06-guest');return p&&p.id;}catch{return null;}})();
if(!PROFILE)throw new Error('게스트 프로필(pace-t06-guest)이 없다 — orca tab profile create --label pace-t06-guest --scope isolated');
const promptCommon=r=>`공개 GitHub 저장소 ${r}의 첫 화면에서 기본 브랜치, 별(Star) 개수, 최신 커밋의 해시 앞 7자·제목·날짜(UTC, YYYY-MM-DD)를 읽어 표로 알려라. 읽기만 한다(로그인·쓰기·별 누르기 금지). 브라우저는 Bash로 orca CLI(Orca 내장 브라우저)를 쓴다 — 탭은 반드시 'orca tab create --profile ${PROFILE} --url …'로 연다(로그인 없는 격리 프로필이다. 다른 프로필·기존 탭은 쓰지 마라). 자기 탭을 새로 열고 끝나면 닫는다. Bash는 orca로 시작하는 단일 명령만 쓸 수 있다(변수 지정·cd·파이프·세미콜론 없이 — 그 밖의 명령은 거부된다). 파일은 Read 도구로 읽는다. GitHub API로 직접 조회하지 말고 화면에서 읽어라. 답의 마지막 줄은 정확히 한 줄로 RESULT {"branch":"…","stars":"…","sha7":"…","title":"…","date":"YYYY-MM-DD"} 형식이다.`;
const promptPlaybook=`이 업무의 플레이북이 ./.claude/skills/${SKILL}/ 에 있다. 그 SKILL.md와 지도(references/flows/ 아래 agent/ 폴더)를 읽고 그 지시대로 수행하라.`;

const work=mkdtempSync(join(tmpdir(),'pace-t06-sess-'));
if(mode==='playbook'){
  if(!playbook||!existsSync(playbook))throw new Error('--playbook 폴더가 필요하다');
  cpSync(playbook,join(work,'.claude','skills',SKILL),{recursive:true});
  if(driving){mkdirSync(join(work,'.claude','skills','pace-playbook-maker','references'),{recursive:true});cpSync(driving,join(work,'.claude','skills','pace-playbook-maker','references','driving.md'));}   // 플레이북이 링크하는 규약(설치된 스킬 위치와 같은 배치)
}
const prompt=promptCommon(repo)+(mode==='playbook'?'\n\n'+promptPlaybook:'');

const orcaTabs=()=>{const r=spawnSync('orca',['tab','list','--json'],{encoding:'utf8',timeout:30000});try{const j=JSON.parse(r.stdout);return new Set((j.result.tabs||j.result||[]).map(t=>t.browserPageId||t.id).filter(Boolean));}catch{return new Set();}};
const tabsBefore=orcaTabs();
const truthStart=await fetchTruth(repo);
const args=['-p','--output-format','stream-json','--verbose','--no-session-persistence','--model',MODEL,'--tools','Bash,Read','--allowedTools','Bash(orca *)','Read','--permission-mode','dontAsk','--setting-sources','project','--disable-slash-commands','--strict-mcp-config'];
const t0=Date.now();
let timedOut=false;
const lines=[];
await new Promise(resolveP=>{
  const child=spawn('claude',args,{cwd:work,stdio:['pipe','pipe','pipe']});
  child.stdin.end(prompt);
  let buf='';
  child.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){lines.push(buf.slice(0,i));buf=buf.slice(i+1);}});
  child.stderr.on('data',()=>{});
  const timer=setTimeout(()=>{timedOut=true;spawnSync('taskkill',['/PID',String(child.pid),'/T','/F']);},TIME_LIMIT_MS);
  child.on('close',()=>{clearTimeout(timer);if(buf.trim())lines.push(buf);resolveP();});
  child.on('error',()=>{clearTimeout(timer);resolveP();});
});
const ms=Date.now()-t0;
const truthEnd=await fetchTruth(repo);

// 열린 탭 정리(세션이 닫지 않은 것)
for(const id of orcaTabs())if(!tabsBefore.has(id))spawnSync('orca',['tab','close','--page',id,'--json'],{timeout:30000});

// 기록 해석(analyze.mjs — 합성 이벤트로 시험한다)
const events=lines.map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);
const walkRel=(d,base=d)=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walkRel(join(d,e.name),base):[relative(base,join(d,e.name)).replace(/\\/g,'/')]);
const skillDir=join(work,'.claude','skills',SKILL);
const mapFiles=mode==='playbook'?walkRel(skillDir).filter(f=>!/\.(jpg|html)$/i.test(f)):[];   // 이미지·사람용 html은 지도 분량에서 뺀다(에이전트용 json·md만)
const A=analyze({events,work,skill:SKILL,profile:PROFILE,mapFiles});
const mapBytes=A.mapReadPaths.reduce((s,rel)=>{try{return s+statSync(join(skillDir,rel)).size;}catch{return s;}},0);
const parsed=A.output;
const j=parsed?judge(parsed,truthStart,truthEnd):{ok:false,fields:{},whole:false,mixed:false,missing:['branch','stars','sha7','title','date']};
const sample={label,mode,repo,model:MODEL,claudeVersion:spawnSync('claude',['--version'],{encoding:'utf8'}).stdout.trim(),
  startedAt:new Date(t0).toISOString(),ms,timedOut,profileViolation:A.profileViolation,permissionDenials:A.permissionDenials,bashNonOrca:A.bashNonOrca,bashNonOrcaWords:A.bashNonOrcaWords,ok:j.ok&&!timedOut&&!A.profileViolation,toolCalls:A.toolCalls,perTool:A.perTool,orcaCalls:A.orcaCalls,tabCreates:A.tabCreates,screenExplorations:A.screenExplorations,mapBytes,mapRead:A.mapRead,mapReadFiles:A.mapReadPaths.length,
  output:parsed,judge:j,truthStart,truthEnd,numTurns:A.numTurns,isError:A.isError,init:A.init};
mkdirSync(resolve(out),{recursive:true});
writeFileSync(join(resolve(out),label+'.json'),scrubText(JSON.stringify(sample,null,1),[[work,'<WORK>']])+'\n');
writeFileSync(join(resolve(out),label+'.stream.jsonl'),scrubText(scrubStreamLines(lines).lines.join('\n'),[[work,'<WORK>']])+'\n');   // orca tab list 결과(사용자의 다른 탭)는 가린다
writeFileSync(join(resolve(out),label+'.prompt.txt'),prompt+'\n');
rmSync(work,{recursive:true,force:true});
console.log(JSON.stringify({label,mode,repo,ok:sample.ok,ms,toolCalls:sample.toolCalls,screenExplorations:A.screenExplorations,mapRead:A.mapRead,mapBytes,timedOut,profileViolation:A.profileViolation,fields:j.fields}));
