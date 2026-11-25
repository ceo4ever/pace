from pathlib import Path
import subprocess, hashlib, gzip, json, sys

root = Path(__file__).resolve().parents[5]
e = Path(__file__).resolve().parent
revision = int(sys.argv[1])
paths = ['.pace/test-map.json', 'docs', 'src', 'templates', 'skills/pace-project-dev/references/coordinator.md', 'test']
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root)
old = e / 'impl-diff.patch'
archive = e / ('impl-diff-r%d.patch.gz' % (revision - 1))
if old.exists() and not archive.exists():
    archive.write_bytes(gzip.compress(old.read_bytes(), mtime=0))
tracked = git('diff', '--name-only', 'HEAD', '--', *paths).decode().splitlines()
untracked = git('ls-files', '--others', '--exclude-standard', '--', *paths).decode().splitlines()
patch = git('diff', 'HEAD', '--', *paths)
for path in untracked:
    r = subprocess.run(['git', 'diff', '--no-index', '--', '/dev/null', path], cwd=root, capture_output=True)
    if r.returncode not in (0, 1):
        raise RuntimeError(r.stderr.decode())
    patch += r.stdout
old.write_bytes(patch)
files = {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in tracked + untracked if (root / p).is_file()}
candidate = {'base': git('rev-parse', 'HEAD').decode().strip(), 'patchSha256': hashlib.sha256(patch).hexdigest(), 'files': files}
out = e / ('candidate-r%d.json' % revision)
if out.exists():
    raise RuntimeError('preserve existing candidate')
out.write_text(json.dumps(candidate, indent=2) + '\n')
print(json.dumps({'files': len(files), 'patchSha256': candidate['patchSha256']}))
