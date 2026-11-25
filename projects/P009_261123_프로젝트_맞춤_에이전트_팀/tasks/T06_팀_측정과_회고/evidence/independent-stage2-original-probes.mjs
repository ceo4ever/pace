import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join as j } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const [source, temp] = process.argv.slice(2);
const home = j(temp,"home");
const cwd = j(temp,"probe-repo");
mkdirSync(cwd);
const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, PACE_HOME: home, PACE_SKIP_BROWSER_E2E: "1", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_NO_LAZY_FETCH: "1" };
function cmd(bin, args, code=0) {
  const r=spawnSync(bin,args,{cwd,env,encoding:"utf8"});
  assert.equal(r.status,code,r.stdout+r.stderr);
  return r;
}
const pace=(...args)=>cmd(process.execPath,[j(source,"bin/pace.ts"),"project",...args]).stdout;
const hash=(s)=>createHash("sha256").update(s).digest("hex");
cmd("git",["init","-q","-b","main"]);
cmd("git",["-c","user.name=T06 Synthetic","-c","user.email=t06@example.invalid","commit","--allow-empty","-qm","fixture"]);
pace("new","synthetic-independent");
const rel = "projects/"+readdirSync(j(cwd,"projects")).find((x)=>x.startsWith("P001_"));
const dir=j(cwd,rel);
const file=(f,v)=>writeFileSync(j(dir,f),typeof v==="string"?v:JSON.stringify(v));
const base=readFileSync(j(dir,"PROJECT.md"),"utf8");
file("log.jsonl","");
const stat=()=>JSON.parse(pace("stats","P001","--json"));
const probes=[];
const check=(id,expected,observed,pass)=>probes.push({id,expected,observed,pass});
for (const [context,example] of [["fence","~~~md\n- 팀 측정: v1\n~~~"],["html-pre","<pre>\n- 팀 측정: v1\n</pre>"]]) {
  file("PROJECT.md",base.replace(/^(#[^\n]+\n)/,`$1\n${example}\n\n`));
  const { teamRetrospectiveRequired }=await import(pathToFileURL(j(source,"src/project/team-retrospective.ts")));
  const got={statsTeam:!!stat().team,finishRequires:teamRetrospectiveRequired(cwd,rel)};
  check(context,{statsTeam:false,finishRequires:false},got,!got.statsTeam&&!got.finishRequires);
}
file("PROJECT.md",base);
const mkPeriod=(i)=>({start:new Date(Date.UTC(2026,0,2*i+1)).toISOString(),end:new Date(Date.UTC(2026,0,2*i+2)).toISOString(),unit:"representative-task",closed:true,completionRef:`frame-${i}.json`});
const frames=Array.from({length:4},(_,i)=>mkPeriod(i));
function coverage(frame,id) {
  const {start,end,unit,completionRef}=frame;
  file(completionRef,{version:1,kind:"team-evidence",sourceRef:"fixture:synthetic",hash:hash(completionRef),period:{start,end,unit},...(id?{requestId:id}:{})});
  return {status:"complete",reportedBy:"agent:maker",verifiedBy:"coordinator",confirmationRef:completionRef,refs:[completionRef]};
}
const context=(after)=>({study:"team-adoption",conditionCode:after?"team":"no-team",definition:"reach-v1",unit:"representative-task",workType:"feature",sizeBand:"small",host:"codex",sampleCount:1,recordingBoundary:"closed-task",qualitySource:"event-log",qualityScopeHash:hash("same-audit")});
const event=(frame,type,by,seconds,fields={})=>({ts:new Date(Date.parse(frame.start)+seconds*1000).toISOString(),p:"P001",type,by,msg:"synthetic "+type,...fields});
function logs(rows){file("log.jsonl",rows.map(r=>JSON.stringify(r)).join("\n"))}
const editCounts=(after)=>({captain_manual_role_corrections:0,captain_file_edits:after?1:2,captain_command_runs:0,coordinator_extra_instructions:0});
function statFrame(frame,after,opts={}) {
  const c=coverage(frame,opts.requestId);
  const counts=editCounts(after);
  file("TEAM-MEASUREMENT.json",{version:1,period:frame,comparison:context(after),request_coverage:c,counts,coverage:Object.fromEntries(Object.keys(counts).map(k=>[k,c])),quality_audit:{blocking_sum:0,rereviews_after_fail:0,coverage:c},...(opts.requestId?{coordinator_answers:[{requestId:opts.requestId,coverage:c}]}:{})});
  return stat().team;
}
function compare(before,after) {
  file("before.json",{version:1,samples:before});file("after.json",{version:1,samples:after});
  const r=JSON.parse(pace("compare-team","--before",j(dir,"before.json"),"--after",j(dir,"after.json"),"--kind","team-adoption","--json"));
  return {conclusion:r.conclusion,reasons:r.reasons,blocking:r.rows.find(x=>x.metric==="blocking_sum").delta,gate:r.rows.find(x=>x.metric==="gate_failures").delta,fileEdits:r.rows.find(x=>x.metric==="captain_file_edits").delta};
}
logs([]);
const chronological=compare(frames.slice(0,2).map(f=>statFrame(f,false).snapshot),frames.slice(2).map(f=>statFrame(f,true).snapshot));
check("chronological-control","observed-burden-improvement",chronological,chronological.conclusion==="observed-burden-improvement");
const reversed=compare(frames.slice(2).map(f=>statFrame(f,false).snapshot),frames.slice(0,2).map(f=>statFrame(f,true).snapshot));
check("reversed-periods","unknown",reversed,reversed.conclusion==="unknown");
const failText="reviewer fail blocking 2 should_fix 1", valid=(blocking)=>({blocking,should_fix:0,reviewer:1,tester:0,pass:blocking?0:1,fail:blocking?1:0});
logs(frames.slice(2).map(f=>event(f,"review","agent",1,{msg:failText})));
const missingReview=compare(frames.slice(0,2).map(f=>statFrame(f,false).snapshot),frames.slice(2).map(f=>statFrame(f,true).snapshot));
check("missing-review-control","unknown",missingReview,missingReview.conclusion==="unknown");
logs(frames.map((f,i)=>event(f,"review","agent",1,{msg:i<2?"reviewer pass blocking 0 should_fix 0":failText,data:valid(0)})));
const contradict=compare(frames.slice(0,2).map(f=>statFrame(f,false).snapshot),frames.slice(2).map(f=>statFrame(f,true).snapshot));
check("contradictory-review","unknown",contradict,contradict.conclusion==="unknown");
const req="answer-order";
for(const reverse of [false,true]){
  logs([event(frames[2],"question","agent",reverse?2:1,{to:"coordinator",requestId:req}),event(frames[2],"answer","coordinator",reverse?1:2,{requestId:req})]);
  const q=statFrame(frames[2],true,{requestId:req}).requests;
  check("own-answer-"+(reverse?"earlier":"later"),reverse?{total:null,unconfirmed:1}:{total:0,unconfirmed:0},{total:q.reachedTotal,unconfirmed:q.comparisonUnconfirmed},reverse?q.reachedTotal===null&&q.comparisonUnconfirmed===1:q.reachedTotal===0&&q.comparisonUnconfirmed===0);
}
console.log(JSON.stringify(probes,null,2));
