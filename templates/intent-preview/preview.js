const data=JSON.parse(document.getElementById('preview-data').textContent);
const nav=document.getElementById('screens'),frame=document.getElementById('frame'),status=document.getElementById('status'),current=document.getElementById('current'),fontWarning=document.getElementById('font-warning');
function show(index){
 const screen=data.screens[index]; if(!screen)return;
 current.textContent=' · '+screen.screen+' / '+screen.state; status.textContent=''; frame.replaceChildren();
 fontWarning.textContent=screen.fontWarnings.length?'글꼴이 대체되어 표시됩니다. 글자 잘림과 배치를 검토하세요: '+screen.fontWarnings.map(w=>w.font).join(', '):'';
 const img=document.createElement('img');img.alt=screen.screen+' '+screen.state;img.src=screen.image;
 img.addEventListener('error',()=>{status.textContent='이미지를 불러올 수 없습니다.';});frame.append(img);
 for(const link of screen.links){const button=document.createElement('button');button.className='hotspot';button.type='button';button.setAttribute('aria-label',link.name+(link.unlinked?' (미연결)':' 이동'));button.style.left=link.x+'%';button.style.top=link.y+'%';button.style.width=link.w+'%';button.style.height=link.h+'%';if(link.unlinked){button.setAttribute('aria-disabled','true');button.addEventListener('click',()=>{status.textContent='연결되지 않은 동작입니다.';});}else button.addEventListener('click',()=>select(link.target));frame.append(button);}
 for(const b of nav.children)b.setAttribute('aria-current',b.dataset.index===String(index)?'true':'false');
}
function select(index){location.hash=String(index);show(index);}
data.screens.forEach((screen,i)=>{const b=document.createElement('button');b.type='button';b.dataset.index=String(i);b.textContent=screen.screen+' · '+screen.state;b.addEventListener('click',()=>select(i));nav.append(b);});
window.addEventListener('hashchange',()=>show(Number(location.hash.slice(1))));show(Number(location.hash.slice(1))||0);
