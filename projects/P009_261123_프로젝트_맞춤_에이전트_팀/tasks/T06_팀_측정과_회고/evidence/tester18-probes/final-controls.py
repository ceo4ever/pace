from control_lib import *
from collections import Counter

rows=[json.loads(line) for line in (D/'commands.jsonl').read_text().splitlines()]
checks=get(D/'results.json')+get(D/'followup-results.json')
by_name={row['name']:row for row in checks}
for name in ['TEAM-RETROSPECTIVE.json','proof.json']:
    label='ignored-'+name; repo=D/label/'repo.wt/P001'
    calls=[row for row in rows if row['cwd'].startswith(str(D/label))]
    before=next(row['stdout'].strip() for row in calls if row['args'][-2:]==['rev-parse','HEAD'])
    after=expect(run([GIT,'rev-parse','HEAD'],repo,dict(PATH=os.environ['PATH'],GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL='/dev/null'),'git'))
    r=by_name[label]['call']; p=next(repo.glob('projects/P001_*')); rel=(p/name).relative_to(repo)
    original=(json.dumps(dict(version=1,kind='team-evidence',sourceRef='fixture:synthetic',hash=h('proof proof.json')),ensure_ascii=False)+'\n') if name=='proof.json' else (json.dumps(dict(version=1,metricRef='METRICS.md',unusedRoles=[],recurringFindings=[],definitionChanges=[],noChangesReasonRef='proof.json'),ensure_ascii=False)+'\n')
    tree_files=expect(run([GIT,'ls-tree','-r','--name-only','HEAD'],repo,dict(PATH=os.environ['PATH'],GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL='/dev/null'),'git')).splitlines()
    by_name[label]=dict(name=label,pass_=r['exit']==2 and 'Git 인덱스에 없다' in r['output'] and before==after and (p/name).read_bytes()==original.encode() and str(rel) not in tree_files and not (p/'TEAM-FINISH.json').exists(),before=before,after=after,call=r)

f,w,p=seed('role-def-refs')
expect(f.cli('team','new','maker','--role','maker',cwd=w))
retro=get(p/'TEAM-RETROSPECTIVE.json')
retro['unusedRoles']=[dict(role='maker',coverage='unconfirmed',refs=[])]
del retro['noChangesReasonRef']
retro['definitionChanges']=[dict(role='maker',changeRef='proof.json',reasonRef='proof.json')]
dump(p/'TEAM-RETROSPECTIVE.json',retro); f.commit(w,'one generic receipt used as both change and reason')
r=finish(f,w)
by_name['role references']=dict(name='role references',accepted_generic_ref=r.returncode==0,call=note('finish using the same generic reference twice',r))

calls=Counter(' '.join(row['args'][2:4]) for row in map(json.loads,(D/'commands.jsonl').read_text().splitlines()) if row['kind']=='cli')
dump(D/'verified.json',dict(calls=calls,cli_total=sum(calls.values()),controls=list(by_name.values())))
print(json.dumps(dict(calls=calls,cli_total=sum(calls.values()),checks={k:v.get('pass_',v.get('accepted_generic_ref')) for k,v in by_name.items()}),ensure_ascii=False))
