import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
export const home=path.join(os.homedir(),'.pace');
export const app=path.join(home,'app');
export const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
export const moduleImport=m=>import(pathToFileURL(path.join(app,m)));
export function inputs(){
 const raw=fs.readFileSync(path.join(home,'secrets/telegram-setup/.env'),'utf8');const out={};
 for(const line of raw.split(/\r?\n/)){if(!line.trim()||line.trim().startsWith('#'))continue;const m=/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);if(!m||Object.hasOwn(out,m[1]))throw Error('input-format');let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);out[m[1]]=v;}
 const token = out.TELEGRAM_BOT_TOKEN,chat=out.TELEGRAM_CHAT_ID,users=(out.TELEGRAM_ALLOWED_USER_IDS??'').split(/[,\s]+/).filter(Boolean);
 if(!/^[0-9]{6,}:[A-Za-z0-9_-]{30,}$/.test(token??'')||!/^-[0-9]+$/.test(chat??'')||users.length!==1||!users.every(x=>/^[0-9]+$/.test(x)))throw Error('input-format');return {token,chat,users};
}
export function evidenceDir(){const p=fs.readdirSync('projects').find(x=>x.startsWith('P005_'));const t=fs.readdirSync(path.join('projects',p,'tasks')).find(x=>x.startsWith('T02_'));return path.join('projects',p,'tasks',t,'evidence');}
export function save(name,data){const s=JSON.stringify(data,null,2)+'\n';const i=inputs();if([i.token,i.chat,...i.users].some(v=>s.includes(v)))throw Error('evidence-sensitive');fs.writeFileSync(path.join(evidenceDir(),name),s);}
export function aclSafe(target){
 const code=`$safe=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544'); $acl=Get-Acl -LiteralPath '${target.replaceAll("'","''")}'; $bad=0; foreach($ace in $acl.Access){if($ace.AccessControlType -eq 'Allow'){try{if($ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $safe){$bad++}}catch{$bad++}}}; [pscustomobject]@{unexpectedAllow=$bad;protected=$acl.AreAccessRulesProtected} | ConvertTo-Json -Compress`;
 const p=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',windowsHide:true,timeout:15000});if(p.status!==0)throw Error('acl-query');const r=JSON.parse(p.stdout);if(r.unexpectedAllow!==0)throw Error('acl-broad');return r;
}
export function verifyModules(){const base=JSON.parse(fs.readFileSync(path.join(evidenceDir(),'local-observer-preflight.json'),'utf8'));for(const [file,hash]of Object.entries(base.modules))if(sha(fs.readFileSync(path.join(app,file)))!==hash)throw Error('module-changed');return base.modules;}
export function runtimeRoot(){return fs.readFileSync(path.join(os.tmpdir(),'pace-p005-t02-runtime-root.txt'),'utf8');}
