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
