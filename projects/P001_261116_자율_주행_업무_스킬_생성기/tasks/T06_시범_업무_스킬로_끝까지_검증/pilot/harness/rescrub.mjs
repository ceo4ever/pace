// 이미 저장한 측정·공존 세션 기록 다시 가리기(T06 유출 검사 보완) — scrub.mjs의 보강 규칙(단축 사용자 이름·프로젝트 폴더 인코딩·orca tab list 결과)을
// 증거 폴더의 세션 기록(.stream.jsonl·세션 .json)에 적용한다. 내용(지표·판정)은 바꾸지 않는다 — 가림 전후 JSON 구조·판정 필드가 같은지 확인한다.
// 사용: node rescrub.mjs <증거 폴더>
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {scrubText,scrubStreamLines} from './scrub.mjs';
const root=resolve(process.argv[2]);
const walk=d=>readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?walk(p):[p];});
let files=0,changed=0,tabs=0;
for(const f of walk(root)){
  const isStream=f.endsWith('.stream.jsonl'),isJson=/[\\/][pn]\d\.json$|coexist-session\.json$/.test(f);
  if(!isStream&&!isJson)continue;
  files++;
  const before=readFileSync(f,'utf8');let after;
  if(isStream){const r=scrubStreamLines(before.split('\n'));tabs+=r.redacted;after=scrubText(r.lines.join('\n'));}
  else{
    after=scrubText(before);
    const a=JSON.parse(before),b=JSON.parse(after);   // 판정·지표 필드는 그대로여야 한다
    for(const k of ['ok','ms','toolCalls','screenExplorations','mapBytes','mapRead','judge','output','verdict'])if(JSON.stringify(a[k])!==JSON.stringify(b[k]))throw new Error(relative(root,f)+': 가림이 판정 필드 '+k+'를 바꿨다');
  }
  if(after!==before){writeFileSync(f,after);changed++;}
}
console.log(JSON.stringify({files,changed,tabListResultsRedacted:tabs}));
