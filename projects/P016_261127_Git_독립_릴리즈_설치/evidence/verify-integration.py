from pathlib import Path
import subprocess, hashlib, json, re

root=Path(__file__).resolve().parents[3]
project=Path(__file__).resolve().parents[1]
installer='991af89e7c230e28211646fcf44a1216ab8d40fb'
remote='430bd7516e803235b55986b245a0788e426af9ad'
base='ad1aaa337a96866211c050e24aba5970c74b1d58'
old='projects/P015_261127_Git_독립_릴리즈_설치/'
def git(*args):
    return subprocess.check_output(['git','-C',str(root),*args])
for ref in [installer,remote]:
    subprocess.run(['git','-C',str(root),'merge-base','--is-ancestor',ref,'HEAD'],check=True)
original=git('ls-tree','-rz','--name-only',installer,'--',old).decode().split('\0')
original={p[len(old):] for p in original if p}
manifest=json.loads((project/'evidence/historical-sha256.json').read_text())
actual={str(p.relative_to(project/'historical')) for p in (project/'historical').rglob('*') if p.is_file()}
assert not any(p.is_symlink() for p in (project/'historical').rglob('*')), 'historical symlink'
assert original==set(manifest)==actual, 'historical file set'
for rel, expected in manifest.items():
    data=(project/'historical'/rel).read_bytes()
    assert hashlib.sha256(data).hexdigest()==expected,rel
    assert data==git('show',installer+':'+old+rel),rel
install_paths=['scripts/install.sh','scripts/install.ps1','scripts/get.ps1','scripts/install-release.mjs','test/install-script.test.ts','test/install-windows-wrapper.test.ts','test/fixtures/install-release.ts','README.md','docs/SETUP.md']
for path in install_paths:
    assert git('ls-tree',installer,'--',path)==git('ls-tree','HEAD','--',path),path
    subprocess.run(['git','-C',str(root),'diff','--quiet','HEAD','--',path],check=True)
shared={'.pace/memory/INDEX.md','.pace/memory/status.md','projects/METRICS.md','backlogs/dashboard/data.js'}
paths=git('diff','--no-renames','--name-only','-z',base,remote).decode().split('\0')
for path in paths:
    if not path or path in shared: continue
    expected=git('ls-tree',remote,'--',path)
    assert expected==git('ls-tree','HEAD','--',path),path
    subprocess.run(['git','-C',str(root),'diff','--quiet','HEAD','--',path],check=True)
    if not expected: assert not (root/path).exists(),path
ids=[m[1] for p in (root/'projects').iterdir() if p.is_dir() and (m:=re.match(r'^(P[0-9]{3})_',p.name))]
assert len(ids)==len(set(ids)),'duplicate project ID'
for number,label in [('P015','xhigh_팀_원본_통합'),('P016','Git_독립_릴리즈_설치')]:
    matches=[p for p in (root/'projects').iterdir() if p.is_dir() and p.name.startswith(number+'_')]
    assert len(matches)==1 and matches[0].name.endswith(label),number
assert not (root/old).exists(),'old duplicate folder remains'
print('PASS: original ancestors, 18 historical files, installer blobs, remote changes, unique project IDs')
