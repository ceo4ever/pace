import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const root=resolve(import.meta.dirname,"../../../../..");
const { verifyCommand }=await import(resolve(root,"src/agent/verify-cli.ts"));
const { createPExecutor,codexP }=await import(resolve(root,"src/agent/p-executor.ts"));
const revision=process.argv[2]??"7"; if(!/^[0-9]+$/.test(revision)) throw new Error("revision required");
const out=resolve(import.meta.dirname,`impl-review-output-${revision}.json`);
if(existsSync(out)) throw new Error("preserve existing review");
// Transport-only proposal: run only after coordinator decision. Same target/hash/ledger and actual previous judgment.
const native=createPExecutor(codexP);
const transport={...native,async run(request,hooks){
  const prompt=request.prompt, marker="## 바뀐 줄 (직전 검토 때 → 지금, - 삭제 · + 추가)", artifact="## 산출물: ";
  const start=prompt.indexOf(marker), end=prompt.indexOf(artifact,start);
  if(start<0||end<0)throw new Error("expected actual rereview layout; do not narrow review silently");
  const delta=prompt.slice(start,end), deltaPath=resolve(import.meta.dirname,"review74-actual-changed-lines.txt");
  const full=resolve(import.meta.dirname,"review74-original-transport.txt.gz"), sent=resolve(import.meta.dirname,"review74-file-transport.txt");
  for(const path of [deltaPath,full,sent])if(existsSync(path))throw new Error("preserve transport originals");
  writeFileSync(deltaPath,delta);writeFileSync(full,gzipSync(prompt));
  const hash=createHash("sha256").update(readFileSync(resolve(import.meta.dirname,"impl-diff.patch"))).digest("hex");
  const replacement=prompt.slice(0,start)+"\n## 파일로 전달한 동일 입력\n입력 문자 한도를 피하기 위해 중복 본문만 파일 참조로 전달한다. 판정 범위와 직전 원문은 위와 같다. 검토 전에 다음 파일의 전체 내용을 나누어 읽어라. 작성자 대응/계약/마감 문서는 읽지 않는다.\n실제 바뀐 줄: "+deltaPath+"\n현재 산출물: "+resolve(import.meta.dirname,"impl-diff.patch")+"\n현재 산출물 SHA256: "+hash+"\n소스 파일과 테스트는 앞의 범위에서 직접 읽을 수 있다. 파일 참조는 검토 생략이 아니다. 읽은 범위를 판정에 남겨라.\n";
  writeFileSync(sent,replacement);writeFileSync(resolve(import.meta.dirname,"review74-transport-hashes.json"),JSON.stringify({originalChars:prompt.length,sentChars:replacement.length,originalSha256:createHash("sha256").update(prompt).digest("hex"),sentSha256:createHash("sha256").update(replacement).digest("hex"),artifactSha256:hash,deltaSha256:createHash("sha256").update(delta).digest("hex"),candidate:"candidate-r74.json"},null,2));
  return native.run({...request,prompt:replacement},hooks);
}};
const code=await verifyCommand(["--author-agent","codex","--allow-same-provider","--target",resolve(import.meta.dirname,"impl-diff.patch"),"--purpose-file",resolve(import.meta.dirname,"impl-purpose.txt"),"--out",out,"--timeout-ms","600000"],{executors:()=>[transport],write:text=>process.stdout.write(text)});
process.exitCode=code;
