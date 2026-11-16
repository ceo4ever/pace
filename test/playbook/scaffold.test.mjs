// 흐름 뼈대(initFlow)·API 단계 기록(inferResponseShape·addApiStep) (T03 S-3·S-7b)
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {initFlow,inferResponseShape,addApiStep} from '../../skills/pace-playbook-maker/tools/scaffold.mjs';
import {validInterview,cleanup,tmp,readJson} from './t03-helpers.mjs';

after(cleanup);
const RRN=['900101','1234567'].join('-');
const ACCT=['1002','123','456789'].join('-');
const PW=['pass','word=','hunter2','value'].join('');

test('S-3 initFlow: 인터뷰의 합의 필드(resultTo·allowedOrigins·risks·rules·base)가 steps.json 뼈대에 그대로 들어간다', ()=>{
  const work=tmp(),iv=validInterview({services:[
    {alias:'box',kind:'web',origin:'https://app.example.test',auth:{method:'env-token',source:'BOX_TOKEN'}},
    {alias:'api',kind:'api',origin:'https://api.example.test',auth:{method:'none'}}]});
  const {file}=initFlow({workDir:work,flow:'box-list',interview:iv,allowedPaths:['/organizations/{id}/documents'],now:'2026-11-16'});
  const d=readJson(file);
  assert.equal(d.title,iv.goal);assert.equal(d.purpose,iv.goal);assert.equal(d.updated,'2026-11-16');
  assert.equal(d.base,'references/flows/box-list');assert.equal(d.agentView,true);
  assert.equal(d.resultTo,'result-sheet');
  assert.deepEqual(d.allowedOrigins,['https://app.example.test','https://api.example.test']);
  assert.deepEqual(d.allowedPaths,['/organizations/{id}/documents']);
  assert.deepEqual(d.risks,{r1:{label:'문서 보내기',color:'#b45309'}});
  assert.deepEqual(d.rules,['문서 보내기: 사람의 보내기 승인 한마디 필요']);
  assert.deepEqual(d.steps,[]);
  // 다른 인터뷰는 다른 뼈대
  const work2=tmp();
  const f2=initFlow({workDir:work2,flow:'other',interview:validInterview({resultTo:'other-sheet',outputs:[{name:'x',format:'숫자',sensitivity:'public'}],riskyActions:[],noRiskyActions:true,services:[{alias:'a',kind:'web',origin:'https://z.example.test',auth:{method:'none'}}]})}).file;
  const d2=readJson(f2);
  assert.equal(d2.resultTo,'other-sheet');assert.deepEqual(d2.allowedOrigins,['https://z.example.test']);assert.equal(d2.risks,undefined);assert.deepEqual(d2.rules,[]);
});

test('S-3 initFlow: 불완전한 인터뷰·잘못된 흐름 이름·이미 있는 흐름·민감 형식은 거부하고 파일을 만들지 않는다', ()=>{
  const work=tmp();
  const iv=validInterview();delete iv.success;
  assert.throws(()=>initFlow({workDir:work,flow:'f',interview:iv}),/인터뷰 기록이 완전하지 않다 — 빠진 항목: success/);
  assert.equal(existsSync(join(work,'flows')),false);
  assert.throws(()=>initFlow({workDir:work,flow:'Bad_Name',interview:validInterview()}),/흐름 이름/);
  const sens=validInterview({scope:`범위 ${RRN}`});
  const e=(()=>{try{initFlow({workDir:work,flow:'f',interview:sens});}catch(x){return x.message;}})();
  assert.ok(e&&!e.includes(RRN));
  assert.equal(existsSync(join(work,'flows')),false);
  initFlow({workDir:work,flow:'f',interview:validInterview()});
  assert.throws(()=>initFlow({workDir:work,flow:'f',interview:validInterview()}),/이미 흐름이 있다/);
});

test('S-7b inferResponseShape: 경로·형태 이름만 반환하고 값은 없다(중첩·배열·민감 키)', ()=>{
  const resp={status:'ok',result:{count:3,done:true,note:null,items:[{id:'a',amount:100},{id:'b',amount:200}],tags:[]},[`${RRN}`]:'x',leaf:{[PW]:1}};
  const shape=inferResponseShape(resp);
  const byPath=Object.fromEntries(shape.map(s=>[s.path,s.type]));
  assert.equal(byPath['status'],'문자열');assert.equal(byPath['result.count'],'숫자');assert.equal(byPath['result.done'],'여부');
  assert.equal(byPath['result.note'],'문자열');assert.equal(byPath['result.items[].id'],'문자열');assert.equal(byPath['result.items[].amount'],'숫자');
  assert.equal(byPath['result.tags[]'],'목록');
  const text=JSON.stringify(shape);
  for(const v of ['ok','"a"','"b"',RRN,PW,'100','200'])assert.ok(!text.includes(v)||v==='100'&&false,`값이 있다: ${v}`);
  assert.ok(!text.includes(RRN)&&!text.includes(PW),'민감 키가 경로에 남았다');
  assert.ok(Object.keys(byPath).includes('*'),'민감 키는 * 로 일반화');
  // 허용 형태 어휘 밖 값은 없다
  for(const s of shape)assert.ok(['문자열','숫자','여부','목록'].includes(s.type));
  assert.deepEqual(inferResponseShape({}),[]);
  assert.deepEqual(inferResponseShape('문자열 하나'),[]);
});

test('S-7b addApiStep: 관찰한 응답에서 경로·형태만 steps.json에 쓰고 값은 어디에도 없다', ()=>{
  const work=tmp();
  const {dir,file}=initFlow({workDir:work,flow:'f',interview:validInterview(),allowedPaths:['/organizations/{orgId}/documents/{docId}/send']});
  const observed={result:{status:'sent',ref:RRN,account:ACCT,secret:PW},count:2};
  const step={id:'S01',title:'보내기',risk:'r1',gate:'사람의 보내기 승인 한마디 필요',tool:'sender.mjs',purpose:'문서를 보낸다',enter:'승인 뒤',
    identify:{anchors:['API 단계']},api:{method:'POST',endpoint:'https://app.example.test/organizations/{orgId}/documents/{docId}/send',request:[{name:'x-target-org',in:'header',role:'target',form:'<조직 식별자>'}],successStatus:'202'},
    extract:[{name:'전송 결과',where:{apiPath:'result.status'},format:'선택값',sensitivity:'public',verify:'값이 완료 상태'}],
    success:'202와 완료 상태',escalate:'거절 응답'};
  const out=addApiStep({flowDir:dir,step,observedResponse:observed});
  assert.equal(out.id,'S01');
  const text=readFileSync(file,'utf8');
  for(const v of [RRN,ACCT,PW,'sent'])assert.ok(!text.includes(v),`steps.json에 값이 있다: ${v}`);
  const d=readJson(file);
  assert.equal(d.steps[0].capture,false);
  assert.deepEqual(d.steps[0].api.response.map(r=>r.path).sort(),['count','result.account','result.ref','result.secret','result.status']);
  assert.ok(d.steps[0].api.response.every(r=>r.type==='문자열'||r.type==='숫자'));
  // 거부: 없는 apiPath·중복 id·응답도 상태 코드도 없음·민감 형식이 단계에 있음 — 파일 불변
  const before=readFileSync(file,'utf8');
  const bad=(patch,obs=observed)=>{try{addApiStep({flowDir:dir,step:{...step,...patch},observedResponse:obs});return null;}catch(e){return e.message;}};
  assert.match(bad({id:'S02',extract:[{...step.extract[0],where:{apiPath:'result.missing'}}]}),/관찰한 응답 경로에 없다/);
  assert.match(bad({}),/단계 id가 없거나 중복/);
  assert.match(bad({id:'S03',api:{...step.api,successStatus:undefined}},{}),/비어 있고 successStatus도 없다/);
  const sens=bad({id:'S04',purpose:`값 ${RRN}`});
  assert.match(sens,/민감 형식 거부/);assert.ok(!sens.includes(RRN));
  assert.equal(readFileSync(file,'utf8'),before);
  assert.ok(readdirSync(dir).every(f=>f==='steps.json'));
});
