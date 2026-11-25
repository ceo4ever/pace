from control_lib import *
from datetime import datetime, timezone, timedelta

def statuses(f,w):
    return f.git('--no-optional-locks','status','--porcelain=v1','--untracked-files=all',cwd=w)
def ledger(f,p,rows):
    with (p/'log.jsonl').open('a') as out:
        for row in rows: out.write(json.dumps(dict(p='P001',msg='synthetic observation',**row))+'\n')
def utc(dt): return dt.isoformat(timespec='milliseconds').replace('+00:00','Z')
def stats(f,w): return json.loads(expect(f.cli('project','stats','P001','--json',cwd=w)))

f,w,p=seed('task-close')
q=p/'tasks/T99_synthetic/TASK-CLOSE.md'; q.parent.mkdir(parents=True); q.write_text('## 리뷰\n\nblocking 2\n\n## 남긴 것\n\n없음\n')
rpath=str(q.relative_to(w)); (w/'.gitignore').write_text('/'+rpath+'\n')
retro=get(p/'TEAM-RETROSPECTIVE.json'); retro['recurringFindings']=[dict(code='review-blocking',count=2,coverage='reported',refs=['proof.json'])]; dump(p/'TEAM-RETROSPECTIVE.json',retro)
f.commit(w,'commit declared finding while source is ignored')
f.git('check-ignore','--',rpath,cwd=w); before=state(f,w); saved=h(q.read_bytes())
s=stats(f,w); held=finish(f,w); after=state(f,w)
held_ok=before==after and held.returncode!=0 and 'TASK-CLOSE.md' in held.stderr and 'Git 인덱스에 없다' in held.stderr and h(q.read_bytes())==saved and not (p/'TEAM-FINISH.json').exists()
f.git('add','-f','--',rpath,cwd=w); f.commit(w,'record input'); good=finish(f,w)
report('ignored task close then recorded',passed=held_ok and any(i['code']=='blocking' and i['count']==2 for i in s['improvements']) and good.returncode==0 and (p/'TEAM-FINISH.json').is_file(),improvements=s['improvements'],before=before,after=after,input=rpath,input_sha=saved,refusal=note('ignored',held),recorded=note('tracked',good))

f,w,p=seed('answer-provenance')
t=datetime.now(timezone.utc)
period=dict(start=utc(t-timedelta(seconds=20)),end=utc(t-timedelta(seconds=1)),unit='representative-task',closed=True)
evidence(p/'frame.json',period=period)
dump(p/'TEAM-MEASUREMENT.json',dict(version=1,period=period|dict(completionRef='frame.json')))
events=[]
ref_names=['wrong.json','out.json','accepted.json']
for i,n in enumerate(ref_names):
    req='request-'+str(i); question=t-timedelta(seconds=12-i); answer=t-timedelta(seconds=8-i)
    events.extend([dict(ts=utc(question),type='question',by='agent',to='owner',requestId=req),dict(ts=utc(answer),type='answer',by='user',requestId=req,ref=n)])
    extra=dict(requestId='other-request' if i==0 else req)
    if i==1: extra['period']=period|dict(start=utc(t-timedelta(seconds=35)),end=utc(t-timedelta(seconds=21)))
    evidence(p/n,**extra)
ledger(f,p,events)
paths=[str(f.rel/n) for n in ref_names]
(w/'.gitignore').write_text(''.join('/'+r+'\n' for r in paths)); f.commit(w,'record scoped requests and omit ignored proofs')
f.git('check-ignore','--',*paths,cwd=w)
s=stats(f,w); held=finish(f,w)
f.git('add','-f','--',paths[2],cwd=w); f.commit(w,'record adopted owner answer proof')
good=finish(f,w); s2=stats(f,w)
untracked=f.git('ls-files','--',*paths,cwd=w).splitlines()
req=s['team']['requests']; req2=s2['team']['requests']
report('wrong and out-of-period proofs remain unknown; adopted proof required',passed=req['ownerReply']==1 and req['unconfirmed']==2 and held.returncode!=0 and 'Git 인덱스에 없다' in held.stderr and 'accepted.json' in held.stderr and good.returncode==0 and req2['ownerReply']==1 and req2['unconfirmed']==2 and untracked==paths[2:],requests_before=req,requests_after=req2,legacy_requests=s['handoffs']['requests'],index_inputs=untracked,refusal=note('adopted ignored',held),accepted=note('only adopted recorded',good))

for phase in ['security','audit','check','legacy-security']:
    cmd='sh side-effect.sh'
    f=Fix('side-effect-'+phase,cmd if phase=='check' else 'true')
    d=f.root/'docs/README.md'
    if phase in ['security','legacy-security']: d.write_text(d.read_text().replace('보안 검사: `true`','보안 검사: `'+cmd+'`'))
    if phase=='audit': d.write_text(d.read_text()+'- 의존성 감사: `'+cmd+'`\n')
    f.commit(f.root,'declare synthetic zero-exit command')
    w=start(f); setup_close(f,w,legacy=phase=='legacy-security'); p=w/f.rel
    (w/'side-effect.sh').write_text("set -e\nprintf 'staged by "+phase+"\\n' > outside.txt\ngit add -- outside.txt\nexit 0\n")
    if phase=='audit': dump(w/'package-lock.json',dict(name='synthetic',lockfileVersion=3,packages={}))
    f.commit(w,'prepare valid close and local check script')
    before=state(f,w); r=finish(f,w); after=state(f,w)
    committed=f.git('show','HEAD:outside.txt',cwd=w); staged=f.git('show',':outside.txt',cwd=w)
    expect_msg='검사 뒤 staged/unstaged' if phase=='check' else '보안 검사/의존성 감사 뒤 자료'
    report(phase,passed=r.returncode!=0 and expect_msg in r.stdout+r.stderr and before==after and committed=='foreign stable' and staged=='staged by '+phase and not (p/'TEAM-FINISH.json').exists(),before=before,after=after,committed=committed,staged=staged,call=note(phase,r))

f,w,p=seed('equal-head')
expect(finish(f,w)); good=approved(f); main=state(f,f.root)
f.git('worktree','remove',str(w))
assert clean(f)==''
f.git('update-ref','refs/heads/project/P001',main,good)
idx=f.index(f.root); r=merge(f,'--yes','--commit',good)
after=state(f,f.root); dirty=clean(f); idx2=f.index(f.root); has_failed_log=(f.root/f.rel/'log.jsonl').exists()
f.git('update-ref','refs/heads/project/P001',good,main)
r2=merge(f,'--yes','--commit',good)
report('equal-ref pre-FF then restored target',passed=r.returncode!=0 and '병합 대기가 아니다' in r.stderr and after==main and not dirty and idx==idx2 and not has_failed_log and r2.returncode==0 and not clean(f) and f.git('rev-parse','HEAD^')==good,main=main,after_rejection=after,approved=good,dirty=dirty,index_before=idx,index_after=idx2,untracked_failure_log=has_failed_log,refusal=note('equal-ref',r),retry=note('restored',r2))

f,w,p=seed('after-ff')
expect(finish(f,w)); target=approved(f); f.git('worktree','remove',str(w))
hook=f.root/'.git/hooks/commit-msg'; hook.write_text('#!/bin/sh\ncase "$(cat "$1")" in *"병합 완료"*) exit 1;; esac\nexit 0\n'); hook.chmod(0o755)
r=merge(f,'--yes','--commit',target); kept=log(f,f.root)
head=state(f,f.root); staged=f.git('diff','--cached','--name-only'); dirty=clean(f); project=(f.root/f.rel/'PROJECT.md').read_text()
report('successful FF then bookkeeping refusal',passed=r.returncode!=0 and head==target and staged=='' and dirty=='M '+str(f.rel/'log.jsonl') and '상태: 병합 대기' in project and [x['ok'] for x in kept if x['type']=='merge']==[False] and all(v in r.stderr for v in ['fast-forward는 완료','--yes --commit <새 SHA>','로그 rebase 충돌이 나면 중단','양쪽 기록을 보존']),head=head,approved=target,staged=staged,dirty=dirty,events=[x for x in kept if x['type']=='merge'],call=note('post-FF failure',r))
