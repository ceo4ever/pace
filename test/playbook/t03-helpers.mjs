// T03 테스트 공용 도우미 — 합성 표본만 쓴다(실값 없음).
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {contentHash} from '../../skills/pace-playbook-maker/tools/agent-map.mjs';

const here=dirname(fileURLToPath(import.meta.url));
export const FIX=join(here,'..','fixtures','playbook','sample-flow');
export const SKILL=join(here,'..','..','skills','pace-playbook-maker');
const tmps=[];
export const cleanup=()=>{for(const d of tmps)rmSync(d,{recursive:true,force:true});};
export const tmp=(prefix='pace-t03-')=>{const d=mkdtempSync(join(tmpdir(),prefix));tmps.push(d);return d;};

export const validInterview=(o={})=>({
  goal:'가상 보관함 목록을 읽어 결과 시트로 넘긴다',scope:'가상 서비스의 보관함 목록 조회까지(전송 제외)',
  inputs:[{name:'기간',form:'YYYY-MM-DD',source:'user'}],
  outputs:[{name:'목록 행',format:'문자열',sensitivity:'masked',deliverTo:'result-sheet'}],resultTo:'result-sheet',
  services:[{alias:'box',kind:'web',origin:'https://app.example.test',auth:{method:'env-token',source:'BOX_TOKEN'}}],
  success:['목록 행 수가 응답 건수와 같다'],
  riskyActions:[{name:'문서 보내기',irreversible:true,gate:'사람의 보내기 승인 한마디 필요'}],
  exceptions:['공지 창이 늦게 뜬다'],frequency:'주 1회',
  privacy:{kinds:['주민번호'],handling:'값은 결과 저장 위치로만 전달하고 지도·기록에는 남기지 않는다'},
  humanPoints:[{step:'S01',reason:'auth'}],...o
});

// sample-flow fixture와 합의가 이어지는 인터뷰(추출 이름·민감도·전달 위치·위험 이름·관문·origin이 fixture와 같다)
export const fixtureInterview=(o={})=>validInterview({
  outputs:[{name:'목록 행',format:'문자열',sensitivity:'masked',deliverTo:'result-sheet'},{name:'문서 제목',format:'문자열',sensitivity:'public'},{name:'전송 결과',format:'선택값',sensitivity:'public'}],
  resultTo:'result-sheet',
  riskyActions:[{name:'전송',irreversible:true,gate:'사람의 보내기 승인 한마디 필요'},{name:'개인정보 화면',irreversible:false}],...o
});

// 다른 인터뷰로 만든 플레이북 시험용: fixture 흐름의 합의 필드를 인터뷰에 맞추고 확인 해시를 다시 적는다(사람이 재확인한 것과 같다)
export function alignFlow(work,iv,flow='sample-flow'){
  const p=join(work,'flows',flow,'steps.json'),d=JSON.parse(readFileSync(p,'utf8'));
  d.resultTo=iv.resultTo;d.allowedOrigins=[...new Set(iv.services.map(v=>v.origin))];
  const names=iv.riskyActions.map(a=>a.name);
  d.risks={send:{label:names[0],color:'#b91c1c'},private:{label:names[1]??names[0],color:'#7c3aed'}};
  const by={S02:iv.outputs[0],S03:iv.outputs[1],S04:iv.outputs[2]};
  for(const s of d.steps){const o=by[s.id];if(o&&s.extract){s.extract[0].name=o.name;s.extract[0].format=o.format;s.extract[0].sensitivity=o.sensitivity;if(o.deliverTo)s.extract[0].deliverTo=o.deliverTo;else delete s.extract[0].deliverTo;}}
  for(const s of d.steps)if(s.api)s.api.endpoint=s.api.endpoint.replace('https://app.example.test',d.allowedOrigins[0]);
  const a0=iv.riskyActions[0];d.steps.find(s=>s.id==='S04').gate=a0.gate??d.steps.find(s=>s.id==='S04').gate;
  d.valueReview.contentHash=contentHash(d);
  writeFileSync(p,JSON.stringify(d,null,1)+'\n');
}

// 승인 완료 가상 흐름(T02 fixture)을 작업 폴더로 복사 + interview.json
export function makeWork(iv=fixtureInterview()){
  const work=tmp('pace-t03-work-');
  mkdirSync(join(work,'flows'),{recursive:true});
  cpSync(FIX,join(work,'flows','sample-flow'),{recursive:true});
  writeFileSync(join(work,'interview.json'),JSON.stringify(iv,null,1)+'\n');
  return work;
}
export const readJson=p=>JSON.parse(readFileSync(p,'utf8'));
export const writeJson=(p,o)=>writeFileSync(p,JSON.stringify(o,null,1)+'\n');
