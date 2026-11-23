from pathlib import Path
import json, os, subprocess, tempfile
repo=Path(__file__).resolve().parents[5]
root=Path(tempfile.mkdtemp(prefix="pace-P009-list-")); home=Path(tempfile.mkdtemp(prefix="pace-P009-list-home-"))
env={k:v for k,v in os.environ.items() if not k.startswith("ORCA_") and not k.startswith("GIT_")}
env.update(HOME=str(home),PACE_HOME=str(home),GIT_CONFIG_GLOBAL=os.devnull,GIT_CONFIG_SYSTEM=os.devnull)
subprocess.run(["git","init","-q",str(root)],env=env,check=True)
def run(*args):
 r=subprocess.run(["node",str(repo/"bin/pace.ts"),*args],cwd=root,env=env,capture_output=True,text=True); assert r.returncode==0,r.stderr;return r.stdout
run("team","new","quality","--role","reviewer")
p=root/".pace/team/quality.md";p.write_text(p.read_text().replace("stage: []","stage: [검토, 마감]").replace("resources: []","resources: [Studio, shared-pipe]"))
actual=run("team","list"); expected="| quality | reviewer | 검토, 마감 | high | Studio, shared-pipe |";assert expected in actual,actual
run("team","sync");before={str(p.relative_to(root)):p.read_bytes() for folder in [".claude/agents",".codex/agents"] for p in (root/folder).iterdir()}
run("team","sync");after={str(p.relative_to(root)):p.read_bytes() for folder in [".claude/agents",".codex/agents"] for p in (root/folder).iterdir()};assert before==after
print(json.dumps({"list_columns":"pass","expected_row":expected,"actual":actual,"repeated_sync_bytes":"pass"},ensure_ascii=False,indent=2))
