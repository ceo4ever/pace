// 웹 관찰(createWebProbe) 단위 검사 — 실제 DOM 동작은 healer-e2e(Orca)에서 확인한다(DOM 스텁은 한글·따옴표 속성 선택자를 지원하지 않는다)
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebProbe} from '../../skills/pace-playbook-maker/tools/heal-web.mjs';

test('T05 S-8 관찰 스크립트는 올바른 JS이고 mask(CSS)·require가 들어가며 re: 규칙은 빠진다', ()=>{
  let script='';
  const p=createWebProbe({browser:{evalJs(e){script=e;return {url:'/box',requireOk:true,elements:[{tag:'button'}],overlays:[]};}},mask:['td.owner','re:\d{6}','.secret']});
  const o=p.observe({step:{screen:{url:'^/box$',require:['table.list']}}});
  assert.doesNotThrow(()=>new Function('return '+script));
  assert.ok(script.includes('"td.owner"')&&script.includes('".secret"')&&script.includes('"table.list"'));
  assert.ok(!script.includes('re:'));
  assert.deepEqual([o.url,o.pathHint,o.elements.length],['/box',false,1]);   // url이 패턴에 맞으니 pathHint 아님
});

test('T05 S-8 경로가 패턴과 다르고 require가 모두 보이면 pathHint, 브라우저 오류는 빈 관찰(던지지 않음)', ()=>{
  const mkp=r=>createWebProbe({browser:{evalJs(){return r;}}});
  assert.equal(mkp({url:'/box/list',requireOk:true,elements:[],overlays:[]}).observe({step:{screen:{url:'^/box$',require:['a']}}}).pathHint,true);
  assert.equal(mkp({url:'/box/list',requireOk:false,elements:[],overlays:[]}).observe({step:{screen:{url:'^/box$',require:['a']}}}).pathHint,false);
  const boom=createWebProbe({browser:{evalJs(){throw new Error('x');}}}).observe({step:{screen:{url:'^/a$'}}});
  assert.deepEqual(boom,{url:'',pathHint:false,elements:[],overlays:[]});
});

test('T05 검토1-④⑥ 관찰 스크립트: 유효 type(DOM 속성)을 읽고, 선택자는 구조 이름만 만들며, 가림 대상 닫기 버튼은 제외한다', ()=>{
  let script='';
  createWebProbe({browser:{evalJs(e){script=e;return {url:'/',requireOk:true,elements:[],overlays:[]};}},mask:['.m']}).observe({step:{screen:{url:'^/$'}}});
  assert.ok(script.includes('etype(e)')&&script.includes('etype(b)')&&script.includes('e.form?'));   // type 없는 button은 폼 안에서만 제출
  assert.ok(!script.includes("getAttribute('type')"));
  assert.ok(!/\['name','aria-label'/.test(script));   // 화면 문구 속성(title·aria-label·placeholder)으로 선택자를 만들지 않는다 — 점수용 attrs는 메모리에만
  assert.ok(script.includes("['name','data-testid','data-action']"));
  assert.ok(/filter\(x=>vis\(x\)&&!masked\(x\)\)/.test(script));
});
