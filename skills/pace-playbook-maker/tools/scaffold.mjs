// 흐름 뼈대와 API 단계 기록 — 서비스 비의존. 인터뷰 합의에서 steps.json의 합의 필드를 채우고,
// API 단계는 관찰한 응답에서 경로·형태 이름만 추려 쓴다(값은 버린다).
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {checkInterview} from './interview.mjs';
import {scanSensitive} from './sensitive.mjs';

const FLOW_NAME=/^[a-z0-9][a-z0-9-]{0,63}$/;
const today=()=>new Date().toISOString().slice(0,10);

// 인터뷰 합의로 흐름 steps.json 뼈대를 만든다. 불완전하면 거부한다(파일을 만들지 않는다).
export function initFlow({workDir,flow,interview,allowedPaths,now=today()}){
  const chk=checkInterview(interview);
  if(!chk.complete)throw new Error('인터뷰 기록이 완전하지 않다 — 빠진 항목: '+(chk.missing.join(', ')||'없음')+(chk.problems.length?` · 문제 ${chk.problems.length}건`:''));
  if(!FLOW_NAME.test(String(flow)))throw new Error('흐름 이름은 소문자·숫자·하이픈이다');
  const dir=join(workDir,'flows',flow);
  const file=join(dir,'steps.json');
  if(existsSync(file))throw new Error('이미 흐름이 있다');
  const risks={};
  (interview.riskyActions||[]).forEach((a,i)=>{risks['r'+(i+1)]={label:a.name,color:'#b45309'};});
  const d={
    title:interview.goal,updated:now,base:`references/flows/${flow}`,purpose:interview.goal,agentView:true,
    ...(Object.keys(risks).length?{risks}:{}),
    rules:(interview.riskyActions||[]).map(a=>`${a.name}: ${a.gate||'사용자 확인'}`),
    resultTo:interview.outputs&&interview.outputs.length?interview.resultTo:undefined,
    allowedOrigins:[...new Set(interview.services.map(v=>v.origin))],
    ...(allowedPaths?{allowedPaths}:{}),
    steps:[]
  };
  scanSensitive(d);
  mkdirSync(dir,{recursive:true});
  writeFileSync(file,JSON.stringify(d,null,1)+'\n');
  return {dir,file};
}

// 관찰한 응답 값에서 경로·형태 이름만 추린다. 값은 어디에도 남기지 않는다.
const TYPE=v=>typeof v==='number'?'숫자':typeof v==='boolean'?'여부':'문자열';
export function inferResponseShape(obj,{limit=200}={}){
  const out=new Map();
  const safeKey=k=>{try{scanSensitive({[k]:1});return /^[A-Za-z_][\w-]{0,63}$/.test(k)?k:'*';}catch{return '*';}};
  const walk=(v,path,depth)=>{
    if(out.size>=limit||depth>8)return;
    if(Array.isArray(v)){for(const x of v)walk(x,path+'[]',depth+1);if(!v.length)out.set(path+'[]','목록');return;}
    if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v))walk(x,path?`${path}.${safeKey(k)}`:safeKey(k),depth+1);return;}
    if(path&&!out.has(path))out.set(path,TYPE(v));
  };
  walk(obj,'',0);
  return [...out.entries()].map(([path,type])=>({path,type}));
}

// API 단계를 steps.json에 더한다. observedResponse에서 api.response를 만들고 값은 버린다.
export function addApiStep({flowDir,step,observedResponse}){
  const file=join(flowDir,'steps.json');
  const d=JSON.parse(readFileSync(file,'utf8'));
  if(!step||typeof step.id!=='string'||d.steps.some(x=>x.id===step.id))throw new Error('단계 id가 없거나 중복이다');
  if(!step.api||!step.api.method||!step.api.endpoint)throw new Error('api.method·endpoint가 필요하다');
  const response=inferResponseShape(observedResponse);
  if(!response.length&&step.api.successStatus===undefined)throw new Error('관찰한 응답이 비어 있고 successStatus도 없다');
  const paths=new Set(response.map(r=>r.path));
  for(const x of step.extract||[])if(x.where&&x.where.apiPath!==undefined&&!paths.has(x.where.apiPath))throw new Error('extract.where.apiPath가 관찰한 응답 경로에 없다');
  const next={...step,capture:false,api:{...step.api,response}};
  scanSensitive({steps:[next]});
  d.steps.push(next);
  writeFileSync(file,JSON.stringify(d,null,1)+'\n');
  return {id:next.id,paths:response.length};
}
