// 측정 판정기·집계(T06) — 정답 묶음과 세션 출력(표)을 대조해 다섯 필드가 맞는지 판정하고 지표를 모아 중앙값으로 P-6을 판정한다.
// 정답 묶음 = {branch, stars, sha7, title, date(UTC YYYY-MM-DD)} — truth.mjs가 세션 시작 직전·끝난 직후 두 번 가져온다(시각 붙임).
// 측정 규칙(TASK 설계 결정): 시간 제한 15분(넘으면 실패·시간 15분), 실패·시간 초과 표본도 중앙값에서 빼지 않는다.
export const FIELDS=['branch','stars','sha7','title','date'];
export const TIME_LIMIT_MS=15*60*1000;

// "12.3k"·"124k"·"1,234"·"1.2m" 같은 표기를 [하한, 상한] 범위로 푼다 — 표기 반올림이 가리는 구간
export function starRange(text){
  const m=/^\s*([\d][\d,]*(?:\.\d+)?)\s*([kKmM]?)\s*$/.exec(String(text??''));
  if(!m)return null;
  const num=parseFloat(m[1].replace(/,/g,'')),mult={'':1,k:1e3,m:1e6}[m[2].toLowerCase()];
  if(!mult||!Number.isFinite(num))return null;
  if(mult===1)return [num,num];
  const decimals=(m[1].split('.')[1]||'').length,half=0.5*Math.pow(10,-decimals)*mult;
  return [num*mult-half,num*mult+half];
}
const norm=s=>String(s??'').replace(/\s+/g,' ').trim();
const asDate=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s??''));return m?`${m[1]}-${m[2]}-${m[3]}`:null;};

// 필드 비교. 날짜는 UTC 일 단위, 나머지는 공백 정리 뒤 대소문자 무시.
const fieldOk=(out,f,truth)=>f==='date'?[truth.date,truth.dateAlt].filter(Boolean).some(d=>asDate(out&&out.date)===asDate(d)):norm(out&&out[f]).toLowerCase()===norm(truth[f]).toLowerCase();
const BUNDLE=['branch','sha7','title','date'];
// 별 개수는 따로 두 시점 범위를 모두 허용한다(표기 반올림 범위 안).
function starsMatch(out,truths){
  const r=starRange(out&&out.stars);if(!r)return false;
  return truths.some(t=>t.stars>=Math.floor(r[0])&&t.stars<=Math.ceil(r[1]));
}
// out: 세션이 낸 표를 읽은 {branch,stars,sha7,title,date}. truthStart·truthEnd: 정답 묶음.
// 브랜치·해시·제목·날짜는 시작 묶음 또는 끝 묶음 중 하나와 **통째로** 일치해야 한다 — 필드마다 두 시점을 섞은 조합은 존재하지 않는 커밋이다.
export function judge(out,truthStart,truthEnd=truthStart){
  const bundles=[truthStart,truthEnd];
  const whole=bundles.some(b=>BUNDLE.every(f=>fieldOk(out,f,b)));
  const per=Object.fromEntries(BUNDLE.map(f=>[f,bundles.some(b=>fieldOk(out,f,b))]));
  const stars=starsMatch(out,bundles);
  return {ok:whole&&stars,fields:{...per,stars},whole,mixed:!whole&&BUNDLE.every(f=>per[f]),
    missing:FIELDS.filter(f=>out==null||out[f]==null||String(out[f]).trim()==='')};
}

export const median=xs=>{const a=[...xs].sort((p,q)=>p-q);const n=a.length;if(!n)return null;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;};
// 표본: {ok, ms, toolCalls, screenExplorations, mapBytes, mapRead(플레이북 군만)}. 시간 초과는 ok:false·ms=TIME_LIMIT_MS로 센다.
export function normalizeSample(s){
  const timedOut=s.ms>TIME_LIMIT_MS||s.timedOut===true;
  return {...s,ok:!timedOut&&s.ok===true,ms:timedOut?TIME_LIMIT_MS:s.ms,timedOut};
}
export function summarize(playbook,nomap){
  const a=playbook.map(normalizeSample),b=nomap.map(normalizeSample);
  const stat=xs=>({n:xs.length,success:xs.filter(x=>x.ok).length,medianMs:median(xs.map(x=>x.ms)),medianToolCalls:median(xs.map(x=>x.toolCalls)),medianExplore:median(xs.map(x=>x.screenExplorations)),medianMapBytes:median(xs.map(x=>x.mapBytes??0))});
  const A=stat(a),B=stat(b);
  const mapUsed=a.every(x=>x.mapRead===true);
  const p6=a.length>=3&&b.length>=3&&A.success===a.length&&mapUsed&&A.medianMs<B.medianMs&&A.medianToolCalls<B.medianToolCalls;
  return {playbook:A,nomap:B,mapUsedInAllPlaybookSamples:mapUsed,p6:p6?'충족':'미충족',
    reasons:[A.success!==a.length&&'플레이북 표본 중 실패 있음',!mapUsed&&'지도를 읽지 않은 플레이북 표본 있음',!(A.medianMs<B.medianMs)&&'플레이북 시간 중앙값이 지도 없음보다 작지 않음',!(A.medianToolCalls<B.medianToolCalls)&&'플레이북 도구 호출 중앙값이 지도 없음보다 작지 않음',(a.length<3||b.length<3)&&'표본 3회 미만'].filter(Boolean)};
}
