// stream-json 이벤트 해석(T06) — 도구 호출 수·화면 탐색·읽은 지도 분량·지도 사용 여부·프로필 사용 위반·최종 출력(RESULT 줄)을 뽑는다. 세션 실행과 분리해 합성 이벤트로 시험한다.
const EXPLORE=new Set(['snapshot','screenshot','eval','find','get','read','html','text','dom']);
const inWork=p=>String(p||'').replace(/\\/g,'/').toLowerCase().replace(/^\/([a-z])\//,'$1:/');
// orca 하위 명령 이름(앞쪽 옵션은 건너뛴다)
export const orcaSub=cmd=>{const m=/(?:^|[\s;&|(])orca(?:\.exe)?\s+((?:--?[\w-]+(?:\s+[^\s-][^\s]*)?\s+)*)([a-z][\w-]*)(?:\s+([a-z][\w-]*))?/.exec(String(cmd));return m?{sub:m[2],sub2:m[3]||''}:{sub:'',sub2:''};};

// events: 파싱한 stream-json 줄들. work: 격리 작업 폴더 경로. skill: 플레이북 폴더 이름. profile: 허용한 게스트 프로필 id.
export function analyze({events,work,skill,profile,mapFiles=[]}){
  const init=events.find(e=>e.type==='system'&&e.subtype==='init')||{};
  const resultEv=[...events].reverse().find(e=>e.type==='result')||{};
  const uses=[];
  for(const e of events)if(e.type==='assistant'&&e.message&&Array.isArray(e.message.content))for(const c of e.message.content)if(c.type==='tool_use')uses.push(c);
  const perTool={};for(const u of uses)perTool[u.name]=(perTool[u.name]||0)+1;
  const orcaCalls=uses.filter(u=>u.name==='Bash'&&/(^|[\s;&|(])orca(\.exe)?\s/.test(String(u.input&&u.input.command)));
  // orca가 아닌 Bash 명령(cat·find 같은 읽기 전용은 도구가 자체 허용한다 — 두 군에 같다): 감사용으로 첫 낱말 집계를 남긴다
  const nonOrca=uses.filter(u=>u.name==='Bash'&&!/(^|[\s;&|(])orca(\.exe)?\s/.test(String(u.input&&u.input.command)));
  const nonOrcaWords={};for(const u of nonOrca){const w=String(u.input&&u.input.command).trim().split(/[\s;&|]+/)[0]||'';nonOrcaWords[w]=(nonOrcaWords[w]||0)+1;}
  const screenExplorations=orcaCalls.filter(u=>EXPLORE.has(orcaSub(u.input.command).sub)).length;
  const tabCreates=orcaCalls.filter(u=>{const s=orcaSub(u.input.command);return s.sub==='tab'&&s.sub2==='create';});
  // 모든 `orca tab create`가 게스트 프로필(--profile <id>)을 써야 한다 — 하나라도 아니면 로그인 상태 탭이 열렸을 수 있다(무효 표본)
  const profileViolation=!!profile&&tabCreates.some(u=>!new RegExp('--profile[ =]'+String(profile).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(String(u.input.command)));
  // 지도를 Read로 읽든 Bash(cat 등)로 읽든 같다 — 모든 도구 입력에서 지도 파일 참조를 센다
  const reads=uses.filter(u=>u.name==='Read').map(u=>inWork(u.input&&(u.input.file_path||u.input.path)));
  const inputs=uses.map(u=>inWork(u.name==='Bash'?u.input&&u.input.command:(u.input&&(u.input.file_path||u.input.path))||'')).join('\n');
  const key=rel=>{const parts=rel.replace(/\\/g,'/').split('/');return (parts.length>1&&/^agent$/.test(parts[parts.length-2])?parts.slice(-2).join('/'):parts[parts.length-1]).toLowerCase();};
  const mapReads=mapFiles.filter(rel=>inputs.includes(key(rel)));
  const mapRead=/agent\/index\.json/.test(inputs)&&/agent\/s\d+\.json/.test(inputs);
  const text=String(resultEv.result||'');
  let output=null;const m=/RESULT\s+(\{.*\})\s*$/m.exec(text);
  if(m){try{output=JSON.parse(m[1]);}catch{output=null;}}
  return {init:{tools:init.tools||null,model:init.model||null,permissionMode:init.permissionMode||null,slashCommands:(init.slash_commands||[]).length,skills:init.skills||null,mcpServers:init.mcp_servers||null,memoryPaths:init.memory_paths||null},
    toolCalls:uses.length,perTool,bashNonOrca:nonOrca.length,bashNonOrcaWords:nonOrcaWords,orcaCalls:orcaCalls.length,tabCreates:tabCreates.length,profileViolation,screenExplorations,
    permissionDenials:events.filter(e=>e.type==='system'&&e.subtype==='permission_denied').length,
    readPaths:reads,mapReadPaths:mapReads,mapRead,output,numTurns:resultEv.num_turns??null,isError:resultEv.is_error===true,resultText:text};
}
