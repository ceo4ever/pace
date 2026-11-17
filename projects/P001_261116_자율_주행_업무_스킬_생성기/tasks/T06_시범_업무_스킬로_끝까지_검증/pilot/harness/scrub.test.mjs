// 세션 기록 가리기 검사(T06 유출 검사 보완) — 합성 값만 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {homedir,tmpdir,userInfo} from 'node:os';
import {scrubText,scrubStreamLines,TAB_LIST_REDACTED} from './scrub.mjs';

const user=(()=>{try{return userInfo().username;}catch{return '';}})();

test('사용자 경로·이름·단축 이름·프로젝트 폴더 인코딩·토큰 모양을 가린다', ()=>{
  const home=homedir(),tmp=tmpdir();
  const s=[`${home}\\x`,`${home.replace(/\\/g,'/')}/y`,`${tmp}\\z`,
    String.raw`<HOME>\.claude\projects\C--Users-ABCDEF-1-XYZ-AppData-Local-Temp-x\memory`,
    'C:\\Users\\someone\\file','/c/Users/someone/file','token ghp_'+'a'.repeat(30),'Authorization: Bearer '+'b'.repeat(30)].join(' | ');
  const t=scrubText(s);
  assert.ok(!t.includes(home)&&!t.includes(home.replace(/\\/g,'/'))&&!t.includes(tmp),'홈·임시 경로가 남았다');
  assert.ok(t.includes('C--Users-<USER>-AppData'),'프로젝트 폴더 인코딩의 사용자 이름이 남았다');
  assert.ok(!/C:\\Users\\someone|\/c\/Users\/someone/.test(t),'사용자 폴더가 남았다');
  assert.ok(!t.includes('ghp_')&&!t.includes('b'.repeat(30)),'토큰이 남았다');
  if(user){
    assert.ok(!scrubText(`이름 ${user} 끝`).includes(user));
    // 8.3 단축형(앞 6자~1.확장 3자)과 '-' 인코딩
    const [base,ext='']=user.toUpperCase().split(/\.(?=[^.]*$)/);const b=base.replace(/[^A-Z0-9]/g,'').slice(0,6),e=ext.replace(/[^A-Z0-9]/g,'').slice(0,3);
    for(const sf of [`${b}~1${e?'.'+e:''}`,`${b}-1${e?'-'+e:''}`])assert.ok(!scrubText(`경로 ${sf}\\Temp`).includes(sf),`단축형이 남았다: ${sf}`);
  }
  // 공개 정보는 그대로
  assert.equal(scrubText('https://github.com/owner/repo commit abc1234'),'https://github.com/owner/repo commit abc1234');
});

test('orca tab list 결과만 가리고 다른 도구 결과·호출 입력은 그대로 둔다', ()=>{
  const ev=[
    {type:'assistant',message:{content:[{type:'tool_use',id:'t1',name:'Bash',input:{command:'orca tab list --json'}}]}},
    {type:'user',message:{content:[{type:'tool_result',tool_use_id:'t1',content:'{"tabs":[{"url":"https://other.example/private"}]}'}]},tool_use_result:{stdout:'https://other.example/private'}},
    {type:'assistant',message:{content:[{type:'tool_use',id:'t2',name:'Bash',input:{command:'orca eval --page p --expression "1"'}}]}},
    {type:'user',message:{content:[{type:'tool_result',tool_use_id:'t2',content:'1'}]},tool_use_result:{stdout:'1'}}
  ].map(e=>JSON.stringify(e));
  const {lines,redacted}=scrubStreamLines(ev);
  assert.equal(redacted,1);
  assert.ok(!lines.join('\n').includes('other.example'),'다른 탭 URL이 남았다');
  const r1=JSON.parse(lines[1]);assert.equal(r1.message.content[0].content,TAB_LIST_REDACTED);assert.equal(r1.tool_use_result,TAB_LIST_REDACTED);
  assert.equal(lines[0],ev[0]);assert.equal(lines[2],ev[2]);assert.equal(lines[3],ev[3]);   // 호출 입력·다른 결과는 그대로
  // 파싱 안 되는 줄은 그대로
  assert.deepEqual(scrubStreamLines(['not json']).lines,['not json']);
});
