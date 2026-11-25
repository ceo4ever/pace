import hashlib,json,os,pathlib,re,shutil,subprocess,sys
D=pathlib.Path(__file__).resolve().parent
SOURCE=pathlib.Path(sys.argv[1]).resolve()
NODE=shutil.which('node')
GIT=shutil.which('git')
MANUAL=['owner_manual_role_corrections','owner_file_edits','owner_command_runs','coordinator_extra_instructions']
def h(s): return hashlib.sha256(s if isinstance(s,bytes) else s.encode()).hexdigest()
def dump(path,o): path.write_text(json.dumps(o,ensure_ascii=False)+'\n')
def get(path): return json.loads(path.read_text())
def run(args,cwd,env,kind):
    r=subprocess.run(args,cwd=cwd,env=env,capture_output=True,text=True)
    with (D/'commands.jsonl').open('a') as f: f.write(json.dumps(dict(kind=kind,args=args,cwd=str(cwd),status=r.returncode,stdout=r.stdout,stderr=r.stderr),ensure_ascii=False)+'\n')
    return r
def expect(r,n=0):
    if r.returncode!=n: raise RuntimeError((r.args,r.returncode,r.stdout,r.stderr))
    return r.stdout.strip()
results=[]
def result(name,passed,**vals):
    results.append(dict(name=name,pass_=bool(passed),**vals))
    dump(D/'results.json',results)
def evidence(path,**extra):
    dump(path,dict(version=1,kind='team-evidence',sourceRef='fixture:synthetic',hash=h('proof '+path.name),**extra))
class Fix:
    def __init__(self,name,check='true'):
        self.base=D/name; self.base.mkdir(); self.root=self.base/'repo'; self.root.mkdir(); self.home=self.base/'home'; self.home.mkdir(); self.tmp=self.base/'tmp'; self.tmp.mkdir()
        self.env=dict(PATH=os.environ['PATH'],HOME=str(self.home),USERPROFILE=str(self.home),PACE_HOME=str(self.home),GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL='/dev/null',TMPDIR=str(self.tmp),TMP=str(self.tmp),TEMP=str(self.tmp),LC_ALL='en_US.UTF-8')
        self.git('init','-q','-b','main')
        self.git('config','user.name','Synthetic tester'); self.git('config','user.email','fixture@example.invalid')
        (self.root/'docs').mkdir()
        (self.root/'docs/README.md').write_text('# Fixture\n\n## 환경\n\n- 검사: `'+check+'`\n- 보안 검사: `true`\n')
        (self.root/'outside.txt').write_text('foreign stable\n')
        self.commit(self.root,'base')
        expect(self.cli('project','new','synthetic'))
        self.rel=next(self.root.glob('projects/P001_*')).relative_to(self.root)
        self.dir=self.root/self.rel
    def git(self,*args,cwd=None): return expect(run([GIT,*args],cwd or self.root,self.env,'git'))
    def cli(self,*args,cwd=None,env=None): return run([NODE,str(SOURCE/'bin/pace.ts'),*args],cwd or self.root,self.env| (env or {}),'cli')
    def commit(self,cwd,msg):
        self.git('add','-A',cwd=cwd); self.git('commit','-qm',msg,cwd=cwd)
    def index(self,cwd):
        path=pathlib.Path(self.git('rev-parse','--path-format=absolute','--git-path','index',cwd=cwd))
        return h(path.read_bytes())
    def state(self,w):
        p=w/self.rel
        return dict(head=self.git('rev-parse','HEAD',cwd=w),index=self.index(w),staged=self.git('diff','--cached','--name-status',cwd=w),status=self.git('--no-optional-locks','status','--short','--untracked-files=all',cwd=w), hashes={n:h((p/n).read_bytes()) if (p/n).is_file() else None for n in ['PROJECT.md','PROJECT-CLOSE.md','TEAM-RETROSPECTIVE.json','METRICS.md','TEAM-FINISH.json','log.jsonl']},outside=(w/'outside.txt').read_text())
def setup_close(f,where,summary='실제 회고',legacy=False,changes=None):
    p=where/f.rel
    proj=p/'PROJECT.md'; s=proj.read_text()
    s=re.sub(r'\| P-1 \| <!--.*?--> \| <!--.*?--> \|','| P-1 | 합성 기준 | 증거 |',s)
    if not legacy: s=s.replace('\n## 목적','\n- 팀 측정: v1\n\n## 목적',1)
    proj.write_text(s)
    (p/'PROJECT-CLOSE.md').write_text('''# 합성 마감

## 기준 대조

| # | 결과 | 증거 |
|---|---|---|
| P-1 | 통과 | 합성 |

## 보안

true 실행

## 정본 반영

| 정본 | 반영 | 비고 |
|---|---|---|
| docs/README.md | 해당 없음 | 합성 |

## 회고

| 구분 | 입력 | 요약 |
|---|---|---|
| 팀 | [팀 회고](TEAM-RETROSPECTIVE.json) | '''+summary+''' |

## 지표

[지표](METRICS.md)

합성 지표 검증.
''')
    if not legacy:
        evidence(p/'proof.json')
        dump(p/'TEAM-RETROSPECTIVE.json',dict(version=1,metricRef='METRICS.md',unusedRoles=[],recurringFindings=[],definitionChanges=changes or [],**({} if changes else dict(noChangesReasonRef='proof.json'))))
def start(f):
    expect(f.cli('project','start','P001','--agent','codex','--no-launch'))
    return pathlib.Path(next(s[9:] for s in f.git('worktree','list','--porcelain').splitlines() if s.startswith('worktree ') and pathlib.Path(s[9:]).resolve()!=f.root))
def compare():
    f=Fix('comparison')
    script=f.base/'ledger.mjs'
    script.write_text("""
import { HandoffStore } from 'SOURCE/src/project/handoff-store.ts';
import { prepareDelivery, deliveryReceipt } from 'SOURCE/src/team/handoff-delivery.ts';
import { digest } from 'SOURCE/src/project/handoff-files.ts';
import { readFileSync,writeFileSync } from 'node:fs';
const [root, rel] = process.argv.slice(2);
const store = new HandoffStore(root,'P001',rel);
const route={transport:'external',actor:'owner',target:'synthetic-human-route',from:'coordinator',sourceRef:'fixture:receipt'};
const specs=['sent','sent','failed','failed','retry','retry'];
for (let i=0;i<6;i++) {
  const id='r'+i, q='q'+i;
  store.record({protocol:'pace-handoff',v:1,id:q,kind:'decision_request',from:'coordinator',to:'owner',requestId:id,data:{interpretation:false}},'synthetic question');
  const phases = specs[i]==='retry' ? ['failed','sent'] : [specs[i]];
  for(const phase of phases) {
    const a=id+'-'+phase;
    prepareDelivery(store,q,a,route);
    deliveryReceipt(store,a,{phase,reportedBy:'coordinator',sourceRef:route.sourceRef,...(phase==='sent'?{responseHash:digest('synthetic'),responseId:'msg-'+id}:{})});
  }
}
const path=root+'/'+rel+'/handoffs.jsonl';
const rows=readFileSync(path,'utf8').trim().split('\u005cn').map(JSON.parse);
writeFileSync(path,rows.map((r)=>JSON.stringify({...r,at:new Date(Date.UTC(2026,0,1+Number(r.requestId.slice(1))*3,12,0,r.seq)).toISOString()})).join('\u005cn')+'\u005cn');
""".replace('SOURCE',str(SOURCE)))
    # API only seeds local receipts. CLI reads and compares the raw ledger.
    script.write_text(script.read_text().replace("split('\n')",r"split('\n')").replace("join('\n')",r"join('\n')").replace("+'\n' ",r"+'\n' "))
    # Keep JavaScript newline escapes literal regardless of Python interpolation.
    script.write_text(script.read_text().replace("'\n'",r"'\n'"))
    expect(run([NODE,str(script),str(f.root),str(f.rel)],f.root,f.env,'fixture'))
    (f.dir/'log.jsonl').write_text('')
    groups=[[],[],[]]
    for i in range(6):
        stamp=lambda day:f'2026-01-{day:02d}T00:00:00.000Z'
        p=dict(start=stamp(1+i*3),end=stamp(2+i*3),unit='representative-task')
        proof=f'p{i}.json'; evidence(f.dir/proof,period=p)
        c=dict(status='complete',reportedBy='agent:maker',verifiedBy='coordinator',confirmationRef=proof,refs=[proof])
        data=dict(version=1,period=p|dict(closed=True,completionRef=proof),comparison=dict(study='team-adoption',conditionCode='no-team' if i<2 else 'team',definition='reach-v1',unit=p['unit'],workType='feature',sizeBand='small',host='codex',sampleCount=1,recordingBoundary='closed-task',qualitySource='event-log',qualityScopeHash=h('constant')),request_coverage=c,log_coverage=c,counts={k:(2 if i<2 else 1) if k=='owner_file_edits' else 0 for k in MANUAL},coverage={k:c for k in MANUAL},quality_audit=dict(blocking_sum=0,rereviews_after_fail=0,coverage=c))
        dump(f.dir/'TEAM-MEASUREMENT.json',data); dump(f.base/f'measurement-{i}.json',data)
        got=json.loads(expect(f.cli('project','stats','P001','--json')))['team']
        dump(f.base/f'stats-{i}.json',got)
        actual=[got['period']['closed']]+[got['requests'][k] for k in ['reachedTotal','ownerDelivery','failedOnly','failedAttemptsObserved']]
        expected=[True,0,0,1,1] if i in (2,3) else [True,1,1,0,int(i>=4)]
        result(f'stats-{i}',actual==expected,actual=actual,expected=expected)
        groups[i//2].append(got['snapshot'])
    for i,g in enumerate(groups): dump(f.dir/f'group{i}.json',dict(version=1,samples=g))
    for i,conclusion in [(1,'unknown'),(2,'observed-burden-improvement')]:
        r=f.cli('project','compare-team','--before',str(f.dir/'group0.json'),'--after',str(f.dir/f'group{i}.json'),'--kind','team-adoption','--json')
        got=json.loads(expect(r)); dump(f.base/f'compare-{i}.json',got)
        result(f'compare-{i}',got['conclusion']==conclusion,expected=conclusion,actual=got['conclusion'],reasons=got['reasons'],rows=got['rows'])
def reply():
    f=Fix('reply')
    p=dict(start='2026-01-02T10:00:00Z',end='2026-01-02T15:00:00Z',unit='representative-task')
    evidence(f.dir/'period.json',period=p)
    c=dict(status='complete',reportedBy='agent:maker',verifiedBy='coordinator',confirmationRef='period.json',refs=['period.json'])
    dump(f.dir/'TEAM-MEASUREMENT.json',dict(version=1,period=p|dict(closed=True,completionRef='period.json'),request_coverage=c))
    rows=[dict(ts='2026-01-02T11:00:00Z',p='P001',type='question',by='agent',to='owner',requestId='q1',msg='synthetic question'),dict(ts='2026-01-02T12:00:00Z',p='P001',type='answer',by='user',requestId='q1',ref='answer.json',msg='synthetic reply')]
    (f.dir/'log.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in rows))
    for name,extra,good in [('optional-absent',{},True),('valid-window',dict(period=p),True),('wrong-id',dict(decisionReplyId='unknown-reply'),False),('wrong-period',dict(period=p|dict(start='2026-01-02T13:00:00Z')),False),('wrong-unit',dict(period=p|dict(unit='project-start-to-merge')),False),('both',dict(decisionReplyId='unknown-reply',period=p|dict(start='2026-01-02T13:00:00Z')),False)]:
        evidence(f.dir/'answer.json',requestId='q1',**extra); shutil.copyfile(f.dir/'answer.json',f.base/(name+'.json'))
        q=json.loads(expect(f.cli('project','stats','P001','--json')))['team']['requests']
        result('reply-'+name,[q['ownerReply'],q['reachedTotal'],q['unconfirmed']]==([1,1,0] if good else [0,None,1]),actual=q)
def markdown():
    for name,summary,ok in [
        ('unquoted-html','[범위](details.md <span>자료</span>)',False),('quoted-html','[범위](details.md "<span>자료</span>")',True),
        ('quoted-tail','[범위](details.md "title" garbage)',False),('balanced-uri','[실제 범위](a_(b(c)).md "scope")',True),
        ('unbalanced-uri','[범위](a_(b(c).md "scope")',False),('angle-uri','[범위](<details with space.md> "scope")',True),
        ('hidden-label','[⠀](details.md "visible only in title")',False),('escaped-label',r'[\[범위\]](details.md "scope")',True),
        ('raw-html','<span>자료</span>',False),('visible-suffix','유효한 [범위](details.md (title))',True),
        ('unknown-role','유효한 요약',False)
    ]:
        f=Fix('md-'+name)
        setup_close(f,f.root,summary,changes=[dict(role='missing',changeRef='proof.json',reasonRef='proof.json')] if name=='unknown-role' else None)
        path=f.dir/'PROJECT-CLOSE.md'; before=h(path.read_bytes())
        r=f.cli('project','finish','P001'); after=h(path.read_bytes())
        why='미지' if name=='unknown-role' else '회고'
        result('md-'+name,r.returncode==(0 if ok else 1) and before==after and (ok or why in r.stdout+r.stderr or name=='unknown-role' and '역할' in r.stdout+r.stderr),expected=0 if ok else 1,actual=r.returncode,closePreserved=before==after,output=r.stdout+r.stderr)
def main():
    for group in sys.argv[2:] or ['compare','reply','markdown','merge_cases','foreign','failed']:
        try: globals()[group]()
        except Exception as e:
            import traceback
            traceback.print_exc()
            result('fixture-error-'+group,False,error=repr(e))
def finish_seed(name,check='true',legacy=False):
    f=Fix(name,check)
    w=start(f)
    setup_close(f,w,legacy=legacy)
    f.commit(w,'validated input')
    return f,w
def merge_cases():
    for present in [True,False]:
        f,w=finish_seed('merge-present' if present else 'merge-absent')
        p=w/f.rel
        expect(f.cli('project','finish','P001',cwd=w))
        old=f.git('rev-parse','HEAD',cwd=w)
        retro=(p/'TEAM-RETROSPECTIVE.json').read_bytes()
        close=(p/'PROJECT-CLOSE.md').read_bytes()
        f.git('update-ref','refs/heads/synthetic-sealed',old)
        for action in ['edit','delete','unchanged']:
            if not w.exists(): f.git('worktree','add',str(w),'project/P001')
            if action=='edit':
                (p/'PROJECT-CLOSE.md').write_bytes(close+b'\nPost-finish edit.\n')
                f.commit(w,'later close change')
            elif action=='delete':
                (p/'TEAM-RETROSPECTIVE.json').unlink()
                f.commit(w,'later retrospective delete')
            else:
                assert (p/'TEAM-RETROSPECTIVE.json').read_bytes()==retro
            f.git('update-index','--refresh')
            if not present: f.git('worktree','remove',str(w))
            before=f.state(f.root)
            if action=='unchanged':
                planned=f.cli('project','merge','P001')
                after_plan=f.state(f.root)
                result(f'private-index-{present}',planned.returncode==0 and old in planned.stdout and before==after_plan,preview=planned.stdout,before=before,after=after_plan)
                r=f.cli('project','merge','P001','--yes')
                actual_parent=f.git('rev-parse','HEAD^') if r.returncode==0 else None
                result(f'merge-{present}-{action}',r.returncode==0 and actual_parent==old,expected=old,actual=actual_parent,output=r.stdout+r.stderr)
            else:
                preview=f.cli('project','merge','P001')
                preview_after=f.state(f.root)
                r=f.cli('project','merge','P001','--yes')
                after=f.state(f.root)
                result(f'merge-{present}-{action}',preview.returncode!=0 and preview_after==before and r.returncode!=0 and 'finish 뒤 내용' in (r.stdout+r.stderr) and before['head']==after['head'] and before['staged']==after['staged'] and before['outside']==after['outside'],preview=preview.stdout+preview.stderr,output=r.stdout+r.stderr,before=before,preview_after=preview_after,after=after)
                if not w.exists(): f.git('worktree','add',str(w),'project/P001')
                f.git('reset','--hard',old,cwd=w)
    same_command_race('approval-during-recheck','recheck')
    same_command_race('approval-at-ff','ff')
    f,w=finish_seed('approval-preview-then-other-finish')
    expect(f.cli('project','finish','P001',cwd=w))
    old=f.git('rev-parse','HEAD',cwd=w)
    old_plan=expect(f.cli('project','merge','P001'))
    assert old in old_plan
    with (w/f.rel/'PROJECT-CLOSE.md').open('a') as out: out.write('\nA later, separately validated retrospective revision.\n')
    f.commit(w,'later changed revision')
    expect(f.cli('project','finish','P001',cwd=w))
    newer=f.git('rev-parse','HEAD',cwd=w)
    assert newer!=old
    r=f.cli('project','merge','P001','--yes')
    merged=f.git('rev-parse','HEAD^') if r.returncode==0 else None
    result('approval-preview-then-other-finish',r.returncode!=0 or merged==old,previewed=old,later=newer,merged=merged,output=r.stdout+r.stderr)
def same_command_race(name,mode):
    f,w=finish_seed(name)
    expect(f.cli('project','finish','P001',cwd=w))
    old=f.git('rev-parse','HEAD',cwd=w)
    tree=f.git('rev-parse','HEAD^{tree}',cwd=w)
    newer=f.git('commit-tree',tree,'-p',old,'-m','same contents different commit')
    f.git('worktree','remove',str(w))
    main_before=f.git('rev-parse','HEAD')
    directory=f.base/'bin'; directory.mkdir()
    wrapper=directory/'git'
    wrapper.write_text('#!'+sys.executable+'\n'+'''
import json,os,pathlib,subprocess,sys
args=sys.argv[1:]
git=os.environ['FIX_REAL_GIT']
counter=pathlib.Path(os.environ['FIX_COUNT'])
mode=os.environ['FIX_MODE']
root=os.environ['FIX_REPO']
event=None
if 'rev-parse' in args and 'project/P001^{commit}' in args and mode=='recheck':
    n=int(counter.read_text())+1 if counter.exists() else 1
    counter.write_text(str(n))
    if n==2: event='recheck'
if 'merge' in args and '--ff-only' in args and mode=='ff': event='ff'
if event:
    subprocess.run([git,'-C',root,'update-ref','refs/heads/project/P001',os.environ['FIX_NEXT'],os.environ['FIX_OLD']],check=True)
    pathlib.Path(os.environ['FIX_RACE']).write_text(json.dumps(dict(event=event,args=args)))
os.execv(git,[git,*args])
''')
    wrapper.chmod(0o755)
    race=f.base/'race.json'
    r=f.cli('project','merge','P001','--yes',env=dict(PATH=str(directory)+os.pathsep+f.env['PATH'],FIX_REAL_GIT=GIT,FIX_REPO=str(f.root),FIX_NEXT=newer,FIX_OLD=old,FIX_RACE=str(race),FIX_COUNT=str(f.base/'counter'),FIX_MODE=mode))
    actual=f.git('rev-parse','HEAD')
    branch=f.git('rev-parse','project/P001')
    output=r.stdout+r.stderr
    if mode=='recheck': good=r.returncode!=0 and actual==main_before and '승인 대상이 바뀌었다' in output
    else: good=r.returncode==0 and f.git('rev-parse','HEAD^')==old and '보존' in output
    result(name,good and race.is_file() and branch==newer,approvalTarget=old,changedBranch=branch,main=actual,mainBefore=main_before,output=output,interception=get(race) if race.exists() else None)
def foreign():
    for name in ['tracked','untracked','legacy-symlink','legacy-regular']:
        legacy=name.startswith('legacy-')
        f,w=finish_seed('foreign-'+name,legacy=legacy)
        p=w/f.rel/'TEAM-FINISH.json'
        foreign=b'{"foreign":"fixture-owned"}\n'
        if name=='legacy-symlink':
            (w/f.rel/'other.json').write_bytes(foreign)
            p.symlink_to('other.json')
        else: p.write_bytes(foreign)
        if name!='untracked': f.commit(w,'existing foreign file')
        before=f.state(w)
        r=f.cli('project','finish','P001',cwd=w)
        after=f.state(w)
        preview=f.cli('project','merge','P001') if legacy and r.returncode==0 else None
        result('foreign-'+name,p.read_bytes()==foreign and (r.returncode==0 and preview is not None and preview.returncode==0 if legacy else r.returncode!=0 and before['hashes']['PROJECT.md']==after['hashes']['PROJECT.md'] and after['hashes']['METRICS.md'] is None),finish=r.returncode,preview=None if preview is None else preview.returncode,before=before,after=after,output=r.stdout+r.stderr,previewOutput=None if preview is None else preview.stdout+preview.stderr,isSymlink=p.is_symlink())
def failed():
    for mode in ['nonzero','zero-with-retro-deletion','zero-with-foreign-stage']:
        command="sh check-fixture.sh"
        f=Fix('check-'+mode,command)
        script=f.root/'check-fixture.sh'
        if mode=='zero-with-foreign-stage':
            script.write_text("printf 'changed by check\\n' > outside.txt\ngit add outside.txt\n")
        elif mode=='zero-with-retro-deletion':
            script.write_text("rm projects/P001_*/TEAM-RETROSPECTIVE.json\n")
        else:
            script.write_text("printf 'created by check\\n' > check-note.txt\ngit add check-note.txt\nexit 17\n")
        f.commit(f.root,'declared fixture check')
        w=start(f); setup_close(f,w); f.commit(w,'validated input')
        f.git('update-index','--refresh',cwd=w)
        before=f.state(w)
        r=f.cli('project','finish','P001',cwd=w)
        after=f.state(w)
        show=None
        if r.returncode==0:
            show=f.git('show','HEAD:outside.txt',cwd=w)
        good=(r.returncode!=0 and before['head']==after['head'] and before['hashes']['PROJECT.md']==after['hashes']['PROJECT.md'] and not after['hashes']['TEAM-FINISH.json'] and not after['hashes']['METRICS.md']) if mode!='zero-with-foreign-stage' else show!='changed by check'
        result('check-'+mode,good,before=before,after=after,output=r.stdout+r.stderr,headOutside=show)
if __name__=='__main__': main()
