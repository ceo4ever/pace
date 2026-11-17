// 정답 판정기·중앙값 집계 검사(T06 S-10) — 합성 정답·세션 출력 표본만 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {judge,starRange,median,summarize,normalizeSample,TIME_LIMIT_MS} from './score.mjs';

const T0={branch:'main',stars:12345,sha7:'abc1234',title:'fix: 첫 번째',date:'2026-11-16'};
const T1={branch:'main',stars:12350,sha7:'def5678',title:'feat: 두 번째',date:'2026-11-17'};   // 측정 중 새 커밋
const OUT={branch:'main',stars:'12.3k',sha7:'abc1234',title:'fix: 첫 번째',date:'2026-11-16'};

test('정답과 모두 맞으면 성공, 필드 하나라도 틀리거나 비면 실패', ()=>{
  assert.equal(judge(OUT,T0).ok,true);
  for(const [f,v] of [['branch','develop'],['sha7','abc1235'],['title','fix: 다른 제목'],['date','2026-11-15'],['stars','9.9k']])assert.equal(judge({...OUT,[f]:v},T0).ok,false,f);
  for(const f of ['branch','stars','sha7','title','date']){const r=judge({...OUT,[f]:''},T0);assert.equal(r.ok,false,f);assert.ok(r.missing.includes(f));}
  assert.equal(judge(null,T0).ok,false);
  // 다른 저장소의 값(전부 다른 묶음)
  assert.equal(judge({branch:'master',stars:'1k',sha7:'0000000',title:'x',date:'2020-01-01'},T0).ok,false);
});

test('날짜는 커밋터 날짜 또는 작성자 날짜(UTC 일)와 맞으면 인정한다', ()=>{
  assert.equal(judge({...OUT,date:'2026-11-15'},{...T0,dateAlt:'2026-11-15'}).ok,true);
  assert.equal(judge({...OUT,date:'2026-11-14'},{...T0,dateAlt:'2026-11-15'}).ok,false);
});

test('별 표기 경계: 12.3k는 12250~12349, 124k는 123500~124499, 쉼표·m 표기도 푼다', ()=>{
  assert.deepEqual(starRange('12.3k').map(Math.round),[12250,12350]);
  assert.deepEqual(starRange('124k').map(Math.round),[123500,124500]);
  assert.deepEqual(starRange('1,234'),[1234,1234]);assert.deepEqual(starRange('1.2m').map(Math.round),[1150000,1250000]);
  assert.equal(starRange('열두 개'),null);
  assert.equal(judge({...OUT,stars:'12.3k'},{...T0,stars:12249}).ok,false);   // 범위 밖
  assert.equal(judge({...OUT,stars:'12.3k'},{...T0,stars:12251}).ok,true);
});

test('측정 중 커밋이 바뀌면 시작 묶음 또는 끝 묶음에 통째로 맞아야 하고 시점을 섞은 조합은 오답이다', ()=>{
  assert.equal(judge(OUT,T0,T1).ok,true);   // 시작 묶음
  assert.equal(judge({...OUT,stars:'12.4k',sha7:T1.sha7,title:T1.title,date:T1.date},T0,T1).ok,true);   // 끝 묶음(별 개수는 두 시점 범위 허용)
  const mixed={...OUT,title:T1.title,date:T1.date};   // 시작 해시 + 끝 제목·날짜
  const r=judge(mixed,T0,T1);assert.equal(r.ok,false);assert.equal(r.mixed,true);
  assert.equal(judge({...OUT,date:T1.date},T0,T1).ok,false);   // 해시·제목은 시작, 날짜만 끝
  // 날짜 UTC 경계: 시점이 다르면 하루 어긋날 수 있다 — 두 묶음 중 하나와 맞으면 인정
  assert.equal(judge({...OUT,date:'2026-11-17'},{...T0,date:'2026-11-17'},T1).ok,true);
});

test('중앙값 집계: 플레이북 3회 모두 정확 + 시간·도구 호출 중앙값이 지도 없음(실패·시간 초과 포함)보다 작을 때만 충족', ()=>{
  assert.equal(median([3,1,2]),2);assert.equal(median([1,2,3,4]),2.5);assert.equal(median([]),null);
  const pb=ms=>({ok:true,ms,toolCalls:8,screenExplorations:2,mapBytes:3000,mapRead:true});
  const nm=(ms,calls,ok=true)=>({ok,ms,toolCalls:calls,screenExplorations:9,mapBytes:0});
  let s=summarize([pb(30000),pb(35000),pb(40000)],[nm(90000,25),nm(100000,30),nm(110000,28)]);
  assert.equal(s.p6,'충족');
  // 지도 없음이 더 빠르면 미충족
  s=summarize([pb(120000),pb(130000),pb(140000)],[nm(90000,25),nm(100000,30),nm(110000,28)]);assert.equal(s.p6,'미충족');assert.ok(s.reasons.some(r=>/시간 중앙값/.test(r)));
  // 플레이북 표본 하나가 실패하면 미충족
  s=summarize([pb(30000),pb(35000),{...pb(40000),ok:false}],[nm(90000,25),nm(100000,30),nm(110000,28)]);assert.equal(s.p6,'미충족');
  // 지도를 읽지 않은 플레이북 표본이 있으면 미충족
  s=summarize([pb(30000),pb(35000),{...pb(40000),mapRead:false}],[nm(90000,25),nm(100000,30),nm(110000,28)]);assert.equal(s.p6,'미충족');assert.ok(s.reasons.some(r=>/지도를 읽지 않은/.test(r)));
  // 표본 3회 미만
  assert.equal(summarize([pb(1),pb(2)],[nm(9,9),nm(9,9),nm(9,9)]).p6,'미충족');
  // 시간 초과 표본은 실패·15분으로 세고 빼지 않는다 — 지도 없음 한 번이 시간 초과여도 중앙값 계산에 15분으로 들어간다
  const n=normalizeSample(nm(TIME_LIMIT_MS+5000,40));assert.deepEqual([n.ok,n.ms,n.timedOut],[false,TIME_LIMIT_MS,true]);
  s=summarize([pb(30000),pb(35000),pb(40000)],[nm(TIME_LIMIT_MS+1,40),nm(TIME_LIMIT_MS+1,40),nm(100000,30)]);
  assert.equal(s.nomap.medianMs,TIME_LIMIT_MS);assert.equal(s.nomap.success,1);assert.equal(s.p6,'충족');
});
