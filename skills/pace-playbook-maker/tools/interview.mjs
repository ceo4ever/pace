// 인터뷰 기록(interview.json) 검사 — 서비스 비의존. 기록에는 값이 아니라 종류·형태·출처 이름만 적는다.
// 사용: node <스킬>/tools/interview.mjs --check <interview.json>   (불완전·민감 형식이면 종료코드 1, 빠진 항목 이름만 출력)
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scanSensitive} from './sensitive.mjs';
import {formatOk} from './agent-map.mjs';
import {createStore} from './orca-adapter.mjs';

const IDENT=/^[A-Za-z][\w-]{0,63}$/;
const SENS=['public','masked','restricted'];
const AUTH=['user-login','env-token','secret-store','none'];
const REASONS=['auth','ambiguous','external','tool-missing'];
const s=v=>typeof v==='string'&&v.trim().length>0;
const arr=v=>Array.isArray(v);

// 필수 항목 이름(보고용)
export const REQUIRED=['goal','scope','success','riskyActions','services','outputs','privacy'];

// 반환: {complete, missing:[항목 이름], problems:[문제 설명(값 없음)]}
export function checkInterview(rec){
  const missing=new Set(),problems=[];
  if(!rec||typeof rec!=='object'||arr(rec))return {complete:false,missing:[...REQUIRED],problems:['기록이 객체가 아니다']};
  try{scanSensitive(rec);}catch(e){problems.push(e.message);}
  if(!s(rec.goal))missing.add('goal');
  if(!s(rec.scope))missing.add('scope');
  if(!arr(rec.success)||!rec.success.length||rec.success.some(x=>!s(x)))missing.add('success');
  // 위험 행동: 비면 noRiskyActions:true를 명시해야 한다
  if(!arr(rec.riskyActions)||(rec.riskyActions.length===0&&rec.noRiskyActions!==true))missing.add('riskyActions');
  else rec.riskyActions.forEach((a,i)=>{
    if(!a||!s(a.name)||typeof a.irreversible!=='boolean')problems.push(`riskyActions[${i}]: name·irreversible이 필요하다`);
    else if(a.irreversible&&!s(a.gate))problems.push(`riskyActions[${i}]: 되돌릴 수 없는 행동은 gate(승인 규칙)가 필요하다`);
  });
  if(!arr(rec.services)||!rec.services.length)missing.add('services');
  else rec.services.forEach((v,i)=>{
    const p=`services[${i}]`;
    if(!v||!(typeof v.alias==='string'&&IDENT.test(v.alias))||!['web','api'].includes(v.kind)||!/^https?:\/\/[^/\s?#]+$/.test(String(v.origin)))problems.push(`${p}: alias·kind(web|api)·origin(스킴://호스트)이 필요하다`);
    const a=v&&v.auth;
    if(!a||!AUTH.includes(a.method))problems.push(`${p}.auth.method가 필요하다(${AUTH.join('|')})`);
    else if(a.method!=='none'&&!(typeof a.source==='string'&&IDENT.test(a.source)))problems.push(`${p}.auth.source는 환경 변수·시크릿 저장소의 이름이어야 한다`);
  });
  // 결과물: 비면 noOutputs:true를 명시해야 한다
  if(!arr(rec.outputs)||(rec.outputs.length===0&&rec.noOutputs!==true))missing.add('outputs');
  else{
    rec.outputs.forEach((o,i)=>{
      const p=`outputs[${i}]`;
      if(!o||!s(o.name)||!formatOk(o.format)||!SENS.includes(o.sensitivity))problems.push(`${p}: name·format(형태 문법)·sensitivity가 필요하다`);
      else if(o.sensitivity!=='public'&&!(typeof o.deliverTo==='string'&&IDENT.test(o.deliverTo)))problems.push(`${p}: masked·restricted는 deliverTo(저장 위치 이름)가 필요하다`);
      else if(o.deliverTo!==undefined&&!(typeof o.deliverTo==='string'&&IDENT.test(o.deliverTo)))problems.push(`${p}.deliverTo 식별자 형식 오류`);
    });
    if(rec.outputs.length&&!(typeof rec.resultTo==='string'&&IDENT.test(rec.resultTo)))problems.push('resultTo(결과 저장 위치 이름)가 필요하다');
  }
  const pv=rec.privacy;
  if(!pv||typeof pv!=='object'||!arr(pv.kinds)||pv.kinds.some(x=>!s(x))||!s(pv.handling))missing.add('privacy');
  if(rec.inputs!==undefined){
    if(!arr(rec.inputs))problems.push('inputs는 배열이다');
    else rec.inputs.forEach((x,i)=>{if(!x||!s(x.name)||!formatOk(x.form)||!s(x.source))problems.push(`inputs[${i}]: name·form(형태 문법)·source가 필요하다`);});
  }
  if(rec.exceptions!==undefined&&(!arr(rec.exceptions)||rec.exceptions.some(x=>!s(x))))problems.push('exceptions는 문자열 배열이다');
  if(rec.frequency!==undefined&&!s(rec.frequency))problems.push('frequency가 비어 있다');
  if(rec.humanPoints!==undefined){
    if(!arr(rec.humanPoints))problems.push('humanPoints는 배열이다');
    else rec.humanPoints.forEach((h,i)=>{if(!h||!s(h.step)||!REASONS.includes(h.reason))problems.push(`humanPoints[${i}]: step·reason(${REASONS.join('|')})이 필요하다`);});
  }
  const miss=[...missing];
  return {complete:miss.length===0&&problems.length===0,missing:miss,problems};
}

// 인터뷰 기록의 최초 저장 진입점 — 메모리에서 구성한 기록을 **쓰기 전에** 민감 형식 검사하고 통과해야만 저장한다.
// 불완전한 기록(필수 항목이 비어 있음)은 저장할 수 있다(인터뷰 도중 저장) — 완전성은 checkInterview/--check로 따로 본다. 민감 형식이면 던지고 파일을 만들지 않는다.
export function saveInterview({workDir,interview,store=createStore(workDir)}){
  store.writeJson('interview.json',interview);
  return {file:store.path('interview.json'),check:checkInterview(interview)};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const i=process.argv.indexOf('--check');
  if(i<0||!process.argv[i+1]){console.error('사용: node interview.mjs --check <interview.json>');process.exit(2);}
  let rec;
  try{rec=JSON.parse(readFileSync(process.argv[i+1],'utf8'));}catch{console.error('interview.json을 읽을 수 없다');process.exit(2);}
  const r=checkInterview(rec);
  if(r.complete){console.log('인터뷰 기록 완전');process.exit(0);}
  if(r.missing.length)console.error('빠진 항목: '+r.missing.join(', '));
  for(const p of r.problems)console.error('- '+p);
  process.exit(1);
}
