import test from 'node:test';
import {privateBanned} from './private-banned.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CaptureRefused,assertCapturable,validateMask,overlay,overlayScript,runCapture,checkOverlayResult} from '../../skills/pace-playbook-maker/tools/capture-core.mjs';
import {Doc,El,Text,addIframe,withDom,emitMutation} from './dom-stub.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const okStep={id:'S01',elements:[]};
const okDoc={mask:['td']};

// ---- 가짜 브라우저: 호출 기록 ----
function fakeBrowser(o={}){
  const calls=[];
  const good={masked:1,errors:[],frames:{},perRule:{},missing:[]};
  return {calls,
    evalJs(expr){
      const kind=expr.includes('f.post()')?'post':expr.includes('f.cleanup()')?'cleanup':'overlay';
      calls.push(kind);
      if(o[kind+'Throw'])throw new Error(kind+' boom');
      if(kind==='overlay')return 'overlay' in o?o.overlay:good;
      if(kind==='post')return 'post' in o?o.post:{ok:true,reasons:[]};
      return true;
    },
    screenshot(){calls.push('screenshot');if(o.shotThrow)throw new Error('shot boom');return '/tmp/shot.jpg';},
    discard(p){calls.push('discard:'+p);if(o.discardThrow)throw new Error('discard boom');},
    sleep(){calls.push('sleep');}
  };
}

test('S-1 mask 없음·빈 배열·잘못된 형식·잘못된 re:는 거부', ()=>{
  for(const mask of [undefined,null,[],'td',[1],[''],['td',' '],['re:'],['re:(']])
    assert.throws(()=>assertCapturable(okStep,{mask}),CaptureRefused,JSON.stringify(mask));
  assert.doesNotThrow(()=>assertCapturable(okStep,{mask:['td','re:\\d{3}']}));
  assert.throws(()=>validateMask(['re:[']),/컴파일/);
});

test('S-2 capture:false 단계는 거부하고 captureNote를 알린다', ()=>{
  assert.throws(()=>assertCapturable({id:'S01',capture:false,captureNote:'개인정보 화면'},okDoc),e=>e instanceof CaptureRefused&&/개인정보 화면/.test(e.message)&&e.code==='capture_false');
});

test('S-3 거부 대상이면 브라우저 호출 0회', ()=>{
  const b=fakeBrowser();
  assert.throws(()=>runCapture({doc:{},step:okStep,browser:b}),CaptureRefused);
  assert.throws(()=>runCapture({doc:okDoc,step:{id:'S01',capture:false},browser:b}),CaptureRefused);
  assert.deepEqual(b.calls,[]);
});

test('S-4 오버레이 결과 형태가 안전하지 않으면 스크린샷 0회·제거는 호출', ()=>{
  const bad=[null,undefined,{},{masked:'1',errors:[],frames:{},perRule:{}},{masked:1,errors:['x'],frames:{},perRule:{}},{masked:1,errors:[],frames:{},perRule:[]}];
  for(const overlayRes of bad){
    const b=fakeBrowser({overlay:overlayRes});
    assert.throws(()=>runCapture({doc:okDoc,step:okStep,browser:b}),CaptureRefused);
    assert.ok(!b.calls.includes('screenshot'));assert.ok(b.calls.includes('cleanup'));
  }
  const b=fakeBrowser({overlay:{masked:1,errors:[],frames:{cert:{ok:false}},perRule:{}}});
  assert.throws(()=>runCapture({doc:okDoc,step:okStep,frames:{cert:'#c'},browser:b}),/frame cert/);
  assert.ok(!b.calls.includes('screenshot'));
  const t=fakeBrowser({overlayThrow:true});
  assert.throws(()=>runCapture({doc:okDoc,step:okStep,browser:t}),/overlay boom/);
  assert.ok(!t.calls.includes('screenshot'));assert.ok(t.calls.includes('cleanup'));
});

test('S-5 사후 검사 실패면 거부하고 원본을 삭제한다', ()=>{
  for(const post of [{ok:false,reasons:['scroll_changed']},{ok:false,reasons:['dom_changed']},null,{ok:true}]){
    const b=fakeBrowser({post});
    let res;
    assert.throws(()=>{res=runCapture({doc:okDoc,step:okStep,browser:b});},CaptureRefused);
    assert.equal(res,undefined);
    assert.ok(b.calls.includes('discard:/tmp/shot.jpg'));assert.ok(b.calls.includes('cleanup'));
  }
  // discard도 실패하면 경로 없이 오류, 원 오류는 보존
  const b=fakeBrowser({post:{ok:false,reasons:['dom_changed']},discardThrow:true});
  assert.throws(()=>runCapture({doc:okDoc,step:okStep,browser:b}),e=>e instanceof CaptureRefused&&/삭제 실패/.test(e.message)&&Boolean(e.discardError));
});

test('S-5c 사후 검사 evalJs가 throw해도 원본 삭제·원 오류 전달', ()=>{
  const b=fakeBrowser({postThrow:true});
  assert.throws(()=>runCapture({doc:okDoc,step:okStep,browser:b}),/post boom/);
  assert.ok(b.calls.includes('discard:/tmp/shot.jpg'));assert.ok(b.calls.includes('cleanup'));
});

test('S-6 스크린샷이 throw하면 제거 호출·오류 전달', ()=>{
  const b=fakeBrowser({shotThrow:true});
  assert.throws(()=>runCapture({doc:okDoc,step:okStep,browser:b}),/shot boom/);
  assert.ok(b.calls.includes('cleanup'));assert.ok(!b.calls.some(c=>c.startsWith('discard')));
});

test('S-7 정상 순서: 오버레이 → 스크린샷 → 사후 검사 → 제거', ()=>{
  const b=fakeBrowser();
  const r=runCapture({doc:okDoc,step:okStep,browser:b});
  assert.deepEqual(b.calls,['overlay','sleep','screenshot','post','cleanup']);
  assert.equal(r.path,'/tmp/shot.jpg');assert.equal(r.info.masked,1);assert.equal(r.cleanupFailed,false);
});

// ---- 오버레이 실제 효과 (DOM 스텁) ----
const run=(doc,cfg)=>withDom(doc,()=>overlay({elements:[],css:[],res:[],frames:{},ignore:[],...cfg}));
const boxesOf=doc=>doc.getElementById('__flowcap').children.filter(c=>c.style.cssText.includes('#475569'));
const td=(doc,text,rect)=>{const t=new El('td',{rect,text});let tb=doc.querySelector('tbody');if(!tb){tb=doc.body.appendChild(new El('tbody',{rect:{left:0,top:0,width:10,height:10}}));}tb.appendChild(t);return t;};

test('S-8 CSS·re: 규칙은 일치 요소마다 상자를 만들고 뷰포트 밖도 덮는다', ()=>{
  const doc=new Doc();
  td(doc,'123',{left:10,top:10,width:50,height:20});
  td(doc,'abc',{left:10,top:40,width:50,height:20});
  td(doc,'x',{left:10,top:5000,width:50,height:20});      // 뷰포트 밖
  const p=doc.body.appendChild(new El('p',{rect:{left:0,top:100,width:90,height:20},text:'사업자 111-22-33333'}));
  const info=run(doc,{css:['td'],res:['re:\\d{3}-\\d{2}-\\d{5}']});
  assert.deepEqual(info.errors,[]);
  assert.equal(info.perRule['td'],3);
  assert.equal(info.perRule['re:\\d{3}-\\d{2}-\\d{5}'],1);
  assert.equal(info.masked,4);
  assert.equal(boxesOf(doc).length,4);
  assert.ok(boxesOf(doc).some(b=>b.style.cssText.includes('top:5000px')));   // 뷰포트 필터 없음
  assert.ok(p);
});

test('S-8b 비일치 요소는 덮지 않고, 크기 0 요소는 건너뛴다', ()=>{
  const doc=new Doc();
  doc.body.appendChild(new El('span',{rect:{left:0,top:0,width:10,height:10},text:'안녕'}));
  td(doc,'숨김',{left:0,top:0,width:0,height:0});
  const info=run(doc,{css:['td'],res:['re:ZZZ']});
  assert.equal(info.masked,0);assert.equal(boxesOf(doc).length,0);
});

test('S-9 규칙값은 JSON 리터럴로만 들어가고 특수 문자에도 컴파일된다', ()=>{
  const evil=`a"];</script>'\`\${x}`;
  const s=overlayScript({elements:[{n:1,find:evil}],mask:[`re:${evil.replace(/[\\^$.*+?()[\]{}|]/g,'\\$&')}`,'td[a="b"]'],frames:{cert:'#c'},mutationIgnore:['.clock']});
  assert.doesNotThrow(()=>new Function(`return ${s}`));
  assert.ok(s.includes(JSON.stringify(evil)));
});

test('S-10 값 있는 입력은 규칙 없이도 덮고, 값 없는 입력·체크박스는 덮지 않는다', ()=>{
  const doc=new Doc();
  const add=(tag,o)=>doc.body.appendChild(new El(tag,{rect:{left:0,top:0,width:40,height:10},...o}));
  add('input',{attrs:{type:'text'},value:'가나다'});
  add('input',{value:'type 없음'});
  add('input',{attrs:{type:'password'},value:'pw'});
  add('textarea',{value:'메모'});
  add('select',{value:'옵션'});
  add('div',{attrs:{contenteditable:'true'},text:'편집'});
  add('input',{attrs:{type:'text'},value:''});
  add('input',{attrs:{type:'checkbox'},value:'on'});
  add('div',{attrs:{contenteditable:'false'},text:'편집불가'});
  const info=run(doc,{css:['table.none'],res:[]});
  assert.equal(info.perRule['(기본:값 있는 입력)'],6);
  assert.equal(boxesOf(doc).length,6);
});

test('S-10b 공개 허용 입력: 선택자와 값 전체 패턴이 모두 맞을 때만 덮지 않는다', ()=>{
  const doc=new Doc();
  const add=(o)=>doc.body.appendChild(new El('input',{rect:{left:0,top:0,width:40,height:10},...o}));
  add({attrs:{type:'text',class:'dateInput'},value:'2026-11-07'});          // 공개
  add({attrs:{type:'text',class:'dateInput'},value:'2026-11-07 홍길동'});    // 패턴 불일치 → 덮음
  add({attrs:{type:'text',class:'other'},value:'2026-11-07'});              // 선택자 불일치 → 덮음
  const reveal=[{selector:'input.dateInput',value:'^\\d{4}-\\d{2}-\\d{2}$'}];
  const info=run(doc,{css:['table.none'],res:[],reveal});
  assert.equal(info.perRule['(기본:값 있는 입력)'],2);
  assert.equal(boxesOf(doc).length,2);
  // 설정 형식: ^…$ 고정이 아니거나 컴파일 안 되면 overlayScript가 거부
  assert.throws(()=>overlayScript({mask:['re:x'],revealInputs:[{selector:'input',value:'\\d+'}]}));
  assert.throws(()=>overlayScript({mask:['re:x'],revealInputs:[{selector:'',value:'^x$'}]}));
  assert.throws(()=>overlayScript({mask:['re:x'],revealInputs:[{selector:'input',value:'^($'}]}));
  assert.ok(overlayScript({mask:['re:x'],revealInputs:reveal}).includes('dateInput'));
  // 최상위 교대(|)로 고정이 풀리는 설정은 다시 감싸 전체 일치만 인정 — 주민번호 값은 계속 덮인다
  const doc2=new Doc();
  doc2.body.appendChild(new El('input',{rect:{left:0,top:0,width:40,height:10},attrs:{type:'text',class:'dateInput'},value:'900101-1234567'}));
  const info2=run(doc2,{css:['table.none'],res:[],reveal:[{selector:'input.dateInput',value:'^\\d{4}$|\\d+$'}]});   // 감싸지 않으면 끝부분 숫자만으로 일치해 공개됐을 패턴
  assert.equal(info2.perRule['(기본:값 있는 입력)'],1);
  // 모든 값·민감 표본과 일치하는 패턴은 거부(리뷰 F4의 우회 패턴 포함)
  for(const v of ['^.*$','^[\\s\\S]*$','^.+$','^[\\S\\s]*$','^[\\d\\D]*$','^(.|\\n)*$','^.{0,}$','^[^\\n]*$','^a|.+$','^\\d+-?\\d+$'])
    assert.throws(()=>overlayScript({mask:['re:x'],revealInputs:[{selector:'input',value:v}]}),undefined,v);
  // 공개는 input에만 — 같은 class·값의 textarea는 계속 덮인다(리뷰 F5)
  const doc3=new Doc();
  doc3.body.appendChild(new El('textarea',{rect:{left:0,top:0,width:40,height:10},attrs:{class:'dateInput'},value:'2026-11-07'}));
  const info3=run(doc3,{css:['table.none'],res:[],reveal:[{selector:'.dateInput',value:'^\\d{4}-\\d{2}-\\d{2}$'}]});
  assert.equal(info3.perRule['(기본:값 있는 입력)'],1);
});

test('S-11 frames: 접근 불가·없음·선언 안 된 iframe·중첩 iframe은 오류, 접근되면 안쪽도 덮는다', ()=>{
  // 접근 불가
  let doc=new Doc();addIframe(doc.body,{id:'c',access:false});
  let info=run(doc,{css:['td'],frames:{cert:'#c'}});
  assert.equal(info.frames.cert.ok,false);assert.ok(info.errors.length);
  assert.throws(()=>checkOverlayResult(info,{cert:'#c'}),CaptureRefused);
  // 선언한 iframe 없음
  doc=new Doc();
  info=run(doc,{css:['td'],frames:{cert:'#c'}});
  assert.equal(info.frames.cert.ok,false);
  // 선언 안 된 보이는 iframe
  doc=new Doc();addIframe(doc.body,{id:'ad'});
  info=run(doc,{css:['td'],frames:{}});
  assert.ok(info.errors.some(e=>/선언되지 않은/.test(e)));
  // 크기 0인 iframe은 무시
  doc=new Doc();addIframe(doc.body,{id:'hid',rect:{left:0,top:0,width:0,height:0}});
  assert.deepEqual(run(doc,{css:['td']}).errors,[]);
  // 선언된 iframe 안 요소는 오프셋을 더해 덮고, 안쪽 중첩 iframe은 오류
  doc=new Doc();
  const {doc:inner}=addIframe(doc.body,{id:'c',rect:{left:100,top:200,width:300,height:200}});
  td(inner,'안쪽',{left:5,top:6,width:20,height:10});
  info=run(doc,{css:['td'],frames:{cert:'#c'}});
  assert.deepEqual(info.errors,[]);assert.equal(info.frames.cert.ok,true);
  assert.ok(boxesOf(doc).some(b=>b.style.cssText.includes('left:105px;top:206px')));
  const d2=new Doc();const a=addIframe(d2.body,{id:'c',rect:{left:0,top:0,width:300,height:200}});
  addIframe(a.doc.body,{id:'nested'});
  assert.ok(run(d2,{css:['td'],frames:{cert:'#c'}}).errors.some(e=>/선언되지 않은/.test(e)));
});

test('S-12 잘못된 선택자·정규식은 삼키지 않고 errors로 거부된다', ()=>{
  const doc=new Doc();
  let info=run(doc,{css:['td!!bad']});
  assert.ok(info.errors.some(e=>/선택자 오류/.test(e)));
  assert.throws(()=>checkOverlayResult(info),CaptureRefused);
  info=run(doc,{res:['re:(']});
  assert.ok(info.errors.some(e=>/정규식 오류/.test(e)));
});

test('S-13 열린 shadow root 안 일치 요소도 덮는다', ()=>{
  const doc=new Doc();
  const shadow=new El('shadow-root');
  const inner=new El('td',{rect:{left:1,top:2,width:30,height:10},text:'비밀'});
  shadow.appendChild(inner);
  doc.body.appendChild(new El('x-host',{shadow,rect:{left:0,top:0,width:10,height:10}}));
  const info=run(doc,{css:['td']});
  assert.equal(info.perRule['td'],1);assert.equal(boxesOf(doc).length,1);
});

// ---- 사후 검사 (변경 감시) ----
function postAfter(setup,{ignore=['.clock'],res=[]}={}){
  const doc=new Doc();
  const clock=doc.body.appendChild(new El('div',{attrs:{class:'clock'},rect:{left:0,top:0,width:50,height:10},text:'10:00'}));
  const cell=td(doc,'값',{left:0,top:50,width:50,height:10});
  return withDom(doc,()=>{
    overlay({elements:[],css:['td'],res,frames:{},ignore});
    setup({doc,clock,cell});
    return globalThis.__flowcap.post();
  });
}

test('S-5b 사후 검사: 시계 텍스트만 통과, 노드 추가·마스킹 대상·규칙 일치 값은 실패', ()=>{
  assert.deepEqual(postAfter(({clock})=>emitMutation({type:'characterData',target:clock.children[0]})),{ok:true,reasons:[]});
  assert.deepEqual(postAfter(()=>{}),{ok:true,reasons:[]});
  // 허용 영역에 노드 추가
  assert.equal(postAfter(({clock})=>emitMutation({type:'childList',target:clock})).ok,false);
  // ignore=body + 행 추가
  assert.equal(postAfter(({doc})=>emitMutation({type:'childList',target:doc.body}),{ignore:['body']}).ok,false);
  // 마스킹 대상 요소의 텍스트 변경
  assert.equal(postAfter(({cell})=>emitMutation({type:'characterData',target:cell.children[0]}),{ignore:['td','.clock']}).ok,false);
  // 허용 영역 텍스트가 re: 규칙에 일치하는 새 값으로 변경 (G1)
  const r=postAfter(({clock})=>{clock.children[0].nodeValue='123-45-67890';emitMutation({type:'characterData',target:clock.children[0]});},{res:['re:\\d{3}-\\d{2}-\\d{5}']});
  assert.equal(r.ok,false);
  // 선언 frame 문서 안 변경
  const doc=new Doc();const {doc:inner}=addIframe(doc.body,{id:'c'});td(inner,'안쪽',{left:0,top:0,width:10,height:10});
  const fr=withDom(doc,()=>{overlay({elements:[],css:['td'],res:[],frames:{cert:'#c'},ignore:[]});emitMutation({type:'childList',target:inner.body});return globalThis.__flowcap.post();});
  assert.equal(fr.ok,false);
});

test('사후 검사: 스크롤·레이아웃 변경은 실패', ()=>{
  assert.deepEqual(postAfter(({doc})=>{doc.defaultView.scrollY=300;}).reasons,['scroll_changed']);
  assert.deepEqual(postAfter(({cell})=>{cell.rect.top=80;}).reasons,['layout_changed']);
});

test('오버레이 제거는 상자와 감시를 정리한다', ()=>{
  const doc=new Doc();td(doc,'값',{left:0,top:0,width:10,height:10});
  withDom(doc,()=>{
    overlay({elements:[],css:['td'],res:[],frames:{},ignore:[]});
    assert.ok(doc.getElementById('__flowcap'));
    globalThis.__flowcap.cleanup();
    assert.equal(doc.getElementById('__flowcap'),null);
    assert.equal(globalThis.__flowcap,undefined);
  });
});

test('S-8c 번호 태그: 뷰포트 안 요소만, 없으면 missing', ()=>{
  const doc=new Doc();
  doc.body.appendChild(new El('button',{id:'ok',rect:{left:10,top:10,width:40,height:20},text:'확인'}));
  doc.body.appendChild(new El('button',{id:'far',rect:{left:10,top:9000,width:40,height:20},text:'멀리'}));
  const info=run(doc,{css:['td'],elements:[{n:1,find:'#ok'},{n:2,find:'#far'},{n:3,find:'text:확인'},{n:4,find:'#none'},{n:5,find:'!!bad'}]});
  assert.deepEqual(info.missing,[2,4,5]);
  // text:는 제목(strong)·자식 없는 div도 찾는다. 자식이 있는 div(컨테이너)는 같은 글자여도 고르지 않는다
  const doc2=new Doc();
  const box=doc2.body.appendChild(new El('div',{rect:{left:0,top:0,width:200,height:50}}));
  box.appendChild(new El('span',{rect:{left:0,top:0,width:40,height:10},text:'안쪽'}));
  doc2.body.appendChild(new El('strong',{rect:{left:0,top:60,width:40,height:10},text:'기본정보'}));
  doc2.body.appendChild(new El('div',{rect:{left:0,top:80,width:40,height:10},text:'첨부파일'}));
  const info2=run(doc2,{css:['td'],elements:[{n:1,find:'text:기본정보'},{n:2,find:'text:첨부파일'},{n:3,find:'text:없는제목'}]});
  assert.deepEqual(info2.missing,[3]);
});

test('코어 소스에 서비스 문구가 없다', ()=>{
  const src=readFileSync(join(here,'..','..','skills','pace-playbook-maker','tools','capture-core.mjs'),'utf8');
  const banned=privateBanned();   // 사례 이름 목록은 저장소 밖 로컬 파일 — 없으면 이 검사는 건너뛴다
  if(banned)assert.ok(!banned.test(src),`코어 소스에 금지어 ${src.match(banned)?.[0]}`);
});

// ---- 사전 검토·구현 후 1차 지적 반영 ----
test('F1 optional frame: 없으면 통과(태그는 missing), 있는데 접근 불가면 거부', ()=>{
  const FR={cert:{selector:'#c',optional:true}};
  let doc=new Doc();td(doc,'값',{left:0,top:0,width:10,height:10});
  let info=run(doc,{css:['td'],frames:FR,elements:[{n:1,find:'cert:button'}]});
  assert.deepEqual(info.errors,[]);assert.equal(info.frames.cert.ok,true);assert.deepEqual(info.missing,[1]);
  assert.doesNotThrow(()=>checkOverlayResult(info,FR));
  doc=new Doc();addIframe(doc.body,{id:'c',access:false});
  info=run(doc,{css:['td'],frames:FR});
  assert.equal(info.frames.cert.ok,false);assert.throws(()=>checkOverlayResult(info,FR),CaptureRefused);
  // 선언 안 된 보이는 iframe은 optional이어도 거부
  doc=new Doc();addIframe(doc.body,{id:'ad'});
  assert.ok(run(doc,{css:['td'],frames:FR}).errors.length);
});

test('F3 보이는 object·embed, F6 열린 dialog·popover·html/body transform은 거부', ()=>{
  for(const tag of ['object','embed']){
    const doc=new Doc();doc.body.appendChild(new El(tag,{rect:{left:0,top:0,width:100,height:100}}));
    assert.ok(run(doc,{css:['td']}).errors.some(e=>/iframe·object·embed/.test(e)),tag);
  }
  let doc=new Doc();doc.body.appendChild(new El('dialog',{attrs:{open:''},rect:{left:0,top:0,width:100,height:100}}));
  assert.ok(run(doc,{css:['td']}).errors.some(e=>/dialog/.test(e)));
  doc=new Doc();doc.body.appendChild(new El('dialog',{rect:{left:0,top:0,width:0,height:0}}));
  assert.deepEqual(run(doc,{css:['td']}).errors,[]);
  doc=new Doc();doc.body.appendChild(new El('div',{attrs:{'data-popover-open':''},rect:{left:0,top:0,width:50,height:50}}));
  assert.ok(run(doc,{css:['td']}).errors.some(e=>/popover/.test(e)));
  for(const p of ['translate','rotate','scale','backdrop-filter','container-type']){
    doc=new Doc();doc.defaultView.getComputedStyle=el=>el===doc.documentElement?{[p]:'10px'}:{};
    assert.ok(run(doc,{css:['td']}).errors.some(e=>e.includes(p)),p);
  }
  doc=new Doc();doc.defaultView.getComputedStyle=el=>el===doc.body?{transform:'matrix(1, 0, 0, 1, 5, 5)'}:{};
  assert.ok(run(doc,{css:['td']}).errors.some(e=>/transform/.test(e)));
  doc=new Doc();doc.defaultView.getComputedStyle=()=>({transform:'none',filter:'none','will-change':'auto'});
  assert.deepEqual(run(doc,{css:['td']}).errors,[]);
});

test('F4 iframe 테두리(clientLeft/Top)만큼 오프셋이 밀린다, F5 iframe 안 re: 글자도 같은 좌표', ()=>{
  const doc=new Doc();
  const {iframe,doc:inner}=addIframe(doc.body,{id:'c',rect:{left:100,top:200,width:300,height:200}});
  iframe.clientLeft=3;iframe.clientTop=4;
  inner.body.appendChild(new El('p',{rect:{left:5,top:6,width:20,height:10},text:'111-22-33333'}));
  const info=run(doc,{res:['re:\\d{3}-\\d{2}-\\d{5}'],frames:{cert:'#c'}});
  assert.equal(info.perRule['re:\\d{3}-\\d{2}-\\d{5}'],1);
  assert.ok(boxesOf(doc).some(b=>b.style.cssText.includes('left:108px;top:210px')));
});

test('F2 오버레이 제거 반환이 true가 아니면 cleanupFailed', ()=>{
  const b=fakeBrowser();
  const orig=b.evalJs;b.evalJs=expr=>{const r=orig(expr);return expr.includes('f.cleanup()')?undefined:r;};
  assert.equal(runCapture({doc:okDoc,step:okStep,browser:b}).cleanupFailed,true);
  const t=fakeBrowser({cleanupThrow:true});
  assert.equal(runCapture({doc:okDoc,step:okStep,browser:t}).cleanupFailed,true);
});

test('S-5d input name·type을 바꿨다 되돌리면 통과, 남은 변경·다른 속성·다른 요소는 실패', ()=>{
  const mk=()=>{const doc=new Doc();const inp=doc.body.appendChild(new El('input',{rect:{left:0,top:0,width:10,height:10},attrs:{type:'text',name:'q'}}));const div=doc.body.appendChild(new El('div',{rect:{left:0,top:20,width:10,height:10},attrs:{name:'d'}}));return {doc,inp,div};};
  const go=(fn)=>{const c=mk();return withDom(c.doc,()=>{overlay({elements:[],css:['td'],res:[],frames:{},ignore:[]});fn(c);return globalThis.__flowcap.post();});};
  // 관측된 Orca 동작: type을 같은 값으로 다시 씀(oldValue = 원래 값) + name을 지웠다 되돌림 → 통과
  assert.deepEqual(go(({inp})=>{
    emitMutation({type:'attributes',target:inp,attributeName:'type',oldValue:'text'});
    inp.attrs.name=null;emitMutation({type:'attributes',target:inp,attributeName:'name',oldValue:'q'});
    inp.attrs.name='q';emitMutation({type:'attributes',target:inp,attributeName:'name',oldValue:null});
  }),{ok:true,reasons:[]});
  // 중간에 다른 type이 있었음(text→password→text) → 최종이 같아도 실패
  assert.equal(go(({inp})=>{inp.attrs.type='password';emitMutation({type:'attributes',target:inp,attributeName:'type',oldValue:'text'});inp.attrs.type='text';emitMutation({type:'attributes',target:inp,attributeName:'type',oldValue:'password'});}).ok,false);
  // 리뷰 F1 재현: 값 있는 hidden input이 hidden→text→hidden → 실패
  {const doc=new Doc();const h=doc.body.appendChild(new El('input',{rect:{left:0,top:0,width:0,height:0},attrs:{type:'hidden'},value:'900101-1234567'}));
   const r=withDom(doc,()=>{overlay({elements:[],css:['td'],res:[],frames:{},ignore:[]});h.attrs.type='text';emitMutation({type:'attributes',target:h,attributeName:'type',oldValue:'hidden'});h.attrs.type='hidden';emitMutation({type:'attributes',target:h,attributeName:'type',oldValue:'text'});return globalThis.__flowcap.post();});
   assert.equal(r.ok,false);}
  // name이 바뀐 채로 남음 → 실패
  assert.equal(go(({inp})=>{inp.attrs.name='x';emitMutation({type:'attributes',target:inp,attributeName:'name',oldValue:'q'});}).ok,false);
  // input의 다른 속성 → 실패
  assert.equal(go(({inp})=>{emitMutation({type:'attributes',target:inp,attributeName:'value'});}).ok,false);
  // input이 아닌 요소의 name → 실패
  assert.equal(go(({div})=>{emitMutation({type:'attributes',target:div,attributeName:'name'});}).ok,false);
});

test('S-5b+ ignore 하위 요소의 childList·attributes는 실패, frame은 해당 옵저버로만 감지, frame 스크롤도 실패', ()=>{
  // ignore 영역의 하위 요소가 target인 childList·attributes
  for(const type of ['childList','attributes','characterData-nonignored']){
    const r=postAfter(({clock})=>{
      const child=clock.appendChild(new El('span',{rect:{left:0,top:0,width:5,height:5},text:'x'}));
      emitMutation(type==='characterData-nonignored'?{type:'characterData',target:new Text('y')}:{type,target:child});
    });
    assert.equal(r.ok,false,type);
  }
  // 선언 frame 문서의 옵저버에만 변경이 도착해도 실패(최상위 옵저버에는 도착하지 않음)
  const doc=new Doc();const {doc:inner}=addIframe(doc.body,{id:'c'});td(inner,'안쪽',{left:0,top:0,width:10,height:10});
  const fr=withDom(doc,()=>{overlay({elements:[],css:['td'],res:[],frames:{cert:'#c'},ignore:[]});emitMutation({type:'childList',target:inner.body},inner.documentElement);return globalThis.__flowcap.post();});
  assert.equal(fr.ok,false);
  // frame 문서 스크롤 변경
  const d2=new Doc();const a=addIframe(d2.body,{id:'c'});td(a.doc,'안쪽',{left:0,top:0,width:10,height:10});
  const sc=withDom(d2,()=>{overlay({elements:[],css:['td'],res:[],frames:{cert:'#c'},ignore:[]});a.doc.defaultView.scrollY=50;return globalThis.__flowcap.post();});
  assert.deepEqual(sc.reasons,['scroll_changed']);
});

// ---- 값 노출 검사(T06 검토 반영): 추출 대상 밖의 같은 값 노출 위치 ----
import {leakScript,leakProblems} from '../../skills/pace-playbook-maker/tools/capture-core.mjs';
const runLeak=(doc,mask,step)=>new Function('document','NodeFilter','getComputedStyle','return '+leakScript({mask,step}))(doc,{SHOW_TEXT:4},()=>({visibility:'visible'}));

const mkDoc=()=>{const d=new Doc();const mk=(tag,o={},parent=d.body)=>{const e=new El(tag,{rect:{left:0,top:0,width:100,height:20},...o});parent.appendChild(e);return e;};return {d,mk};};

test('값 노출 S-1 같은 값이 가림 밖 다른 곳에 보이면 개수로 잡고, 가려진 곳·대상 자신은 세지 않는다 — 대상마다 결과 하나', ()=>{
  const {d,mk}=mkDoc();
  mk('span',{attrs:{class:'stars'},text:'124k'});            // 추출 대상
  mk('p',{attrs:{class:'about'},text:'About: 124k stars'});   // 같은 값이 다른 곳(가려지지 않음)
  mk('td',{attrs:{class:'row'},text:'124k'});                 // 같은 값이 다른 곳(가려짐)
  const step={extract:[{name:'별',where:{selector:'span.stars'}}]};
  let r=runLeak(d,['td.row'],step);
  assert.deepEqual(r,[{name:'별',checked:true,exposed:1}]);   // about의 124k만(td는 가려짐, 대상 자신 제외)
  assert.deepEqual(leakProblems(r,step),["추출 '별'의 값이 대상 밖 1곳에 가려지지 않고 보인다"]);
  // 정규식 가림 규칙이 덮으면 세지 않는다
  const covered=runLeak(d,['td.row','re:\\d+k stars'],step);
  assert.deepEqual(covered,[{name:'별',checked:true,exposed:0}]);assert.deepEqual(leakProblems(covered,step),[]);
  // 결과는 이름·개수뿐(값 없음)
  assert.ok(!JSON.stringify(r).includes('124k'));
});

test('값 노출 S-2 노드로 나뉜 글자·다른 입력칸의 value·짧은 값(낱말 단위)도 센다', ()=>{
  const {d,mk}=mkDoc();
  mk('span',{attrs:{class:'title'},text:'가상 제목 abcd'});
  const p=mk('p',{attrs:{class:'list'}});mk('b',{text:'가상 제목 ab'},p);mk('i',{text:'cd'},p);   // ab<i>cd</i>로 나뉨 → p에서 한 번
  mk('input',{attrs:{class:'search'},value:'가상 제목 abcd'});                                      // 다른 입력칸의 value
  mk('span',{attrs:{class:'stars'},text:'7'});mk('em',{text:'7'});mk('em',{text:'v1.7 release'});    // 짧은 값도 낱말로: em '7'과 'v1.7'의 '7'(점 뒤 낱말)
  const step={extract:[{name:'제목',where:{selector:'span.title'}},{name:'별',where:{selector:'span.stars'}}]};
  const r=runLeak(d,[],step);
  assert.deepEqual(r,[{name:'제목',checked:true,exposed:2},{name:'별',checked:true,exposed:2}]);
  // 가리면 0
  assert.deepEqual(runLeak(d,['p.list','input.search','em'],step).map(x=>x.exposed),[0,0]);
});

test('값 노출 S-2b 화면(뷰포트) 밖 요소와 다른 낱말 속 부분 일치는 세지 않는다', ()=>{
  const {d,mk}=mkDoc();
  mk('span',{attrs:{class:'branch'},text:'main'});
  mk('p',{text:'custom domain settings'});                                  // 'main'이 낱말 안에만 — 세지 않음
  mk('p',{text:'switch to main now'});                                      // 낱말로 있음 — 셈
  mk('pre',{text:'git checkout main',rect:{left:0,top:2000,width:100,height:20}});   // 뷰포트(800×600) 밖 — 이미지에 없음
  const step={extract:[{name:'브랜치',where:{selector:'span.branch'}}]};
  const run=new Function('document','NodeFilter','getComputedStyle','innerWidth','innerHeight','return '+leakScript({mask:[],step}));
  assert.deepEqual(run(d,{SHOW_TEXT:4},()=>({visibility:'visible'}),800,600),[{name:'브랜치',checked:true,exposed:1}]);
});

test('값 노출 S-2c 대상을 품은 부모의 다른 글자와 주변 글자가 붙은 짧은 값도 센다(검토 3차)', ()=>{
  const {d,mk}=mkDoc();
  const box=mk('div',{attrs:{class:'box'}});
  mk('span',{id:'target',text:'abcd'},box);box.appendChild(new Text(' · abcd'));   // <div><span id=target>abcd</span> · abcd</div>
  mk('span',{attrs:{class:'stars'},text:'7'});mk('p',{text:'별: 7'});mk('p',{text:'v17 release'});   // 짧은 값: '별: 7'만(낱말), 'v17'은 아님
  const step={extract:[{name:'제목',where:{selector:'#target'}},{name:'별',where:{selector:'span.stars'}}]};
  assert.deepEqual(runLeak(d,['#target','span.stars'],step),[{name:'제목',checked:true,exposed:1},{name:'별',checked:true,exposed:1}]);
  // 부모 전체를 가리면 0
  assert.deepEqual(runLeak(d,['div.box','span.stars','p'],step).map(x=>x.exposed),[0,0]);
});

test('값 노출 S-3 fail-closed — 대상 없음·값 없음·결과 없음·불완전·해석 불가는 모두 문제', ()=>{
  const {d,mk}=mkDoc();
  mk('span',{attrs:{class:'empty'},text:''});
  const step={extract:[{name:'없음',where:{selector:'span.none'}},{name:'빈값',where:{selector:'span.empty'}}]};
  const r=runLeak(d,[],step);
  assert.deepEqual(r,[{name:'없음',checked:false,reason:'missing'},{name:'빈값',checked:false,reason:'empty'}]);
  assert.deepEqual(leakProblems(r,step),["추출 '없음'의 값 노출을 검사하지 못했다(대상 없음)","추출 '빈값'의 값 노출을 검사하지 못했다(값 없음)"]);
  assert.equal(leakProblems(undefined,step).length,1);
  assert.equal(leakProblems([],step).length,2);              // 대상마다 결과가 있어야 한다
  assert.equal(leakProblems([{}],step).length,2);
  assert.deepEqual(leakProblems([{name:'없음',checked:true,exposed:'0'},{name:'빈값',checked:true,exposed:0}],step),["추출 '없음'의 값 노출 검사 결과를 해석하지 못했다"]);
});
