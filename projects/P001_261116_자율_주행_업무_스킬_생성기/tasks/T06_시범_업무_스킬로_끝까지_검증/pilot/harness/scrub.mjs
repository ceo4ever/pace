// 세션 원본 기록 가리기 — 사용자 경로·사용자 이름·토큰 모양을 치환해 증거로 남길 수 있게 한다(저장소 이름·커밋 값 같은 공개 정보는 그대로).
// T06 유출 검사 보완: Windows 단축 이름(예: ABCDEF~1.XYZ)·Claude 프로젝트 폴더 인코딩(C--Users-…), `orca tab list` 결과(사용자의 다른 탭 URL·작업 폴더)도 가린다.
import {homedir,tmpdir,userInfo} from 'node:os';
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// 사용자 이름의 Windows 8.3 단축형(앞 6자~1.확장 3자)과 그 '-' 인코딩
const shortForms=user=>{
  if(!user)return [];
  const [base,ext='']=user.toUpperCase().split(/\.(?=[^.]*$)/);
  const b=base.replace(/[^A-Z0-9]/g,'').slice(0,6),e=ext.replace(/[^A-Z0-9]/g,'').slice(0,3);
  return [`${b}~1${e?'.'+e:''}`,`${b}-1${e?'-'+e:''}`];
};
export function scrubText(text,extra=[]){
  let t=String(text);
  const user=(()=>{try{return userInfo().username;}catch{return '';}})();
  const home=homedir();
  const pairs=[[tmpdir(),'<TEMP>'],[home,'<HOME>'],...extra];
  for(const [from,to] of pairs){
    if(!from)continue;
    const variants=new Set([from,from.replace(/\\/g,'/'),from.replace(/\\/g,'\\\\'),from.replace(/^([A-Za-z]):/,(m,d)=>'/'+d.toLowerCase()).replace(/\\/g,'/')]);
    for(const v of variants)t=t.replace(new RegExp(esc(v),'gi'),to);
  }
  // Claude 프로젝트 폴더 이름 인코딩(C--Users-<이름>-AppData-…)
  t=t.replace(/([A-Za-z])--Users-[A-Za-z0-9.~_-]+?(?=-AppData|-Documents|-Desktop|\\|\/|"|$)/g,'$1--Users-<USER>');
  for(const s of shortForms(user))t=t.replace(new RegExp(esc(s),'gi'),'<USER>');
  if(user)t=t.replace(new RegExp(esc(user),'gi'),'<USER>');
  // Windows 단축 경로(8.3) 형태의 사용자 폴더 — 앞 6자+~1
  t=t.replace(/C:[\\/]+Users[\\/]+[^\\/"'\s]+/gi,'<USER-PATH>').replace(/\/c\/Users\/[^/"'\s]+/gi,'<USER-PATH>');
  // 토큰 모양
  t=t.replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,'<TOKEN>')
       .replace(/(authorization["']?\s*[:=]\s*["']?bearer\s+)[A-Za-z0-9._~+/=-]{10,}/gi,'$1<TOKEN>');
  return t;
}

// stream-json 줄 배열에서 `orca tab list` 결과를 가린다 — 그 출력에는 이 업무와 무관한 사용자의 다른 탭 URL·작업 폴더가 있다.
// 도구 호출(입력)은 남기고 결과 본문만 바꾼다. 반환: {lines, redacted}
export const TAB_LIST_REDACTED='<orca tab list 출력 가림 — 사용자의 다른 탭 URL·작업 폴더 정보>';
export function scrubStreamLines(lines){
  const ids=new Set();let redacted=0;
  const out=lines.map(l=>{
    let e;try{e=JSON.parse(l);}catch{return l;}
    if(e&&e.type==='assistant'&&e.message&&Array.isArray(e.message.content))
      for(const c of e.message.content)if(c&&c.type==='tool_use'&&c.name==='Bash'&&/(^|[\s;&|(])orca(\.exe)?\s+(\S+\s+)*?tab\s+list\b/.test(String(c.input&&c.input.command)))ids.add(c.id);
    if(e&&e.type==='user'&&e.message&&Array.isArray(e.message.content)){
      let hit=false;
      for(const c of e.message.content)if(c&&c.type==='tool_result'&&ids.has(c.tool_use_id)){c.content=TAB_LIST_REDACTED;hit=true;}
      if(hit){if(e.tool_use_result!==undefined)e.tool_use_result=TAB_LIST_REDACTED;redacted++;return JSON.stringify(e);}
    }
    return l;
  });
  return {lines:out,redacted};
}
