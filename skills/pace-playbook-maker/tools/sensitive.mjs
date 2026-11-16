// 민감 형식 탐지 — 지도·명세·기록 파일에 실값이 기록되는 것을 막는다(경로만 보고하고 값은 쓰지 않는다). 서비스 비의존.
// 보장 수준: 탐지 가능한 형식만 거부한다. 이름·주소 같은 형식 없는 값의 완전 차단은 보장하지 않는다.
const HEX64=/^[0-9a-f]{64}$/;
const PLACEHOLDER=/^(<[^<>]+>|\{[^{}]+\})$/;
// ---- 민감 형식 탐지 (경로만 보고하고 값은 쓰지 않는다) ---------------------------------------------
const digits=s=>(s.match(/\d/g)||[]).length;
const KINDS=[
  ['주민번호',s=>/\d{6}-?[1-8]\d{6}/.test(s)],
  ['카드',s=>/(?<!\d)\d{4}([- ]?\d{4}){3}(?!\d)/.test(s)],
  ['전화',s=>/(?<![\d-])0\d{1,2}-?\d{3,4}-?\d{4}(?![\d-])/.test(s)],
  ['계좌형',s=>/(?<![\d-])\d{10,14}(?![\d-])/.test(s)||[...s.matchAll(/(?<![\d-])\d{2,6}(-\d{2,8}){2,3}(?![\d-])/g)].some(m=>digits(m[0])>=10)],
  ['이메일',s=>/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/.test(s)],
  ['JWT형태',s=>/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/.test(s)],
  ['긴 토큰',s=>[...s.matchAll(/[A-Za-z0-9_-]{24,}/g)].some(m=>{const x=m[0];return (x.match(/\d/g)||[]).length>=2&&(x.match(/[A-Za-z]/g)||[]).length>=2&&new Set(x).size>=12;})],
  ['자격증명 대입',s=>{
    for(const m of s.matchAll(/(token|secret|passwd|password|authorization|api[_-]?key)\s*[:=]\s*(\S+)(\s+(\S+))?/gi)){
      let v=m[2];if(/^(bearer|basic)$/i.test(v)&&m[4])v=m[4];
      v=v.replace(/[,;)]+$/,'');
      if(!PLACEHOLDER.test(v))return true;
    }
    // 명령 옵션으로 넘기는 자격증명(--password 값)
    for(const m of s.matchAll(/--?(?:token|secret|passwd|password|api[_-]?key|auth\w*)\s+(\S+)/gi)){
      const v=m[1].replace(/[,;)]+$/,'');
      if(!v.startsWith('-')&&!PLACEHOLDER.test(v))return true;
    }
    return false;
  }]
];
// 해시 필드(키 이름이 해시 전용인 것)는 64자 16진 형식만 허용하고 토큰 검사에서 뺀다 — 다른 경로의 같은 길이 문자열은 계속 거부한다
const HASH_PATHS=[/(^|\.)(shotHash|recordHash|shotSha256|contextSha|contentHash|sourceHash|actionHash|candidateHash)$/,/(^|\.)shot\.sha256$/];
// 캡처 기록의 좌표·크기·건수는 숫자가 정상이다(좌표 값 자체는 형식 검사에서 제외)
const NUMERIC_OK=[/.captureRecord.(boxes|view|masking|elementsMasked)/];
const PATTERN_PATHS=[/^mask\[\d+\]$/,/^steps\[\d+\]\.mask\[\d+\]$/,/^steps\[\d+\]\.revealInputs\[\d+\]\.value$/];
function decodedVariants(s){
  const out=[s];
  if(/%[0-9a-fA-F]{2}/.test(s)){try{out.push(decodeURIComponent(s));}catch{/* 잘못된 인코딩은 원문만 검사 */}}
  return out;
}
export function scanSensitive(d){
  const found=[];
  const walk=(v,path)=>{
    if(v&&typeof v==='object'&&!Array.isArray(v)){
      // 객체 키도 값처럼 지도에 실릴 수 있다(예: frames 별칭) — 민감 형식이면 거부
      for(const k of Object.keys(v))for(const [kind,test] of KINDS)if(test(k)){found.push(`${path?path+'.':''}<키> (${kind})`);break;}
    }
    if(typeof v==='number'&&!NUMERIC_OK.some(re=>re.test(path))){
      // 숫자 값도 지도에 그대로 실린다(예: title에 숫자) — 문자열로 보고 같은 형식 검사를 한다
      for(const [kind,test] of KINDS)if(test(String(v))){found.push(`${path} (${kind})`);break;}
      return;
    }
    if(typeof v==='string'){
      if(HASH_PATHS.some(re=>re.test(path))){if(!HEX64.test(v))found.push(`${path} (해시 형식 아님)`);return;}
      const isPattern=PATTERN_PATHS.some(re=>re.test(path));
      // 패턴은 구두점 이스케이프(\.·\-)를 풀어 리터럴 실값이 가려지지 않게 한다(\d 같은 메타 표현은 그대로 둔다)
      const variants=decodedVariants(v).flatMap(x=>[x,x.replace(/\\([^A-Za-z0-9])/g,'$1')]);   // 정규식·선택자의 이스케이프(\.·\-)에 숨은 리터럴도 검사
      for(const text of variants){
        for(const [kind,test] of KINDS)if(test(text)){found.push(`${path} (${kind})`);return;}
        if(isPattern&&/\d{6,}/.test(text)){found.push(`${path} (리터럴 숫자 6자리 이상)`);return;}
      }
      return;
    }
    if(Array.isArray(v)){v.forEach((x,i)=>walk(x,`${path}[${i}]`));return;}
    // 민감 형식인 객체 키는 경로에도 되쓰지 않는다(오류 메시지가 주행 기록에 저장될 수 있다)
    const safeKey=k=>KINDS.some(([,test])=>test(k))?'<민감 키>':k;
    if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v))walk(x,path?`${path}.${safeKey(k)}`:safeKey(k));}
  };
  walk(d,'');
  if(found.length)throw new Error('민감 형식 거부 — 지도·명세에 실값을 기록할 수 없다: '+found.join(', '));
}



// 사용자가 실값을 말했을 때 기록에는 종류만 남기기 위한 보조 — 탐지된 형식의 이름만 돌려주고 값은 돌려주지 않는다.
export function sensitiveKinds(text){
  const kinds=new Set();
  const s=String(text??'');
  for(const x of decodedVariants(s).flatMap(v=>[v,v.replace(/\\([^A-Za-z0-9])/g,'$1')]))for(const [kind,test] of KINDS)if(test(x))kinds.add(kind);
  return [...kinds];
}
