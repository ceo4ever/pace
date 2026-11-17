// stream-json 해석기 검사(T06) — 합성 이벤트만 쓴다(LLM 호출 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,orcaSub} from './analyze.mjs';

const WORK='C:/Users/x/AppData/Local/Temp/sess1';
const PROFILE='aaaa-bbbb';
const use=(name,input,id='t'+Math.random())=>({type:'assistant',message:{content:[{type:'tool_use',id,name,input}]}});
const bash=cmd=>use('Bash',{command:cmd});
const read=p=>use('Read',{file_path:p});
const done=(text)=>({type:'result',subtype:'success',result:text,num_turns:5,is_error:false});

test('orca 하위 명령 해석 — 앞쪽 옵션을 건너뛰고 tab create 같은 두 단어를 읽는다', ()=>{
  assert.deepEqual(orcaSub('orca tab create --url https://x --profile p'),{sub:'tab',sub2:'create'});
  assert.deepEqual(orcaSub('orca eval --page abc --expression "1"'),{sub:'eval',sub2:''});
  assert.deepEqual(orcaSub('cd x && orca screenshot --page abc'),{sub:'screenshot',sub2:''});
  assert.deepEqual(orcaSub('ls'),{sub:'',sub2:''});
});

test('지표: 도구 호출 수·화면 탐색·지도 읽기·분량 경로·최종 출력', ()=>{
  const events=[
    {type:'system',subtype:'init',tools:['Bash','Read'],model:'m',permissionMode:'dontAsk',slash_commands:[],skills:[]},
    read(`${WORK}/.claude/skills/pb/SKILL.md`),read(`${WORK}/.claude/skills/pb/references/flows/f/agent/index.json`),read(`${WORK}/.claude/skills/pb/references/flows/f/agent/S02.json`),
    bash(`orca tab create --url https://github.com/a/b --profile ${PROFILE}`),bash('orca viewport --page p --width 1280 --height 900'),
    bash('orca eval --page p --expression "document.title"'),bash('orca screenshot --page p'),bash('orca tab close --page p'),
    done('표\nRESULT {"branch":"main","stars":"1k","sha7":"abc1234","title":"t","date":"2026-11-16"}')];
  const r=analyze({events,work:WORK,skill:'pb',profile:PROFILE,mapFiles:['SKILL.md','references/flows/f/agent/index.json','references/flows/f/agent/S02.json','references/flows/f/agent/S01.json']});
  assert.equal(r.toolCalls,8);assert.deepEqual(r.perTool,{Read:3,Bash:5});assert.equal(r.orcaCalls,5);assert.equal(r.screenExplorations,2);
  assert.equal(r.mapRead,true);assert.equal(r.mapReadPaths.length,3);assert.equal(r.profileViolation,false);   // S01은 읽지 않았다
  assert.deepEqual(r.output,{branch:'main',stars:'1k',sha7:'abc1234',title:'t',date:'2026-11-16'});
});

test('지도를 Bash cat으로 읽어도 참조로 센다(Read와 같다) — 읽은 파일 목록은 호출자가 준 지도 파일 중 참조된 것', ()=>{
  const files=['SKILL.md','references/history.md','references/flows/f/steps.json','references/flows/f/agent/index.json','references/flows/f/agent/S01.json','references/flows/f/agent/S02.json'];
  const events=[bash(`cd ./.claude/skills/pb && cat SKILL.md`),bash(`cat references/flows/f/agent/index.json references/flows/f/agent/S02.json`),done('x')];
  const r=analyze({events,work:WORK,skill:'pb',profile:PROFILE,mapFiles:files});
  assert.equal(r.mapRead,true);assert.deepEqual(r.mapReadPaths.sort(),['SKILL.md','references/flows/f/agent/S02.json','references/flows/f/agent/index.json'].sort());
  // index만 읽으면 지도 사용으로 세지 않는다
  assert.equal(analyze({events:[bash('cat references/flows/f/agent/index.json'),done('x')],work:WORK,skill:'pb',profile:PROFILE,mapFiles:files}).mapRead,false);
});

test('orca 아닌 Bash 명령은 첫 낱말로 집계한다(두 군 허용 도구 감사)', ()=>{
  const r=analyze({events:[bash('cat SKILL.md'),bash('cd x && cat y'),bash('find . -type f'),bash('orca tab list'),done('x')],work:WORK,skill:'pb',profile:PROFILE});
  assert.equal(r.bashNonOrca,3);assert.deepEqual(r.bashNonOrcaWords,{cat:1,cd:1,find:1});
});

test('권한 거부 이벤트를 센다', ()=>{
  const r=analyze({events:[{type:'system',subtype:'permission_denied'},{type:'system',subtype:'permission_denied'},done('x')],work:WORK,skill:'pb',profile:PROFILE});
  assert.equal(r.permissionDenials,2);
});

test('지도를 읽지 않았으면 mapRead false, 프로필 없이 탭을 열면 위반', ()=>{
  let r=analyze({events:[read(`${WORK}/.claude/skills/pb/SKILL.md`),bash('orca tab create --url https://github.com/a/b'),done('x')],work:WORK,skill:'pb',profile:PROFILE});
  assert.equal(r.mapRead,false);assert.equal(r.profileViolation,true);assert.equal(r.output,null);
  // index만 읽고 단계 json을 안 읽은 경우도 지도 사용으로 세지 않는다
  r=analyze({events:[read(`${WORK}/.claude/skills/pb/references/flows/f/agent/index.json`),done('x')],work:WORK,skill:'pb',profile:PROFILE});assert.equal(r.mapRead,false);
  // 다른 프로필 id
  r=analyze({events:[bash('orca tab create --url https://x --profile other-id'),done('x')],work:WORK,skill:'pb',profile:PROFILE});assert.equal(r.profileViolation,true);
  // 탭을 열지 않으면 위반 없음
  r=analyze({events:[done('x')],work:WORK,skill:'pb',profile:PROFILE});assert.equal(r.profileViolation,false);
});
