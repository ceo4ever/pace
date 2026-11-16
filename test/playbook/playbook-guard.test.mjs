// 플레이북 생성의 저장 경계·합의 대조 (독립 검토 1차 지적 회귀): 합의 불일치 거부, 원본 먼저 검사·선별 복사, 인터뷰 최초 저장 보호
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generatePlaybook,checkAgreement} from '../../skills/pace-playbook-maker/tools/playbook.mjs';
import {saveInterview,checkInterview} from '../../skills/pace-playbook-maker/tools/interview.mjs';
import {contentHash} from '../../skills/pace-playbook-maker/tools/agent-map.mjs';
import {validInterview,fixtureInterview,makeWork,cleanup,tmp,readJson,writeJson} from './t03-helpers.mjs';

after(cleanup);
const RRN=['900101','1234567'].join('-');
const tryGen=(work)=>{const out=join(tmp('pace-t03-out-'),'box-list');try{generatePlaybook({workDir:work,outDir:out,name:'box-list'});return {out,err:null};}catch(e){return {out,err:e.message};}};
const flowFile=work=>join(work,'flows','sample-flow','steps.json');
const mutate=(work,fn)=>{const d=readJson(flowFile(work));fn(d);d.valueReview.contentHash=contentHash(d);writeJson(flowFile(work),d);};   // 확인 해시를 다시 적는다(재확인한 것과 같다)
const stepOf=(d,id)=>d.steps.find(s=>s.id===id);

test('합의 대조: 인터뷰와 흐름의 결과 위치·민감도·전달 위치·origin·위험 이름·관문이 다르면 생성 거부(지도 검사는 통과하는 불일치)', ()=>{
  assert.deepEqual(checkAgreement(fixtureInterview(),readJson(flowFile(makeWork())),'f'),[]);
  const cases=[
    ['결과 위치',w=>mutate(w,d=>{d.resultTo='other-store';}),/resultTo가 인터뷰와 다르다/],
    ['추출 민감도(인터뷰 restricted·흐름 public)',w=>{writeJson(join(w,'interview.json'),fixtureInterview({outputs:[{name:'목록 행',format:'문자열',sensitivity:'restricted',deliverTo:'approved-store'},{name:'문서 제목',format:'문자열',sensitivity:'public'},{name:'전송 결과',format:'선택값',sensitivity:'public'}],resultTo:'approved-store'}));mutate(w,d=>{d.resultTo='approved-store';});},/민감도가 인터뷰와 다르다/],
    ['전달 위치',w=>mutate(w,d=>{stepOf(d,'S02').extract[0].deliverTo='other-store';}),/전달 위치가 인터뷰와 다르다/],
    ['추출 이름',w=>mutate(w,d=>{stepOf(d,'S03').extract[0].name='인터뷰에 없는 항목';}),/인터뷰 outputs에 없다/],
    ['접근 origin',w=>mutate(w,d=>{d.allowedOrigins=['https://app.example.test','https://extra.example.test'];}),/allowedOrigins에 인터뷰 서비스에 없는 origin/],
    ['위험 등급 이름',w=>mutate(w,d=>{d.risks.send.label='인터뷰에 없는 행동';}),/인터뷰 riskyActions에 없다/],
    ['승인 관문',w=>mutate(w,d=>{stepOf(d,'S04').gate='사람 확인 없이 진행';}),/관문이 인터뷰와 다르다/],
    ['추출 형식',w=>mutate(w,d=>{stepOf(d,'S02').extract[0].format='숫자';}),/형식이 인터뷰와 다르다/],
    ['가역 행동의 합의 관문',w=>{writeJson(join(w,'interview.json'),fixtureInterview({riskyActions:[{name:'전송',irreversible:true,gate:'사람의 보내기 승인 한마디 필요'},{name:'개인정보 화면',irreversible:false,gate:'열기 전 확인'}]}));},/행동의 관문이 인터뷰와 다르다/],
    ['합의한 결과물이 흐름에 없음',w=>{writeJson(join(w,'interview.json'),fixtureInterview({outputs:[{name:'목록 행',format:'문자열',sensitivity:'masked',deliverTo:'result-sheet'},{name:'문서 제목',format:'문자열',sensitivity:'public'},{name:'전송 결과',format:'선택값',sensitivity:'public'},{name:'빠진 결과물',format:'숫자',sensitivity:'public'}]}));},/합의한 결과물 '빠진 결과물'/],
    ['결과물 없음인데 추출',w=>{writeJson(join(w,'interview.json'),fixtureInterview({outputs:[],noOutputs:true,resultTo:undefined}));},/noOutputs/]
  ];
  for(const [name,prep,re] of cases){
    const w=makeWork();prep(w);
    const r=tryGen(w);
    assert.match(r.err??'',re,name);
    assert.equal(existsSync(r.out),false,`${name}: outDir가 만들어졌다`);
  }
});

test('저장 경계: 원본을 먼저 검사하고(민감 형식이면 임시 복사 전에 거부) 승인 증거와 맞는 캡처만 선별 복사한다', ()=>{
  const before=new Set(readdirSync(tmpdir()).filter(f=>/^pace-playbook-/.test(f)));
  // 민감 형식이 든 원본 steps.json — 복사 전에 거부, 임시 폴더 흔적 없음, 오류에 값 없음
  const w=makeWork();
  const d=readJson(flowFile(w));d.steps.find(s=>s.id==='S02').purpose=`값 ${RRN}`;writeJson(flowFile(w),d);
  const r=tryGen(w);
  assert.match(r.err,/민감 형식 거부/);assert.ok(!r.err.includes(RRN));assert.equal(existsSync(r.out),false);
  const left=readdirSync(tmpdir()).filter(f=>/^pace-playbook-/.test(f)&&!before.has(f));
  assert.deepEqual(left,[],'임시 폴더가 남았다');
  // 참조·승인되지 않은 파일(이미지·텍스트·바이너리)은 산출물에 들어가지 않는다
  const w2=makeWork();
  const shots=join(w2,'flows','sample-flow','shots');
  writeFileSync(join(shots,'extra.jpg'),readFileSync(join(shots,'S02.jpg')));
  writeFileSync(join(w2,'flows','sample-flow','notes.txt'),`메모 ${RRN}`);
  writeFileSync(join(w2,'flows','sample-flow','x.bin'),Buffer.from([1,2,3]));
  const ok=tryGen(w2);
  assert.equal(ok.err,null);
  const all=(d)=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?all(join(d,e.name)).map(x=>e.name+'/'+x):[e.name]);
  const list=all(ok.out);
  assert.ok(!list.some(f=>/extra\.jpg|notes\.txt|x\.bin/.test(f)),`반출됨: ${list.filter(f=>/extra|notes|x\.bin/.test(f))}`);
  assert.ok(list.includes('references/flows/sample-flow/shots/S02.jpg')&&list.includes('references/flows/sample-flow/shots/S03.jpg'));
});

test('인터뷰 최초 저장: saveInterview는 쓰기 전에 검사 — 민감 형식은 던지고 파일이 없으며, 불완전한 기록은 저장되고 --check가 빠진 항목을 알린다', ()=>{
  const dir=tmp();
  const bad=validInterview({privacy:{kinds:['주민번호'],handling:`값은 ${RRN}`}});
  const e=(()=>{try{saveInterview({workDir:dir,interview:bad});}catch(x){return x.message;}})();
  assert.match(e,/민감 형식 거부/);assert.ok(!e.includes(RRN));
  assert.equal(existsSync(join(dir,'interview.json')),false);
  assert.deepEqual(readdirSync(dir),[]);
  // 도중 저장(필수 항목 없음)은 저장된다
  const partial={goal:'가상 업무',scope:'범위 초안'};
  const r=saveInterview({workDir:dir,interview:partial});
  assert.ok(existsSync(r.file));assert.equal(r.check.complete,false);
  assert.ok(r.check.missing.includes('success')&&r.check.missing.includes('riskyActions'));
  assert.deepEqual(readJson(r.file),partial);
  // 완전한 기록으로 덮어쓰면 완전
  const full=saveInterview({workDir:dir,interview:validInterview()});
  assert.equal(full.check.complete,true);assert.deepEqual(checkInterview(readJson(full.file)),{complete:true,missing:[],problems:[]});
});
