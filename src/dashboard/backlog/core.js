(() => {
'use strict';
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safePath = p => /^(backlogs|projects)\//.test(p) && !p.split('/').some(x=>!x || x==='.' || x==='..' || x.startsWith('.') || /^(node_modules)$/i.test(x) || /\.local\./i.test(x)) && !/^backlogs\/(?:backup\/)?[^/]+\/sources(?:\/|$)/i.test(p) && !/(secret|credential|token|private|\.env)/i.test(p);
const resolvePath = (base, rel) => { try { const u=new URL(rel, 'https://local.invalid/'+base); if(u.origin!=='https://local.invalid')return null; const p=decodeURIComponent(u.pathname.slice(1)); return safePath(p)?p:null; }catch{return null} };

const backlogFilters = ['대기','진행','완료','보류','기타','전체'];
const backlogLabel = value => value==='대기'?'발의':value;
function implementationStatus(states,linked){const unique=[...new Set(states)];return unique.length===1?unique[0]:unique.length?'상태 혼합':linked?'작업 미지정':'미연결';}
const status = txt => { const value=(String(txt || '').match(/^-\s*상태:\s*(.*?)\s*$/m)||[])[1]||'';return (value.match(/^(진행|대기|보류|완료)(?:\s*[(（—-].*)?$/)||[])[1]||'기타'; };
function progressRows(text){const section=(String(text||'').match(/^## 진행 현황[\s\S]*?(?=^## |(?![\s\S]))/m)||[])[0]||'';const lines=section.split('\n').filter(x=>/^\s*\|/.test(x)).map(x=>x.split('|').slice(1,-1).map(c=>c.trim()));const header=lines.findIndex(row=>row.some(c=>c.includes('브리프'))&&row.some(c=>c.includes('프로젝트')));if(header<0)return [];const briefs=lines[header].findIndex(c=>c.includes('브리프')), projects=lines[header].findIndex(c=>c.includes('프로젝트'));return lines.slice(header+1).map(row=>({brief:(row[briefs]||'').match(/BR(\d+)/i)?.[1],project:row[projects]||''})).filter(row=>row.brief);}
function briefPaths(catalog,root){const dir=root.slice(0,root.lastIndexOf('/'));return catalog.filter(p=>p.startsWith(dir+'/')&&p.slice(dir.length+1).indexOf('/')===-1&&/^BR\d+.*\.md$/i.test(p.slice(dir.length+1)));}
function backlogPaths(files){return Object.keys(files).filter(p=>/^backlogs\/(?:backup\/)?BL[^/]+\/BACKLOG\.md$/.test(p));}
function backlogId(path){return (path.split('/').at(-2)||'').split('_').slice(0,2).join('_');}
function projectId(path){return (path.match(/^projects\/(?:[^/]+\/)*(P\d{3})[^/]*(?:\/|$)/)||[])[1]||'';}
function projectRoot(files,root){
 const field=String(files[root]||'').match(/^-\s*프로젝트 기준 경로:\s*([^\r\n]*)/m);
 if(!field)return 'projects/';
 const value=field[1].trim().replace(/^`(.*)`$/,'$1').replace(/\/+$/,'');
 return /^projects(?:\/[^/]+)*$/.test(value)&&safePath(value+'/PROJECT.md')?value+'/':null;
}
function projectsFor(files,root){
 const parent=projectRoot(files,root);if(!parent)return [];
 const id=root.split('/').at(-2),ids=new Set();
 for(const row of progressRows(files[root]))for(const m of row.project.matchAll(/P\d{3}/g))ids.add(m[0]);
 return Object.keys(files).filter(p=>{
  if(!p.startsWith(parent)||!/^P\d{3}[^/]*\/PROJECT\.md$/.test(p.slice(parent.length)))return false;
  const origin=(files[p].match(/^-\s*출처:\s*(.*)$/m)||[])[1]||'';
  return ids.has(projectId(p))||origin.includes(id);
 });
}
function resolveDocumentPath(files,base,rel,backlog){
 const candidates=[resolvePath(base,rel)];
 const legacy=base.replace(/^(backlogs|projects)\/backup\//,'$1/');
 if(legacy!==base)candidates.push(resolvePath(legacy,rel));
 for(const path of candidates){
  if(!path)continue;
  const project=path.match(/^projects\/(P\d{3}[^/]*)(\/.*)$/);
  const parent=projectRoot(files,backlog);
  if(project&&parent){const moved=parent+project[1]+project[2];if(Object.hasOwn(files,moved))return moved;}
  if(Object.hasOwn(files,path))return path;
  const old=path.match(/^backlogs\/(BL[^/]+)\/(.*)$/);
  if(old){const root=backlogPaths(files).find(p=>p.split('/').at(-2)===old[1]);if(root){const moved=root.slice(0,root.lastIndexOf('/')+1)+old[2];if(Object.hasOwn(files,moved))return moved;}}
 }
 return candidates.find(Boolean)||null;
}
function projectsForBrief(files,root,brief){const n=(brief.match(/BR(\d+)/i)||[])[1],row=progressRows(files[root]).find(r=>r.brief===n);return row?[...new Set([...row.project.matchAll(/P\d{3}/g)].map(m=>m[0]))]:[];}
function tasksForBrief(files,root,brief,related){const n=(brief.match(/BR(\d+)/i)||[])[1],row=progressRows(files[root]).find(r=>r.brief===n);if(!row)return [];const parent=projectRoot(files,root);if(!parent)return [];const pairs=[...row.project.matchAll(/(P\d{3})(?:\s*\/\s*(T\d+))?/g)];return related.filter(path=>{if(!path.startsWith(parent))return false;const m=path.slice(parent.length).match(/^(P\d{3})[^/]*\/tasks\/(T\d+)_.*\/(?:TASK|README)\.md$/);if(!m)return false;return pairs.some(pair=>pair[1]===m[1]&&(pair[2]?pair[2]===m[2]:pairs.length===1&&m[2]==='T'+n));});}
function humanName(value){return String(value||'').replace(/\.(md|jsonl|html?)$/i,'').replace(/_/g,' ').replace(/^(?:BL\d{6}\s*\d{2}|BR\d+|P\d{3}(?:\s+\d{6})?|T\d+)\s*/i,'').replace(/\s*[—–]\s*개요와 진행 현황$/,'').trim();}
function taskStatus(files,path){const project=path.replace(/\/tasks\/.*/, '/PROJECT.md'),task=(path.match(/\/tasks\/(T\d+)/)||[])[1];const row=(files[project]||'').split('\n').find(line=>new RegExp('^\\|\\s*'+task+'\\s*\\|').test(line));if(row){const value=row.split('|').map(x=>x.trim()).find(x=>['진행','대기','보류','완료'].includes(x));if(value)return value}return status(files[path])}
function selectedSections(text){const sections=String(text||'').split(/(?=^##\s+)/m);return sections.filter(s=>/^##\s*(?:목표|목적|범위|완료 기준|기준)(?:\s|$)/.test(s)).join('\n');}
function treeFor(paths,root){const node={children:new Map(),files:[]};for(const path of paths){if(!path.startsWith(root+'/'))continue;const parts=path.slice(root.length+1).split('/');let current=node;for(const part of parts.slice(0,-1)){if(!current.children.has(part))current.children.set(part,{children:new Map(),files:[]});current=current.children.get(part)}current.files.push(path)}return node;}
const isCompactHeader = text => /^(#|id|유형|검증 기준|기준|상태|선행|프로젝트|날짜)$/i.test(String(text).trim());
const isCompactValue = value => {const text=String(value).trim();return text.length<=12&&!/\s/.test(text)};
const clampColumnWidth = value => Math.max(72,Math.min(1200,value));
function eventsFor(files, paths) {const events=[];for(const p of paths.filter(p=>p.endsWith('.jsonl') && Object.hasOwn(files,p)))for(const [i,line] of files[p].split('\n').entries()){if(!line.trim())continue;try{const e=JSON.parse(line);if(!e||typeof e!=='object'||Array.isArray(e)||typeof e.ts!=='string'||Number.isNaN(Date.parse(e.ts)))throw Error();events.push({time:e.ts,text:`${String(e.type||'사건')} · ${String(e.msg||'')}`,context:`${String(e.p||'')} ${String(e.t||'')}`.trim(),p})}catch{events.push({time:'',text:`파싱 또는 형식 오류 · ${i+1}행`,context:'',p})}}return events.sort((a,b)=>b.time.localeCompare(a.time));}
function inline(s,base, imageFor = () => null,pathFor=resolvePath){let out='', last=0; const re=/(!?)\[([^\]]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)|`([^`]+)`|\*\*([^*]+)\*\*/g; for(const m of s.matchAll(re)){out+=esc(s.slice(last,m.index)); if(m[4])out+=`<code>${esc(m[4])}</code>`;else if(m[5])out+=`<strong>${esc(m[5])}</strong>`;else {const dest=m[3];const p=pathFor(base,dest);if(p){if(m[1] && imageFor(p)){out+=`<a href="#" data-file="${esc(p)}"><img src="${esc(imageFor(p))}" alt="${esc(m[2])}"></a>`}else out+=`<a href="#" data-file="${esc(p)}">${m[1]?'이미지: ':''}${esc(m[2])}</a>`;}else if(/^https?:\/\//i.test(dest)){try{const u=new URL(dest);out+=`<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(m[2])}</a>`}catch{out+=esc(m[2])}}else out+=esc(m[2]);}last=m.index+m[0].length;}return out+esc(s.slice(last));}
function markdown(text,base,imageFor = () => null,pathFor=resolvePath){const lines=text.replace(/\r/g,'').split('\n');let out='',code=false, list=false, table=false;const close=()=>{if(list){out+='</ul>';list=false}if(table){out+='</tbody></table></div></div>';table=false}};for(const line of lines){if(/^```/.test(line)){close();out+=code?'</code></pre>':'<pre><code>';code=!code;continue}if(code){out+=esc(line)+'\n';continue}if(/^\s*\|/.test(line)){if(/^\s*\|[\s:|\-]+\|?\s*$/.test(line))continue;if(list){out+='</ul>';list=false}const cells=line.trim().replace(/^\||\|$/g,'').split('|');if(!table){out+='<div class="table-frame"><div class="table-scroll"><table><thead><tr>'+cells.map(c=>`<th scope="col">${inline(c.trim(),base,imageFor,pathFor)}</th>`).join('')+'</tr></thead><tbody>';table=true}else out+='<tr>'+cells.map(c=>`<td>${inline(c.trim(),base,imageFor,pathFor)}</td>`).join('')+'</tr>';continue}if(table){out+='</tbody></table></div></div>';table=false}const li=line.match(/^\s*[-*]\s+(.*)/);if(li){if(!list){out+='<ul>';list=true}const check=li[1].match(/^\[([ xX])\]\s*(.*)$/);out+=check?`<li><input type="checkbox" disabled ${check[1].toLowerCase()==='x'?'checked':''}> ${inline(check[2],base,imageFor,pathFor)}</li>`:`<li>${inline(li[1],base,imageFor,pathFor)}</li>`;continue}if(list){out+='</ul>';list=false}const h=line.match(/^(#{1,6})\s+(.+)/);if(h)out+=`<h${h[1].length}>${inline(h[2],base,imageFor,pathFor)}</h${h[1].length}>`;else if(line.trim())out+=`<p>${inline(line,base,imageFor,pathFor)}</p>`;}close();if(code)out+='</code></pre>';return out;}

globalThis.dashboardCore={backlogPaths,backlogId,projectId,projectRoot,resolveDocumentPath,esc,safePath,resolvePath,status,backlogFilters,backlogLabel,implementationStatus,humanName,taskStatus,selectedSections,briefPaths,projectsFor,projectsForBrief,tasksForBrief,treeFor,isCompactHeader,isCompactValue,clampColumnWidth,eventsFor,markdown};
})();
