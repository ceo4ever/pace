import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [workspace, out] = process.argv.slice(2);
const base = path.join(out, 'requests'), cwd = path.join(base, 'repo'), home = path.join(base, 'pace-home');
const p = path.join(cwd, 'projects', fs.readdirSync(path.join(cwd,'projects')).find(s=>s.startsWith('P001_')), 'log.jsonl');
const env = {PATH:process.env.PATH,HOME:home,USERPROFILE:home,PACE_HOME:home,TMPDIR:out,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'};
const original = fs.readFileSync(p,'utf8');
const clean = original.trim().split('\n').filter(line=>JSON.parse(line).requestId!=='old-coordinator').join('\n')+'\n';
const checks=[];
for (const [label, input, observedTotal, boundary] of [['boundary',original,'미확인',1],['closed-clean',clean,'1',0]]) {
  try {
    fs.writeFileSync(p,input);
    fs.writeFileSync(path.join(out,label+'.display-input.jsonl'),input);
    const args = [path.join(workspace,'bin/pace.ts'),'project','stats','P001'];
    const {status,stdout,stderr} = spawnSync(process.execPath,args,{cwd,env,encoding:'utf8'});
    const result={exe:process.execPath,args,cwd,status,stdout,stderr};
    fs.writeFileSync(path.join(out,label+'.display.json'),JSON.stringify(result,null,2)+'\n');
    const totalLine=stdout.split('\n').find(l=>l.startsWith('요청 ID별:'))??'';
    const boundaryLine=stdout.split('\n').find(l=>l.startsWith('구간 밖 최초 요청의 구간 내 활동:'))??'';
    const expected=[0,true,true,boundary>0], observed=[status,totalLine.includes('/ 총량 '+observedTotal+' '),boundaryLine.includes(boundary+'건'),boundaryLine.includes('총량/방향 보류')];
    checks.push({name:'text-'+label,matched:JSON.stringify(expected)===JSON.stringify(observed),expected,observed,totalLine,boundaryLine});
  } finally { fs.writeFileSync(p,original); }
}
fs.writeFileSync(path.join(out,'text-results.json'),JSON.stringify(checks,null,2)+'\n');
console.log(JSON.stringify(checks,null,2));
