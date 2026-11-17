// 같은 시각의 정답 — GitHub 공개 API(로그인 없음)로 기본 브랜치·별 개수·최신 커밋(해시 앞 7자·제목·날짜)을 가져온다.
// 정답 묶음: {at, repo, branch, stars, sha7, title, date(committer, UTC YYYY-MM-DD), dateAlt(author, UTC)} — 공개 값이라 증거에 남긴다.
export async function fetchTruth(repo,{fetchFn=fetch}={}){
  const get=async path=>{
    const r=await fetchFn('https://api.github.com'+path,{headers:{'user-agent':'pace-measure','accept':'application/vnd.github+json'}});
    if(!r.ok)throw new Error(`GitHub API ${r.status}`);
    return r.json();
  };
  const info=await get(`/repos/${repo}`);
  const c=await get(`/repos/${repo}/commits/${encodeURIComponent(info.default_branch)}`);
  const day=s=>String(s||'').slice(0,10);
  return {at:new Date().toISOString(),repo,branch:info.default_branch,stars:info.stargazers_count,sha7:String(c.sha).slice(0,7),
    title:String(c.commit.message).split('\n')[0],date:day(c.commit.committer&&c.commit.committer.date),dateAlt:day(c.commit.author&&c.commit.author.date)};
}
if(import.meta.url===new URL('file:///'+process.argv[1].replace(/\\/g,'/')).href){
  console.log(JSON.stringify(await fetchTruth(process.argv[2]),null,1));
}
