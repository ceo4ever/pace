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

