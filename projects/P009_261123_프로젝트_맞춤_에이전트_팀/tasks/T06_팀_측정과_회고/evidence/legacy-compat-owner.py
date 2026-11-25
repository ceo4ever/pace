import os,subprocess,tempfile,pathlib,hashlib,json,tarfile,io
root=pathlib.Path.cwd(); old=pathlib.Path(tempfile.mkdtemp(prefix="pace-t06-legacy-source-")); fixture=pathlib.Path(tempfile.mkdtemp(prefix="pace-t06-legacy-repo-")); home=pathlib.Path(tempfile.mkdtemp(prefix="pace-t06-legacy-home-"))
archive=subprocess.run(["git","archive","HEAD","src","bin","templates"],check=True,capture_output=True).stdout
with tarfile.open(fileobj=io.BytesIO(archive)) as t:t.extractall(old)
env=os.environ.copy()
for k in list(env):
 if k.startswith(("ORCA_","CLAUDE","CODEX","GIT_")) or k in ("PACE_AGENT_CHILD","PACE_HOST"):env.pop(k,None)
env.update(PACE_HOME=str(home),HOME=str(home),USERPROFILE=str(home),GIT_CONFIG_GLOBAL=str(home/"gitconfig"),GIT_CONFIG_SYSTEM=str(home/"gitconfig"))
(home/"gitconfig").write_text("")
def run(argv):
 r=subprocess.run(argv,cwd=fixture,env=env,text=True,capture_output=True);assert r.returncode==0,(argv,r.stdout,r.stderr);return r.stdout
run(["git","init","-q","-b","main"]);run(["git","config","user.name","Synthetic"]);run(["git","config","user.email","fixture@example.invalid"])
(fixture/"docs").mkdir();(fixture/"docs/README.md").write_text("# fixture\n\n## 환경\n\n- 검사: `true`\n- 보안 검사: `true`\n")
run(["git","add","-A"]);run(["git","commit","-qm","fixture"])
run(["node",str(old/"bin/pace.ts"),"project","new","Legacy compatibility"])
dir=next((fixture/"projects").glob("P001_*"));(dir/"PROJECT-CLOSE.md").write_text("## 지표\n\n[지표](METRICS.md)\n\n합성 비교\n")
proof={"baselineCommit":run(["git","-C",str(root),"rev-parse","HEAD"]).strip(),"syntheticOnly":True,"results":{}}
for mode,args in [("json",["--json"]),("text",[])]:
 a=run(["node",str(old/"bin/pace.ts"),"project","stats","P001",*args]);b=run(["node",str(root/"bin/pace.ts"),"project","stats","P001",*args]);assert a==b,mode
 proof["results"][mode]={"byteEqual":True,"sha256":hashlib.sha256(a.encode()).hexdigest()}
run(["node",str(old/"bin/pace.ts"),"project","stats","P001","--write"]);a=(dir/"METRICS.md").read_bytes()
run(["node",str(root/"bin/pace.ts"),"project","stats","P001","--write"]);b=(dir/"METRICS.md").read_bytes();assert a==b,"METRICS"
proof["results"]["METRICS"]={"byteEqual":True,"sha256":hashlib.sha256(a).hexdigest()}
print(json.dumps(proof,ensure_ascii=False,indent=2))
