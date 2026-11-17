// 시범 플레이북 작성 확인(T06 S-1, T-1) — 저장소 안 시범 플레이북과 작업 폴더(저장소 밖)의 인터뷰를 검사해 결과를 쓴다.
// 인터뷰 완전성·실값 0, 승인 캡처가 사람 확인 해시와 같음, checkPlaybook·checkAgentFresh, 플레이북에 입력별 값(만들 때·주행 입력 저장소 이름) 0.
// 사용: node build-check.mjs <출력 파일> [--work <작업 폴더>]
import {readFileSync,readdirSync,statSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');
const imp=f=>import(pathToFileURL(join(ROOT,'skills','pace-playbook-maker','tools',f)).href);
const {checkInterview}=await imp('interview.mjs');
const {checkPlaybook}=await imp('playbook.mjs');
const {checkAgentFresh}=await imp('build.mjs');
const {scanSensitive}=await imp('sensitive.mjs');
const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:undefined;};
const WORK=arg('--work')||process.env.PILOT_WORK||join(tmpdir(),'pace-t06-pilot-work');
const PB=resolve(here,'..','github-repo-latest'),FLOW=join(PB,'references','flows','repo-latest');
const APPROVED='9fd8d5cd92b5';   // 사람(캡틴)이 대기 이미지를 확인한 해시 앞 12자(결정 메모 2026-11-17 07:15)
const lines=[];const say=s=>{lines.push(s);console.log(s);};let ok=true;
const walk=d=>readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?walk(p):[p];});
// 인터뷰
const iv=JSON.parse(readFileSync(join(WORK,'interview.json'),'utf8'));
const ci=checkInterview(iv);let ivClean=true;try{scanSensitive(iv);}catch{ivClean=false;}
say(`인터뷰(저장소 밖 작업 폴더): 완전=${ci.complete} 빠진 항목 ${ci.missing.length}·문제 ${ci.problems.length} · 민감 형식 실값 ${ivClean?0:'있음'}`);
if(!ci.complete||!ivClean)ok=false;
// 승인 캡처
const d=JSON.parse(readFileSync(join(FLOW,'steps.json'),'utf8'));
const cap=d.steps.filter(s=>s.captureRecord).map(s=>({id:s.id,sha:s.shotHash.slice(0,12),human:s.shotHash.startsWith(APPROVED)}));
say(`승인 캡처: ${cap.map(c=>`${c.id} ${c.sha}(사람 확인 해시와 같음 ${c.human})`).join(', ')} · agentView=${d.agentView}`);
if(!cap.length||cap.some(c=>!c.human))ok=false;
// 생성물 검사
const cp=checkPlaybook(PB,{name:'github-repo-latest'}),fr=checkAgentFresh(FLOW);
say(`checkPlaybook ${cp.ok?'통과':'실패 '+cp.problems.join(' | ')} · checkAgentFresh ${fr.ok?'통과':'실패 '+(fr.problems||[]).join(' | ')}`);
if(!cp.ok||!fr.ok)ok=false;
// 입력별 값: 만들 때 입력과 주행 입력 저장소 이름이 플레이북 파일(이미지 제외)에 없어야 한다 — 자리표시(<owner/repo>)만
const inputs=['ceo4ever/pace','anthropics/claude-code','microsoft/vscode','nodejs/node'];
const files=walk(PB).filter(f=>!/\.jpe?g$/i.test(f));
const hits=[];for(const f of files){const t=readFileSync(f,'utf8');for(const x of inputs)if(t.includes(x))hits.push(`${relative(PB,f).replace(/\\/g,'/')}: ${x}`);}
const placeholder=files.some(f=>readFileSync(f,'utf8').includes('<owner/repo>'));
say(`플레이북 파일 ${files.length}개 — 입력별 값(저장소 이름 ${inputs.length}개) ${hits.length}건${hits.length?' ('+hits.join(', ')+')':''} · 자리표시 <owner/repo> 사용 ${placeholder}`);
if(hits.length||!placeholder)ok=false;
say(`판정: ${ok?'통과':'실패'}`);
writeFileSync(resolve(process.argv[2]),lines.join('\n')+'\n');
process.exit(ok?0:1);
