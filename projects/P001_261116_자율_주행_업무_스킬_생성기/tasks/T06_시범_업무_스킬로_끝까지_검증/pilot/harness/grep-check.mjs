// 커밋 전 식별 정보 grep(T06, 코디네이터 지시) — T06 폴더·skills/pace-playbook-maker·test/playbook에서
// 사용자 이름(원형·8.3 단축형·프로젝트 폴더 인코딩)·사례 저장소 금지어(비공개 목록)·절대 사용자 경로를 세고, 증거 기록의 URL 호스트 목록을 낸다. 출력은 개수·호스트뿐.
// 사용: node grep-check.mjs <출력 파일>
import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {join,resolve,dirname,relative,extname} from 'node:path';
import {homedir,userInfo} from 'node:os';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,'..','..','..','..','..','..');
const T06=resolve(here,'..','..');
const roots=[T06,join(ROOT,'skills','pace-playbook-maker'),join(ROOT,'test','playbook'),join(ROOT,'test','playbook-pilot-harness.test.ts')];
const walk=p=>statSync(p).isDirectory()?readdirSync(p).flatMap(n=>walk(join(p,n))):[p];
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const user=(()=>{try{return userInfo().username;}catch{return '';}})();
const [base,ext='']=user.toUpperCase().split(/\.(?=[^.]*$)/);const b=base.replace(/[^A-Z0-9]/g,'').slice(0,6),e=ext.replace(/[^A-Z0-9]/g,'').slice(0,3);
const banned=readFileSync(join(homedir(),'.pace-private','P001-banned.txt'),'utf8').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).map(s=>new RegExp(s,'gi'));
const checks=[
  ['사용자 이름(원형·단축형·인코딩)',[new RegExp(esc(user),'gi'),new RegExp(esc(`${b}~1${e?'.'+e:''}`),'gi'),new RegExp(esc(`${b}-1${e?'-'+e:''}`),'gi')]],
  ['사례 저장소·회사·사람 금지어(비공개 목록)',banned],
  ['절대 사용자 경로',[/(?<![A-Za-z])[A-Za-z]:[\\/]+Users[\\/]+(?!<)[A-Za-z0-9._-]+/g,/\/c\/Users\/(?!<)[A-Za-z0-9._-]+/g,new RegExp(esc(homedir()).replace(/\\\\/g,'[\\\\/]+'),'gi')]]
];
const files=roots.flatMap(walk).filter(f=>!/\.(jpe?g|png)$/i.test(f));
const lines=[];const say=s=>{lines.push(s);console.log(s);};let ok=true;
say(`대상: T06 폴더·skills/pace-playbook-maker·test/playbook·시험 래퍼 — 파일 ${files.length}개(이미지 제외)`);
// 시험의 합성 사용자 폴더 이름(x·someone·me)은 실제 경로가 아니다 — 따로 센다
const SYNTH=/[\\/](x|someone|me)$/i;
for(const [name,res] of checks){let n=0,synth=0;const fs=new Set();for(const f of files){const t=readFileSync(f,'utf8');for(const re of res){for(const m of t.matchAll(re)){if(SYNTH.test(m[0])){synth++;continue;}n++;fs.add(relative(ROOT,f).replace(/\\/g,'/'));}}}say(`${name}: ${n}건${synth?` (시험 합성 이름 x·someone·me ${synth}건 제외)`:''}${fs.size?' — '+[...fs].join(', '):''}`);if(n)ok=false;}
const hosts=new Map();for(const f of files.filter(f=>f.startsWith(join(T06,'evidence')))){for(const m of readFileSync(f,'utf8').matchAll(/https?:\/\/([A-Za-z0-9.-]+)(:\d+)?/g))hosts.set(m[1]+(m[2]||''),(hosts.get(m[1]+(m[2]||''))||0)+1);}
say(`증거의 URL 호스트: ${[...hosts].sort((a,b)=>b[1]-a[1]).map(([h,n])=>`${h} ${n}`).join(' · ')}`);
say('  (example.com·gitlab.example.com·linear.app는 orca --help 예시 글, claude.ai는 GitHub 저장소 README의 설치 명령 글, github.com은 업무 대상, x·127.0.0.1·app.example.test는 검토 대상 문서에 실은 코드·시험 글)');
say(`판정: ${ok?'식별 정보 0건':'식별 정보 있음'}`);
writeFileSync(resolve(process.argv[2]),lines.join('\n')+'\n');
process.exit(ok?0:1);
