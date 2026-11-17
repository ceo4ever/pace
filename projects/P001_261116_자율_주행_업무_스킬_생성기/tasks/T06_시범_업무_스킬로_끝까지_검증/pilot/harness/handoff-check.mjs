// 인계 문서 검사(T06 S-7, T-7) — 저장소 밖 인계 문서의 변경 위치 `file:line`이 사례 저장소 작업 사본에 실재하는지(1절 import 9곳은 그 줄이 코어 import인지),
// 검사 명령이 있는지, PACE 추적 파일(이 태스크 폴더·docs·브레인·스킬·메모리)에 사례 저장소 금지어가 0인지 본다. 출력은 비식별 — 개수·종류만.
// 사용: node handoff-check.mjs <출력 파일>
import {readFileSync,readdirSync,existsSync,writeFileSync,statSync} from 'node:fs';
import {join,resolve,dirname,extname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');
const PRIV=join(homedir(),'.pace-private');
const priv=readFileSync(join(PRIV,'P001-case.md'),'utf8');
const REPO=/사례 저장소 경로:\s*(.+)/.exec(priv)[1].trim();
const doc=readFileSync(join(PRIV,'HANDOFF_P001_to_case.md'),'utf8');
const lines=[];const say=s=>{lines.push(s);console.log(s);};
let ok=true;
say(`인계 문서: ~/.pace-private/ 아래 있음(${doc.length}자) · 사례 저장소 작업 사본 git status ${execFileSync('git',['-C',REPO,'status','--porcelain'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).length}줄`);
// 1절 표의 import 9곳
const sec1=doc.split('## 2.')[0];
const imports=[...sec1.matchAll(/^\|\s*\d+\s*\|\s*`([^`]+):(\d+)`/gm)].map(m=>({file:m[1],line:+m[2]}));
let real=0;
for(const x of imports){
  const p=join(REPO,x.file);
  const l=existsSync(p)?readFileSync(p,'utf8').split(/\r?\n/)[x.line-1]||'':'';
  if(/^import .*(capture-core|dom-stub)\.mjs/.test(l))real++;else say(`  위치 불일치: 1절 ${imports.indexOf(x)+1}번`);
}
say(`1절 코어 import 위치 ${imports.length}곳 중 실재(그 줄이 코어 import) ${real}곳`);
if(imports.length!==9||real!==9)ok=false;
// 문서 전체의 다른 file:line(4절 등)도 줄이 있는지
const others=[...doc.matchAll(/`(\.?[\w./-]+\.(?:md|mjs)):(\d+)(?:[·,]\d+)*`/g)].map(m=>({file:m[1],line:+m[2]})).filter(x=>!imports.some(i=>i.file===x.file&&i.line===x.line));
const otherReal=others.filter(x=>{const p=join(REPO,x.file);return existsSync(p)&&readFileSync(p,'utf8').split(/\r?\n/).length>=x.line;}).length;
say(`그 밖의 변경 위치 ${others.length}곳 중 실재 ${otherReal}곳`);
if(otherReal!==others.length)ok=false;
// 검사 명령
const cmds=[['npm test',/npm test/g],['compare-identity',/compare-identity/g],['git status',/git status/g],['해시 비교(sha256sum)',/sha256sum/g],['import grep',/grep -rn/g]];
const cmdRes=cmds.map(([n,re])=>[n,(doc.match(re)||[]).length]);
say(`검사 명령: ${cmdRes.map(([n,c])=>`${n} ${c}`).join(' · ')}`);
if(cmdRes.some(([,c])=>c===0))ok=false;
// 추적 파일 비식별: 금지어(줄마다 정규식) — 이 프로젝트가 main 대비 더하거나 바꾼 파일 전부(커밋·작업 중·새 파일). main에 이미 있던 내용은 이 프로젝트 범위 밖이다
const banned=readFileSync(join(PRIV,'P001-banned.txt'),'utf8').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).map(s=>new RegExp(s,'i'));
const g=(...a)=>execFileSync('git',['-C',ROOT,...a],{encoding:'utf8'}).split('\n').filter(Boolean);
// 검사 대상은 이 프로젝트가 더한 글자다: 새 파일은 전체, 기존 파일은 분기점 대비 더한 줄(+)만 — 다시 생성한 목차의 기존 줄은 main에 이미 있던 내용이다
const base=g('merge-base','main','HEAD')[0];
const changed=g('-c','core.quotepath=false','diff','--name-only',base).filter(f=>!/\.(jpe?g|png)$/i.test(f));
const untracked=g('-c','core.quotepath=false','ls-files','--others','--exclude-standard').filter(f=>!/\.(jpe?g|png)$/i.test(f));
const tracked=[...new Set([...changed,...untracked])];
const addedText=f=>{
  if(untracked.includes(f)||!g('-c','core.quotepath=false','ls-tree','--name-only',base,'--',f).length)return readFileSync(join(ROOT,f),'utf8');
  return execFileSync('git',['-C',ROOT,'-c','core.quotepath=false','diff','-U0',base,'--',f],{encoding:'utf8'}).split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++')).map(l=>l.slice(1)).join('\n');
};
let hits=0;const hitFiles=new Set();
for(const f of tracked){const p=join(ROOT,f);if(!existsSync(p)||statSync(p).isDirectory())continue;const t=addedText(f);for(const re of banned)if(re.test(t)){hits++;hitFiles.add(f);}}
say(`main 분기점 대비 바뀐·새 파일 ${tracked.length}개(새 파일 전체·기존 파일은 더한 줄) × 금지어 ${banned.length}개 — 일치 ${hits}건${hitFiles.size?' (파일 '+hitFiles.size+'개 — 아래)':''}`);
for(const f of hitFiles)say(`  금지어 일치: ${f}`);
if(hits)ok=false;
say(`판정: ${ok?'통과':'실패'}`);
writeFileSync(resolve(process.argv[2]),lines.join('\n')+'\n');
process.exit(ok?0:1);
