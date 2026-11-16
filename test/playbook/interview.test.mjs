// 인터뷰 기록 검사·실값 종류 보조 (T03 S-1·S-2)
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkInterview} from '../../skills/pace-playbook-maker/tools/interview.mjs';
import {sensitiveKinds} from '../../skills/pace-playbook-maker/tools/sensitive.mjs';
import {validInterview,cleanup,tmp,SKILL} from './t03-helpers.mjs';

after(cleanup);
// 합성 표본은 조각으로 이어 붙여 만든다(저장소 비밀 검사가 리터럴로 오인하지 않게)
const RRN=['900101','1234567'].join('-');
const ACCT=['1002','123','456789'].join('-');
const PW=['pass','word=','hunter2','value'].join('');
const MAIL=['qa-user','@','example.org'].join('');

test('S-1 완전한 인터뷰는 통과하고, 필수 항목이 하나씩 빠지면 그 이름을 보고한다', ()=>{
  assert.deepEqual(checkInterview(validInterview()),{complete:true,missing:[],problems:[]});
  const drop=k=>{const iv=validInterview();delete iv[k];return checkInterview(iv);};
  for(const k of ['goal','scope','success','riskyActions','services','outputs','privacy']){
    const r=drop(k);
    assert.equal(r.complete,false,k);
    assert.ok(r.missing.includes(k),`${k} 보고 없음: ${r.missing}`);
  }
  // 성공 기준·위험 행동은 비어 있어도 안 된다
  assert.ok(checkInterview(validInterview({success:[]})).missing.includes('success'));
  assert.ok(checkInterview(validInterview({success:['  ']})).missing.includes('success'));
  assert.ok(checkInterview(validInterview({riskyActions:[]})).missing.includes('riskyActions'));
  assert.ok(checkInterview(validInterview({goal:' '})).missing.includes('goal'));
});

test('S-1 명시적 "없음"은 통과하고, 형식 오류는 problems로 보고한다', ()=>{
  assert.equal(checkInterview(validInterview({riskyActions:[],noRiskyActions:true})).complete,true);
  assert.equal(checkInterview(validInterview({outputs:[],noOutputs:true,resultTo:undefined})).complete,true);
  const bad=(patch)=>checkInterview(validInterview(patch));
  assert.match(bad({riskyActions:[{name:'보내기',irreversible:true}]}).problems.join('|'),/gate\(승인 규칙\)가 필요/);
  assert.match(bad({services:[{alias:'x',kind:'web',origin:'app.example.test',auth:{method:'none'}}]}).problems.join('|'),/origin/);
  assert.match(bad({services:[{alias:'x',kind:'web',origin:'https://a.example.test',auth:{method:'env-token'}}]}).problems.join('|'),/auth\.source는 환경 변수·시크릿 저장소의 이름/);
  assert.match(bad({outputs:[{name:'x',format:'문자열',sensitivity:'masked'}]}).problems.join('|'),/deliverTo/);
  assert.match(bad({outputs:[{name:'x',format:'"홍길동"',sensitivity:'public'}]}).problems.join('|'),/format\(형태 문법\)/);
  assert.match(bad({resultTo:undefined}).problems.join('|'),/resultTo/);
  assert.match(bad({humanPoints:[{step:'S01',reason:'몰라'}]}).problems.join('|'),/reason/);
  assert.equal(checkInterview(null).complete,false);
});

test('S-1 민감 형식이 든 기록은 거부하고 오류에 값이 없다(문자열·키)', ()=>{
  for(const [kind,value] of [['주민번호',RRN],['계좌형',ACCT],['자격증명',PW],['이메일',MAIL]]){
    const r=checkInterview(validInterview({privacy:{kinds:['주민번호'],handling:`값은 ${value} 로 처리`}}));
    assert.equal(r.complete,false,kind);
    const text=JSON.stringify(r);
    assert.match(text,/민감 형식 거부/,kind);
    assert.ok(!text.includes(value),`${kind}: 오류에 값이 있다`);
  }
  const keyed=checkInterview(validInterview({[MAIL]:'x'}));
  assert.equal(keyed.complete,false);assert.ok(!JSON.stringify(keyed).includes(MAIL));
});

test('S-1 CLI: --check는 완전하면 0, 불완전·민감 형식이면 1(빠진 항목 이름만, 값 없음)', ()=>{
  const dir=tmp();
  const run=iv=>{const f=join(dir,'iv.json');writeFileSync(f,JSON.stringify(iv));return spawnSync(process.execPath,[join(SKILL,'tools','interview.mjs'),'--check',f],{encoding:'utf8'});};
  assert.equal(run(validInterview()).status,0);
  const miss=run(validInterview({success:[]}));
  assert.equal(miss.status,1);assert.match(miss.stderr,/빠진 항목: success/);
  const sens=run(validInterview({scope:`범위 ${RRN}`}));
  assert.equal(sens.status,1);assert.ok(!sens.stderr.includes(RRN)&&!sens.stdout.includes(RRN));
  assert.equal(spawnSync(process.execPath,[join(SKILL,'tools','interview.mjs')],{encoding:'utf8'}).status,2);
});

test('S-2 sensitiveKinds: 사용자가 실값을 말한 답에서 종류 이름만 돌려주고 값은 없다', ()=>{
  const answer=`제 주민번호는 ${RRN}이고 계좌는 ${ACCT}, ${PW} 입니다. 메일 ${MAIL}`;
  const kinds=sensitiveKinds(answer);
  assert.ok(kinds.includes('주민번호'));assert.ok(kinds.includes('이메일'));assert.ok(kinds.length>=3);
  assert.ok(kinds.every(k=>typeof k==='string'));
  const joined=kinds.join('|');
  for(const v of [RRN,ACCT,PW,MAIL])assert.ok(!joined.includes(v));
  assert.deepEqual(sensitiveKinds('평범한 문장입니다'),[]);
  assert.deepEqual(sensitiveKinds(undefined),[]);
});
