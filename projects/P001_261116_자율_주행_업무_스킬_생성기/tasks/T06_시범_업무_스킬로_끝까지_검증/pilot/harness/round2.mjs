// 2라운드 보완(T06, main 판단 A) — 캡처를 다시 하지 않고 바꿀 수 있는 행동·서술 필드만 더한다(find·screen 불변 → 승인 캡처 증거 그대로 재사용).
// ① orca 명령 세 가지 형태(도움말 호출 없이 바로 쓰게)
// ② S02 command: 다섯 값을 한 번에 읽는 식 — 화면이 커밋 제목을 '…'로 줄였으면 최신 커밋 줄의 펼침 단추(화면 안 표시 토글, 서버 상태 불변)를
//    눌러 '…'로 시작하는 이어지는 글의 첫 줄을 붙인다(GitHub 첫 화면에는 긴 제목 전체가 속성·스크립트 어디에도 없다 — 실페이지 확인)
// ③ 제목 verify: 잘린 값 금지(주행 라이브러리의 truncated 검사와 같은 규칙)
export const S02_READ = "(async()=>{const q=s=>document.querySelector(s);const vis=e=>e.getBoundingClientRect().height>0;const H='[data-testid=latest-commit-html]';const all=()=>[...document.querySelectorAll(H)].filter(vis).map(e=>e.textContent.trim());let t=all()[0]||null;if(t&&t.endsWith('…')){const b=q('[data-testid=latest-commit-details-toggle]');if(b&&b.getAttribute('aria-expanded')!=='true')b.click();let c=null;for(let i=0;i<20&&!c;i++){c=all().find(x=>x.startsWith('…'));if(!c)await new Promise(r=>setTimeout(r,150));}t=c?t.slice(0,-1)+c.slice(1).split('\\n')[0]:null;}const a=q('[data-testid=latest-commit-details] a[href*=commit]');const rt=q('[data-testid=latest-commit-details] relative-time');const st=q('[data-testid=star-button]');return JSON.stringify({path:location.pathname,branch:(q('#ref-picker-repos-header-ref-selector')||{}).innerText||null,stars:st?((st.innerText.match(/\\(([^)]+)\\)/)||[])[1]||null):null,sha7:a?a.textContent.trim():null,title:t,date:rt?(rt.getAttribute('datetime')||'').slice(0,10):null});})()";

// ④ 지도 읽기 호출 축소(캡틴 결정 '지도 읽기 호출 수 축소 시도'): 열기만 하는 S01(요소·추출·캡처 없음)을 S02의 진입 조건으로 접는다 —
//    지도 = index.json + S02.json 두 파일. 열기 명령은 S02 enter(→ index.start)에, 읽기·닫기 명령은 S02 toolNote·command에 둔다.
export function applyRound2(d) {
  d.steps = d.steps.filter((s) => s.id !== 'S01');
  const s2 = d.steps.find((s) => s.id === 'S02');
  s2.enter = '공개 저장소 첫 화면이 열려 있다 — 열기: `orca tab create --url https://github.com/<owner/repo> --json`(출력 result.browserPageId가 이후 <page>)';
  s2.toolNote = 'orca 명령 세 가지면 된다(도움말 불필요): 열기는 enter, 읽기는 command 한 번(다섯 값을 JSON으로 — 값이 null이면 그 요소가 없는 것이니 멈추고 보고), 닫기 `orca tab close --page <page>`. 제목이 화면에서 줄었으면 command의 식이 펼침 단추로 전체 제목을 읽는다';
  s2.command = 'orca eval --page <page> --expression "' + S02_READ + '"';
  const x = s2.extract.find((e) => e.name === '최신 커밋 제목');
  x.verify = '비어 있지 않고 말줄임(…)으로 끝나지 않는 전체 제목 — 화면이 줄였으면 펼침 단추(latest-commit-details-toggle)로 펼친 이어지는 글의 첫 줄을 붙인다';
  return d;
}
