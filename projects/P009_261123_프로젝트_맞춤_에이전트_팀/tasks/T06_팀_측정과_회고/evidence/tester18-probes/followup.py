from control_lib import *

# Re-evaluate the original ignored controls with the criterion's nonzero return,
# using original CLI transcripts and retained before/after Git state.
previous=get(D/'results.json')
for name in ['TEAM-RETROSPECTIVE.json','proof.json']:
    label='ignored-'+name; repo=D/label/'repo.wt/P001'
    calls=[json.loads(x) for x in (D/'commands.jsonl').read_text().splitlines() if str(D/label) in x]
    prior=next(row for row in previous if row['name']==label)
    heads=[row['stdout'].strip() for row in calls if row['args'][-2:]==['rev-parse','HEAD']]
    r=prior['call']
    exists=list(repo.glob('projects/P001_*/'+name))
    unchanged=(name=='proof.json' and get(exists[0])['hash']==h('proof proof.json')) or (name=='TEAM-RETROSPECTIVE.json' and get(exists[0])==dict(version=1,metricRef='METRICS.md',unusedRoles=[],recurringFindings=[],definitionChanges=[],noChangesReasonRef='proof.json'))
    report(label,passed=r['exit']!=0 and 'Git 인덱스에 없다' in r['output'] and len(heads)==2 and heads[0]==heads[1] and unchanged and not list(repo.glob('projects/P001_*/TEAM-FINISH.json')),heads=heads,call=r)

# Match the focused adapter's Unicode fixture with the real CLI, which pins core.quotepath=false.
f=Fix('unicode'); w=start(f)
new=pathlib.Path(str(f.rel).replace('_synthetic','_합성'))
f.git('mv',str(f.rel),str(new),cwd=w); f.rel=new; p=w/new
setup_close(f,w); f.commit(w,'add unicode project fixtures')
expect(finish(f,w)); original=approved(f)
project=p/'PROJECT.md'; project.write_text(project.read_text().replace('- 팀 측정: v1\n',''))
f.commit(w,'remove one adoption signal while leaving the real receipt')
r=merge(f,'--yes')
report('Unicode source CLI vs default Git adapter',passed=r.returncode!=0 and 'finish 뒤 내용' in r.stderr,original=original,quoted=f.git('ls-tree','-r','--name-only','HEAD','--',str(f.rel),cwd=w),unquoted=f.git('-c','core.quotepath=false','ls-tree','-r','--name-only','HEAD','--',str(f.rel),cwd=w),call=note('stale receipt on Unicode path',r))

# Continue the real team recovery in the retained fixture after the indicated
# rebase conflict, preserving both histories and the observed failure.
f=Fix.__new__(Fix); f.base=D/'bookkeeping'; f.root=f.base/'repo'; f.home=f.base/'home'; f.tmp=f.base/'tmp'
f.rel=next(f.root.glob('projects/P001_*')).relative_to(f.root)
f.env=dict(PATH=os.environ['PATH'],HOME=str(f.home),USERPROFILE=str(f.home),PACE_HOME=str(f.home),GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL='/dev/null',TMPDIR=str(f.tmp),TMP=str(f.tmp),TEMP=str(f.tmp),LC_ALL='en_US.UTF-8')
w=f.base/'repo.wt/P001'; log_path=w/f.rel/'log.jsonl'
if '<<<<<<<' in log_path.read_text():
    log_path.write_text(''.join(line for line in log_path.read_text().splitlines(keepends=True) if not line.startswith(('<<<<<<<','=======','>>>>>>>'))))
    f.git('add','--',str(f.rel/'log.jsonl'),cwd=w)
    expect(run([GIT,'-c','core.editor=true','rebase','--continue'],w,f.env,'git'))
r=finish(f,w)
if r.returncode==0:
    sha=approved(f); m=merge(f,'--yes','--commit',sha)
    rows=log(f,f.root); observed=[row['ok'] for row in rows if row['type']=='merge']
    report('bookkeeping manual recovery',passed=m.returncode==0 and observed==[False,True] and clean(f)=='',merge_events=observed,calls=[note('refinish',r),note('merge after a manual log conflict resolution',m)])
else:
    report('bookkeeping manual recovery',passed=False,call=note('refinish',r))
