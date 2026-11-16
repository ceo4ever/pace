// 플레이북(업무 스킬 한 벌) 생성·검사 — 서비스 비의존.
// 입력: 작업 폴더의 interview.json + flows/<흐름>/(steps.json·shots/, agentView:true, 승인 완료).
// 산출: <outDir>/SKILL.md · references/flows/<흐름>/ · references/history.md [· references/agreements.md]
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve,sep} from 'node:path';
import {checkInterview} from './interview.mjs';
import {buildFlow,checkAgentFresh} from './build.mjs';
import {scanSensitive} from './sensitive.mjs';

// 주행 규약 버전 — 플레이북 SKILL.md에 표기한다. 규약 본문은 pace-playbook-maker의 references/driving.md 한 곳에 있다.
export const DRIVING_VERSION=1;
const NAME=/^[a-z0-9][a-z0-9-]{0,63}$/;
const SKILL_LIMIT=8192;
const SKIP=new Set(['interview.json']);

const crlfSize=buf=>{const lf=buf.filter(b=>b===10).length,cr=buf.filter(b=>b===13).length;return buf.length+(lf-cr);};
const oneLine=s=>String(s).replace(/\s+/g,' ').trim();
const list=a=>(a&&a.length?a:[]).map(x=>`- ${x}`).join('\n')||'- (없음)';

// 인터뷰 합의를 그대로 옮긴 본문 절들(값 없음 — 인터뷰 검사를 통과한 문장)
function sections(iv){
  const svc=iv.services.map(v=>`- ${v.alias}(${v.kind}) ${v.origin} — 인증: ${v.auth.method}${v.auth.source?`(${v.auth.source})`:''}`).join('\n');
  const inputs=(iv.inputs||[]).map(x=>`- ${x.name}(${x.form}) ← ${x.source}`).join('\n')||'- (없음)';
  const outputs=iv.outputs&&iv.outputs.length?iv.outputs.map(o=>`- ${o.name}(${o.format}, ${o.sensitivity}) → ${o.deliverTo||iv.resultTo}`).join('\n'):'- (없음 — 결과 값을 읽지 않는다)';
  const risky=iv.riskyActions&&iv.riskyActions.length?iv.riskyActions.map(a=>`- ${a.name} — ${a.irreversible?'되돌릴 수 없음':'되돌릴 수 있음'}${a.gate?` · 관문: ${a.gate}`:''}`).join('\n'):'- (밖으로 나가는 위험 행동 없음)';
  const human=(iv.humanPoints||[]).map(h=>`- ${h.step}: ${h.reason}`).join('\n')||'- (없음)';
  return {
    scope:iv.scope,start:svc,inputs,outputs,success:list(iv.success),safety:risky,
    privacy:`종류: ${iv.privacy.kinds.join(', ')||'없음'}\n처리: ${iv.privacy.handling}`,
    exceptions:`${list(iv.exceptions)}\n빈도: ${iv.frequency||'(미정)'}`,human
  };
}

function skillText({name,iv,flows,full}){
  const S=sections(iv);
  const desc=oneLine(`${iv.goal} — ${iv.scope}`).slice(0,300)+' 이 업무를 자율 주행으로 수행할 때 쓴다.';
  const head=`---\nname: ${name}\ndescription: ${desc}\n---\n\n# ${oneLine(iv.goal)} (${name})\n\n이 스킬은 \`pace-playbook-maker\`가 만든 플레이북(업무 스킬)이다. 지도(\`references/flows/*/agent/\`)를 읽고 주행한다.\n\n`;
  const core=`## 범위\n${S.scope}\n\n## 성공 기준\n${S.success}\n\n## 안전 규칙\n${S.safety}\n- 읽기는 자율이다. 밖으로 나가는 행동은 지도에 승인 규칙이 있을 때만 자율이고 없으면 사용자에게 확인한다.\n- 지도와 화면이 다르면 멈추고 보고한다.\n\n`;
  const detail=`## 시작 조건(서비스·인증)\n${S.start}\n\n## 입력\n${S.inputs}\n\n## 결과와 저장 위치\n${S.outputs}\n\n## 개인정보 처리\n${S.privacy}\n\n## 예외와 빈도\n${S.exceptions}\n\n## 사람과 함께하는 지점\n${S.human}\n\n`;
  const idx=`## 흐름 색인\n| 흐름 | 지도 | 사람용 |\n|---|---|---|\n${flows.map(f=>`| ${f} | [index.json](references/flows/${f}/agent/index.json) | [flow.html](references/flows/${f}/flow.html) |`).join('\n')}\n\n`;
  const tail=`## 주행 규약\n\`pace-playbook-maker\` 스킬의 \`references/driving.md\`(규약 버전 ${DRIVING_VERSION})를 따른다. 규약은 이 스킬에 복사하지 않는다.\n\n## 학습 이력\n[references/history.md](references/history.md)\n`;
  if(full)return head+core+detail+idx+tail;
  return head+core+`## 그 밖의 합의\n서비스·인증, 입력, 결과 저장 위치, 개인정보 처리, 예외·빈도, 사람과 함께하는 지점은 [references/agreements.md](references/agreements.md)에 있다.\n\n`+idx+tail;
}

// 인터뷰 합의와 흐름(steps.json)이 어긋나면 문제 목록을 돌려준다(값 없음).
// 결과 위치·추출 선언의 이름·민감도·전달 위치·접근 origin·위험 등급과 승인 관문이 인터뷰와 이어져야 한다.
export function checkAgreement(iv,d,flow='flow'){
  const probs=[];
  const outputs=iv.outputs||[],byName=new Map(outputs.map(o=>[o.name,o]));
  const origins=new Set((iv.services||[]).map(v=>v.origin));
  if(outputs.length&&d.resultTo!==iv.resultTo)probs.push(`${flow}: resultTo가 인터뷰와 다르다`);
  for(const o of d.allowedOrigins||[])if(!origins.has(o))probs.push(`${flow}: allowedOrigins에 인터뷰 서비스에 없는 origin이 있다`);
  const actions=new Map((iv.riskyActions||[]).map(a=>[a.name,a]));
  for(const [id,r] of Object.entries(d.risks||{}))if(!actions.has(r&&r.label))probs.push(`${flow}: 위험 등급 ${id}의 이름이 인터뷰 riskyActions에 없다`);
  for(const s of d.steps||[]){
    for(const x of s.extract||[]){
      const o=byName.get(x.name);
      if(!outputs.length)probs.push(`${flow} ${s.id}: 인터뷰가 결과물 없음(noOutputs)인데 추출 선언이 있다`);
      else if(!o)probs.push(`${flow} ${s.id}: 추출 '${x.name}'이 인터뷰 outputs에 없다`);
      else{
        if(x.format!==o.format)probs.push(`${flow} ${s.id}: 추출 '${x.name}'의 형식이 인터뷰와 다르다`);
        if(x.sensitivity!==o.sensitivity)probs.push(`${flow} ${s.id}: 추출 '${x.name}'의 민감도가 인터뷰와 다르다`);
        if((x.deliverTo??d.resultTo)!==(o.deliverTo??iv.resultTo))probs.push(`${flow} ${s.id}: 추출 '${x.name}'의 전달 위치가 인터뷰와 다르다`);
      }
    }
    if(s.risk&&s.risk!=='read'){
      const label=d.risks&&d.risks[s.risk]&&d.risks[s.risk].label,a=actions.get(label);
      if(!a)probs.push(`${flow} ${s.id}: 위험 등급이 인터뷰 riskyActions와 이어지지 않는다`);
      else if((a.irreversible||a.gate!==undefined)&&s.gate!==a.gate)probs.push(`${flow} ${s.id}: 행동의 관문이 인터뷰와 다르다`);
    }
  }
  return probs;
}

// 여러 흐름을 합쳐 인터뷰에서 합의한 결과물이 모두 추출 선언으로 있는지 본다(빠진 결과물 이름 목록).
export function checkCoverage(iv,ds){
  const have=new Set(ds.flatMap(d=>(d.steps||[]).flatMap(s=>(s.extract||[]).map(x=>x.name))));
  return (iv.outputs||[]).filter(o=>!have.has(o.name)).map(o=>`합의한 결과물 '${o.name}'을 읽는 추출 선언이 어느 흐름에도 없다`);
}

// 플레이북 폴더를 검사한다. 반환 {ok, problems[]}. name을 주면 frontmatter name과 대조(임시 폴더에서 만들 때).
export function checkPlaybook(dir,{name}={}){
  const problems=[];
  const root=resolve(dir);
  const skillPath=join(root,'SKILL.md');
  if(!existsSync(skillPath))return {ok:false,problems:['SKILL.md가 없다']};
  const raw=readFileSync(skillPath);
  const text=raw.toString('utf8');
  const fm=/^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if(!fm)problems.push('frontmatter가 없다');
  else{
    const n=/^name: (.+)$/m.exec(fm[1]),dsc=/^description: (.+)$/m.exec(fm[1]);
    const want=name??basename(root);
    if(!n||n[1].trim()!==want)problems.push('frontmatter name이 폴더 이름과 다르다');
    if(!n||!NAME.test(n[1].trim()))problems.push('name 형식 오류');
    if(!dsc||dsc[1].trim().length<20||dsc[1].trim().length>1024)problems.push('description은 한 줄 20~1024자여야 한다');
  }
  if(crlfSize(raw)>SKILL_LIMIT)problems.push(`SKILL.md가 ${SKILL_LIMIT}바이트(CRLF 기준)를 넘는다`);
  const docs=[skillPath,...(existsSync(join(root,'references','agreements.md'))?[join(root,'references','agreements.md')]:[])];
  for(const f of docs)for(const [,href] of readFileSync(f,'utf8').matchAll(/\]\(([^)#]+)\)/g)){
    if(/^[a-z]+:/i.test(href))continue;
    if(!existsSync(resolve(dirname(f),href)))problems.push(`링크 대상이 없다: ${href}`);
  }
  const flowsDir=join(root,'references','flows');
  const flows=existsSync(flowsDir)?readdirSync(flowsDir):[];
  if(!flows.length)problems.push('흐름이 없다');
  for(const fl of flows){
    try{const r=checkAgentFresh(join(flowsDir,fl));if(!r.applicable)problems.push(`${fl}: agentView 흐름이 아니다`);else if(!r.ok)problems.push(`${fl}: 지도가 낡았다 — ${r.problems[0]}`);}
    catch(e){problems.push(`${fl}: 지도 검사 실패`);}
  }
  const shotHashes=new Map();
  for(const fl of flows){try{shotHashes.set(fl,new Set((JSON.parse(readFileSync(join(flowsDir,fl,'steps.json'),'utf8')).steps||[]).map(s=>s.shotHash).filter(Boolean)));}catch{shotHashes.set(fl,new Set());}}
  const ALLOWED=[/^SKILL\.md$/,/^references\/(history|agreements)\.md$/,/^references\/flows\/([^/]+)\/(steps\.json|flow\.html)$/,/^references\/flows\/([^/]+)\/flow\/[^/]+\.md$/,/^references\/flows\/([^/]+)\/agent\/(index|S\d+)\.(json|html)$/];
  for(const f of walk(root)){
    const rel=f.slice(root.length+1).split(sep).join('/');
    if(SKIP.has(basename(f))||/(^|\/)pending(\/|$)/.test(rel)){problems.push(`작업 중간 파일이 산출물에 있다: ${rel}`);continue;}
    // 학습이 보관한 이전 버전(versions/v{n}) — 이미지는 현재 shotHash와 달라도 되고 json은 민감 형식을 검사한다
    if(/^references\/flows\/[^/]+\/versions\/v\d+\/shots\/S\d+\.jpg$/.test(rel))continue;
    if(/^references\/flows\/[^/]+\/versions\/v\d+\/steps\.json$/.test(rel)){try{scanSensitive(JSON.parse(readFileSync(f,'utf8')));}catch(e){problems.push(`${rel}: 민감 형식 — ${e.message.replace(/^.*?: /,'').slice(0,120)}`);}continue;}
    const shot=/^references\/flows\/([^/]+)\/shots\/S\d+\.jpg$/.exec(rel);
    if(shot){if(!(shotHashes.get(shot[1])||new Set()).has(createHash('sha256').update(readFileSync(f)).digest('hex')))problems.push(`승인 증거(shotHash)와 맞지 않는 이미지: ${rel}`);continue;}
    if(!ALLOWED.some(re=>re.test(rel))){problems.push(`허용 목록 밖 파일: ${rel}`);continue;}
    if(!/\.(md|json|html|txt)$/i.test(f))continue;
    const body=readFileSync(f,'utf8');
    try{
      if(/\.json$/i.test(f))scanSensitive(JSON.parse(body));else scanSensitive({file:body});
    }catch(e){problems.push(`${rel}: 민감 형식 — ${e.message.replace(/^.*?: /,'').slice(0,120)}`);}
  }
  return {ok:problems.length===0,problems};
}
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]);

// 생성: 임시 폴더에서 만들고 검사에 통과해야 outDir로 옮긴다. 실패하면 outDir를 만들지 않는다.
export function generatePlaybook({workDir,outDir,name}){
  if(!NAME.test(String(name)))throw new Error('name은 소문자·숫자·하이픈이다');
  if(existsSync(outDir))throw new Error('outDir가 이미 있다');
  const ivPath=join(workDir,'interview.json');
  if(!existsSync(ivPath))throw new Error('interview.json이 없다');
  const iv=JSON.parse(readFileSync(ivPath,'utf8'));
  const chk=checkInterview(iv);
  if(!chk.complete)throw new Error('인터뷰 기록이 완전하지 않다 — 빠진 항목: '+(chk.missing.join(', ')||'없음')+(chk.problems.length?` · 문제 ${chk.problems.length}건`:''));
  const flowsRoot=join(workDir,'flows');
  const flows=existsSync(flowsRoot)?readdirSync(flowsRoot).filter(f=>existsSync(join(flowsRoot,f,'steps.json'))).sort():[];
  if(!flows.length)throw new Error('흐름이 없다');
  // 임시 복사 전에 모든 흐름의 원본을 검사한다(민감 형식·합의 대조·결과물 충족)
  const sources=new Map();
  for(const f of flows){
    const d=JSON.parse(readFileSync(join(flowsRoot,f,'steps.json'),'utf8'));
    scanSensitive(d);
    if(d.agentView!==true)throw new Error(`${f}: agentView 흐름이 아니다`);
    if(d.base!==`references/flows/${f}`)throw new Error(`${f}: steps.json base가 references/flows/${f}가 아니다`);
    const mismatch=checkAgreement(iv,d,f);
    if(mismatch.length)throw new Error('인터뷰 합의와 흐름이 다르다 — '+mismatch.join(' | '));
    sources.set(f,d);
  }
  const uncovered=checkCoverage(iv,[...sources.values()]);
  if(uncovered.length)throw new Error('인터뷰 합의와 흐름이 다르다 — '+uncovered.join(' | '));
  const tmp=mkdtempSync(join(tmpdir(),'pace-playbook-'));
  try{
    const out=join(tmp,name);
    mkdirSync(join(out,'references','flows'),{recursive:true});
    for(const f of flows){
      // 원본을 먼저 검사한다 — 민감 형식·합의 불일치가 있으면 아무것도 복사하기 전에 거부한다
      const src=join(flowsRoot,f);
      const d=sources.get(f);
      // 선별 복사: steps.json과 승인 증거(shotHash)와 해시가 같은 캡처만. 그 밖 파일은 복사하지 않는다.
      const copy=join(tmp,'work-'+f);
      mkdirSync(copy,{recursive:true});
      cpSync(join(src,'steps.json'),join(copy,'steps.json'));
      for(const s of d.steps||[]){
        if(!s.shotHash)continue;
        const sp=join(src,'shots',s.id+'.jpg');
        if(existsSync(sp)&&createHash('sha256').update(readFileSync(sp)).digest('hex')===s.shotHash){mkdirSync(join(copy,'shots'),{recursive:true});cpSync(sp,join(copy,'shots',s.id+'.jpg'));}
      }
      buildFlow(copy);   // 승인·증거가 무효면 여기서 던진다. 파생물만 낡은 것은 이 재생성으로 해소된다.
      const fresh=checkAgentFresh(copy);
      if(!fresh.ok)throw new Error(`${f}: 지도 최신성 검사 실패`);
      const dest=join(out,'references','flows',f);
      mkdirSync(dest,{recursive:true});
      for(const item of ['steps.json','shots','agent','flow.html','flow'])if(existsSync(join(copy,item)))cpSync(join(copy,item),join(dest,item),{recursive:true});
    }
    writeFileSync(join(out,'references','history.md'),`# 학습 이력\n\n주행 규약 버전 ${DRIVING_VERSION}. 아직 학습한 변경이 없다.\n`);
    let text=skillText({name,iv,flows,full:true});
    if(crlfSize(Buffer.from(text,'utf8'))>SKILL_LIMIT-400){
      const S=sections(iv);
      writeFileSync(join(out,'references','agreements.md'),`# 합의 사항\n\n## 시작 조건(서비스·인증)\n${S.start}\n\n## 입력\n${S.inputs}\n\n## 결과와 저장 위치\n${S.outputs}\n\n## 개인정보 처리\n${S.privacy}\n\n## 예외와 빈도\n${S.exceptions}\n\n## 사람과 함께하는 지점\n${S.human}\n`);
      text=skillText({name,iv,flows,full:false});
    }
    writeFileSync(join(out,'SKILL.md'),text);
    const res=checkPlaybook(out,{name});
    if(!res.ok)throw new Error('플레이북 검사 실패: '+res.problems.join(' | '));
    mkdirSync(dirname(resolve(outDir)),{recursive:true});
    cpSync(out,outDir,{recursive:true});
    return {outDir,flows};
  }finally{rmSync(tmp,{recursive:true,force:true});}
}
