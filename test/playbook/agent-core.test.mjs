// 코어의 에이전트 지도용 기능: 요소 box·가림 증거 수집, captureRecord, approveStep, boxMatches
import test from 'node:test';
import assert from 'node:assert/strict';
import {overlay,captureRecord,approveStep,boxMatches,sha256Hex,CaptureRefused} from '../../skills/pace-playbook-maker/tools/capture-core.mjs';
import {Doc,El,Text,withDom} from './dom-stub.mjs';

const run=(doc,cfg)=>withDom(doc,()=>overlay({elements:[],css:[],res:[],frames:{},ignore:[],...cfg}));
const SHA=sha256Hex('shot');
const OK_POST={ok:true,reasons:[]};
const rect=(left,top,width,height)=>({left,top,width,height});

// 가림 대상 td(원문 값을 가진 요소)와 가려지지 않는 p
function secretDoc(){
  const doc=new Doc();
  doc.body.appendChild(new El('td',{rect:rect(40,140,300,20),text:'SECRET-VALUE-4242'}));
  doc.body.appendChild(new El('p',{rect:rect(40,200,200,20),text:'공개 문구'}));
  return doc;
}
const stepOf=(o={})=>({id:'S02',elements:[{n:1,find:'td'},{n:2,find:'p'}],maskRequire:[],extract:[],...o});
const infoOf=(doc,step,mask={css:['td']})=>run(doc,{...mask,elements:step.elements.map(e=>({n:e.n,find:e.find}))});

test('S-3 오버레이가 요소 box·가림 증거·뷰 크기를 숫자·불리언으로만 돌려주고 원문 값은 없다', ()=>{
  const doc=secretDoc(),step=stepOf();
  const info=infoOf(doc,step);
  assert.deepEqual(info.boxes[1],{x:40,y:140,w:300,h:20});
  assert.deepEqual(info.boxes[2],{x:40,y:200,w:200,h:20});
  assert.equal(info.elementsMasked[1],true);
  assert.equal(info.elementsMasked[2],false);
  assert.deepEqual(info.view,{vw:800,vh:600,dpr:1});
  assert.ok(!JSON.stringify(info).includes('SECRET-VALUE-4242'),'원문 값이 결과에 있다');
  const rec=captureRecord({info,post:OK_POST,step,shotSha256:SHA});
  assert.ok(!JSON.stringify(rec).includes('SECRET-VALUE-4242'));
  assert.equal(rec.elementsMasked[1],true);
  assert.match(rec.recordHash,/^[0-9a-f]{64}$/);
});

test('S-3 approveStep: 정상은 captureRecord·shotHash·recordHash를 쓰고, 위조·승인 해시 불일치·캡처 없는 단계는 거부', ()=>{
  const step=stepOf(),info=infoOf(secretDoc(),step);
  const rec=captureRecord({info,post:OK_POST,step,shotSha256:SHA});
  const out=approveStep(step,rec,{approvedSha:SHA});
  assert.equal(out.shotHash,SHA);assert.equal(out.recordHash,rec.recordHash);
  assert.deepEqual(out.captureRecord.boxes[1],{x:40,y:140,w:300,h:20});
  assert.ok(!('recordHash' in out.captureRecord));
  assert.equal(step.shotHash,undefined,'입력 step을 바꾸지 않는다(순수 함수)');
  const code=fn=>{try{fn();return null;}catch(e){assert.ok(e instanceof CaptureRefused);return e.code;}};
  assert.equal(code(()=>approveStep(step,{...rec,boxes:{...rec.boxes,1:{x:0,y:0,w:300,h:20}}},{approvedSha:SHA})),'approve_tamper');
  assert.equal(code(()=>approveStep(step,rec,{approvedSha:sha256Hex('다른 캡처')})),'approve_sha_mismatch');
  assert.equal(code(()=>approveStep(step,rec,{approvedSha:'abc'})),'approve_sha');
  assert.equal(code(()=>approveStep({...step,capture:false},rec,{approvedSha:SHA})),'approve_step');
  assert.equal(code(()=>approveStep({...step,elements:[{n:1,find:'td.other'},{n:2,find:'p'}]},rec,{approvedSha:SHA})),'approve_find');
});

test('S-3b 가림 판정: 합집합이 요소를 완전히 덮으면 true, 일부만 덮으면 false, 모든 승인을 거부하지 않는다', ()=>{
  // 정상: 글자 노드 두 개의 rect 합집합이 요소 전체를 덮는다
  const full=new Doc(),p=new El('p',{rect:rect(0,100,300,20)});
  p.appendChild(new Text('900101',rect(0,100,150,20)));p.appendChild(new Text('900102',rect(150,100,150,20)));
  full.body.appendChild(p);
  const infoFull=run(full,{res:['re:\\d{6}'],elements:[{n:1,find:'p'}]});
  assert.equal(infoFull.elementsMasked[1],true);
  const step={id:'S02',elements:[{n:1,find:'p'}],maskRequire:[],extract:[]};
  assert.doesNotThrow(()=>captureRecord({info:infoFull,post:OK_POST,step,shotSha256:SHA}));
  // 부분 가림: 글자 일부만 덮는다
  const part=new Doc(),q=new El('p',{rect:rect(0,100,300,20)});
  q.appendChild(new Text('900101',rect(0,100,100,10)));part.body.appendChild(q);
  const infoPart=run(part,{res:['re:\\d{6}'],elements:[{n:1,find:'p'}]});
  assert.equal(infoPart.elementsMasked[1],false);
  const withExtract={...step,extract:[{name:'값',where:{selector:'p'},format:'문자열',sensitivity:'public'}]};
  assert.throws(()=>captureRecord({info:infoPart,post:OK_POST,step:withExtract,shotSha256:SHA}),e=>e.code==='extract_unmasked');
  assert.doesNotThrow(()=>captureRecord({info:infoFull,post:OK_POST,step:withExtract,shotSha256:SHA}));
});

test('S-3b·S-3e 실패 입력은 기록 단계에서 즉시 거부: 사후 검사 실패·errors·가림 0건·다른 요소만 가림·restricted·미연결·미발견', ()=>{
  const step=stepOf(),good=infoOf(secretDoc(),step);
  const code=(args)=>{try{captureRecord({shotSha256:SHA,post:OK_POST,step,info:good,...args});return null;}catch(e){return e.code;}};
  assert.equal(code({post:{ok:false,reasons:['dom_changed']}}),'record_post');
  assert.equal(code({post:undefined}),'record_post');
  assert.equal(code({info:{...good,errors:['오류']}}),'record_errors');
  assert.equal(code({shotSha256:'xyz'}),'record_sha');
  assert.equal(code({step:{...step,maskRequire:['td']},info:{...good,perRule:{td:0}}}),'mask_require_zero');
  assert.equal(code({step:{...step,maskRequire:['td']}}),null,'가림 필수 규칙이 1건 이상이면 통과');
  const ex=(selector,sensitivity)=>({...step,extract:[{name:'x',where:{selector},format:'문자열',sensitivity}]});
  assert.equal(code({step:ex('p','public')}),'extract_unmasked');            // 다른 요소(td)만 가려졌고 추출 대상 p는 노출
  assert.equal(code({step:ex('td','public')}),null);                          // public 추출도 가려져야 하며 가려졌다
  assert.equal(code({step:ex('td','restricted')}),'extract_restricted');
  assert.equal(code({step:ex('none-here','masked')}),'extract_unlinked');
  assert.equal(code({info:{...good,missing:[1]},step:ex('td','public')}),'extract_missing');
  assert.equal(code({step:{...step,capture:false}}),'record_step');
});

test('S-5 boxMatches: 창 크기·배율 환산 일치, 캡처 픽셀(dpr 곱) 혼동·다른 요소·비비례 이동은 불일치', ()=>{
  const rec={x:40,y:140,w:300,h:20,vw:800,vh:600};
  assert.equal(boxMatches(rec,{x:40,y:140,w:300,h:20,vw:800,vh:600}).ok,true);
  assert.equal(boxMatches(rec,{x:80,y:280,w:600,h:40,vw:1600,vh:1200}).ok,true,'창을 2배로 키운 비례 변경');
  assert.equal(boxMatches(rec,{x:20,y:70,w:150,h:10,vw:400,vh:300}).ok,true,'창을 절반으로 줄인 비례 변경');
  // 픽셀 좌표(dpr 2 곱)를 CSS 좌표로 오인해 기록한 경우
  assert.equal(boxMatches({x:80,y:280,w:600,h:40,vw:800,vh:600},{x:40,y:140,w:300,h:20,vw:800,vh:600}).ok,false);
  assert.equal(boxMatches(rec,{x:40,y:300,w:200,h:20,vw:800,vh:600}).ok,false,'다른 요소 위치');
  assert.equal(boxMatches(rec,{x:240,y:140,w:150,h:20,vw:800,vh:600}).ok,false,'사이드바가 열려 한쪽으로 밀리고 좁아진 비비례 변화');
  assert.equal(boxMatches(rec,{x:40,y:140,w:0,h:20,vw:800,vh:600}).ok,false);
  assert.equal(boxMatches(null,rec).ok,false);
});
