// 두 군 조건 비교(T06 S-3) — 라운드별 세션 기록(.json)의 init 맥락(도구·스킬·MCP·권한 모드)·모델·CLI 버전·프로필 위반·거부·orca 밖 Bash가 두 군에 같은지,
// 플레이북 군이 지도 파일을 실제로 읽었는지 표로 낸다. 프롬프트 파일은 1라운드와 바이트 비교한다.
// 사용: node group-compare.mjs <출력 파일> <증거 폴더>
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
const [outFile,ev]=process.argv.slice(2);
const E=resolve(ev);
const rounds=[['1라운드',join(E,'sessions-round1','sessions')],['2라운드',join(E,'sessions-round2','sessions')],['3라운드',join(E,'sessions')]];
const labels=['p1','p2','p3','n1','n2','n3'];
const lines=[];const say=s=>{lines.push(s);console.log(s);};let ok=true;
const key=s=>JSON.stringify({tools:s.init.tools,model:s.init.model,permissionMode:s.init.permissionMode,slashCommands:s.init.slashCommands,skills:s.init.skills,mcpServers:s.init.mcpServers,claudeVersion:s.claudeVersion,model2:s.model});
for(const [name,dir] of rounds){
  const S=Object.fromEntries(labels.map(l=>[l,JSON.parse(readFileSync(join(dir,l+'.json'),'utf8'))]));
  const keys=new Set(labels.map(l=>key(S[l])));
  const s0=S.p1;
  say(`[${name}] init·모델·버전 같음(6세션): ${keys.size===1} — 모델 ${s0.model}(init ${s0.init.model}) · CLI ${s0.claudeVersion} · 도구 ${JSON.stringify(s0.init.tools)} · 권한 ${s0.init.permissionMode} · 스킬 ${JSON.stringify(s0.init.skills)} · MCP ${JSON.stringify(s0.init.mcpServers)}`);
  for(const l of labels){const s=S[l];say(`  ${l} ${s.mode} ${s.repo}: 정확 ${s.ok} · ${s.ms}ms · 호출 ${s.toolCalls}(${JSON.stringify(s.perTool)}) · orca 밖 Bash ${s.bashNonOrca}${s.bashNonOrca?JSON.stringify(s.bashNonOrcaWords):''} · 거부 ${s.permissionDenials} · 프로필 위반 ${s.profileViolation} · 시간 초과 ${s.timedOut}${s.mode==='playbook'?` · 지도 읽음 ${s.mapRead}(파일 ${s.mapReadFiles}개 ${s.mapBytes}B)`:''}`);}
  if(keys.size!==1)ok=false;
  if(['p1','p2','p3'].some(l=>!S[l].mapRead))ok=false;
  if(labels.some(l=>S[l].profileViolation))ok=false;
  // 프롬프트: 1라운드와 바이트 같음
  if(name!=='1라운드'){const same=labels.every(l=>readFileSync(join(dir,l+'.prompt.txt')).equals(readFileSync(join(rounds[0][1],l+'.prompt.txt'))));say(`  프롬프트 6개 1라운드와 바이트 동일: ${same}`);if(!same)ok=false;}
}
say(`판정: ${ok?'두 군 조건 같음·플레이북 군 지도 읽음·프로필 위반 0':'조건 차이 있음'}`);
writeFileSync(resolve(outFile),lines.join('\n')+'\n');
process.exit(ok?0:1);
