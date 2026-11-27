import json,glob,os,collections
projs={'fin-link P035':'/Volumes/Data/StoreLinkStudio/fin-link/projects/P035_*','fin-link P044':'/Volumes/Data/StoreLinkStudio/fin-link/projects/P044_*','fin-link P045':'/Volumes/Data/StoreLinkStudio/fin-link/projects/P045_*','pace P014':'/Volumes/Data/AiStudio/workspace/pace/projects/P014_*'}
def rd(f): return [json.loads(l) for l in open(f) if l.strip()] if os.path.exists(f) else []
tot=collections.Counter()
for name,g in projs.items():
  pd=glob.glob(g)[0]; tasks=sorted(glob.glob(pd+'/tasks/T*'))
  a=collections.Counter(tasks=len(tasks))
  for t in tasks:
    pre=[r for r in rd(t+'/REVIEW-LOG.jsonl') if r.get('type')=='review']
    post=[r for r in rd(t+'/evidence/REVIEW-LOG.jsonl') if r.get('type')=='review']
    a['pre']+=len(pre); a['pre_fail']+=sum(r.get('verdict')=='fail' for r in pre)
    a['post']+=len(post); a['post_unk']+=sum(r.get('verdict')=='unknown' for r in post)
    a['post_pass']+=sum(r.get('verdict')=='pass' for r in post)
    for i,r in enumerate(post):
      if r.get('verdict')=='fail':
        a['post_fail']+=1; a['f2p']+=any(x.get('verdict')=='pass' for x in post[i+1:i+3])
    for f in glob.glob(t+'/REVIEW-FOLLOWUPS.jsonl')+glob.glob(t+'/evidence/REVIEW-FOLLOWUPS.jsonl'):
      for d in rd(f):
        a['joint']+=d.get('type')=='joint'; a['owner']+=d.get('type')=='owner'; a['waiver_req']+=d.get('type')=='waiver_request'
  print(name,dict(a)); tot+=a
n=tot['tasks']; print('TOTAL',dict(tot))
for k in ['pre','post','post_unk','joint','owner']: print(k,'per task %.2f'%(tot[k]/n))
print('post fail->pass within 2: %d/%d'%(tot['f2p'],tot['post_fail']))
