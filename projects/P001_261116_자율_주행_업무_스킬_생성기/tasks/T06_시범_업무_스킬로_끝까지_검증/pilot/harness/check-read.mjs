// 2라운드 읽기 식 실페이지 확인(T06) — 재생성한 지도 S02.json의 command를 에이전트가 쓰듯 bash 한 줄로 그대로 실행해(자리표시 <page>만 바꿈)
// 공개 GitHub 저장소들의 다섯 값을 읽고 같은 시각 GitHub 공개 API 정답과 대조한다. 게스트 프로필 탭을 열고 끝나면 닫는다. 결과(공개 정보)를 표준 출력으로 낸다.
// 사용: node check-read.mjs <S02.json> <owner/repo>...
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fetchTruth} from './truth.mjs';
const [map,...repos]=process.argv.slice(2);
const cmd=JSON.parse(readFileSync(map,'utf8')).command;
const sh=c=>spawnSync('bash',['-c',c],{encoding:'utf8',timeout:90000}).stdout||'';
const prof=JSON.parse(sh('orca tab profile list --json')).result.profiles.find(p=>p.label==='pace-t06-guest').id;
const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
for(const r of repos){
  const page=JSON.parse(sh(`orca tab create --profile ${prof} --url https://github.com/${r} --json`)).result.browserPageId;
  for(let i=0;i<30;i++){sleep(700);if(sh(`orca eval --page ${page} --expression "!!document.querySelector('[data-testid=latest-commit-html]')"`).trim()==='true')break;}
  const raw=sh(cmd.replace('<page>',page)).trim();
  sh(`orca tab close --page ${page}`);
  const truth=await fetchTruth(r);
  let got;try{got=JSON.parse(raw);}catch{got={raw:raw.slice(0,200)};}
  const ok={branch:got.branch===truth.branch,sha7:got.sha7===truth.sha7,title:got.title===truth.title,date:got.date===truth.date};
  console.log(JSON.stringify({repo:r,at:truth.at,longTitle:truth.title.length>70,got,truth:{branch:truth.branch,sha7:truth.sha7,title:truth.title,date:truth.date,stars:truth.stars},ok}));
}
