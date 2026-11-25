from probe import *
f,w=finish_seed('clean-no-worktree')
expect(f.cli('project','finish','P001',cwd=w))
old=f.git('rev-parse','HEAD',cwd=w)
f.git('worktree','remove',str(w))
before=f.state(f.root)
planned=f.cli('project','merge','P001')
after=f.state(f.root)
r=f.cli('project','merge','P001','--yes')
parent=f.git('rev-parse','HEAD^') if r.returncode==0 else None
result('clean-no-worktree',planned.returncode==0 and old in planned.stdout and before==after and r.returncode==0 and parent==old,preview=planned.stdout,merge=r.stdout+r.stderr,before=before,after=after,target=old,merged=parent)

# Real legacy baseline bytes are only read. Comparison reads copies in this owned fixture.
f=Fix('legacy-adapter')
evidence_dir=next((SOURCE/'projects').glob('P009_*/tasks/T01_*/evidence'))
for filename in ['baseline-roblox.json','baseline-ai-sql-client.json']:
    original=evidence_dir/filename
    a=original.read_bytes()
    copy=f.base/filename; copy.write_bytes(a)
    r=f.cli('project','compare-team','--before',str(copy),'--after',str(copy),'--kind','team-adoption','--json')
    got=json.loads(expect(r)); dump(f.base/('output-'+filename),got)
    b=got['sources']['before']
    evidence_ok=(b['counts']['blocking_sum_stats_events']==31 and b['counts']['blocking_sum_audited']==48) if 'roblox' in filename else (b['observed']['owner_file_edits']==0 and b['counts']['owner_file_edits'] is None)
    result(filename,got['conclusion']=='unknown' and b['counts']['owner_questions'] is None and evidence_ok and a==original.read_bytes() and a==copy.read_bytes(),hash=h(a),conclusion=got['conclusion'],source=b)
