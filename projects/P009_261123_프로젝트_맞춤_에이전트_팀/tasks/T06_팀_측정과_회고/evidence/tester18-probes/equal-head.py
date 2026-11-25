from control_lib import *
from collections import Counter

f,w,p=seed('preff-equal-head')
expect(finish(f,w)); good=approved(f)
main=state(f,f.root)
f.git('worktree','remove',str(w))
assert clean(f)==''
f.git('update-ref','refs/heads/project/P001',main,good)
rejected=merge(f,'--yes','--commit',good)
dirty=clean(f); index_diff=f.git('diff','--cached','--name-only')
assert state(f,f.root)==main
f.git('update-ref','refs/heads/project/P001',good,main)
retry=merge(f,'--yes','--commit',good)
p=f.root/f.rel/'log.jsonl'
out=dict(name='pre-FF rejection when target equals HEAD',main=main,good=good,dirty_after_refusal=dirty,index_diff=index_diff,main_log=p.read_text() if p.is_file() else None,rejected=note('invalid equal target',rejected),retry=note('retry with restored approved commit',retry),pass_=not dirty and retry.returncode==0)
dump(D/'equal-head.json',out)
print(json.dumps(out,ensure_ascii=False))
calls=Counter(' '.join(row['args'][2:4]) for row in map(json.loads,(D/'commands.jsonl').read_text().splitlines()) if row['kind']=='cli')
print(sum(calls.values()),dict(calls))
