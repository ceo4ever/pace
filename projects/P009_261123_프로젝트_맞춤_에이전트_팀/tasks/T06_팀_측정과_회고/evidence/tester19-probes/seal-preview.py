from control_lib import *
f=Fix.__new__(Fix)
f.base=D/'adopted-by-rebase'; f.root=f.base/'repo'; f.home=f.base/'home'; f.tmp=f.base/'tmp'
f.env=dict(PATH=os.environ['PATH'],HOME=str(f.home),USERPROFILE=str(f.home),PACE_HOME=str(f.home),GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL='/dev/null',TMPDIR=str(f.tmp),TMP=str(f.tmp),TEMP=str(f.tmp),LC_ALL='en_US.UTF-8')
f.rel=next(f.root.glob('projects/P001_*')).relative_to(f.root)
w=f.base/'repo.wt/P001'
sealed=f.git('rev-parse','HEAD',cwd=w)
idx=f.index(f.root)
preview=merge(f)
dump(D/'seal-preview.json',dict(sealed=sealed,validates=preview.returncode==0 and sealed in preview.stdout,index_unchanged=idx==f.index(f.root),call=note('preview after unsafe finish',preview)))
print((D/'seal-preview.json').read_text())
