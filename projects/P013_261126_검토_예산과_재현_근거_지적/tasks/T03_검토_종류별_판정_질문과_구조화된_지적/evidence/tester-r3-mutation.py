import pathlib,tempfile,shutil,subprocess,json
root=pathlib.Path.cwd(); evidence=next(root.glob('projects/P013_*/tasks/T03_*/evidence')); results=[]
mutations=[('orphan', '''const structured = structuredStage !== undefined ||
      (scope && (Object.hasOwn(rec, "assessment") || (typeof text === "string" && hasStructuredReviewFence(text))));''', 'const structured = structuredStage !== undefined;', '고아 기록의 구조화 판정을 다시 계산해 일치하지 않은 pass를 복구하지 않는다'),('rereview', '''if (base.structured_stage || record.review?.structured_stage !== undefined ||
      (scope && (Object.hasOwn(record, "assessment") || hasStructuredReviewFence(text)))) {''', 'if (base.structured_stage || record.review?.structured_stage !== undefined) {', '재검토 기준점의 단계 표지가 빠지거나 구조화 판정이 다르면 호출을 거부한다')]
for name,old,new,pattern in mutations:
 with tempfile.TemporaryDirectory(prefix='pace-r3-mutant-') as tmp:
  tmp=pathlib.Path(tmp)
  for folder in ['src','test']: shutil.copytree(root/folder,tmp/folder)
  shutil.copy(root/'package.json',tmp/'package.json')
  path=tmp/'src/agent/verify-cli.ts'; s=path.read_text(); assert s.count(old)==1; path.write_text(s.replace(old,new))
  command=['node','--test','--test-name-pattern='+pattern,'test/agent-structured-review.test.ts']
  run=subprocess.run(command,cwd=tmp,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  evidence.joinpath('tester-r3-mutant-'+name+'.log').write_text(run.stdout)
  results.append({'mutation':name,'replacement':new,'test':pattern,'exit_code':run.returncode,'detected':run.returncode!=0})
with tempfile.TemporaryDirectory(prefix='pace-r3-mutant-combined-') as tmp:
 tmp=pathlib.Path(tmp)
 for folder in ['src','test']: shutil.copytree(root/folder,tmp/folder)
 shutil.copy(root/'package.json',tmp/'package.json')
 path=tmp/'src/agent/verify-cli.ts'; s=path.read_text()
 for _,old,new,_ in mutations: s=s.replace(old,new)
 path.write_text(s)
 run=subprocess.run(['node','--test','--test-name-pattern=고아 기록의 구조화 판정을 다시 계산|재검토 기준점의 단계 표지가 빠지거나','test/agent-structured-review.test.ts'],cwd=tmp,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 evidence.joinpath('tester-r3-mutant-combined.log').write_text(run.stdout)
 results.append({'mutation':'combined','test':'both new regression tests','exit_code':run.returncode,'detected':run.returncode!=0})
print(json.dumps(results,ensure_ascii=False,indent=2)); evidence.joinpath('tester-r3-mutations.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
assert all(r['detected'] for r in results)
