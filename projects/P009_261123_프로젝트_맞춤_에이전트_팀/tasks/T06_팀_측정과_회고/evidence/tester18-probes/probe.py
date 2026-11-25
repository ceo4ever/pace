from fixture import *

def seed(name, check='true', legacy=False, security=None):
    f=Fix(name,check)
    if security:
        p=f.root/'docs/README.md'; p.write_text(p.read_text().replace('보안 검사: `true`','보안 검사: `'+security+'`'))
        f.commit(f.root,'declare synthetic security check')
    w=start(f); setup_close(f,w,legacy=legacy); f.commit(w,'valid synthetic inputs')
    return f,w,w/f.rel
def finish(f,w): return f.cli('project','finish','P001',cwd=w)
def merge(f,*args): return f.cli('project','merge','P001',*args)
def approved(f):
    out=expect(merge(f)); return re.search(r'--yes --commit ([0-9a-f]{40,64})',out)[1]
def state(f,w): return f.git('rev-parse','HEAD',cwd=w)
def clean(f): return f.git('--no-optional-locks','status','--porcelain=v1','--untracked-files=all')
def log(f,where): return [json.loads(x) for x in (where/f.rel/'log.jsonl').read_text().splitlines()]
def note(label,r): return dict(label=label, exit=r.returncode, output=r.stdout+r.stderr)
def report(name,**data):
    print(name,json.dumps(data,ensure_ascii=False),flush=True)
    result(name,data.pop('passed'),**data)

for name in ['TEAM-RETROSPECTIVE.json','proof.json']:
    f,w,p=seed('ignored-'+name); rel=str(f.rel/name)
    f.git('rm','--cached','--',rel,cwd=w); (w/'.gitignore').write_text('/'+rel+'\n'); f.commit(w,'ignore live valid input')
    f.git('check-ignore','--',rel,cwd=w); before=state(f,w); saved=(p/name).read_bytes()
    r=finish(f,w)
    report('ignored-'+name,passed=r.returncode==1 and 'Git 인덱스에 없다' in r.stderr and before==state(f,w) and saved==(p/name).read_bytes() and not (p/'TEAM-FINISH.json').exists(),call=note('finish',r))

for kind in ['check','security']:
    cmd='sh side-effect.sh'; f,w,p=seed('stage-'+kind,cmd if kind=='check' else 'true',security=cmd if kind=='security' else None)
    (w/'side-effect.sh').write_text("#!/bin/sh\nset -e\nprintf 'staged by "+kind+"\\n' > outside.txt\ngit add -- outside.txt\nexit 0\n")
    f.commit(w,'add synthetic declared check')
    before=state(f,w); r=finish(f,w); head=state(f,w)
    committed=f.git('show','HEAD:outside.txt',cwd=w); staged=f.git('show',':outside.txt',cwd=w)
    report('stage-'+kind,passed=r.returncode==1 and '검사 뒤 staged/unstaged' in r.stdout and before==head and committed=='foreign stable' and staged=='staged by '+kind and not (p/'TEAM-FINISH.json').exists(),before=before,after=head,committed=committed,staged=staged,call=note('finish',r))

f,w,p=seed('legacy',legacy=True)
dest=p/'TEAM-FINISH.json'; dest.write_text('synthetic foreign data\n'); f.commit(w,'legacy regular file')
r1=finish(f,w); regular=dest.read_bytes()
dest.unlink(); dest.symlink_to('PROJECT-CLOSE.md'); f.commit(w,'legacy symlink')
r2=finish(f,w); r3=merge(f)
r4=merge(f,'--yes')
on_main=f.root/f.rel/'TEAM-FINISH.json'
report('legacy regular and link',passed=regular==b'synthetic foreign data\n' and all(r.returncode==0 for r in [r1,r2,r3,r4]) and '--commit' not in r3.stdout and on_main.is_symlink() and os.readlink(on_main)=='PROJECT-CLOSE.md' and clean(f)=='',calls=[note('legacy',r) for r in [r1,r2,r3,r4]])

f,w,p=seed('collision')
dest=p/'TEAM-FINISH.json'; dest.write_text('{"foreign":"fixture"}\n'); before=state(f,w)
r1=finish(f,w)
untracked=f.git('ls-files','--',str(f.rel/dest.name),cwd=w)==''
first=state(f,w)==before and untracked and dest.read_text()=='{"foreign":"fixture"}\n'
f.commit(w,'explicit tracked foreign file')
before=state(f,w); r2=finish(f,w); second=state(f,w)==before and dest.read_text()=='{"foreign":"fixture"}\n'
report('adopted collisions',passed=first and second and all(r.returncode==1 for r in [r1,r2]),untracked_preserved=first,tracked_preserved=second,calls=[note('collision',r) for r in [r1,r2]])

f,w,p=seed('approval-and-retry')
expect(finish(f,w)); first=approved(f)
(p/'PROJECT-CLOSE.md').write_text((p/'PROJECT-CLOSE.md').read_text().replace('실제 회고','개정 회고')); f.commit(w,'change retrospection summary')
expect(finish(f,w)); idx=f.index(f.root); second=approved(f); idx_after=f.index(f.root); separate_index=idx==idx_after
main=state(f,f.root)
bad=[]
for options in [('--yes',),('--yes','--commit','f'*40),('--yes','--commit',first),('--yes','--commit',second[:12])]:
    r=merge(f,*options); bad.append((note(' '.join(options),r),r.returncode!=0 and state(f,f.root)==main and clean(f)==''))
f.git('rm','--',str(f.rel/'TEAM-RETROSPECTIVE.json'),cwd=w); f.git('commit','-qm','remove sealed evidence',cwd=w); invalid=state(f,w)
f.git('worktree','remove',str(w)); idx_before=f.index(f.root)
r1=merge(f,'--yes','--commit',invalid)
pre=r1.returncode!=0 and 'finish 뒤 내용' in r1.stderr and clean(f)=='' and state(f,f.root)==main and f.index(f.root)==idx_before
f.git('update-ref','refs/heads/project/P001',second,invalid)
preview=approved(f); r2=merge(f,'--yes','--commit',preview)
report('approval, private index, absent worktree retry',passed=first!=second and all(row[1] for row in bad) and separate_index and pre and preview==second and r2.returncode==0 and f.git('rev-parse','HEAD^')==second and clean(f)=='',bad=bad,first=first,second=second,index_before=idx,index_after=idx_after,preFF=pre,calls=[note('invalid',r1),note('retry',r2)])

f,w,p=seed('bookkeeping')
expect(finish(f,w)); target=approved(f); f.git('worktree','remove',str(w))
hook=f.root/'.git/hooks/commit-msg'; hook.write_text('#!/bin/sh\ncase "$(cat "$1")" in *"병합 완료"*) exit 1;; esac\nexit 0\n'); hook.chmod(0o755)
r=merge(f,'--yes','--commit',target)
recovered_state=state(f,f.root)==target and '상태: 병합 대기' in (f.root/f.rel/'PROJECT.md').read_text()
recoverable=r.returncode==1 and 'fast-forward는 완료' in r.stderr and 'start P001 --no-launch' in r.stderr and recovered_state and f.git('diff','--cached','--name-only')=='' and clean(f)=='M '+str(f.rel/'log.jsonl') and len([row for row in log(f,f.root) if row.get('type')=='merge'])==1
hook.unlink(); f.git('add','--',str(f.rel/'log.jsonl')); f.git('commit','-qm','preserve the failed merge event')
w=start(f); r2=finish(f,w)
if r2.returncode==0:
    target2=approved(f); r3=merge(f,'--yes','--commit',target2)
    recovered=r3.returncode==0 and clean(f)=='' and '상태: 완료' in (f.root/f.rel/'PROJECT.md').read_text()
else:
    r3=None; recovered=False
report('post-FF bookkeeping recovery',passed=recoverable and recovered,recoverable=recoverable,recovered=recovered,calls=[note('commit-msg refusal',r),note('refinish',r2),note('merge again',r3) if r3 else None])
