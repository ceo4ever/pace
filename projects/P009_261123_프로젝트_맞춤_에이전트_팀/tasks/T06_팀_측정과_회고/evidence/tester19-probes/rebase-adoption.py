from control_lib import *
f=Fix('adopted-by-rebase')
doc=f.root/'docs/README.md'
doc.write_text(doc.read_text().replace('보안 검사: `true`','보안 검사: `sh side-effect.sh`'))
(f.root/'side-effect.sh').write_text("set -e\nprintf 'staged before adoption\\n' > outside.txt\ngit add -- outside.txt\nexit 0\n")
f.commit(f.root,'declare synthetic zero-exit security command')
w=start(f)
setup_close(f,w,legacy=True)
p=w/f.rel
f.commit(w,'valid synthetic legacy inputs')
main_project=f.root/f.rel/'PROJECT.md'
# Only main adopts. Use the exact start commit as common base so independent
# main/worker changes have a deterministic, conflict-free merge.
start_commit=state(f,w)
# The worker HEAD also has its committed close. Avoid changing which changes are
# in main by committing only the adoption marker and typed retrospective files.
main_project.write_text(main_project.read_text().replace('\n## 목적','\n- 팀 측정: v1\n\n## 목적',1))
main_dir=main_project.parent
dump(main_dir/'TEAM-RETROSPECTIVE.json',dict(version=1,metricRef='METRICS.md',unusedRoles=[],recurringFindings=[],definitionChanges=[],noChangesReasonRef='proof.json'))
evidence(main_dir/'proof.json')
f.commit(f.root,'adopt measurement on main only')
r=finish(f,w)
old_file=f.git('show',start_commit+':outside.txt',cwd=w)
final_file=f.git('show','HEAD:outside.txt',cwd=w)
history=f.git('log','--format=%s','--','outside.txt',cwd=w)
seal=(p/'TEAM-FINISH.json').is_file()
report('adoption arrives at rebase after early side effect',passed=r.returncode!=0 and old_file==final_file and not seal,call=note('finish',r),before_head=start_commit,after_head=state(f,w),old_file=old_file,final_file=final_file,history=history,seal=seal,marker='- 팀 측정: v1' in (p/'PROJECT.md').read_text())
